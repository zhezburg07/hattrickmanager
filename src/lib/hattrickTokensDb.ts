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
  tableEnsured = true;
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
