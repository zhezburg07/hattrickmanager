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
  const from = fromAddress();

  // resend.emails.send() по контракту SDK (node_modules/resend/dist/index.mjs,
  // fetchRequest) не бросает исключение на HTTP-ошибку от Resend — она
  // всегда приходит как { data: null, error: {...} } в самом ответе. Но
  // сама библиотека логирует это (logError) только когда NODE_ENV !==
  // "production" — то есть НИКОГДА в проде на Vercel. Раньше здесь читалась
  // только error.message без status/name — теперь логируем весь объект
  // ошибки Resend целиком, это единственное место, где виден настоящий
  // текст причины 403 (неверный/просроченный ключ, ограничение аккаунта,
  // непроверенный домен отправителя, песочница onboarding@resend.dev и
  // т.п.). Внешний try/catch — на случай, если сам fetch внутри SDK всё же
  // выбросит исключение (сетевой сбой и т.п.), а не просто вернёт error.
  let response: Awaited<ReturnType<typeof resend.emails.send>>;
  try {
    response = await resend.emails.send({
      from,
      to,
      subject: "Восстановление пароля — HattrickManager",
      text: `Для сброса пароля перейдите по ссылке: ${resetLink}\n\nСсылка действует 1 час. Если вы не запрашивали сброс пароля — просто проигнорируйте это письмо.`,
      html: `
        <p>Для сброса пароля перейдите по ссылке:</p>
        <p><a href="${resetLink}">${resetLink}</a></p>
        <p>Ссылка действует 1 час. Если вы не запрашивали сброс пароля — просто проигнорируйте это письмо.</p>
      `,
    });
  } catch (err) {
    console.error("Resend: исключение при вызове emails.send() (сетевой сбой fetch внутри SDK?)", {
      to,
      from,
      error: err instanceof Error ? err.message : String(err),
    });
    throw new Error("Не удалось отправить письмо через Resend: сетевая ошибка при обращении к API.");
  }

  const { data, error, headers } = response;

  if (error) {
    // Логируем ВЕСЬ объект error целиком (не только statusCode/name/message
    // по отдельности) плюс заголовки ответа (там бывает x-request-id — по
    // нему сама Resend может найти конкретный запрос в поддержке) — раньше
    // логировались только три выбранных поля, а вдруг Resend вернёт что-то
    // ещё по конкретной причине отказа. Пользователю на экране по-прежнему
    // остаётся только общее сообщение (см. /api/auth/forgot-password) — это
    // только в серверный лог.
    console.error("Resend отклонил отправку письма — полный объект ответа:", JSON.stringify({ to, from, error, headers }, null, 2));
    throw new Error(`Resend отклонил отправку письма [${error.statusCode ?? "?"} ${error.name}]: ${error.message}`);
  }

  console.log("Resend: письмо принято в очередь на отправку — полный объект ответа:", JSON.stringify({ to, from, data, headers }, null, 2));
}
