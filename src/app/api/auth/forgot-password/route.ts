import { NextRequest, NextResponse } from "next/server";
import { findByEmailAnyStatus, saveResetToken } from "@/lib/hattrickTokensDb";
import { generateResetToken } from "@/lib/passwordAuth";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 час

// ВРЕМЕННО: отправка настоящего письма ещё не подключена (нужен сторонний
// email-сервис, см. чат — решили отложить). Пока что ссылка для сброса
// возвращается прямо в ответе, и страница /forgot-password показывает её
// на экране вместо письма. Когда появится email-сервис, здесь нужно будет
// заменить блок "resetLink в ответе" на реальную отправку письма на email —
// вся остальная логика (токен, срок жизни, страница сброса) уже готова и
// менять её не придётся.
export async function POST(request: NextRequest) {
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
    // выдаём ссылку (см. neutralMessage ниже), но отвечаем 200 в обоих случаях.
    const neutralMessage =
      "Если такой email привязан к аккаунту, ссылка для сброса пароля готова (см. ниже — пока без реальной отправки письма).";

    if (!record) {
      return NextResponse.json({ ok: true, message: neutralMessage, resetLink: null });
    }

    const token = generateResetToken();
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    await saveResetToken(record.hattrickUserId, token, expiresAt);

    const resetLink = new URL(`/reset-password?token=${token}`, request.nextUrl.origin).toString();

    return NextResponse.json({ ok: true, message: neutralMessage, resetLink });
  } catch (err) {
    console.error("Ошибка запроса сброса пароля:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Не удалось обработать запрос. Попробуйте позже." }, { status: 500 });
  }
}
