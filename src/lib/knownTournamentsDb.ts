import { neon } from "@neondatabase/serverless";

// Локальная память турниров команды (см. чат "Titans of 2007 Trophy —
// tournamentdetails.xml реально работает по старому ID") — tournamentlist.xml
// подтверждённо отдаёт только турниры, в которых команда участвует ПРЯМО
// СЕЙЧАС (см. hattrickArena.ts); турнир, завершившийся много сезонов назад,
// исчезает из этого списка НАВСЕГДА — а прямой запрос tournamentdetails.xml
// по известному ID при этом всё же работает (докстрока "только текущий
// сезон" снова оказалась неверной). Значит единственный способ узнать
// историю трофеев за прошлые сезоны — САМИМ запомнить tournamentId, ПОКА
// турнир ещё виден в tournamentlist.xml, чтобы позже (когда он уже выпадет
// из списка) можно было запросить tournamentdetails.xml/tournamentfixtures.xml
// напрямую по сохранённому ID. На каждой синхронизации — просто UPSERT
// каждого турнира из tournamentlist.xml сюда (имя может обновиться,
// last_seen_at продвигается); ничего никогда не удаляется.
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
    CREATE TABLE IF NOT EXISTS known_tournaments (
      hattrick_user_id TEXT NOT NULL,
      tournament_id BIGINT NOT NULL,
      name TEXT NOT NULL,
      first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_checked_at TIMESTAMPTZ,
      PRIMARY KEY (hattrick_user_id, tournament_id)
    )
  `;
  // На случай, если таблица уже была создана предыдущей версией этого файла
  // (до появления last_checked_at) — тот же приём миграции, что уже
  // используется в hattrickTokensDb.ts.
  await db`ALTER TABLE known_tournaments ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ`;
  tableEnsured = true;
}

export interface KnownTournament {
  tournamentId: string;
  name: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  // Когда последний раз ходили за tournamentdetails.xml/tournamentfixtures.xml
  // по этому ID ради проверки трофея (см. markTournamentsChecked ниже) —
  // null, если ни разу. Используется только для порядка выборки
  // (getKnownTournaments сортирует "непроверенные и давно не проверенные
  // сначала"), само значение сейчас нигде не читается.
  lastCheckedAt: Date | null;
}

// Вызывается на каждой синхронизации сразу после успешного tournamentlist.xml
// (см. src/lib/chppSync.ts) — сохраняет/обновляет каждый турнир, который
// команда прямо сейчас видит в своём списке. name обновляется на случай,
// если Hattrick когда-нибудь его поменяет; first_seen_at — только при первой
// вставке (ON CONFLICT его не трогает), last_checked_at тоже не трогается
// (это отдельный процесс — см. markTournamentsChecked).
export async function upsertKnownTournaments(
  hattrickUserId: string,
  tournaments: { tournamentId: string; name: string }[],
): Promise<void> {
  if (tournaments.length === 0) return;
  await ensureTable();
  const db = sql();
  for (const t of tournaments) {
    if (!t.tournamentId) continue;
    await db`
      INSERT INTO known_tournaments (hattrick_user_id, tournament_id, name, last_seen_at)
      VALUES (${hattrickUserId}, ${t.tournamentId}, ${t.name}, now())
      ON CONFLICT (hattrick_user_id, tournament_id) DO UPDATE SET
        name = EXCLUDED.name,
        last_seen_at = now()
    `;
  }
}

// Полный список турниров, когда-либо виденных у этой команды — включая те,
// что уже выпали из живого tournamentlist.xml. Порядок — "непроверенные и
// давно не проверенные на трофей сначала" (last_checked_at ASC NULLS
// FIRST), чтобы при обходе ограниченными пачками (MAX_HISTORICAL_
// TOURNAMENTS_PER_SYNC в chppSync.ts) со временем проверялись ВСЕ
// известные турниры по кругу, а не одни и те же первые N при каждой
// синхронизации.
export async function getKnownTournaments(hattrickUserId: string): Promise<KnownTournament[]> {
  await ensureTable();
  const db = sql();
  const rows = (await db`
    SELECT tournament_id, name, first_seen_at, last_seen_at, last_checked_at
    FROM known_tournaments
    WHERE hattrick_user_id = ${hattrickUserId}
    ORDER BY last_checked_at ASC NULLS FIRST, first_seen_at ASC
  `) as {
    tournament_id: string;
    name: string;
    first_seen_at: Date;
    last_seen_at: Date;
    last_checked_at: Date | null;
  }[];

  return rows.map((r) => ({
    tournamentId: r.tournament_id,
    name: r.name,
    firstSeenAt: r.first_seen_at,
    lastSeenAt: r.last_seen_at,
    lastCheckedAt: r.last_checked_at,
  }));
}

// Отмечает, что мы только что сходили за tournamentdetails.xml/
// tournamentfixtures.xml по этим ID (см. "исторические турниры" в
// chppSync.ts) — сдвигает их в конец очереди getKnownTournaments, чтобы
// следующая синхронизация проверила ДРУГИЕ известные турниры, а не эти же
// самые. Вызывается независимо от того, удался запрос или нет — иначе
// постоянно недоступный ID навсегда застрял бы в начале очереди.
export async function markTournamentsChecked(hattrickUserId: string, tournamentIds: string[]): Promise<void> {
  if (tournamentIds.length === 0) return;
  await ensureTable();
  const db = sql();
  for (const tournamentId of tournamentIds) {
    await db`
      UPDATE known_tournaments SET last_checked_at = now()
      WHERE hattrick_user_id = ${hattrickUserId} AND tournament_id = ${tournamentId}
    `;
  }
}
