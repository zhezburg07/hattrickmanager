import { NextRequest, NextResponse } from "next/server";
import { findByIdentifier } from "@/lib/accountsDb";
import { verifyPassword } from "@/lib/passwordAuth";
import { SESSION_COOKIE, buildSessionCookieValue } from "@/lib/siteSession";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";

// 10 попыток за 15 минут на IP — типичный порог защиты от перебора пароля,
// достаточно щедрый, чтобы не мешать реальному пользователю, опечатавшемуся
// пару раз (см. чат "Аудит проекта").
const LOGIN_RATE_LIMIT_MAX = 10;
const LOGIN_RATE_LIMIT_WINDOW_SECONDS = 15 * 60;

// Без maxAge — это намеренно обычная сессионная cookie: вход по паролю
// должен требовать повторного ввода логина/пароля при каждом новом визите
// после закрытия браузера (см. чат), в отличие от долгоживущей сессии
// OAuth-подключения к Hattrick (см. /api/auth/callback,
// /api/auth/session-upgrade — там maxAge 400 дней намеренно не трогаем).
function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
}

// Вход по логину ИЛИ email + пароль — альтернатива повторному походу на
// OAuth Hattrick (см. страницу /login). Регистрация (см. /api/auth/register)
// добавила логин как ещё один валидный идентификатор для входа, не только
// email. При совпадении ставит ТУ ЖЕ cookie сессии сайта (SESSION_COOKIE),
// что и обычный OAuth-вход (см. /api/auth/callback) — она хранит только
// подписанный ID аккаунта (см. src/lib/accountsDb.ts), не сам Hattrick-
// токен — тот (если команда подключена) уже лежит в базе отдельно.
export async function POST(request: NextRequest) {
  try {
    const rateLimit = await checkRateLimit(
      `login:${clientIp(request)}`,
      LOGIN_RATE_LIMIT_MAX,
      LOGIN_RATE_LIMIT_WINDOW_SECONDS,
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Слишком много попыток входа. Попробуйте позже." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
      );
    }
  } catch (err) {
    // Rate limit не должен блокировать вход, если сама проверка не удалась
    // (например, БД временно недоступна) — честно логируем и пускаем
    // дальше, а не превращаем сбой инфраструктуры защиты в отказ в доступе
    // для всех.
    console.error("Rate limit (вход): не удалось проверить —", err instanceof Error ? err.message : err);
  }

  let body: { identifier?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const identifier = (body.identifier ?? "").trim();
  const password = body.password ?? "";

  if (!identifier || !password) {
    return NextResponse.json({ error: "Введите логин/email и пароль." }, { status: 400 });
  }

  try {
    const record = await findByIdentifier(identifier);
    // Намеренно один и тот же ответ и когда логин/email не найден, и когда
    // пароль не подошёл — чтобы нельзя было перебором узнать, какие
    // логины/email вообще зарегистрированы.
    const invalidResponse = () => NextResponse.json({ error: "Неверный логин, email или пароль." }, { status: 401 });

    if (!record) return invalidResponse();

    const matches = await verifyPassword(password, record.passwordHash);
    if (!matches) return invalidResponse();

    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, buildSessionCookieValue(record.accountId), cookieOptions());
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
