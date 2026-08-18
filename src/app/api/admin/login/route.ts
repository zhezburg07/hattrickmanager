import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPassword, ADMIN_SESSION_COOKIE } from "@/lib/adminAuth";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";

// Строже, чем у обычного входа (5 за 15 минут, не 10) — единственная защита
// всей админ-панели раньше была ровно один статичный пароль без вообще
// какого-либо ограничения на перебор (см. чат "Аудит проекта: безопасность"
// — самая высокая по значимости цель из всех auth-эндпоинтов).
const ADMIN_LOGIN_RATE_LIMIT_MAX = 5;
const ADMIN_LOGIN_RATE_LIMIT_WINDOW_SECONDS = 15 * 60;

export async function POST(request: NextRequest) {
  try {
    const rateLimit = await checkRateLimit(
      `admin-login:${clientIp(request)}`,
      ADMIN_LOGIN_RATE_LIMIT_MAX,
      ADMIN_LOGIN_RATE_LIMIT_WINDOW_SECONDS,
    );
    if (!rateLimit.allowed) {
      return NextResponse.redirect(new URL("/admin?error=ratelimit", request.url));
    }
  } catch (err) {
    console.error("Rate limit (админ-вход): не удалось проверить —", err instanceof Error ? err.message : err);
  }

  const formData = await request.formData();
  const password = String(formData.get("password") ?? "");

  const token = verifyAdminPassword(password);
  if (!token) {
    return NextResponse.redirect(new URL("/admin?error=1", request.url));
  }

  const response = NextResponse.redirect(new URL("/admin", request.url));
  response.cookies.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return response;
}
