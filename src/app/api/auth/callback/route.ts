import { NextRequest, NextResponse } from "next/server";
import { buildAuthorizationHeader, buildOAuthParams, HATTRICK_OAUTH_URLS } from "@/lib/hattrickOAuth";
import { requestChppXmlRaw } from "@/lib/hattrickApi";
import { parseManagerXml } from "@/lib/manager";
import { saveHattrickTokens } from "@/lib/hattrickTokensDb";
import { SESSION_COOKIE, buildSessionCookieValue } from "@/lib/siteSession";

// Manager.xml обычно отвечает с первого раза — но раньше сбой здесь просто
// пропускался молча (UserID был нужен только для необязательной истории
// навыков). Теперь UserID ещё и ключ, под которым токен сохраняется в базу
// (см. src/lib/hattrickTokensDb.ts) — без него нельзя выдать долгоживущую
// сессию, поэтому пробуем дважды, прежде чем сдаться.
async function fetchManagerUserId(accessToken: string, accessTokenSecret: string): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const managerRaw = await requestChppXmlRaw("manager", {}, { accessToken, accessTokenSecret });
      if (managerRaw.httpStatus >= 200 && managerRaw.httpStatus < 300) {
        return parseManagerXml(managerRaw.rawXml).userId;
      }
    } catch {
      // попробуем ещё раз — см. цикл
    }
  }
  return null;
}

// Шаг 3 из 3 подключения к Hattrick: "Access Token".
//
// Сюда Hattrick возвращает пользователя после того, как он вошёл под своим
// логином/паролем и нажал "Разрешить" на своей же странице. В адресе он
// присылает нам oauth_token (тот же временный пропуск, что мы выдали на шаге
// 1) и oauth_verifier — код, подтверждающий, что именно этот пользователь
// только что согласился на подключение.
//
// Дальше происходит вот что:
// 1. Достаём из cookie секрет временного пропуска, который сохранили на
//    шаге 1 (он нужен, чтобы правильно подписать следующий запрос).
// 2. Отправляем в Hattrick подписанный запрос "обменяйте мой пропуск на
//    постоянный ключ" на access_token.ashx, приложив oauth_verifier.
// 3. Hattrick присылает постоянные oauth_token/oauth_token_secret — именно
//    они дальше будут использоваться для чтения данных команды. Пароль
//    пользователя по-прежнему нигде не участвовал.
// 4. Сохраняем эту пару в защищённой cookie текущего пользователя и
//    отправляем его в личный кабинет.
export async function GET(request: NextRequest) {
  const oauthToken = request.nextUrl.searchParams.get("oauth_token");
  const oauthVerifier = request.nextUrl.searchParams.get("oauth_verifier");

  if (!oauthToken || !oauthVerifier) {
    return NextResponse.json(
      { error: "В обратной ссылке от Hattrick нет oauth_token или oauth_verifier — авторизация не была завершена." },
      { status: 400 },
    );
  }

  const storedRequestToken = request.cookies.get("hattrick_request_token")?.value;
  const storedRequestTokenSecret = request.cookies.get("hattrick_request_token_secret")?.value;

  if (!storedRequestToken || !storedRequestTokenSecret) {
    return NextResponse.json(
      {
        error:
          "Не найден временный пропуск (request token) — либо прошло больше 10 минут с начала входа, либо этот адрес открыли напрямую, минуя кнопку «Подключить команду». Начните подключение заново.",
      },
      { status: 400 },
    );
  }

  if (storedRequestToken !== oauthToken) {
    return NextResponse.json(
      { error: "oauth_token из обратной ссылки не совпадает с тем, что мы выдавали. Начните подключение заново." },
      { status: 400 },
    );
  }

  const consumerKey = process.env.HATTRICK_CONSUMER_KEY;
  const consumerSecret = process.env.HATTRICK_CONSUMER_SECRET;

  if (!consumerKey || !consumerSecret) {
    return NextResponse.json(
      { error: "Не заданы HATTRICK_CONSUMER_KEY / HATTRICK_CONSUMER_SECRET в .env.local." },
      { status: 500 },
    );
  }

  const oauthParams = buildOAuthParams(
    "GET",
    HATTRICK_OAUTH_URLS.accessToken,
    { consumerKey, consumerSecret, token: storedRequestToken, tokenSecret: storedRequestTokenSecret },
    { oauth_verifier: oauthVerifier },
  );

  let response: Response;
  try {
    response = await fetch(HATTRICK_OAUTH_URLS.accessToken, {
      method: "GET",
      headers: { Authorization: buildAuthorizationHeader(oauthParams) },
    });
  } catch {
    return NextResponse.json({ error: "Не удалось связаться с chpp.hattrick.org на шаге обмена токена." }, { status: 502 });
  }

  const bodyText = await response.text();

  if (!response.ok) {
    return NextResponse.json(
      { error: "Hattrick отклонил обмен на Access Token.", details: bodyText, status: response.status },
      { status: 502 },
    );
  }

  const parsed = new URLSearchParams(bodyText);
  const accessToken = parsed.get("oauth_token");
  const accessTokenSecret = parsed.get("oauth_token_secret");

  if (!accessToken || !accessTokenSecret) {
    return NextResponse.json(
      { error: "Hattrick ответил, но не прислал постоянный oauth_token/oauth_token_secret.", details: bodyText },
      { status: 502 },
    );
  }

  // Hattrick UserID — стабильный идентификатор менеджера (в отличие от
  // access-токена, не меняется) — теперь это ключ, под которым токен
  // сохраняется в базе (см. fetchManagerUserId выше и src/lib/hattrickTokensDb.ts),
  // так что без него нельзя выдать долгоживущую сессию сайта.
  const managerUserId = await fetchManagerUserId(accessToken, accessTokenSecret);

  if (!managerUserId) {
    return NextResponse.json(
      {
        error:
          "Hattrick подтвердил доступ, но не удалось определить ваш UserID (manager.xml не ответил дважды подряд) — без него нельзя сохранить долгоживущую сессию. Попробуйте подключиться ещё раз.",
      },
      { status: 502 },
    );
  }

  try {
    await saveHattrickTokens(managerUserId, accessToken, accessTokenSecret);
  } catch (err) {
    return NextResponse.json(
      {
        error: `Не удалось сохранить токен доступа в базе данных: ${err instanceof Error ? err.message : "неизвестная ошибка"}`,
      },
      { status: 500 },
    );
  }

  const redirectResponse = NextResponse.redirect(new URL("/dashboard", request.url));

  // Собственная долгоживущая cookie сессии сайта (см. src/lib/siteSession.ts)
  // — содержит только подписанный Hattrick UserID, а не сам OAuth-токен (тот
  // теперь в базе). При следующих визитах src/lib/hattrickApi.ts находит
  // токен по этой cookie без повторного прохождения OAuth-флоу.
  redirectResponse.cookies.set(SESSION_COOKIE, buildSessionCookieValue(managerUserId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 400, // ~400 дней — максимум, который разрешают браузеры
    path: "/",
  });

  // Временный пропуск больше не нужен — убираем за собой.
  redirectResponse.cookies.delete("hattrick_request_token");
  redirectResponse.cookies.delete("hattrick_request_token_secret");

  return redirectResponse;
}
