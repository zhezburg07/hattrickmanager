import { NextRequest, NextResponse } from "next/server";
import { applyPasswordReset, findByResetToken } from "@/lib/accountsDb";
import { hashPassword, isValidPassword, MIN_PASSWORD_LENGTH } from "@/lib/passwordAuth";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";

// 10 попыток за 15 минут на IP — защита от перебора самого токена сброса
// (см. чат "Аудит проекта"), тот же порядок, что и у входа по паролю.
const RESET_PASSWORD_RATE_LIMIT_MAX = 10;
const RESET_PASSWORD_RATE_LIMIT_WINDOW_SECONDS = 15 * 60;

export async function POST(request: NextRequest) {
  try {
    const rateLimit = await checkRateLimit(
      `reset-password:${clientIp(request)}`,
      RESET_PASSWORD_RATE_LIMIT_MAX,
      RESET_PASSWORD_RATE_LIMIT_WINDOW_SECONDS,
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Слишком много попыток. Попробуйте позже." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
      );
    }
  } catch (err) {
    console.error("Rate limit (новый пароль): не удалось проверить —", err instanceof Error ? err.message : err);
  }

  let body: { token?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const token = body.token ?? "";
  const password = body.password ?? "";

  if (!token) {
    return NextResponse.json({ error: "Ссылка для сброса пароля повреждена — не хватает токена." }, { status: 400 });
  }
  if (!isValidPassword(password)) {
    return NextResponse.json({ error: `Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов.` }, { status: 400 });
  }

  try {
    const record = await findByResetToken(token);
    if (!record) {
      return NextResponse.json({ error: "Ссылка недействительна — возможно, ей уже воспользовались." }, { status: 400 });
    }
    if (new Date(record.expiresAt).getTime() < Date.now()) {
      return NextResponse.json({ error: "Срок действия ссылки истёк (1 час) — запросите сброс пароля заново." }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);
    await applyPasswordReset(record.accountId, passwordHash);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Ошибка сброса пароля:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Не удалось сбросить пароль. Попробуйте позже." }, { status: 500 });
  }
}
