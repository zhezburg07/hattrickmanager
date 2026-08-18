import { NextRequest, NextResponse } from "next/server";
import { findByEmailAnyStatus, saveResetToken } from "@/lib/accountsDb";
import { generateResetToken } from "@/lib/passwordAuth";
import { sendPasswordResetEmail } from "@/lib/email";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 час

// 5 запросов в час на IP — защита и от подбора email (см. neutralMessage
// ниже), и от использования формы как бесплатной email-бомбы на чужой адрес
// (см. чат "Аудит проекта").
const FORGOT_PASSWORD_RATE_LIMIT_MAX = 5;
const FORGOT_PASSWORD_RATE_LIMIT_WINDOW_SECONDS = 60 * 60;

// Ссылка для сброса пароля теперь реально отправляется письмом через Resend
// (см. src/lib/email.ts), а не показывается на экране — раньше это было
// временным решением до подключения email-сервиса.
export async function POST(request: NextRequest) {
  try {
    const rateLimit = await checkRateLimit(
      `forgot-password:${clientIp(request)}`,
      FORGOT_PASSWORD_RATE_LIMIT_MAX,
      FORGOT_PASSWORD_RATE_LIMIT_WINDOW_SECONDS,
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Слишком много запросов. Попробуйте позже." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
      );
    }
  } catch (err) {
    console.error("Rate limit (сброс пароля): не удалось проверить —", err instanceof Error ? err.message : err);
  }

  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const email = (body.email ?? "").trim();
  if (!email) {
    return NextResponse.json({ error: "Введите email." }, { status: 400 });
  }

  try {
    const record = await findByEmailAnyStatus(email);

    // Намеренно НЕ сообщаем прямым текстом "такого email нет" — иначе можно
    // было бы перебором узнать чужие email. Если email не найден, просто не
    // отправляем письмо, но отвечаем 200 в обоих случаях с одним и тем же
    // нейтральным текстом.
    const neutralMessage = "Если такой email привязан к аккаунту, на него отправлено письмо со ссылкой для сброса пароля.";

    if (!record) {
      return NextResponse.json({ ok: true, message: neutralMessage });
    }

    const token = generateResetToken();
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    await saveResetToken(record.accountId, token, expiresAt);

    const resetLink = new URL(`/reset-password?token=${token}`, request.nextUrl.origin).toString();
    await sendPasswordResetEmail(email, resetLink);

    return NextResponse.json({ ok: true, message: neutralMessage });
  } catch (err) {
    // Ошибка отправки письма (например, RESEND_API_KEY не задан или Resend
    // отклонил запрос) — честная 500, а не молчаливый "ok": пользователь
    // иначе будет ждать письмо, которое никогда не придёт, без единой
    // подсказки, что что-то не так.
    console.error("Ошибка запроса сброса пароля:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Не удалось обработать запрос. Попробуйте позже." }, { status: 500 });
  }
}
