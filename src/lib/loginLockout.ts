import { neon } from "@neondatabase/serverless";

// Постепенная блокировка входа по паролю (см. чат "Ограничение попыток
// входа: более мягкая схема") — отдельно от общего checkRateLimit
// (rateLimit.ts, всё ещё используется для register/forgot-password/
// reset-password): там жёсткий порог "N запросов за скользящее окно",
// здесь — состояние на bucketKey (тот же IP-ключ, см. clientIp в
// rateLimit.ts), считающее ТОЛЬКО подряд идущие НЕУДАЧНЫЕ попытки ввода
// пароля (успешный вход полностью сбрасывает счётчик, см.
// recordLoginSuccess) и постепенно нарастающая лестница блокировок:
//   1-2 неудачные попытки  — как обычно, без предупреждения
//   3-4 неудачные попытки  — предупреждение тем же текстом, БЕЗ блокировки
//   5-я неудачная попытка  — блокировка на 1 минуту
//   6-я (после разблокировки) — блокировка на 15 минут
//   7-я                    — блокировка на 1 час
//   8-я и далее            — блокировка на 1 сутки (дальше не растёт)
// Хранится в Postgres (та же база), не в памяти процесса — по той же
// причине, что и auth_rate_limit_attempts (Vercel serverless не гарантирует
// общую память между инстансами/холодными стартами).
function sql() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Не задана переменная окружения DATABASE_URL — база данных не подключена.");
  }
  return neon(url);
}

let tableEnsured = false;

async function ensureTable(): Promise<void> {
  if (tableEnsured) return;
  const db = sql();
  await db`
    CREATE TABLE IF NOT EXISTS auth_login_lockouts (
      bucket_key TEXT PRIMARY KEY,
      failed_count INTEGER NOT NULL DEFAULT 0,
      blocked_until TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  tableEnsured = true;
}

// С какого количества подряд неудачных попыток показывать предупреждение
// (тем же текстом, что и реальная блокировка), но ещё не блокировать.
const WARNING_AFTER_FAILURES = 3;

// Лестница эскалации — afterFailures проверяется по принципу "уже
// достигнут порог", а не "равен ровно": последняя подошедшая ступень и
// определяет длительность блокировки. Поэтому 8, 9, 10... неудачных попыток
// подряд всегда получают верхнюю ступень (сутки), а не растут дальше не
// заданного пользователем сценария.
const LOCKOUT_LADDER: { afterFailures: number; blockSeconds: number }[] = [
  { afterFailures: 5, blockSeconds: 60 }, // 1 минута
  { afterFailures: 6, blockSeconds: 15 * 60 }, // 15 минут
  { afterFailures: 7, blockSeconds: 60 * 60 }, // 1 час
  { afterFailures: 8, blockSeconds: 24 * 60 * 60 }, // 1 сутки
];

function blockSecondsForFailureCount(failedCount: number): number | null {
  let seconds: number | null = null;
  for (const rung of LOCKOUT_LADDER) {
    if (failedCount >= rung.afterFailures) seconds = rung.blockSeconds;
  }
  return seconds;
}

export interface LoginLockoutStatus {
  blocked: boolean;
  retryAfterSeconds: number | null;
}

// Проверка ПЕРЕД сверкой пароля — если бакет уже заблокирован с прошлой
// попытки, пароль вообще не проверяем (и, соответственно, не считаем это
// ещё одной неудачной попыткой — см. recordFailedLogin, вызывается только
// когда checkLoginLockout уже пропустил запрос дальше).
export async function checkLoginLockout(bucketKey: string): Promise<LoginLockoutStatus> {
  await ensureTable();
  const db = sql();
  const rows = await db`SELECT blocked_until FROM auth_login_lockouts WHERE bucket_key = ${bucketKey}`;
  const blockedUntilRaw = rows[0]?.blocked_until as string | null | undefined;
  if (!blockedUntilRaw) return { blocked: false, retryAfterSeconds: null };
  const remainingMs = new Date(blockedUntilRaw).getTime() - Date.now();
  if (remainingMs <= 0) return { blocked: false, retryAfterSeconds: null };
  return { blocked: true, retryAfterSeconds: Math.ceil(remainingMs / 1000) };
}

export interface RecordedLoginFailure {
  // true — эта попытка ПЕРЕВЕЛА бакет в заблокированное состояние (5-я,
  // 6-я, 7-я, 8-я+ подряд неудачная попытка) — ответ на НЕЁ должен быть
  // "слишком много попыток", а не обычным "неверный пароль".
  blocked: boolean;
  // true — 3-я или 4-я подряд неудачная попытка: предупреждение тем же
  // текстом, но запрос не блокируется — попробовать ещё можно сразу же.
  warning: boolean;
  retryAfterSeconds: number | null;
}

// Увеличивает счётчик подряд неудачных попыток на 1 и, если новое значение
// достигло очередной ступени лестницы, сразу устанавливает blocked_until —
// именно ЭТА попытка (5-я/6-я/7-я/8-я) должна увидеть "заблокировано", а не
// следующая. Инкремент и подсчёт нового значения — одним запросом
// (INSERT ... ON CONFLICT ... RETURNING), обновление blocked_until — вторым,
// только когда действительно нужно.
export async function recordFailedLogin(bucketKey: string): Promise<RecordedLoginFailure> {
  await ensureTable();
  const db = sql();

  const rows = await db`
    INSERT INTO auth_login_lockouts (bucket_key, failed_count, updated_at)
    VALUES (${bucketKey}, 1, now())
    ON CONFLICT (bucket_key) DO UPDATE
      SET failed_count = auth_login_lockouts.failed_count + 1, updated_at = now()
    RETURNING failed_count
  `;
  const failedCount = Number(rows[0]?.failed_count ?? 1);
  const blockSeconds = blockSecondsForFailureCount(failedCount);

  // Дешёвая, редкая уборка старых строк (не на каждый вызов) — учётные
  // записи, которые давно не пытались войти неудачно, не нужно хранить
  // вечно (тот же приём, что и в rateLimit.ts).
  if (Math.random() < 0.01) {
    db`DELETE FROM auth_login_lockouts WHERE updated_at < now() - interval '30 days'`.catch(() => {});
  }

  if (blockSeconds !== null) {
    await db`
      UPDATE auth_login_lockouts
      SET blocked_until = now() + make_interval(secs => ${blockSeconds})
      WHERE bucket_key = ${bucketKey}
    `;
    return { blocked: true, warning: false, retryAfterSeconds: blockSeconds };
  }

  return { blocked: false, warning: failedCount >= WARNING_AFTER_FAILURES, retryAfterSeconds: null };
}

// Успешный вход полностью сбрасывает лестницу — пароль подошёл, дальнейшие
// неудачные попытки (например, с другого устройства позже) должны снова
// начинать с 1, а не наследовать чужую историю ошибок.
export async function recordLoginSuccess(bucketKey: string): Promise<void> {
  await ensureTable();
  const db = sql();
  await db`
    UPDATE auth_login_lockouts SET failed_count = 0, blocked_until = NULL, updated_at = now()
    WHERE bucket_key = ${bucketKey}
  `;
}
