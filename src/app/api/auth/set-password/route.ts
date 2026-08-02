import { NextRequest, NextResponse } from "next/server";
import { getStoredAccountId } from "@/lib/hattrickApi";
import { setEmailLogin } from "@/lib/accountsDb";
import { hashPassword, isValidEmail, isValidPassword, MIN_PASSWORD_LENGTH } from "@/lib/passwordAuth";

// Вызывается из предложения "Придумайте email и пароль" на Обзоре (см.
// SetPasswordPrompt.tsx) — привязывает email+пароль к аккаунту (см.
// src/lib/accountsDb.ts). ИСПРАВЛЕНО: раньше требовалось обязательно уже
// подключённое через OAuth Hattrick-подключение — на деле для того, чтобы
// просто добавить пароль ко входу на сайт, Hattrick-подключение не нужно
// вовсе (нужен только сам аккаунт), поэтому проверка теперь смотрит на
// getStoredAccountId(), а не на Hattrick UserID. Сам OAuth-токен (если есть)
// эта операция не трогает — пароль лишь ускоряет последующие входы.
export async function POST(request: NextRequest) {
  const accountId = getStoredAccountId();
  if (!accountId) {
    return NextResponse.json({ error: "Сессия не найдена — сначала войдите в аккаунт." }, { status: 401 });
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
    await setEmailLogin(accountId, email, passwordHash);
    return NextResponse.json({ ok: true });
  } catch (err) {
    // "Email уже занят" — единственная ожидаемая, безопасная для показа
    // причина отказа (см. setEmailLogin в accountsDb.ts). Всё остальное
    // (например, база данных недоступна) — не показываем как есть, только в
    // логах сервера.
    if (err instanceof Error && err.message.includes("уже используется")) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("Ошибка сохранения email/пароля:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Не удалось сохранить email и пароль. Попробуйте позже." }, { status: 500 });
  }
}
