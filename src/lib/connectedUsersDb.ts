import { neon } from "@neondatabase/serverless";

// Реестр всех, кто когда-либо подключал команду через Hattrick OAuth — нужен
// только владельцу сайта (см. /admin), поэтому хранится отдельно от истории
// навыков игроков (player_stat_snapshots и т.д. в playerHistoryDb.ts) — та
// таблица не годится, потому что каждую запись там перезаписывает свежий
// снимок, а здесь как раз важно НЕ терять самую первую дату подключения.
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
    CREATE TABLE IF NOT EXISTS connected_users (
      hattrick_user_id TEXT PRIMARY KEY,
      team_name TEXT,
      first_connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  tableEnsured = true;
}

export interface ConnectedUser {
  hattrickUserId: string;
  teamName: string | null;
  firstConnectedAt: string;
  lastSeenAt: string;
}

// Вызывается при каждом открытии Обзора (см. dashboard/page.tsx) — при
// первом визите создаёт запись (first_connected_at = сейчас), при каждом
// следующем — только обновляет last_seen_at и (если удалось получить)
// название команды, не трогая исходную дату первого подключения. Ошибки базы
// не должны ломать обычную страницу — вызывающий код оборачивает это в
// fire-and-forget с .catch(() => {}).
export async function upsertConnectedUser(hattrickUserId: string, teamName: string | null): Promise<void> {
  await ensureTable();
  const db = sql();
  await db`
    INSERT INTO connected_users (hattrick_user_id, team_name, first_connected_at, last_seen_at)
    VALUES (${hattrickUserId}, ${teamName}, now(), now())
    ON CONFLICT (hattrick_user_id)
    DO UPDATE SET
      team_name = COALESCE(EXCLUDED.team_name, connected_users.team_name),
      last_seen_at = now()
  `;
}

// Запись одного пользователя — для раздела "Обновления" в личном кабинете
// (см. UpdatesSection.tsx), в отличие от getAllConnectedUsers ниже (только
// для /admin, отдаёт всех).
export async function getConnectedUser(hattrickUserId: string): Promise<ConnectedUser | null> {
  await ensureTable();
  const db = sql();
  const rows = await db`
    SELECT hattrick_user_id, team_name, first_connected_at, last_seen_at
    FROM connected_users
    WHERE hattrick_user_id = ${hattrickUserId}
  `;
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    hattrickUserId: String(row.hattrick_user_id),
    teamName: row.team_name,
    firstConnectedAt: row.first_connected_at,
    lastSeenAt: row.last_seen_at,
  };
}

export async function getAllConnectedUsers(): Promise<ConnectedUser[]> {
  await ensureTable();
  const db = sql();
  const rows = await db`
    SELECT hattrick_user_id, team_name, first_connected_at, last_seen_at
    FROM connected_users
    ORDER BY last_seen_at DESC
  `;
  return rows.map((row) => ({
    hattrickUserId: String(row.hattrick_user_id),
    teamName: row.team_name,
    firstConnectedAt: row.first_connected_at,
    lastSeenAt: row.last_seen_at,
  }));
}
