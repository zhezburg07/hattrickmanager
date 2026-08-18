import { neon } from "@neondatabase/serverless";

// Rate limiting на auth-эндпоинтах (см. чат "Аудит проекта: безопасность/
// крайние случаи/скорость" — до этого не было НИКАКОЙ защиты от перебора
// паролей ни на одном auth-эндпоинте, включая /api/admin/login, где вся
// защита — один статичный пароль на всю панель). Хранится в Postgres (той
// же базе, что и всё остальное), а НЕ в памяти процесса — на Vercel
// serverless-функции не гарантируют общую память между инстансами/
// холодными стартами, поэтому in-memory счётчик обходился бы простым
// повтором запроса, попавшим на другой инстанс.
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
    CREATE TABLE IF NOT EXISTS auth_rate_limit_attempts (
      bucket_key TEXT NOT NULL,
      attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS auth_rate_limit_attempts_key_time_idx ON auth_rate_limit_attempts (bucket_key, attempted_at)`;
  tableEnsured = true;
}

export interface RateLimitResult {
  allowed: boolean;
  // Приблизительно — ширина самого окна, не точный момент разблокировки
  // (это скользящее окно, не фиксированный таймер) — но для заголовка
  // Retry-After и текста пользователю точнее не нужно.
  retryAfterSeconds: number | null;
}

// Скользящее окно: пишет ЭТУ попытку и сразу считает, сколько их было для
// того же ключа за последние windowSeconds — оба действия одним запросом
// (CTE), чтобы не тратить два похода в базу на каждый вызов auth-эндпоинта.
// Попытка записывается ВСЕГДА (в том числе когда сама оказывается
// заблокирована) — иначе быстрый перебор просто перестал бы засчитываться,
// как только лимит исчерпан, и окно "забывало" бы о нём раньше времени.
export async function checkRateLimit(bucketKey: string, maxAttempts: number, windowSeconds: number): Promise<RateLimitResult> {
  await ensureTable();
  const db = sql();

  const rows = await db`
    WITH inserted AS (
      INSERT INTO auth_rate_limit_attempts (bucket_key) VALUES (${bucketKey})
      RETURNING 1
    )
    SELECT COUNT(*) AS count
    FROM auth_rate_limit_attempts
    WHERE bucket_key = ${bucketKey} AND attempted_at > now() - make_interval(secs => ${windowSeconds})
  `;
  const count = Number(rows[0]?.count ?? 0);

  // Дешёвая, редкая уборка старых строк (не на каждый вызов — сам DELETE
  // не должен добавлять задержку в горячий путь входа) — 1% вызовов,
  // fire-and-forget, ошибка уборки не должна ронять сам rate limit.
  if (Math.random() < 0.01) {
    db`DELETE FROM auth_rate_limit_attempts WHERE attempted_at < now() - interval '1 day'`.catch(() => {});
  }

  if (count > maxAttempts) {
    return { allowed: false, retryAfterSeconds: windowSeconds };
  }
  return { allowed: true, retryAfterSeconds: null };
}

// IP клиента — на Vercel за edge-сетью реальный IP приходит в
// X-Forwarded-For (первый адрес в списке — сам клиент, остальные, если
// есть, — промежуточные прокси), NextRequest.ip в этой версии Next.js
// ненадёжен вне рантайма Vercel. "unknown" — честный fallback для локальной
// разработки (заголовка нет), не крашимся и не гадаем реальный IP.
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
