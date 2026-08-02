import { Resend } from "resend";

// Отправка транзакционных писем через Resend (resend.com) — простой API
// поверх обычного HTTP, без своего SMTP-сервера. RESEND_API_KEY обязателен
// (см. .env.local / переменные окружения Vercel), иначе throw — вызывающий
// код (см. /api/auth/forgot-password) сам решает, что делать с ошибкой.
//
// RESEND_FROM_EMAIL необязателен: по умолчанию используется
// "onboarding@resend.dev" — тестовый адрес Resend, работающий БЕЗ
// подтверждения своего домена, но с ограничением: пока домен не подтверждён
// в личном кабинете Resend, письма с этого адреса доходят только на email,
// которым зарегистрирован сам аккаунт Resend (это ограничение самого
// Resend, не этого кода). Чтобы отправлять реальным пользователям на любой
// email, нужно подтвердить свой домен в Resend и указать адрес с ним в
// RESEND_FROM_EMAIL (например, "HattrickManager <no-reply@hattrickmanager.org>").
function resendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("Не задана переменная окружения RESEND_API_KEY — отправка email не настроена.");
  }
  return new Resend(apiKey);
}

function fromAddress(): string {
  return process.env.RESEND_FROM_EMAIL ?? "HattrickManager <onboarding@resend.dev>";
}

export async function sendPasswordResetEmail(to: string, resetLink: string): Promise<void> {
  const resend = resendClient();
  const { error } = await resend.emails.send({
    from: fromAddress(),
    to,
    subject: "Восстановление пароля — HattrickManager",
    text: `Для сброса пароля перейдите по ссылке: ${resetLink}\n\nСсылка действует 1 час. Если вы не запрашивали сброс пароля — просто проигнорируйте это письмо.`,
    html: `
      <p>Для сброса пароля перейдите по ссылке:</p>
      <p><a href="${resetLink}">${resetLink}</a></p>
      <p>Ссылка действует 1 час. Если вы не запрашивали сброс пароля — просто проигнорируйте это письмо.</p>
    `,
  });
  if (error) {
    throw new Error(`Resend отклонил отправку письма: ${error.message}`);
  }
}
