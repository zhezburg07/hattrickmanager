import { NextRequest, NextResponse } from "next/server";
import { resolveManagerUserId } from "@/lib/manager";
import { linkOrCreateHattrickConnection } from "@/lib/accountsDb";
import { SESSION_COOKIE, buildSessionCookieValue } from "@/lib/siteSession";

// Вызывается один раз при каждом заходе в личный кабинет (см.
// src/components/SessionUpgrader.tsx, подключён в dashboard/layout.tsx).
// Если пользователь вошёл через "мягкий" откат (см. /api/auth/callback —
// managercompendium.xml не ответил при входе, поэтому cookie сессии сайта
// не была выдана), здесь мы пробуем получить UserID ещё раз и, если
// получилось, "дозаписываем" cookie сессии сайта — без этого пользователь
// так и остался бы без hm_session до следующего полного прохождения OAuth.
export async function POST(request: NextRequest) {
  if (request.cookies.get(SESSION_COOKIE)?.value) {
    return NextResponse.json({ upgraded: false, reason: "already-upgraded" });
  }

  const accessToken = request.cookies.get("hattrick_access_token")?.value;
  const accessTokenSecret = request.cookies.get("hattrick_access_token_secret")?.value;
  if (!accessToken || !accessTokenSecret) {
    return NextResponse.json({ upgraded: false, reason: "no-session" });
  }

  const { userId, diagnostics } = await resolveManagerUserId({ accessToken, accessTokenSecret }, 1);
  if (!userId) {
    console.error("Не удалось выдать cookie сессии сайта:", diagnostics.join(" | "));
    return NextResponse.json({ upgraded: false, reason: "manager-failed" });
  }

  // Этот роут выполняется только когда SESSION_COOKIE ещё нет (см. ранний
  // return выше) — значит currentAccountId всегда null: тут не может быть
  // сценария "уже залогинен, привязываю ещё одну команду", только "первое
  // подключение" или "снова увидели уже известный hattrick_user_id".
  let result;
  try {
    result = await linkOrCreateHattrickConnection({
      hattrickUserId: userId,
      accessToken,
      accessTokenSecret,
      currentAccountId: null,
    });
  } catch (err) {
    console.error("Не удалось сохранить токен в базе при апгрейде сессии:", err instanceof Error ? err.message : err);
    return NextResponse.json({ upgraded: false, reason: "db-error" });
  }

  if (result.status === "conflict") {
    // Практически недостижимо при currentAccountId: null (конфликт возможен
    // только если существующая привязка принадлежит ДРУГОМУ аккаунту, а не
    // нашему null) — обрабатываем defensively на случай гонки запросов.
    console.error("Конфликт привязки при апгрейде сессии: команда уже привязана к другому аккаунту.");
    return NextResponse.json({ upgraded: false, reason: "already-linked" });
  }

  if (result.status === "no-session") {
    // См. тот же комментарий в /api/auth/callback — раньше здесь молча
    // заводился новый "голый" аккаунт без пароля. Теперь просто ничего не
    // делаем: пользователь остаётся на временных cookie (hasLegacySoftLogin
    // в dashboard/layout.tsx) до следующей попытки, вместо тихого создания
    // аккаунта. SessionUpgrader.tsx всё равно не проверяет тело ответа.
    return NextResponse.json({ upgraded: false, reason: "no-account-session" });
  }

  // Всегда короткая (сессионная) cookie — см. тот же комментарий в
  // /api/auth/callback: регистрация теперь обязательна для всех, отдельная
  // долгоживущая ветка для "чистых" OAuth-аккаунтов без пароля больше не
  // нужна.
  const response = NextResponse.json({ upgraded: true });
  response.cookies.set(SESSION_COOKIE, buildSessionCookieValue(result.accountId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
  // Запасные cookie больше не нужны — теперь всё идёт через cookie сессии сайта.
  response.cookies.delete("hattrick_access_token");
  response.cookies.delete("hattrick_access_token_secret");
  return response;
}
