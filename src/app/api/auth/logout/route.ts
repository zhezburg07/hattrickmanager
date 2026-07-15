import { NextResponse } from "next/server";

// Не читает ничего из запроса — без force-dynamic Next.js статически
// закешировал бы этот редирект (та же ловушка, что была у request-token,
// см. коммит "Fix OAuth request-token route being statically cached on Vercel").
export const dynamic = "force-dynamic";

// Разлогинивает пользователя: удаляет постоянный ключ доступа к Hattrick
// (см. src/lib/hattrickApi.ts) и отправляет обратно на публичную главную.
export async function GET(request: Request) {
  const redirectResponse = NextResponse.redirect(new URL("/", request.url));

  redirectResponse.cookies.delete("hattrick_access_token");
  redirectResponse.cookies.delete("hattrick_access_token_secret");

  return redirectResponse;
}
