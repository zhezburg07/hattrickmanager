import { NextRequest, NextResponse } from "next/server";
import { resolveManagerUserId } from "@/lib/manager";
import { linkOrCreateHattrickConnection } from "@/lib/accountsDb";
import { SESSION_COOKIE, buildSessionCookieValue } from "@/lib/siteSession";

// Вызывается один раз при каждом заходе в личный кабинет (см.
// src/components/SessionUpgrader.tsx, подключён в dashboard/layout.tsx).
// Если пользователь вошёл через "мягкий" откат (см. /api/auth/callback —
// managercompendium.xml не ответил при входе, поэтому долгоживущая сессия
// не была выдана), здесь мы пробуем получить UserID ещё раз и, если
// получилось, "дозаписываем" долгоживущую сессию — без этого при каждом
// закрытии браузера пришлось бы заново проходить OAuth.
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
    console.error("Не удалось обновить сессию до долгоживущей:", diagnostics.join(" | "));
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

  const response = NextResponse.json({ upgraded: true });
  response.cookies.set(SESSION_COOKIE, buildSessionCookieValue(result.accountId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 400,
    path: "/",
  });
  // Запасные cookie больше не нужны — теперь всё идёт через долгоживущую сессию.
  response.cookies.delete("hattrick_access_token");
  response.cookies.delete("hattrick_access_token_secret");
  return response;
}
