import { neon } from "@neondatabase/serverless";
import type { StoredHattrickTokens } from "./hattrickApi";

// Постоянное хранилище OAuth-токена доступа к Hattrick, по Hattrick UserID.
// Раньше сам токен лежал только в cookie браузера — рабочий вариант (400
// дней жизни), но это смешивало "секрет для похода в CHPP" с "cookie сессии
// сайта". Теперь токен лежит в базе, а cookie сессии сайта (см.
// src/lib/siteSession.ts) содержит только подписанный Hattrick UserID — по
// нему при каждом визите здесь достаётся токен, без повторного OAuth.
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
    CREATE TABLE IF NOT EXISTS hattrick_tokens (
      hattrick_user_id TEXT PRIMARY KEY,
      access_token TEXT NOT NULL,
      access_token_secret TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  // Вход по email+паролю поверх уже существующей записи (см. чат) — те же
  // 4 столбца добавляются в уже существующую таблицу через ADD COLUMN IF NOT
  // EXISTS, отдельная таблица не нужна: это 1-к-1 с hattrick_user_id, тем же
  // ключом, где уже лежит OAuth-токен. Всё необязательное (nullable) — вход
  // по email работает только у тех, кто сам решил его завести (см.
  // /api/auth/set-password), OAuth остаётся обязательным первым шагом.
  await db`ALTER TABLE hattrick_tokens ADD COLUMN IF NOT EXISTS email TEXT`;
  await db`ALTER TABLE hattrick_tokens ADD COLUMN IF NOT EXISTS password_hash TEXT`;
  await db`ALTER TABLE hattrick_tokens ADD COLUMN IF NOT EXISTS reset_token TEXT`;
  await db`ALTER TABLE hattrick_tokens ADD COLUMN IF NOT EXISTS reset_token_expires_at TIMESTAMPTZ`;
  // Частичный уникальный индекс (не обычный UNIQUE-констрейнт на столбце) —
  // потому что у большинства строк email будет NULL (пароль не заводили), а
  // обычный UNIQUE в Postgres как раз и так не считает несколько NULL
  // конфликтующими — этот индекс просто делает это явным и защищает от двух
  // РЕАЛЬНЫХ одинаковых email.
  await db`CREATE UNIQUE INDEX IF NOT EXISTS hattrick_tokens_email_idx ON hattrick_tokens (email) WHERE email IS NOT NULL`;
  tableEnsured = true;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Привязывает email+хеш пароля к уже существующей записи (она обязана уже
// существовать — создаётся при первом OAuth-входе, см. /api/auth/callback).
// Бросает исключение, если email уже занят ДРУГИМ hattrick_user_id.
export async function setEmailLogin(hattrickUserId: string, email: string, passwordHash: string): Promise<void> {
  await ensureTable();
  const db = sql();
  const normalized = normalizeEmail(email);
  const taken = await db`
    SELECT 1 FROM hattrick_tokens WHERE email = ${normalized} AND hattrick_user_id != ${hattrickUserId}
  `;
  if (taken.length > 0) {
    throw new Error("Этот email уже используется другим аккаунтом.");
  }
  await db`
    UPDATE hattrick_tokens
    SET email = ${normalized}, password_hash = ${passwordHash}
    WHERE hattrick_user_id = ${hattrickUserId}
  `;
}

export async function hasEmailLogin(hattrickUserId: string): Promise<boolean> {
  await ensureTable();
  const db = sql();
  const rows = await db`
    SELECT 1 FROM hattrick_tokens WHERE hattrick_user_id = ${hattrickUserId} AND password_hash IS NOT NULL
  `;
  return rows.length > 0;
}

export interface EmailLoginRecord {
  hattrickUserId: string;
  passwordHash: string;
}

// Используется на странице "Войти по email" — находит запись только среди
// тех, кто реально завёл пароль (password_hash задан).
export async function findByEmail(email: string): Promise<EmailLoginRecord | null> {
  await ensureTable();
  const db = sql();
  const rows = await db`
    SELECT hattrick_user_id, password_hash
    FROM hattrick_tokens
    WHERE email = ${normalizeEmail(email)} AND password_hash IS NOT NULL
  `;
  if (rows.length === 0) return null;
  return { hattrickUserId: String(rows[0].hattrick_user_id), passwordHash: String(rows[0].password_hash) };
}

// Ссылка для сброса пароля живёт 1 час (см. /api/auth/forgot-password) —
// после reset-password ниже token/expires_at обнуляются, так что повторно
// использовать ту же ссылку не получится.
export async function saveResetToken(hattrickUserId: string, token: string, expiresAt: Date): Promise<void> {
  await ensureTable();
  const db = sql();
  await db`
    UPDATE hattrick_tokens
    SET reset_token = ${token}, reset_token_expires_at = ${expiresAt.toISOString()}
    WHERE hattrick_user_id = ${hattrickUserId}
  `;
}

export interface ResetTokenRecord {
  hattrickUserId: string;
  expiresAt: string;
}

export async function findByResetToken(token: string): Promise<ResetTokenRecord | null> {
  await ensureTable();
  const db = sql();
  const rows = await db`
    SELECT hattrick_user_id, reset_token_expires_at
    FROM hattrick_tokens
    WHERE reset_token = ${token}
  `;
  if (rows.length === 0) return null;
  return { hattrickUserId: String(rows[0].hattrick_user_id), expiresAt: String(rows[0].reset_token_expires_at) };
}

export async function applyPasswordReset(hattrickUserId: string, passwordHash: string): Promise<void> {
  await ensureTable();
  const db = sql();
  await db`
    UPDATE hattrick_tokens
    SET password_hash = ${passwordHash}, reset_token = NULL, reset_token_expires_at = NULL
    WHERE hattrick_user_id = ${hattrickUserId}
  `;
}

// Есть ли вообще OAuth-токен для этого email (даже без пароля) — используется
// только для "забыли пароль", чтобы не выдавать один и тот же нейтральный
// ответ и когда email не найден, и когда пароль просто не заводили (не
// раскрывая при этом, какой из двух случаев произошёл, — см. route).
export async function findByEmailAnyStatus(email: string): Promise<{ hattrickUserId: string } | null> {
  await ensureTable();
  const db = sql();
  const rows = await db`
    SELECT hattrick_user_id FROM hattrick_tokens WHERE email = ${normalizeEmail(email)}
  `;
  if (rows.length === 0) return null;
  return { hattrickUserId: String(rows[0].hattrick_user_id) };
}

// Вызывается один раз, сразу после успешного обмена на Access Token (см.
// /api/auth/callback) — при повторном подключении того же UserID (например,
// если пользователь отозвал и заново выдал доступ на Hattrick) просто
// перезаписывает токен новым.
export async function saveHattrickTokens(
  hattrickUserId: string,
  accessToken: string,
  accessTokenSecret: string,
): Promise<void> {
  await ensureTable();
  const db = sql();
  await db`
    INSERT INTO hattrick_tokens (hattrick_user_id, access_token, access_token_secret, created_at, updated_at)
    VALUES (${hattrickUserId}, ${accessToken}, ${accessTokenSecret}, now(), now())
    ON CONFLICT (hattrick_user_id)
    DO UPDATE SET
      access_token = EXCLUDED.access_token,
      access_token_secret = EXCLUDED.access_token_secret,
      updated_at = now()
  `;
}

// Читает сохранённый токен по Hattrick UserID — вызывается на каждом визите
// вместо повторного прохождения OAuth (см. getStoredHattrickTokens в
// src/lib/hattrickApi.ts). Возвращает null, если для этого UserID токена в
// базе нет.
export async function getHattrickTokens(hattrickUserId: string): Promise<StoredHattrickTokens | null> {
  await ensureTable();
  const db = sql();
  const rows = await db`
    SELECT access_token, access_token_secret
    FROM hattrick_tokens
    WHERE hattrick_user_id = ${hattrickUserId}
  `;
  if (rows.length === 0) return null;
  return { accessToken: rows[0].access_token, accessTokenSecret: rows[0].access_token_secret };
}
