import { NextRequest, NextResponse } from "next/server";
import { applyPasswordReset, findByResetToken } from "@/lib/hattrickTokensDb";
import { hashPassword, isValidPassword, MIN_PASSWORD_LENGTH } from "@/lib/passwordAuth";

export async function POST(request: NextRequest) {
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
    await applyPasswordReset(record.hattrickUserId, passwordHash);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Ошибка сброса пароля:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Не удалось сбросить пароль. Попробуйте позже." }, { status: 500 });
  }
}
