import { NextResponse } from "next/server";

// Не читает ничего из запроса — без force-dynamic Next.js статически
// закешировал бы этот редирект (та же ловушка, что была у request-token,
// см. коммит "Fix OAuth request-token route being statically cached on Vercel").
export const dynamic = "force-dynamic";

// Разлогинивает пользователя: удаляет постоянный ключ доступа к Hattrick
// (см. src/lib/hattrickApi.ts) и отправляет обратно на публичную главную.
export async function GET(request: Request) {
  const redirectResponse = NextResponse.redirect(new URL("/", request.url));

  // Удаляем только cookie текущей сессии — историю навыков и т.п. в базе
  // данных (см. src/lib/playerHistoryDb.ts) это не трогает: она хранится
  // отдельно, по Hattrick UserID, и никуда не денется до следующего входа.
  redirectResponse.cookies.delete("hattrick_access_token");
  redirectResponse.cookies.delete("hattrick_access_token_secret");
  redirectResponse.cookies.delete("hattrick_user_id");

  return redirectResponse;
}
