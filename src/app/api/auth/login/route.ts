import { NextRequest, NextResponse } from "next/server";
import { findByEmail } from "@/lib/hattrickTokensDb";
import { verifyPassword } from "@/lib/passwordAuth";
import { SESSION_COOKIE, buildSessionCookieValue } from "@/lib/siteSession";

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

// Вход по email+паролю — альтернатива повторному походу на OAuth Hattrick
// (см. страницу /login). При совпадении ставит ТУ ЖЕ cookie сессии сайта
// (SESSION_COOKIE), что и обычный OAuth-вход (см. /api/auth/callback) — она
// хранит только подписанный hattrick_user_id, а сам Hattrick-токен уже лежит
// в базе с прошлого OAuth-подключения. Поэтому дальше всё работает как
// обычно: getStoredHattrickTokens() найдёт тот же токен по этому UserID.
export async function POST(request: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const email = (body.email ?? "").trim();
  const password = body.password ?? "";

  if (!email || !password) {
    return NextResponse.json({ error: "Введите email и пароль." }, { status: 400 });
  }

  try {
    const record = await findByEmail(email);
    // Намеренно один и тот же ответ и когда email не найден, и когда пароль
    // не подошёл — чтобы нельзя было перебором узнать, какие email вообще
    // зарегистрированы.
    const invalidResponse = () => NextResponse.json({ error: "Неверный email или пароль." }, { status: 401 });

    if (!record) return invalidResponse();

    const matches = await verifyPassword(password, record.passwordHash);
    if (!matches) return invalidResponse();

    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, buildSessionCookieValue(record.hattrickUserId), cookieOptions(60 * 60 * 24 * 400));
    return response;
  } catch (err) {
    // База данных недоступна и т.п. — честная ошибка вместо сырого падения
    // (проверено вживую: без этого try/catch сюда прилетало необработанное
    // исключение, и клиент видел просто "не удалось связаться с сервером"
    // без какой-либо подсказки, что не так). Подробности — только в логах
    // сервера, не в ответе клиенту: это публичная форма входа, незачем
    // показывать посторонним внутренние детали ошибки.
    console.error("Ошибка входа по email:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Не удалось выполнить вход. Попробуйте позже." }, { status: 500 });
  }
}
