import { NextRequest, NextResponse } from "next/server";
import { buildAuthorizationHeader, buildOAuthParams, HATTRICK_OAUTH_URLS } from "@/lib/hattrickOAuth";
import { resolveManagerUserId } from "@/lib/manager";
import { linkOrCreateHattrickConnection } from "@/lib/accountsDb";
import { SESSION_COOKIE, buildSessionCookieValue, verifySessionCookieValue } from "@/lib/siteSession";

function cookieOptions(maxAge?: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    ...(maxAge !== undefined ? { maxAge } : {}),
  };
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
  // access-токена, не меняется) — нужен как ключ для привязки к аккаунту
  // сайта (см. src/lib/accountsDb.ts) и выдачи cookie сессии сайта. ВАЖНО:
  // получение UserID — второстепенный шаг и НЕ должно блокировать сам вход.
  // Если он не удался (см. diagnostics ниже — точная причина логируется и
  // показывается один раз баннером в личном кабинете), пользователь всё
  // равно попадает в кабинет — см. fallback-cookies в конце функции, cookie
  // сессии сайта тогда не ставится вовсе (см. /api/auth/session-upgrade).
  const { userId: managerUserId, diagnostics } = await resolveManagerUserId({ accessToken, accessTokenSecret });

  const redirectResponse = NextResponse.redirect(new URL("/dashboard", request.url));
  redirectResponse.cookies.delete("hattrick_request_token");
  redirectResponse.cookies.delete("hattrick_request_token_secret");

  if (managerUserId) {
    try {
      // Если браузер уже нёс валидную cookie сессии сайта в этом запросе —
      // значит пользователь был залогинен (по логину/паролю или прошлой
      // OAuth-сессии) ДО того, как начал "Подключить команду". Cookie
      // сессии переживает весь редирект-цикл OAuth (это обычная, не
      // временная cookie), так что её достаточно прочитать прямо здесь —
      // отдельный OAuth state-параметр не нужен. Если она есть — новая
      // команда привязывается к ТОМУ ЖЕ аккаунту, а не создаёт новый (см.
      // чат: "hattrick_user_id привязывается к уже существующей учётной
      // записи").
      const existingSessionCookie = request.cookies.get(SESSION_COOKIE)?.value;
      const currentAccountId = existingSessionCookie ? verifySessionCookieValue(existingSessionCookie) : null;

      // Пользователь мог прийти сюда через "Подтвердить и привязать сюда"
      // (см. ReducedDashboard.tsx) — тогда /api/auth/request-token заранее
      // поставил cookie с ИМЕННО этим hattrickUserId, подтверждая, что
      // пользователь осознанно согласился на перепривязку конфликтующей
      // команды. Сверяем значение, а не просто наличие cookie — иначе старая
      // cookie от подтверждения другой команды могла бы молча сработать и
      // для этой.
      const confirmReassignCookie = request.cookies.get("hm_confirm_reassign")?.value;
      const confirmReassign = !!confirmReassignCookie && confirmReassignCookie === managerUserId;

      const result = await linkOrCreateHattrickConnection({
        hattrickUserId: managerUserId,
        accessToken,
        accessTokenSecret,
        currentAccountId,
        confirmReassign,
      });

      redirectResponse.cookies.delete("hm_confirm_reassign");

      if (result.status === "conflict") {
        // Эта команда Hattrick уже привязана к ДРУГОМУ аккаунту сайта — не
        // перезаписываем чужую привязку молча, честно сообщаем об этом.
        // hattrickUserId в адресе — чтобы баннер в /dashboard мог предложить
        // явное подтверждение перепривязки (см. confirmReassign выше), не
        // заставляя проходить OAuth ещё раз только ради этого значения.
        const conflictResponse = NextResponse.redirect(
          new URL(`/dashboard?connectError=already-linked&hattrickUserId=${encodeURIComponent(managerUserId)}`, request.url),
        );
        conflictResponse.cookies.delete("hattrick_request_token");
        conflictResponse.cookies.delete("hattrick_request_token_secret");
        conflictResponse.cookies.delete("hm_confirm_reassign");
        return conflictResponse;
      }

      if (result.status === "no-session") {
        // Короткая сессия сайта исчезла где-то между /api/auth/request-token
        // и этим callback'ом (например, пользователь закрыл браузер, пока
        // сидел на странице авторизации Hattrick) — раньше это молча
        // заводило новый "голый" аккаунт без пароля (см. чат). Вместо этого
        // отправляем на главную с понятным объяснением вместо тихого
        // создания аккаунта — HomeSidebar.tsx покажет сообщение и откроет
        // вкладку регистрации.
        const sessionExpiredResponse = NextResponse.redirect(
          new URL("/?connectAuthRequired=1&sessionExpired=1", request.url),
        );
        sessionExpiredResponse.cookies.delete("hattrick_request_token");
        sessionExpiredResponse.cookies.delete("hattrick_request_token_secret");
        sessionExpiredResponse.cookies.delete("hm_confirm_reassign");
        return sessionExpiredResponse;
      }

      // Собственная cookie сессии сайта (см. src/lib/siteSession.ts) —
      // содержит только подписанный ID аккаунта, а не сам OAuth-токен (тот
      // теперь в базе). При следующих визитах src/lib/hattrickApi.ts находит
      // токен по этой cookie без повторного прохождения OAuth-флоу.
      //
      // Всегда короткая (сессионная) cookie — регистрация теперь обязательна
      // для всех, "чистых" OAuth-аккаунтов без пароля больше не заводится
      // (см. чат), поэтому больше нет причины различать длинную/короткую
      // сессию по признаку "есть пароль или нет" — раньше это только
      // порождало путаницу (OAuth в одном визите с паролем "перезаписывал"
      // короткую сессию долгоживущей).
      redirectResponse.cookies.set(SESSION_COOKIE, buildSessionCookieValue(result.accountId), cookieOptions());
      return redirectResponse;
    } catch (err) {
      // Сохранение в базу не удалось — тоже не блокируем вход, откатываемся
      // к обычной сессии ниже вместе с остальными причинами сбоя.
      diagnostics.push(`Не удалось сохранить токен в базе: ${err instanceof Error ? err.message : "неизвестная ошибка"}`);
    }
  }

  // "Мягкий" откат: UserID не определился (или не сохранился в базу) — вход
  // всё равно завершается успешно, просто cookie сессии сайта (hm_session)
  // пока не ставится. Access Token/Secret кладём прямо в cookie БЕЗ maxAge —
  // обычная сессия браузера. Если managercompendium.xml сработает при
  // обычном использовании сайта, cookie сессии сайта подключится сама (см.
  // /api/auth/session-upgrade + src/components/SessionUpgrader.tsx).
  console.error("Вход без cookie сессии сайта — не удалось определить UserID:", diagnostics.join(" | "));

  redirectResponse.cookies.set("hattrick_access_token", accessToken, cookieOptions());
  redirectResponse.cookies.set("hattrick_access_token_secret", accessTokenSecret, cookieOptions());
  redirectResponse.cookies.set(
    "session_warning",
    encodeURIComponent(diagnostics.join(" | ") || "неизвестная причина"),
    cookieOptions(30),
  );

  return redirectResponse;
}
