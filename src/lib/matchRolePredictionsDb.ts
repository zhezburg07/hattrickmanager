import { neon } from "@neondatabase/serverless";
import type { SlotRole } from "@/data/pitchBoard";
import type { SquadSkills } from "@/data/squad";
import type { RoleCalibration, PlayerRoleTrend } from "@/components/dashboard/zoneRatings";
import { playerRoleTrendKey } from "@/components/dashboard/zoneRatings";

// Датасет калибровки позиционного рейтинга (см. чат "Калибровка
// позиционного рейтинга по реальным звёздам Hattrick", план в
// .claude/plans) — для каждого игрока стартового состава в каждом реально
// сыгранном матче: какими входными данными формула считала бы прогноз (на
// момент ТОГО матча, не сегодня) и какую реальную оценку звёзд (RatingStars)
// игрок получил по итогу. По той же философии, что и уже существующий
// match_research_log (matchResearchDb.ts) — ОБЕЗЛИЧЕННАЯ таблица, без
// hattrick_user_id, общая на все аккаунты: PlayerID/MatchID глобально
// уникальны в самом Hattrick и не зависят от того, кто из подключённых
// пользователей их синхронизировал, а сами навыки/рейтинги — публичные в
// самом Hattrick данные (видны любому на странице игрока/отчёте матча), не
// личные данные пользователя приложения.
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
    CREATE TABLE IF NOT EXISTS match_role_predictions (
      match_id BIGINT NOT NULL,
      player_id BIGINT NOT NULL,
      match_date TIMESTAMPTZ,
      role_id SMALLINT NOT NULL,
      slot_role TEXT NOT NULL,
      skills JSONB NOT NULL,
      experience INTEGER NOT NULL,
      form INTEGER NOT NULL,
      stamina INTEGER NOT NULL,
      loyalty INTEGER,
      is_club_product BOOLEAN,
      formula_version TEXT NOT NULL,
      predicted_raw NUMERIC NOT NULL,
      actual_rating_stars NUMERIC NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (match_id, player_id)
    )
  `;
  // Обе оценки звёзд по отдельности (см. чат "Калькулятор оптимальной
  // минуты замены", шаг 1 плана) — тот же аддитивный приём миграции, что
  // уже применялся для loyalty/is_club_product выше (ALTER TABLE ADD COLUMN
  // IF NOT EXISTS, а не новая таблица: тот же ключ match_id+player_id, те
  // же навыки/stamina уже есть в этой строке — стамина нужна и будущей
  // формуле усталости). ЧИСТО сбор данных — ничем пока не читаются, не
  // участвуют в существующей позиционной калибровке (actual_rating_stars
  // выше остаётся её единственным входом, логика та же, что и раньше).
  // Nullable — конкретное поле может не прийти в ответе CHPP.
  await db`ALTER TABLE match_role_predictions ADD COLUMN IF NOT EXISTS rating_stars_full NUMERIC`;
  await db`ALTER TABLE match_role_predictions ADD COLUMN IF NOT EXISTS rating_stars_end_of_match NUMERIC`;
  tableEnsured = true;
}

function toTimestamp(raw: string | null): Date | null {
  if (!raw) return null;
  const iso = raw.includes("T") ? raw : `${raw.replace(" ", "T")}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface MatchRolePredictionRecord {
  matchId: string;
  playerId: number;
  // Сырой HattrickTime ("YYYY-MM-DD HH:MM:SS") — переводится в Date в
  // toTimestamp выше перед вставкой, как и в matchResearchDb.ts.
  matchDate: string | null;
  roleId: number;
  slotRole: SlotRole;
  skills: SquadSkills;
  experience: number;
  form: number;
  stamina: number;
  loyalty: number | null;
  isClubProduct: boolean | null;
  formulaVersion: string;
  predictedRaw: number;
  actualRatingStars: number;
  // Обе оценки звёзд по отдельности — только сбор данных для будущей
  // калибровки калькулятора замены (см. чат "Калькулятор оптимальной минуты
  // замены", шаг 1), не влияют на actualRatingStars/существующую
  // позиционную калибровку. null, если конкретное поле не пришло от CHPP.
  ratingStarsFull: number | null;
  ratingStarsEndOfMatch: number | null;
}

// Сохраняет пару "прогноз/реальность" для одного игрока в одном матче. В
// отличие от match_research_log — здесь ОБЕ величины (прогноз и факт)
// известны сразу в момент записи (оба посчитаны из уже полученного ответа
// CHPP за один проход синхронизации), поэтому постепенного дозаполнения
// через COALESCE не нужно: строка либо создаётся целиком, либо (если уже
// существует — например, синхронизация повторно задела тот же матч) не
// трогается — реальная оценка сыгранного матча не меняется задним числом.
export async function saveMatchRolePrediction(record: MatchRolePredictionRecord): Promise<void> {
  if (!record.matchId || !record.playerId) return;
  await ensureTable();
  const db = sql();

  await db`
    INSERT INTO match_role_predictions (
      match_id, player_id, match_date, role_id, slot_role,
      skills, experience, form, stamina, loyalty, is_club_product,
      formula_version, predicted_raw, actual_rating_stars,
      rating_stars_full, rating_stars_end_of_match
    ) VALUES (
      ${record.matchId}, ${record.playerId}, ${toTimestamp(record.matchDate)}, ${record.roleId}, ${record.slotRole},
      ${JSON.stringify(record.skills)}, ${record.experience}, ${record.form}, ${record.stamina},
      ${record.loyalty}, ${record.isClubProduct},
      ${record.formulaVersion}, ${record.predictedRaw}, ${record.actualRatingStars},
      ${record.ratingStarsFull}, ${record.ratingStarsEndOfMatch}
    )
    ON CONFLICT (match_id, player_id) DO NOTHING
  `;
}

// Ниже какого числа накопленных матчей по роли НЕ доверяем регрессии — сама
// линейная регрессия математически определена уже при 2 точках, но 2-3
// матча — не статистика, а совпадение. Порог намеренно консервативный (см.
// чат "Калибровка позиционного рейтинга по реальным звёздам Hattrick", план
// в .claude/plans, шаг 4) — ниже него getAllRoleCalibrations раньше честно
// не возвращала калибровку для этой роли вовсе (см. applyCalibration в
// zoneRatings.ts), теперь вместо этого подставляет ВРЕМЕННОЕ ручное
// приближение — см. PRELIMINARY_CALIBRATION ниже.
const MIN_CALIBRATION_SAMPLES = 15;

// ВРЕМЕННОЕ ручное приближение (см. чат "Хардкод предварительной
// калибровки", обновлено в чате "Обновить временную калибровку рейтинга
// звёзд") — пока ни у одной роли нет 15+ реальных матчей, чтобы
// getAllRoleCalibrations честно посчитала регрессию сама. Источник: ручной
// разбор 33 реальных пар прогноз/факт из ТРЁХ матчей (match_id=769224307,
// 769224311, 769224316) — обычная линейная регрессия по всем 33 точкам дала
// slope≈0.52/intercept≈0.92 (R²≈0.73) — заметно надёжнее прежней версии (11
// точек из ОДНОГО матча, slope≈0.55/intercept≈0.65). Всё ещё НЕ полноценная
// регрессия по каждой роли отдельно (данных для честного разделения по
// ролям пока недостаточно) — только чтобы прогноз уже сейчас выглядел
// ближе к реальным звёздам, а не ждал недель/месяцев накопления. Общая
// (не по ролям), поэтому isPreliminary=true распространяется на ВСЕ 7
// ролей одинаково. Как только у роли накопится MIN_CALIBRATION_SAMPLES
// реальных матчей, настоящая регрессия в цикле ниже автоматически
// перекрывает эту заглушку для этой конкретной роли — удалять вручную
// ничего не придётся.
const PRELIMINARY_CALIBRATION: { slope: number; intercept: number } = { slope: 0.52, intercept: 0.92 };

const ALL_SLOT_ROLES: SlotRole[] = ["GK", "DEF_WIDE", "DEF_CENTRAL", "MID_WIDE", "MID_CENTRAL", "FWD_CENTRAL", "FWD_WIDE"];

// Коэффициенты линейной калибровки (сырой прогноз → реальная звезда) по
// каждой роли сразу — одним запросом через встроенные в Postgres
// агрегатные функции линейной регрессии (regr_slope/regr_intercept/
// regr_count), без своего кода статистики. Считается заново при каждом
// вызове (не кешируется отдельной таблицей) — при текущих объёмах данных
// это дешёвый агрегатный запрос по индексированному PRIMARY KEY, а
// пересчёт "на лету" всегда отражает самые свежие накопленные матчи.
export async function getAllRoleCalibrations(formulaVersion: string): Promise<Partial<Record<SlotRole, RoleCalibration>>> {
  await ensureTable();
  const db = sql();
  const rows = await db`
    SELECT slot_role,
           regr_slope(actual_rating_stars, predicted_raw) AS slope,
           regr_intercept(actual_rating_stars, predicted_raw) AS intercept,
           regr_count(actual_rating_stars, predicted_raw) AS sample_count
    FROM match_role_predictions
    WHERE formula_version = ${formulaVersion}
    GROUP BY slot_role
  `;

  const result: Partial<Record<SlotRole, RoleCalibration>> = {};
  for (const row of rows) {
    const sampleCount = Number(row.sample_count ?? 0);
    if (sampleCount < MIN_CALIBRATION_SAMPLES) continue;
    const slope = Number(row.slope);
    const intercept = Number(row.intercept);
    if (Number.isNaN(slope) || Number.isNaN(intercept)) continue;
    result[row.slot_role as SlotRole] = { slope, intercept, sampleCount, isPreliminary: false };
  }

  // Роли без настоящей регрессии (мало/нет реальных матчей ещё) — временная
  // заглушка вместо "калибровки нет вообще", см. PRELIMINARY_CALIBRATION
  // выше. sampleCount=0 — честно означает "не число реальных матчей этой
  // роли", formatSlotRatingTooltip (zoneRatings.ts) обязана проверять
  // isPreliminary раньше, чем показывать sampleCount пользователю.
  for (const role of ALL_SLOT_ROLES) {
    if (!result[role]) {
      result[role] = { ...PRELIMINARY_CALIBRATION, sampleCount: 0, isPreliminary: true };
    }
  }

  return result;
}

// Сколько последних матчей учитывать в тренде одного игрока (см. чат
// "Калибровка позиционного рейтинга по реальным звёздам Hattrick", план в
// .claude/plans, шаг 5) — "последние N игр" из примера задания.
const PLAYER_TREND_RECENT_LIMIT = 10;

// Тренд по каждому (игрок, роль) — среднее РЕАЛЬНОЕ (actual_rating_stars) за
// последние PLAYER_TREND_RECENT_LIMIT матчей, для сравнения с ТЕКУЩИМ
// прогнозом на слоте (пример из задания: "прогноз 6.2★, в среднем реально
// получал 5.8★ за последние N игр"). Таблица не привязана к аккаунту,
// поэтому тренд игрока, перешедшего между командами разных пользователей
// приложения, не теряется. Одним запросом для ВСЕХ игроков состава сразу
// (оконная функция ROW_NUMBER — топ-N последних матчей на пару игрок+роль),
// а не по отдельному запросу на игрока — иначе страница "Расстановка"
// делала бы по одному обращению к БД на каждый занятый слот. Возвращает
// обычный объект (не Map) — проходит через границу серверный/клиентский
// компонент как обычный JSON-проп (см. calibrations в lineup/page.tsx).
export async function getPlayerRoleTrends(playerIds: number[]): Promise<Record<string, PlayerRoleTrend>> {
  const result: Record<string, PlayerRoleTrend> = {};
  if (playerIds.length === 0) return result;
  await ensureTable();
  const db = sql();
  const rows = await db`
    SELECT player_id, slot_role, actual_rating_stars
    FROM (
      SELECT player_id, slot_role, actual_rating_stars,
             ROW_NUMBER() OVER (PARTITION BY player_id, slot_role ORDER BY match_date DESC NULLS LAST) AS rn
      FROM match_role_predictions
      WHERE player_id = ANY(${playerIds})
    ) ranked
    WHERE rn <= ${PLAYER_TREND_RECENT_LIMIT}
  `;

  const grouped = new Map<string, number[]>();
  for (const row of rows) {
    const key = playerRoleTrendKey(Number(row.player_id), row.slot_role as SlotRole);
    const list = grouped.get(key) ?? [];
    list.push(Number(row.actual_rating_stars));
    grouped.set(key, list);
  }
  for (const [key, values] of grouped) {
    result[key] = { avgActualStars: values.reduce((s, v) => s + v, 0) / values.length, sampleCount: values.length };
  }
  return result;
}
