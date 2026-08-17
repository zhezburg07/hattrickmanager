import { neon } from "@neondatabase/serverless";
import type { PlayerStatSnapshot, PositionGroup, SquadPlayer } from "@/data/squad";

// Постоянное хранилище истории навыков/TSI игроков — переживает logout и
// живёт отдельно от cookie сессии, привязано к Hattrick UserID (см.
// src/lib/manager.ts и cookie "hattrick_user_id" в /api/auth/callback).
// Раньше это хранилось в localStorage браузера (см. git-историю
// src/components/dashboard/playerStatChanges.ts) — терялось при смене
// устройства/браузера и не было привязано к конкретному аккаунту Hattrick.
function sql() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Не задана переменная окружения DATABASE_URL — база данных не подключена.");
  }
  return neon(url);
}

// Ключ "тренировочной недели" — дата ближайшей пятницы НЕ ПОЗЖЕ данного
// момента (Hattrick обновляет тренировку каждую пятницу). ИСПРАВЛЕНО: раньше
// player_stat_snapshots хранил РОВНО один снимок на игрока, перезаписываемый
// при КАЖДОМ визите — из-за этого стрелки роста/падения были видны только на
// самый первый визит сразу после пятничной тренировки, а на следующий же
// визит (хоть в тот же день) "было" уже совпадало со "стало", и подсветка
// пропадала — не "всю неделю до следующей пятницы", как требуется, а только
// на один заход. Обычная ISO-неделя (date_trunc('week', ...), с понедельника)
// тоже не подошла бы: пятничное обновление попадало бы в СЕРЕДИНУ такой
// недели, а не на её границу, и до-/после-тренировочные значения мешались бы
// в одном бакете. Поэтому неделя здесь считается от пятницы до пятницы.
export function trainingWeekKey(date: Date): string {
  const day = date.getUTCDay(); // 0=вс, 1=пн, …, 5=пт, 6=сб
  const diff = (day - 5 + 7) % 7; // сколько дней назад была ближайшая пятница
  const friday = new Date(date);
  friday.setUTCDate(date.getUTCDate() - diff);
  return friday.toISOString().slice(0, 10);
}

let tableEnsured = false;

// Отдельная от старой player_stat_snapshots (не переиспользуем ту же
// таблицу — она НЕ удаляется и не мигрируется, просто больше не пишется:
// CREATE TABLE IF NOT EXISTS не меняет схему уже существующей таблицы, а
// нужен был именно новый набор столбцов — training_week в первичном ключе
// вместо простого "один снимок на игрока").
async function ensureTable(): Promise<void> {
  if (tableEnsured) return;
  const db = sql();
  await db`
    CREATE TABLE IF NOT EXISTS player_weekly_stat_snapshots (
      hattrick_user_id TEXT NOT NULL,
      player_id BIGINT NOT NULL,
      training_week DATE NOT NULL,
      skills JSONB NOT NULL,
      experience INTEGER NOT NULL,
      form INTEGER NOT NULL,
      stamina INTEGER NOT NULL,
      tsi INTEGER NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (hattrick_user_id, player_id, training_week)
    )
  `;
  // Преданность/родной клуб (см. чат "Калибровка позиционного рейтинга по
  // реальным звёздам Hattrick", план в .claude/plans, шаг 2) — тот же приём
  // аддитивной миграции, что уже применялся в hattrickTokensDb.ts/
  // knownTournamentsDb.ts (ALTER TABLE ADD COLUMN IF NOT EXISTS, а не новая
  // таблица — это совместимое добавление колонок, PRIMARY KEY не меняется).
  await db`ALTER TABLE player_weekly_stat_snapshots ADD COLUMN IF NOT EXISTS loyalty INTEGER`;
  await db`ALTER TABLE player_weekly_stat_snapshots ADD COLUMN IF NOT EXISTS is_club_product BOOLEAN`;
  tableEnsured = true;
}

function snapshotOf(p: SquadPlayer): PlayerStatSnapshot {
  return {
    skills: { ...p.skills },
    experience: p.experience,
    form: p.form,
    stamina: p.stamina,
    tsi: p.tsi,
    loyalty: p.loyalty,
    isClubProduct: p.isClubProduct,
  };
}

// Снимок из ПОСЛЕДНЕЙ тренировочной недели строго ДО текущей (не обязательно
// ровно "неделя назад" — если пользователь не заходил несколько недель
// подряд, берётся самый свежий из уже сохранённых, чтобы показать
// накопленное изменение с последнего реального визита, а не "нет данных").
export async function getPreviousWeekSnapshots(
  hattrickUserId: string,
  currentWeek: string,
): Promise<Record<number, PlayerStatSnapshot>> {
  await ensureTable();
  const db = sql();
  const rows = await db`
    SELECT DISTINCT ON (player_id) player_id, skills, experience, form, stamina, tsi, loyalty, is_club_product
    FROM player_weekly_stat_snapshots
    WHERE hattrick_user_id = ${hattrickUserId} AND training_week < ${currentWeek}
    ORDER BY player_id, training_week DESC
  `;

  const result: Record<number, PlayerStatSnapshot> = {};
  for (const row of rows) {
    result[Number(row.player_id)] = {
      skills: row.skills,
      experience: row.experience,
      form: row.form,
      stamina: row.stamina,
      tsi: row.tsi,
      loyalty: row.loyalty ?? undefined,
      isClubProduct: row.is_club_product ?? undefined,
    };
  }
  return result;
}

// Снимок на/до ПРОИЗВОЛЬНОЙ прошлой даты (недели матча), а не только "до
// текущей" (см. getPreviousWeekSnapshots выше) — нужен для "Калибровка
// позиционного рейтинга по реальным звёздам Hattrick" (план в .claude/plans,
// шаг 2/3): чтобы посчитать прогноз для конкретного прошлого матча теми
// навыками, что были у игрока НА ТОТ МОМЕНТ, а не сегодняшними. null, если
// снимка на эту неделю или раньше ещё нет (например, аккаунт подключён
// позже даты матча) — честно, вызывающий код должен пропустить запись
// калибровки для этого игрока/матча, а не подставлять текущие данные.
export async function getSnapshotAsOf(
  hattrickUserId: string,
  playerId: number,
  atOrBeforeWeek: string,
): Promise<PlayerStatSnapshot | null> {
  await ensureTable();
  const db = sql();
  const rows = await db`
    SELECT skills, experience, form, stamina, tsi, loyalty, is_club_product
    FROM player_weekly_stat_snapshots
    WHERE hattrick_user_id = ${hattrickUserId} AND player_id = ${playerId} AND training_week <= ${atOrBeforeWeek}
    ORDER BY training_week DESC
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    skills: row.skills,
    experience: row.experience,
    form: row.form,
    stamina: row.stamina,
    tsi: row.tsi,
    loyalty: row.loyalty ?? undefined,
    isClubProduct: row.is_club_product ?? undefined,
  };
}

// Сохраняет/обновляет снимок ТЕКУЩЕЙ тренировочной недели — при повторных
// визитах в течение той же недели просто обновляет её же бакет (так что
// "было" из getPreviousWeekSnapshots не меняется до следующей пятницы).
export async function saveCurrentWeekSnapshot(
  hattrickUserId: string,
  currentWeek: string,
  players: SquadPlayer[],
): Promise<void> {
  await ensureTable();
  const db = sql();

  await Promise.all(
    players.map((p) => {
      const snapshot = snapshotOf(p);
      return db`
        INSERT INTO player_weekly_stat_snapshots (hattrick_user_id, player_id, training_week, skills, experience, form, stamina, tsi, loyalty, is_club_product, updated_at)
        VALUES (${hattrickUserId}, ${p.id}, ${currentWeek}, ${JSON.stringify(snapshot.skills)}, ${snapshot.experience}, ${snapshot.form}, ${snapshot.stamina}, ${snapshot.tsi}, ${snapshot.loyalty ?? null}, ${snapshot.isClubProduct ?? null}, now())
        ON CONFLICT (hattrick_user_id, player_id, training_week)
        DO UPDATE SET
          skills = EXCLUDED.skills,
          experience = EXCLUDED.experience,
          form = EXCLUDED.form,
          stamina = EXCLUDED.stamina,
          tsi = EXCLUDED.tsi,
          loyalty = EXCLUDED.loyalty,
          is_club_product = EXCLUDED.is_club_product,
          updated_at = now()
      `;
    }),
  );
}

// Раньше здесь была resolvePlayerHistory() — читала прошлый недельный снимок
// И сразу же сохраняла текущий за один вызов, вызывалась при КАЖДОМ визите
// на Состав/Расстановку. После перехода этих вкладок на чтение сохранённых
// данных (см. src/lib/chppSync.ts) свежие данные CHPP появляются только во
// время синхронизации — поэтому запись снимка (saveCurrentWeekSnapshot)
// теперь происходит там же, один раз за синхронизацию, а страницы делают
// только чтение (getPreviousWeekSnapshots напрямую) при отрисовке стрелок
// роста/падения — то же самое чтение теперь переиспользует и "Изменения
// TSI" на Обзоре (resolveWeeklyTsiHighlights ниже).

// Момент последнего сохранённого снимка навыков игроков для этого
// пользователя — реальный факт из базы (см. UpdatesSection.tsx), а не
// выдуманный "прогресс обновления". Снимки сохраняются при каждом заходе на
// Состав/Расстановку (см. resolvePlayerHistory выше), так что null означает
// "ни разу не заходили ни на одну из этих вкладок".
export async function getLatestSkillSnapshotAt(hattrickUserId: string): Promise<Date | null> {
  await ensureTable();
  const db = sql();
  const rows = await db`
    SELECT MAX(updated_at) AS latest FROM player_weekly_stat_snapshots WHERE hattrick_user_id = ${hattrickUserId}
  `;
  const latest = rows[0]?.latest;
  return latest ? new Date(latest) : null;
}

// Сколько игроков показывать с каждой стороны в "Изменения TSI" на Обзоре
// (см. чат "Переработать раскладку блоков на Обзоре") — было 3.
const WEEKLY_TSI_TOP_N = 8;

export interface WeeklyTsiEntry {
  playerId: number;
  name: string;
  positionGroup: PositionGroup;
  tsiNow: number;
  tsiWeekAgo: number;
  delta: number;
}

export interface WeeklyTsiResult {
  hasEnoughHistory: boolean;
  gainer: WeeklyTsiEntry | null;
  loser: WeeklyTsiEntry | null;
  topGainers: WeeklyTsiEntry[];
  topLosers: WeeklyTsiEntry[];
}

const emptyWeeklyResult: WeeklyTsiResult = {
  hasEnoughHistory: false,
  gainer: null,
  loser: null,
  topGainers: [],
  topLosers: [],
};

// ПЕРЕПИСАНО (см. чат "Изменения TSI на Обзоре находят гораздо меньше
// реальных изменений, чем есть на самом деле") — раньше здесь была
// отдельная, более строгая таблица (player_weekly_tsi) с точным ISO-
// календарным сравнением "эта неделя vs ровно 7 дней назад" через INNER
// JOIN: любой игрок без строки ровно в ОБОИХ этих двух конкретных
// недельных бакетах молча выпадал из сравнения — то же самое несоответствие
// понедельник-недель против пятничных "тренировочных недель", которое уже
// когда-то заставило завести player_weekly_stat_snapshots/trainingWeekKey
// отдельно от простого date_trunc('week', ...). Теперь "Изменения TSI"
// переиспользует ТОТ ЖЕ устойчивый к пропускам механизм, что уже работает
// на Составе/Расстановке (getPreviousWeekSnapshots — берёт САМЫЙ СВЕЖИЙ
// доступный предыдущий снимок для игрока, а не требует снимок ровно в
// заданную неделю) — players передаётся вызывающим кодом (см.
// dashboard/page.tsx, getStoredSquadData) для имени/позиции, которых сам
// снимок навыков не хранит.
export async function resolveWeeklyTsiHighlights(
  hattrickUserId: string | null,
  players: SquadPlayer[] | null,
): Promise<WeeklyTsiResult> {
  if (!hattrickUserId || !players || players.length === 0) return emptyWeeklyResult;

  try {
    const prevByPlayerId = await getPreviousWeekSnapshots(hattrickUserId, trainingWeekKey(new Date()));

    const entries: WeeklyTsiEntry[] = [];
    for (const p of players) {
      const prev = prevByPlayerId[p.id];
      if (!prev) continue; // нет предыдущего снимка для этого игрока — сравнивать не с чем
      entries.push({
        playerId: p.id,
        name: p.name,
        positionGroup: p.positionGroup,
        tsiNow: p.tsi,
        tsiWeekAgo: prev.tsi,
        delta: p.tsi - prev.tsi,
      });
    }

    if (entries.length === 0) return emptyWeeklyResult;

    // Сортировка по ПРОЦЕНТУ изменения (delta относительно текущего TSI
    // игрока), а не по абсолютной величине — по запросу (см. чат "Изменения
    // TSI: шрифт процента + сортировка по проценту"). tsiNow===0 не должно
    // встречаться на реальных данных, но 0 вместо деления на 0 — честнее
    // NaN/Infinity, которые сломали бы сортировку.
    const percentOf = (e: WeeklyTsiEntry) => (e.tsiNow ? e.delta / e.tsiNow : 0);
    const byPercentDesc = [...entries].sort((a, b) => percentOf(b) - percentOf(a));
    const byPercentAsc = [...entries].sort((a, b) => percentOf(a) - percentOf(b));

    return {
      hasEnoughHistory: true,
      gainer: byPercentDesc[0] ?? null,
      loser: byPercentAsc[0] ?? null,
      topGainers: byPercentDesc.slice(0, WEEKLY_TSI_TOP_N),
      topLosers: byPercentAsc.slice(0, WEEKLY_TSI_TOP_N),
    };
  } catch {
    return emptyWeeklyResult;
  }
}
