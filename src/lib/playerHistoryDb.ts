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
function trainingWeekKey(date: Date): string {
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
  tableEnsured = true;
}

function snapshotOf(p: SquadPlayer): PlayerStatSnapshot {
  return { skills: { ...p.skills }, experience: p.experience, form: p.form, stamina: p.stamina, tsi: p.tsi };
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
    SELECT DISTINCT ON (player_id) player_id, skills, experience, form, stamina, tsi
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
    };
  }
  return result;
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
        INSERT INTO player_weekly_stat_snapshots (hattrick_user_id, player_id, training_week, skills, experience, form, stamina, tsi, updated_at)
        VALUES (${hattrickUserId}, ${p.id}, ${currentWeek}, ${JSON.stringify(snapshot.skills)}, ${snapshot.experience}, ${snapshot.form}, ${snapshot.stamina}, ${snapshot.tsi}, now())
        ON CONFLICT (hattrick_user_id, player_id, training_week)
        DO UPDATE SET
          skills = EXCLUDED.skills,
          experience = EXCLUDED.experience,
          form = EXCLUDED.form,
          stamina = EXCLUDED.stamina,
          tsi = EXCLUDED.tsi,
          updated_at = now()
      `;
    }),
  );
}

// Читает снимок последней ПРОШЕДШЕЙ тренировочной недели, сразу
// сохраняет/обновляет бакет ТЕКУЩЕЙ недели и возвращает карту
// playerId -> снимок "было" для подсветки изменений. Один и тот же вызов
// используется и на "Составе", и на "Расстановке" (см. squad/page.tsx,
// lineup/page.tsx) — сравнение и подсветка одинаковы на обеих вкладках.
// Если что-то пошло не так с базой — не ломает страницу, просто сравнивать
// будет не с чем в этот раз.
export async function resolvePlayerHistory(
  hattrickUserId: string | null,
  players: SquadPlayer[],
): Promise<Record<number, PlayerStatSnapshot | undefined>> {
  if (!hattrickUserId || players.length === 0) return {};

  try {
    const currentWeek = trainingWeekKey(new Date());
    const previous = await getPreviousWeekSnapshots(hattrickUserId, currentWeek);
    await saveCurrentWeekSnapshot(hattrickUserId, currentWeek, players);
    // "Побочный эффект": заодно кладём/обновляем недельный снимок TSI (см.
    // ниже) — Состав и Расстановка уже и так запрашивают полный список
    // реальных игроков, так что для "Лучшего/худшего игрока недели" на
    // Обзоре не нужен отдельный запрос к CHPP. Ошибка здесь не должна
    // портить обычное сравнение "было → стало" выше.
    saveWeeklyTsiSnapshot(hattrickUserId, players).catch(() => {});
    return previous;
  } catch {
    return {};
  }
}

let weeklyTableEnsured = false;

async function ensureWeeklyTable(): Promise<void> {
  if (weeklyTableEnsured) return;
  const db = sql();
  await db`
    CREATE TABLE IF NOT EXISTS player_weekly_tsi (
      hattrick_user_id TEXT NOT NULL,
      player_id BIGINT NOT NULL,
      week_start DATE NOT NULL,
      name TEXT NOT NULL,
      position_group TEXT NOT NULL,
      tsi INTEGER NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (hattrick_user_id, player_id, week_start)
    )
  `;
  weeklyTableEnsured = true;
}

// Отдельная от player_stat_snapshots таблица (а не переиспользование той же):
// player_stat_snapshots хранит РОВНО один снимок на игрока (перезаписывается
// при каждом визите) — этого достаточно для "было → стало с прошлого раза",
// но недостаточно для "было → стало РОВНО неделю назад" (два визита в один
// день стёрли бы вчерашнее значение). Здесь — одна строка на игрока за
// календарную неделю (week_start = начало недели по date_trunc), которая
// просто обновляется актуальным значением при каждом визите на этой неделе.
export async function saveWeeklyTsiSnapshot(hattrickUserId: string, players: SquadPlayer[]): Promise<void> {
  await ensureWeeklyTable();
  const db = sql();

  await Promise.all(
    players.map(
      (p) => db`
        INSERT INTO player_weekly_tsi (hattrick_user_id, player_id, week_start, name, position_group, tsi, updated_at)
        VALUES (${hattrickUserId}, ${p.id}, date_trunc('week', now())::date, ${p.name}, ${p.positionGroup}, ${p.tsi}, now())
        ON CONFLICT (hattrick_user_id, player_id, week_start)
        DO UPDATE SET name = EXCLUDED.name, position_group = EXCLUDED.position_group, tsi = EXCLUDED.tsi, updated_at = now()
      `,
    ),
  );
}

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

// Сравнивает снимок TSI текущей календарной недели со снимком недели,
// начавшейся ровно 7 дней назад — если для пользователя ещё нет снимка той,
// более ранней недели (например, это первая неделя использования сайта или
// он ни разу не заходил на Состав/Расстановку неделю назад), сравнивать не с
// чем — честно возвращается hasEnoughHistory: false.
export async function resolveWeeklyTsiHighlights(hattrickUserId: string | null): Promise<WeeklyTsiResult> {
  if (!hattrickUserId) return emptyWeeklyResult;

  try {
    await ensureWeeklyTable();
    const db = sql();
    const rows = await db`
      WITH cur AS (
        SELECT player_id, name, position_group, tsi
        FROM player_weekly_tsi
        WHERE hattrick_user_id = ${hattrickUserId} AND week_start = date_trunc('week', now())::date
      ),
      prev AS (
        SELECT player_id, tsi
        FROM player_weekly_tsi
        WHERE hattrick_user_id = ${hattrickUserId}
          AND week_start = (date_trunc('week', now())::date - interval '7 days')::date
      )
      SELECT cur.player_id, cur.name, cur.position_group, cur.tsi AS tsi_now, prev.tsi AS tsi_prev
      FROM cur JOIN prev ON cur.player_id = prev.player_id
    `;

    if (rows.length === 0) return emptyWeeklyResult;

    const entries: WeeklyTsiEntry[] = rows.map((row) => ({
      playerId: Number(row.player_id),
      name: row.name,
      positionGroup: row.position_group as PositionGroup,
      tsiNow: row.tsi_now,
      tsiWeekAgo: row.tsi_prev,
      delta: row.tsi_now - row.tsi_prev,
    }));

    const byDeltaDesc = [...entries].sort((a, b) => b.delta - a.delta);
    const byDeltaAsc = [...entries].sort((a, b) => a.delta - b.delta);

    return {
      hasEnoughHistory: true,
      gainer: byDeltaDesc[0] ?? null,
      loser: byDeltaAsc[0] ?? null,
      topGainers: byDeltaDesc.slice(0, 3),
      topLosers: byDeltaAsc.slice(0, 3),
    };
  } catch {
    return emptyWeeklyResult;
  }
}
