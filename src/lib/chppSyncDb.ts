import { neon } from "@neondatabase/serverless";

// Хранилище синхронизированных данных CHPP (см. чат: "вместо того чтобы
// каждая вкладка личного кабинета делала живой запрос к CHPP при каждом
// открытии — данные сохраняются в базу при синхронизации, а вкладки читают
// уже сохранённое"). Одна key-value таблица на все виды данных
// (chpp_snapshots, ключ — data_key: "team"/"league"/"matches"/... — см.
// src/lib/chppSync.ts) вместо отдельной таблицы под каждый тип: формы данных
// слишком разные (SquadPlayer[], RealEconomy, таблица лиги...), чтобы
// нормализовать без ~15 отдельных схем ради того, что по сути один и тот же
// паттерн "последнее известное значение X для этой команды". Не единый JSON
// на пользователя — иначе один неудачный раздел синхронизации при перезаписи
// рисковал бы затереть уже сохранённые хорошие данные других разделов.
function sql() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Не задана переменная окружения DATABASE_URL — база данных не подключена.");
  }
  return neon(url);
}

let tablesEnsured = false;

async function ensureTables(): Promise<void> {
  if (tablesEnsured) return;
  const db = sql();

  await db`
    CREATE TABLE IF NOT EXISTS chpp_snapshots (
      hattrick_user_id TEXT NOT NULL,
      data_key TEXT NOT NULL,
      data JSONB,
      error TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (hattrick_user_id, data_key)
    )
  `;

  await db`
    CREATE TABLE IF NOT EXISTS chpp_sync_status (
      hattrick_user_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      last_synced_at TIMESTAMPTZ,
      last_attempted_at TIMESTAMPTZ,
      last_error TEXT
    )
  `;
  // Техническая диагностика синхронизации (см. чат "Согласны с
  // разделением") — отдельно от last_error: никогда не означает сбой,
  // видна только при явном включении отладочного флага (см.
  // SHOW_SYNC_DIAGNOSTICS в dashboard/updates/page.tsx). Тот же аддитивный
  // приём миграции, что и в других *Db.ts (ALTER TABLE ADD COLUMN IF NOT
  // EXISTS, не новая таблица).
  await db`ALTER TABLE chpp_sync_status ADD COLUMN IF NOT EXISTS last_diagnostic_notes TEXT`;

  tablesEnsured = true;
}

// --- chpp_snapshots -----------------------------------------------------

export interface StoredSnapshot<T> {
  data: T | null;
  error: string | null;
  updatedAt: string;
}

// Успешный fetch+parse одного раздела (см. data_key в chppSync.ts) — error
// сбрасывается в NULL, чтобы страница, читающая эти данные, не показывала
// устаревшую ошибку рядом со свежими данными.
export async function saveSnapshotSuccess(hattrickUserId: string, dataKey: string, data: unknown): Promise<void> {
  await ensureTables();
  const db = sql();
  await db`
    INSERT INTO chpp_snapshots (hattrick_user_id, data_key, data, error, updated_at)
    VALUES (${hattrickUserId}, ${dataKey}, ${JSON.stringify(data)}, NULL, now())
    ON CONFLICT (hattrick_user_id, data_key)
    DO UPDATE SET data = EXCLUDED.data, error = NULL, updated_at = now()
  `;
}

// Неудачный fetch+parse одного раздела — НАРОЧНО не трогает уже сохранённое
// data при конфликте: если синхронизация не удалась только для этого
// раздела, страница может показать последние успешно сохранённые данные с
// пометкой "не удалось обновить", а не пустоту.
export async function saveSnapshotError(hattrickUserId: string, dataKey: string, errorText: string): Promise<void> {
  await ensureTables();
  const db = sql();
  await db`
    INSERT INTO chpp_snapshots (hattrick_user_id, data_key, data, error, updated_at)
    VALUES (${hattrickUserId}, ${dataKey}, NULL, ${errorText}, now())
    ON CONFLICT (hattrick_user_id, data_key)
    DO UPDATE SET error = EXCLUDED.error, updated_at = now()
  `;
}

export async function getSnapshot<T>(hattrickUserId: string, dataKey: string): Promise<StoredSnapshot<T> | null> {
  await ensureTables();
  const db = sql();
  const rows = await db`
    SELECT data, error, updated_at FROM chpp_snapshots
    WHERE hattrick_user_id = ${hattrickUserId} AND data_key = ${dataKey}
  `;
  if (rows.length === 0) return null;
  const row = rows[0];
  return { data: (row.data as T | null) ?? null, error: row.error, updatedAt: String(row.updated_at) };
}

// Читает сразу все разделы одним запросом — страницам вроде Обзора, которым
// нужно 6-8 разных ключей сразу, не нужно делать по отдельному запросу на
// каждый.
export async function getAllSnapshots(hattrickUserId: string): Promise<Record<string, StoredSnapshot<unknown>>> {
  await ensureTables();
  const db = sql();
  const rows = await db`
    SELECT data_key, data, error, updated_at FROM chpp_snapshots WHERE hattrick_user_id = ${hattrickUserId}
  `;
  const result: Record<string, StoredSnapshot<unknown>> = {};
  for (const row of rows) {
    result[String(row.data_key)] = { data: row.data ?? null, error: row.error, updatedAt: String(row.updated_at) };
  }
  return result;
}

// --- chpp_sync_status -----------------------------------------------------

export type SyncStatusValue = "ok" | "partial" | "failed" | "in_progress";

export interface ChppSyncStatus {
  status: SyncStatusValue;
  lastSyncedAt: string | null;
  lastAttemptedAt: string | null;
  lastError: string | null;
  // Техническая диагностика — см. комментарий у last_diagnostic_notes в
  // ensureTables выше. Никогда не означает сбой сама по себе.
  lastDiagnosticNotes: string | null;
}

export async function getSyncStatus(hattrickUserId: string): Promise<ChppSyncStatus | null> {
  await ensureTables();
  const db = sql();
  const rows = await db`
    SELECT status, last_synced_at, last_attempted_at, last_error, last_diagnostic_notes
    FROM chpp_sync_status WHERE hattrick_user_id = ${hattrickUserId}
  `;
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    status: row.status as SyncStatusValue,
    lastSyncedAt: row.last_synced_at,
    lastAttemptedAt: row.last_attempted_at,
    lastError: row.last_error,
    lastDiagnosticNotes: row.last_diagnostic_notes,
  };
}

export async function setSyncInProgress(hattrickUserId: string): Promise<void> {
  await ensureTables();
  const db = sql();
  await db`
    INSERT INTO chpp_sync_status (hattrick_user_id, status, last_attempted_at)
    VALUES (${hattrickUserId}, 'in_progress', now())
    ON CONFLICT (hattrick_user_id) DO UPDATE SET status = 'in_progress', last_attempted_at = now()
  `;
}

// last_synced_at обновляется только для "ok"/"partial" (реально получили
// хоть что-то свежее) — при полном "failed" остаётся дата ПРЕДЫДУЩЕЙ удачной
// синхронизации, если она была, а не затирается на "никогда".
export async function finishSync(
  hattrickUserId: string,
  status: "ok" | "partial" | "failed",
  lastError: string | null,
  lastDiagnosticNotes: string | null,
): Promise<void> {
  await ensureTables();
  const db = sql();
  if (status === "failed") {
    await db`
      UPDATE chpp_sync_status SET status = ${status}, last_error = ${lastError}, last_diagnostic_notes = ${lastDiagnosticNotes}
      WHERE hattrick_user_id = ${hattrickUserId}
    `;
  } else {
    await db`
      UPDATE chpp_sync_status SET status = ${status}, last_synced_at = now(), last_error = ${lastError}, last_diagnostic_notes = ${lastDiagnosticNotes}
      WHERE hattrick_user_id = ${hattrickUserId}
    `;
  }
}
