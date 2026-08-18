import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPassword, ADMIN_SESSION_COOKIE } from "@/lib/adminAuth";
import { clientIp } from "@/lib/rateLimit";
import { checkLoginLockout, recordFailedLogin, recordLoginSuccess } from "@/lib/loginLockout";

// Постепенная лестница блокировок (см. loginLockout.ts) — та же схема, что
// и у обычного входа: 3-4 неудачные попытки подряд — предупреждение без
// блокировки, 5-я — блокировка на 1 минуту, дальше 15 минут → 1 час → 1
// сутки. Раньше единственная защита всей админ-панели была один статичный
// пароль без вообще какого-либо ограничения на перебор (см. чат "Аудит
// проекта: безопасность"), затем — фиксированный порог "5 за 15 минут",
// который на практике оказался слишком строгим для обычных опечаток.
export async function POST(request: NextRequest) {
  const bucketKey = `admin-login:${clientIp(request)}`;

  try {
    const lockout = await checkLoginLockout(bucketKey);
    if (lockout.blocked) {
      return NextResponse.redirect(new URL("/admin?error=ratelimit", request.url));
    }
  } catch (err) {
    console.error("Ограничение входа (админ): не удалось проверить блокировку —", err instanceof Error ? err.message : err);
  }

  const formData = await request.formData();
  const password = String(formData.get("password") ?? "");

  const token = verifyAdminPassword(password);
  if (!token) {
    try {
      const attempt = await recordFailedLogin(bucketKey);
      if (attempt.blocked || attempt.warning) {
        return NextResponse.redirect(new URL("/admin?error=ratelimit", request.url));
      }
    } catch (err) {
      console.error("Ограничение входа (админ): не удалось записать неудачную попытку —", err instanceof Error ? err.message : err);
    }
    return NextResponse.redirect(new URL("/admin?error=1", request.url));
  }

  try {
    await recordLoginSuccess(bucketKey);
  } catch (err) {
    console.error("Ограничение входа (админ): не удалось сбросить счётчик после успешного входа —", err instanceof Error ? err.message : err);
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
