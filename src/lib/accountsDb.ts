import { randomUUID } from "crypto";
import { neon } from "@neondatabase/serverless";

// Разделяет "аккаунт сайта" (логин/email/пароль — существует независимо от
// Hattrick) и "привязку к Hattrick" (OAuth-токен конкретной команды) на две
// связанные таблицы — раньше это была ОДНА таблица hattrick_tokens с
// PRIMARY KEY hattrick_user_id, из-за чего аккаунт физически не мог
// существовать без уже подключённой через OAuth команды (см. чат:
// "Реализуй новую форму регистрации... доступна до подключения команды").
//
// Старая таблица hattrick_tokens НЕ удаляется и не изменяется — она остаётся
// нетронутой страховкой на случай проблем с миграцией (см. hattrickTokensDb.ts,
// тот файл теперь просто не используется новым кодом, но не удалён).
//
// Ключевой приём миграции: у КАЖДОЙ существующей строки hattrick_tokens
// сейчас в базе — и в уже выданной пользователю подписанной cookie сессии
// сайта (см. siteSession.ts) — "идентичность" это buквально hattrick_user_id.
// Чтобы не разлогинить ни одного реального пользователя, для строк,
// перенесённых из hattrick_tokens, id нового аккаунта равен ТОЙ ЖЕ строке
// hattrick_user_id — тогда уже выданная cookie (она подписывает именно эту
// строку) продолжает резолвиться в валидный accounts.id без единого
// изменения в самой логике подписи/проверки cookie. Та же логика
// применяется и к НОВЫМ пользователям, которые подключаются через OAuth,
// ни разу не регистрировавшись заранее (id аккаунта = hattrick_user_id) —
// это ровно today's поведение, просто через новую схему. Единственный
// случай, когда id аккаунта — случайный UUID, а не hattrick_user_id: когда
// аккаунт создан через новую форму регистрации (см. registerAccount ниже),
// то есть команда Hattrick ещё не привязана вовсе.
function sql() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Не задана переменная окружения DATABASE_URL — база данных не подключена.");
  }
  return neon(url);
}

let schemaEnsured = false;

async function ensureSchema(): Promise<void> {
  if (schemaEnsured) return;
  const db = sql();

  await db`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      username TEXT,
      email TEXT,
      password_hash TEXT,
      reset_token TEXT,
      reset_token_expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await db`CREATE UNIQUE INDEX IF NOT EXISTS accounts_email_idx ON accounts (email) WHERE email IS NOT NULL`;
  // Регистронезависимая уникальность логина (LOWER(...)) — иначе "Ivan" и
  // "ivan" считались бы разными логинами, что путает пользователей при входе.
  await db`CREATE UNIQUE INDEX IF NOT EXISTS accounts_username_idx ON accounts (LOWER(username)) WHERE username IS NOT NULL`;

  await db`
    CREATE TABLE IF NOT EXISTS hattrick_connections (
      hattrick_user_id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts (id),
      access_token TEXT NOT NULL,
      access_token_secret TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  // Один аккаунт — одна привязанная команда Hattrick (как и сегодня). Если
  // понадобится несколько команд на один аккаунт — этот индекс придётся
  // сначала убрать/ослабить.
  await db`CREATE UNIQUE INDEX IF NOT EXISTS hattrick_connections_account_id_idx ON hattrick_connections (account_id)`;

  // Однократный (идемпотентный) перенос всех существующих строк из старой
  // hattrick_tokens — ON CONFLICT DO NOTHING делает повторные запуски (при
  // каждом новом холодном старте serverless-функции, см. комментарий у
  // schemaEnsured) безопасными и дешёвыми после первого реального переноса.
  await db`
    INSERT INTO accounts (id, email, password_hash, reset_token, reset_token_expires_at, created_at, updated_at)
    SELECT hattrick_user_id, email, password_hash, reset_token, reset_token_expires_at, created_at, updated_at
    FROM hattrick_tokens
    ON CONFLICT (id) DO NOTHING
  `;
  await db`
    INSERT INTO hattrick_connections (hattrick_user_id, account_id, access_token, access_token_secret, created_at, updated_at)
    SELECT hattrick_user_id, hattrick_user_id, access_token, access_token_secret, created_at, updated_at
    FROM hattrick_tokens
    ON CONFLICT (hattrick_user_id) DO NOTHING
  `;

  schemaEnsured = true;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// --- Регистрация и вход по логину/email ------------------------------------

export interface RegisterAccountInput {
  username: string;
  email: string;
  passwordHash: string;
}

// Создаёт аккаунт БЕЗ привязки к Hattrick (hattrick_connections для него
// пока не существует) — именно это и нужно для регистрации "до подключения
// команды". id — случайный UUID, поскольку никакого hattrick_user_id ещё
// нет и взять неоткуда.
export async function registerAccount(input: RegisterAccountInput): Promise<{ accountId: string }> {
  await ensureSchema();
  const db = sql();
  const normalizedEmail = normalizeEmail(input.email);
  const normalizedUsername = input.username.trim();

  const existing = await db`
    SELECT 1 FROM accounts WHERE LOWER(username) = LOWER(${normalizedUsername}) OR email = ${normalizedEmail}
  `;
  if (existing.length > 0) {
    // Не различаем здесь "занят логин" vs "занят email" одним общим запросом
    // ради простоты — точное сообщение определяется отдельной проверкой ниже.
    const usernameTaken = await db`SELECT 1 FROM accounts WHERE LOWER(username) = LOWER(${normalizedUsername})`;
    if (usernameTaken.length > 0) {
      throw new Error("Этот логин уже занят.");
    }
    throw new Error("Этот email уже используется.");
  }

  const accountId = randomUUID();
  await db`
    INSERT INTO accounts (id, username, email, password_hash, created_at, updated_at)
    VALUES (${accountId}, ${normalizedUsername}, ${normalizedEmail}, ${input.passwordHash}, now(), now())
  `;
  return { accountId };
}

export interface IdentityLoginRecord {
  accountId: string;
  passwordHash: string;
}

// Ищет аккаунт для входа ПО ЛОГИНУ ИЛИ ПО EMAIL (раньше можно было войти
// только по email — регистрация добавила логин как ещё один валидный
// идентификатор для входа).
export async function findByIdentifier(identifier: string): Promise<IdentityLoginRecord | null> {
  await ensureSchema();
  const db = sql();
  const normalized = identifier.trim();
  const rows = await db`
    SELECT id, password_hash
    FROM accounts
    WHERE (LOWER(username) = LOWER(${normalized}) OR email = ${normalizeEmail(normalized)})
      AND password_hash IS NOT NULL
  `;
  if (rows.length === 0) return null;
  return { accountId: String(rows[0].id), passwordHash: String(rows[0].password_hash) };
}

// Привязывает email+хеш пароля к уже существующему аккаунту (нужен для
// сценария "аккаунт был создан через OAuth-подключение, пароль решили
// завести позже" — см. SetPasswordPrompt.tsx).
export async function setEmailLogin(accountId: string, email: string, passwordHash: string): Promise<void> {
  await ensureSchema();
  const db = sql();
  const normalized = normalizeEmail(email);
  const taken = await db`
    SELECT 1 FROM accounts WHERE email = ${normalized} AND id != ${accountId}
  `;
  if (taken.length > 0) {
    throw new Error("Этот email уже используется другим аккаунтом.");
  }
  await db`
    UPDATE accounts
    SET email = ${normalized}, password_hash = ${passwordHash}, updated_at = now()
    WHERE id = ${accountId}
  `;
}

export async function hasEmailLogin(accountId: string): Promise<boolean> {
  await ensureSchema();
  const db = sql();
  const rows = await db`
    SELECT 1 FROM accounts WHERE id = ${accountId} AND password_hash IS NOT NULL
  `;
  return rows.length > 0;
}

// --- Сброс пароля ------------------------------------------------------------

export async function saveResetToken(accountId: string, token: string, expiresAt: Date): Promise<void> {
  await ensureSchema();
  const db = sql();
  await db`
    UPDATE accounts
    SET reset_token = ${token}, reset_token_expires_at = ${expiresAt.toISOString()}, updated_at = now()
    WHERE id = ${accountId}
  `;
}

export interface ResetTokenRecord {
  accountId: string;
  expiresAt: string;
}

export async function findByResetToken(token: string): Promise<ResetTokenRecord | null> {
  await ensureSchema();
  const db = sql();
  const rows = await db`
    SELECT id, reset_token_expires_at
    FROM accounts
    WHERE reset_token = ${token}
  `;
  if (rows.length === 0) return null;
  return { accountId: String(rows[0].id), expiresAt: String(rows[0].reset_token_expires_at) };
}

export async function applyPasswordReset(accountId: string, passwordHash: string): Promise<void> {
  await ensureSchema();
  const db = sql();
  await db`
    UPDATE accounts
    SET password_hash = ${passwordHash}, reset_token = NULL, reset_token_expires_at = NULL, updated_at = now()
    WHERE id = ${accountId}
  `;
}

// Есть ли вообще аккаунт с таким email (даже без пароля) — используется
// только "забыли пароль", чтобы не выдавать один и тот же нейтральный ответ
// и когда email не найден, и когда пароль просто не заводили.
export async function findByEmailAnyStatus(email: string): Promise<{ accountId: string } | null> {
  await ensureSchema();
  const db = sql();
  const rows = await db`
    SELECT id FROM accounts WHERE email = ${normalizeEmail(email)}
  `;
  if (rows.length === 0) return null;
  return { accountId: String(rows[0].id) };
}

// --- Привязка к Hattrick -----------------------------------------------------

export interface HattrickConnection {
  hattrickUserId: string;
  accessToken: string;
  accessTokenSecret: string;
}

export async function getHattrickConnectionForAccount(accountId: string): Promise<HattrickConnection | null> {
  await ensureSchema();
  const db = sql();
  const rows = await db`
    SELECT hattrick_user_id, access_token, access_token_secret
    FROM hattrick_connections
    WHERE account_id = ${accountId}
  `;
  if (rows.length === 0) return null;
  return {
    hattrickUserId: String(rows[0].hattrick_user_id),
    accessToken: String(rows[0].access_token),
    accessTokenSecret: String(rows[0].access_token_secret),
  };
}

export async function getHattrickUserIdForAccount(accountId: string): Promise<string | null> {
  await ensureSchema();
  const db = sql();
  const rows = await db`
    SELECT hattrick_user_id FROM hattrick_connections WHERE account_id = ${accountId}
  `;
  if (rows.length === 0) return null;
  return String(rows[0].hattrick_user_id);
}

export type LinkOrCreateResult =
  | { status: "linked"; accountId: string }
  | { status: "conflict"; ownerAccountId: string };

// Вызывается один раз, сразу после успешного обмена на Access Token (см.
// /api/auth/callback и /api/auth/session-upgrade) — решает, привязать ли
// эту команду Hattrick к УЖЕ залогиненному (по логину/паролю или по прошлой
// сессии) аккаунту, найти существующую привязку, или завести новый аккаунт
// "по старинке" (OAuth без предварительной регистрации).
export async function linkOrCreateHattrickConnection(params: {
  hattrickUserId: string;
  accessToken: string;
  accessTokenSecret: string;
  currentAccountId: string | null;
  // Пользователь явно подтвердил перепривязку конфликтующей команды на
  // текущий аккаунт (см. баннер "already-linked" в ReducedDashboard.tsx и
  // /api/auth/request-token?confirmReassignHattrickUserId=...). Безопасно
  // доверять этому подтверждению: чтобы вообще дойти досюда, пользователь
  // только что заново прошёл настоящий OAuth Hattrick именно для этой
  // команды — то есть подтвердил владение ею на стороне самого Hattrick,
  // не только кликом на нашем сайте.
  confirmReassign?: boolean;
}): Promise<LinkOrCreateResult> {
  await ensureSchema();
  const db = sql();
  const { hattrickUserId, accessToken, accessTokenSecret, currentAccountId, confirmReassign } = params;

  const existingRows = await db`
    SELECT account_id FROM hattrick_connections WHERE hattrick_user_id = ${hattrickUserId}
  `;
  const existingAccountId = existingRows.length > 0 ? String(existingRows[0].account_id) : null;

  if (existingAccountId) {
    if (currentAccountId && existingAccountId !== currentAccountId) {
      if (!confirmReassign) {
        // Эта команда Hattrick уже привязана к ДРУГОМУ аккаунту сайта — не
        // перезаписываем и не "воруем" привязку молча, честно сообщаем о
        // конфликте (пользователь может подтвердить перепривязку отдельным
        // шагом — см. confirmReassign выше).
        return { status: "conflict", ownerAccountId: existingAccountId };
      }
      // Подтверждено — переносим привязку на текущий аккаунт. Частый
      // случай: команда была подключена ДО появления регистрации по
      // логину/паролю, для неё автоматически завёлся "служебный" аккаунт
      // (id = hattrick_user_id, без логина), а теперь тот же человек
      // зарегистрировал отдельный аккаунт и хочет привязать к нему ту же
      // команду. Старый аккаунт-заглушка не удаляется — просто перестаёт
      // владеть этой привязкой.
      await db`
        UPDATE hattrick_connections
        SET account_id = ${currentAccountId}, access_token = ${accessToken}, access_token_secret = ${accessTokenSecret}, updated_at = now()
        WHERE hattrick_user_id = ${hattrickUserId}
      `;
      return { status: "linked", accountId: currentAccountId };
    }
    await db`
      UPDATE hattrick_connections
      SET access_token = ${accessToken}, access_token_secret = ${accessTokenSecret}, updated_at = now()
      WHERE hattrick_user_id = ${hattrickUserId}
    `;
    return { status: "linked", accountId: existingAccountId };
  }

  if (currentAccountId) {
    // Пользователь уже залогинен (по логину/паролю или предыдущей OAuth-
    // сессии) и подключает ЕЩЁ НЕ привязанную команду — привязываем к его
    // существующему аккаунту, новый аккаунт не создаём.
    await db`
      INSERT INTO hattrick_connections (hattrick_user_id, account_id, access_token, access_token_secret, created_at, updated_at)
      VALUES (${hattrickUserId}, ${currentAccountId}, ${accessToken}, ${accessTokenSecret}, now(), now())
    `;
    return { status: "linked", accountId: currentAccountId };
  }

  // Нет ни существующей привязки, ни текущей сессии — обычное первое OAuth-
  // подключение без предварительной регистрации (сегодняшнее поведение по
  // умолчанию). id аккаунта = hattrick_user_id, как и у перенесённых строк.
  await db`
    INSERT INTO accounts (id, created_at, updated_at)
    VALUES (${hattrickUserId}, now(), now())
    ON CONFLICT (id) DO NOTHING
  `;
  await db`
    INSERT INTO hattrick_connections (hattrick_user_id, account_id, access_token, access_token_secret, created_at, updated_at)
    VALUES (${hattrickUserId}, ${hattrickUserId}, ${accessToken}, ${accessTokenSecret}, now(), now())
    ON CONFLICT (hattrick_user_id)
    DO UPDATE SET access_token = EXCLUDED.access_token, access_token_secret = EXCLUDED.access_token_secret, updated_at = now()
  `;
  return { status: "linked", accountId: hattrickUserId };
}
