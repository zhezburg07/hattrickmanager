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
      PRIMARY KEY (hattrick_user_id, tournament_id)
    )
  `;
  tableEnsured = true;
}

export interface KnownTournament {
  tournamentId: string;
  name: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

// Вызывается на каждой синхронизации сразу после успешного tournamentlist.xml
// (см. src/lib/chppSync.ts) — сохраняет/обновляет каждый турнир, который
// команда прямо сейчас видит в своём списке. name обновляется на случай,
// если Hattrick когда-нибудь его поменяет; first_seen_at — только при первой
// вставке (ON CONFLICT его не трогает).
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
// что уже выпали из живого tournamentlist.xml. Пока используется только для
// диагностики (см. chppSync.ts); в будущем — источник ID для похода за
// историческими трофеями через tournamentdetails.xml/tournamentfixtures.xml.
export async function getKnownTournaments(hattrickUserId: string): Promise<KnownTournament[]> {
  await ensureTable();
  const db = sql();
  const rows = (await db`
    SELECT tournament_id, name, first_seen_at, last_seen_at
    FROM known_tournaments
    WHERE hattrick_user_id = ${hattrickUserId}
    ORDER BY last_seen_at DESC
  `) as { tournament_id: string; name: string; first_seen_at: Date; last_seen_at: Date }[];

  return rows.map((r) => ({
    tournamentId: r.tournament_id,
    name: r.name,
    firstSeenAt: r.first_seen_at,
    lastSeenAt: r.last_seen_at,
  }));
}
