import { NextResponse } from "next/server";
import { buildAuthorizationHeader, buildOAuthParams, HATTRICK_OAUTH_URLS } from "@/lib/hattrickOAuth";

// Этот роут не читает ничего из самого запроса (нет searchParams/cookies), и
// без этой строки Next.js считает его "статическим" и кеширует один и тот же
// ответ (с одним и тем же oauth_token и cookie) для всех подряд — на Vercel
// это реально происходило и ломало вход в продакшене. force-dynamic
// заставляет выполнять функцию заново при каждом обращении.
export const dynamic = "force-dynamic";

// Шаг 1 из 3 подключения к Hattrick: "Request Token".
//
// Что здесь происходит простыми словами:
// 1. Наш сервер отправляет в Hattrick подписанный запрос "дайте мне временный
//    пропуск" — указывая, куда вернуть пользователя после того, как он
//    разрешит доступ (oauth_callback).
// 2. Hattrick присылает в ответ два значения: временный "пропуск"
//    (oauth_token) и секрет к нему (oauth_token_secret). Пароль пользователя
//    здесь нигде не участвует — это разговор только между нашим сервером и
//    Hattrick.
// 3. Мы сохраняем этот секрет в защищённой cookie (недоступной для чтения из
//    браузера) — он понадобится на шаге 3, чтобы обменять пропуск на
//    постоянный ключ доступа.
// 4. Отправляем пользователя на страницу авторизации Hattrick вместе с
//    временным пропуском — там он логинится и жмёт "Разрешить".
export async function GET() {
  const consumerKey = process.env.HATTRICK_CONSUMER_KEY;
  const consumerSecret = process.env.HATTRICK_CONSUMER_SECRET;
  const callbackUrl = process.env.HATTRICK_OAUTH_CALLBACK_URL;

  if (!consumerKey || !consumerSecret || !callbackUrl) {
    return NextResponse.json(
      {
        error:
          "Не заданы HATTRICK_CONSUMER_KEY / HATTRICK_CONSUMER_SECRET / HATTRICK_OAUTH_CALLBACK_URL в .env.local. Проверьте файл и перезапустите сервер.",
      },
      { status: 500 },
    );
  }

  const oauthParams = buildOAuthParams(
    "GET",
    HATTRICK_OAUTH_URLS.requestToken,
    { consumerKey, consumerSecret },
    { oauth_callback: callbackUrl },
  );

  let response: Response;
  try {
    response = await fetch(HATTRICK_OAUTH_URLS.requestToken, {
      method: "GET",
      headers: { Authorization: buildAuthorizationHeader(oauthParams) },
    });
  } catch {
    return NextResponse.json({ error: "Не удалось связаться с chpp.hattrick.org. Проверьте интернет-соединение." }, { status: 502 });
  }

  const bodyText = await response.text();

  if (!response.ok) {
    return NextResponse.json(
      { error: "Hattrick отклонил запрос Request Token — проверьте Consumer Key/Secret в .env.local.", details: bodyText, status: response.status },
      { status: 502 },
    );
  }

  const parsed = new URLSearchParams(bodyText);
  const requestToken = parsed.get("oauth_token");
  const requestTokenSecret = parsed.get("oauth_token_secret");

  if (!requestToken || !requestTokenSecret) {
    return NextResponse.json(
      { error: "Hattrick ответил, но не прислал oauth_token/oauth_token_secret.", details: bodyText },
      { status: 502 },
    );
  }

  const authorizeUrl = `${HATTRICK_OAUTH_URLS.authorize}?oauth_token=${encodeURIComponent(requestToken)}`;

  const redirectResponse = NextResponse.redirect(authorizeUrl);

  // Секрет временного токена нужен будет только шагу 3 (обмен на постоянный
  // ключ) и никогда не должен быть виден в браузере — httpOnly не даёт
  // JavaScript на странице его прочитать. Живёт 10 минут: этого достаточно,
  // чтобы пользователь успел авторизоваться на Hattrick и вернуться обратно.
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 600,
    path: "/",
  };
  redirectResponse.cookies.set("hattrick_request_token", requestToken, cookieOptions);
  redirectResponse.cookies.set("hattrick_request_token_secret", requestTokenSecret, cookieOptions);

  return redirectResponse;
}
