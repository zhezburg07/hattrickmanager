import { NextRequest, NextResponse } from "next/server";
import { registerAccount } from "@/lib/accountsDb";
import {
  hashPassword,
  isValidEmail,
  isValidPassword,
  isValidUsername,
  MIN_PASSWORD_LENGTH,
} from "@/lib/passwordAuth";
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

// Регистрация нового аккаунта БЕЗ подключённой команды Hattrick — сама
// команда (hattrick_connections, см. src/lib/accountsDb.ts) привязывается
// позже, отдельным шагом ("Подключить команду" в урезанном личном
// кабинете, см. ReducedDashboard.tsx), через обычный OAuth. Здесь создаётся
// только запись в accounts: логин, email, хеш пароля.
export async function POST(request: NextRequest) {
  let body: { username?: string; email?: string; confirmEmail?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const username = (body.username ?? "").trim();
  const email = (body.email ?? "").trim();
  const confirmEmail = (body.confirmEmail ?? "").trim();
  const password = body.password ?? "";

  if (!isValidUsername(username)) {
    return NextResponse.json(
      { error: "Логин должен быть от 3 до 24 символов (буквы, цифры, _ и -)." },
      { status: 400 },
    );
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Введите корректный email." }, { status: 400 });
  }
  // Повторная проверка на сервере — клиент уже сверяет email/confirmEmail
  // вживую (см. HomeSidebar.tsx), но клиентскому JS доверять нельзя.
  if (email.toLowerCase() !== confirmEmail.toLowerCase()) {
    return NextResponse.json({ error: "Email и подтверждение email не совпадают." }, { status: 400 });
  }
  if (!isValidPassword(password)) {
    return NextResponse.json({ error: `Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов.` }, { status: 400 });
  }

  try {
    const passwordHash = await hashPassword(password);
    const { accountId } = await registerAccount({ username, email, passwordHash });

    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, buildSessionCookieValue(accountId), cookieOptions(60 * 60 * 24 * 400));
    return response;
  } catch (err) {
    // "Логин/email уже занят" — единственные ожидаемые, безопасные для
    // показа причины отказа (см. registerAccount в accountsDb.ts). Всё
    // остальное (например, база данных недоступна) — не показываем как
    // есть, только в логах сервера.
    if (err instanceof Error && (err.message.includes("уже занят") || err.message.includes("уже используется"))) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("Ошибка регистрации:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Не удалось зарегистрироваться. Попробуйте позже." }, { status: 500 });
  }
}
