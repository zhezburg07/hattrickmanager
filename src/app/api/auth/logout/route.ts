import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/siteSession";

// Не читает ничего из запроса — без force-dynamic Next.js статически
// закешировал бы этот редирект (та же ловушка, что была у request-token,
// см. коммит "Fix OAuth request-token route being statically cached on Vercel").
export const dynamic = "force-dynamic";

// Разлогинивает пользователя: удаляет cookie сессии сайта (см.
// src/lib/siteSession.ts) и отправляет обратно на публичную главную. Сам
// OAuth-токен в базе данных (см. src/lib/hattrickTokensDb.ts) не трогаем —
// он остаётся привязанным к Hattrick UserID и просто перестаёт быть
// доступным этому браузеру, пока пользователь не подключится заново.
export async function GET(request: Request) {
  const redirectResponse = NextResponse.redirect(new URL("/", request.url));

  redirectResponse.cookies.delete(SESSION_COOKIE);

  // На случай, если в браузере ещё остались cookie версии сайта до перехода
  // на хранение токена в базе данных — подчищаем и их тоже.
  redirectResponse.cookies.delete("hattrick_access_token");
  redirectResponse.cookies.delete("hattrick_access_token_secret");
  redirectResponse.cookies.delete("hattrick_user_id");

  return redirectResponse;
}
