import { NextRequest, NextResponse } from "next/server";
import { getStoredHattrickUserId } from "@/lib/hattrickApi";
import { setEmailLogin } from "@/lib/hattrickTokensDb";
import { hashPassword, isValidEmail, isValidPassword, MIN_PASSWORD_LENGTH } from "@/lib/passwordAuth";

// Вызывается из предложения "Придумайте email и пароль" на Обзоре (см.
// SetPasswordPrompt.tsx) — привязывает email+пароль к УЖЕ подключённому
// через OAuth аккаунту (значит, hattrick_user_id уже известен из cookie
// сессии). Сам OAuth-токен эта операция не трогает — пароль лишь ускоряет
// последующие входы, ничего не заменяет.
export async function POST(request: NextRequest) {
  const hattrickUserId = getStoredHattrickUserId();
  if (!hattrickUserId) {
    return NextResponse.json({ error: "Сессия не найдена — сначала подключите команду через Hattrick." }, { status: 401 });
  }

  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const email = (body.email ?? "").trim();
  const password = body.password ?? "";

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Введите корректный email." }, { status: 400 });
  }
  if (!isValidPassword(password)) {
    return NextResponse.json({ error: `Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов.` }, { status: 400 });
  }

  try {
    const passwordHash = await hashPassword(password);
    await setEmailLogin(hattrickUserId, email, passwordHash);
    return NextResponse.json({ ok: true });
  } catch (err) {
    // "Email уже занят" — единственная ожидаемая, безопасная для показа
    // причина отказа (см. setEmailLogin в hattrickTokensDb.ts). Всё
    // остальное (например, база данных недоступна) — не показываем как
    // есть, только в логах сервера.
    if (err instanceof Error && err.message.includes("уже используется")) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("Ошибка сохранения email/пароля:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Не удалось сохранить email и пароль. Попробуйте позже." }, { status: 500 });
  }
}
