import { NextRequest, NextResponse } from "next/server";
import { resolveManagerUserId } from "@/lib/manager";
import { saveHattrickTokens } from "@/lib/hattrickTokensDb";
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

  try {
    await saveHattrickTokens(userId, accessToken, accessTokenSecret);
  } catch (err) {
    console.error("Не удалось сохранить токен в базе при апгрейде сессии:", err instanceof Error ? err.message : err);
    return NextResponse.json({ upgraded: false, reason: "db-error" });
  }

  const response = NextResponse.json({ upgraded: true });
  response.cookies.set(SESSION_COOKIE, buildSessionCookieValue(userId), {
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
