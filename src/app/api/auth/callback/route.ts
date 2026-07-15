import { NextRequest, NextResponse } from "next/server";
import { buildAuthorizationHeader, buildOAuthParams, HATTRICK_OAUTH_URLS } from "@/lib/hattrickOAuth";
import { requestChppXmlRaw } from "@/lib/hattrickApi";
import { parseManagerXml } from "@/lib/manager";

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
  // access-токена, не меняется), нужен как ключ для истории навыков между
  // визитами (см. src/lib/playerHistoryDb.ts). Если запрос не удался — не
  // блокируем вход из-за этого, просто история между визитами не будет
  // сохраняться для этой сессии.
  let managerUserId: string | null = null;
  try {
    const managerRaw = await requestChppXmlRaw("manager", {}, { accessToken, accessTokenSecret });
    if (managerRaw.httpStatus >= 200 && managerRaw.httpStatus < 300) {
      managerUserId = parseManagerXml(managerRaw.rawXml).userId;
    }
  } catch {
    // см. комментарий выше — не блокируем вход
  }

  const redirectResponse = NextResponse.redirect(new URL("/dashboard", request.url));

  // Постоянный ключ доступа — сохраняем его надолго (Hattrick не ограничивает
  // срок жизни access token, он живёт, пока пользователь сам не отзовёт
  // доступ в настройках Hattrick). httpOnly — недоступен для чтения из
  // JavaScript в браузере, виден только серверу.
  redirectResponse.cookies.set("hattrick_access_token", accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 400, // ~400 дней — максимум, который разрешают браузеры
    path: "/",
  });
  redirectResponse.cookies.set("hattrick_access_token_secret", accessTokenSecret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 400,
    path: "/",
  });
  if (managerUserId) {
    redirectResponse.cookies.set("hattrick_user_id", managerUserId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 400,
      path: "/",
    });
  }

  // Временный пропуск больше не нужен — убираем за собой.
  redirectResponse.cookies.delete("hattrick_request_token");
  redirectResponse.cookies.delete("hattrick_request_token_secret");

  return redirectResponse;
}
