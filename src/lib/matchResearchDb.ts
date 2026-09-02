import { neon } from "@neondatabase/serverless";
import type { MatchZoneRatings } from "./matchAnalysis";

// Долгосрочный, ОБЕЗЛИЧЕННЫЙ журнал сыгранных матчей — впрок, для будущего
// анализа/алгоритма прогнозирования (не сейчас — просто накопление сырых
// данных). Принципиально отличается от остальных таблиц в
// playerHistoryDb.ts (player_stat_snapshots/player_weekly_tsi): те привязаны
// к hattrick_user_id, а здесь такого столбца нет вообще — MatchID глобально
// уникален в самом Hattrick (не зависит от того, кто из подключённых
// пользователей его посмотрел), поэтому PRIMARY KEY — match_id, без
// привязки к конкретному аккаунту HattrickManager. Никаких имён команд,
// менеджеров или иных персональных данных — только числовые ID команд
// (публичные идентификаторы Hattrick, не личные данные) и рейтинги/результат.
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
    CREATE TABLE IF NOT EXISTS match_research_log (
      match_id BIGINT PRIMARY KEY,
      match_date TIMESTAMPTZ,
      match_type SMALLINT,
      cup_id BIGINT,
      home_team_id BIGINT,
      away_team_id BIGINT,
      home_formation TEXT,
      away_formation TEXT,
      home_tactic_type SMALLINT,
      away_tactic_type SMALLINT,
      home_team_attitude SMALLINT,
      away_team_attitude SMALLINT,
      home_left_def SMALLINT,
      home_mid_def SMALLINT,
      home_right_def SMALLINT,
      home_midfield SMALLINT,
      home_left_att SMALLINT,
      home_mid_att SMALLINT,
      home_right_att SMALLINT,
      home_set_pieces_def SMALLINT,
      home_set_pieces_att SMALLINT,
      away_left_def SMALLINT,
      away_mid_def SMALLINT,
      away_right_def SMALLINT,
      away_midfield SMALLINT,
      away_left_att SMALLINT,
      away_mid_att SMALLINT,
      away_right_att SMALLINT,
      away_set_pieces_def SMALLINT,
      away_set_pieces_att SMALLINT,
      home_power_index SMALLINT,
      away_power_index SMALLINT,
      home_goals SMALLINT,
      away_goals SMALLINT,
      logged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  // Воронка сбора данных для будущей калибровки тактик (см. чат
  // "Автоматическая воронка сбора данных для будущей калибровки тактик") —
  // тот же аддитивный приём (ALTER TABLE ADD COLUMN IF NOT EXISTS), что и
  // везде в проекте, старые строки просто останутся NULL.
  //
  // *_pressing_events/*_attack_middle_events/*_attack_wings_events — счётчик
  // срабатываний кодов события 68/343/344 (SUSPECTED_TACTIC_EVENT_IDS,
  // matchAnalysis.ts) на каждой стороне за матч. Коды пока НЕ подтверждены
  // официально (68 подтверждён эмпирически на 2 матчах пользователем,
  // 343/344 — только гипотеза) — сохраняем как есть, переинтерпретация
  // кода не потребует новой миграции, только правки в коде, который их
  // считает.
  await db`ALTER TABLE match_research_log ADD COLUMN IF NOT EXISTS home_pressing_events SMALLINT`;
  await db`ALTER TABLE match_research_log ADD COLUMN IF NOT EXISTS away_pressing_events SMALLINT`;
  await db`ALTER TABLE match_research_log ADD COLUMN IF NOT EXISTS home_attack_middle_events SMALLINT`;
  await db`ALTER TABLE match_research_log ADD COLUMN IF NOT EXISTS away_attack_middle_events SMALLINT`;
  await db`ALTER TABLE match_research_log ADD COLUMN IF NOT EXISTS home_attack_wings_events SMALLINT`;
  await db`ALTER TABLE match_research_log ADD COLUMN IF NOT EXISTS away_attack_wings_events SMALLINT`;
  // NrOfChances* (MatchAttackStats, matchAnalysis.ts) — официальный эффект
  // Прессинга измеряется именно здесь, не в RatingMidfield (см. чат "Полный
  // аудит реализации тактик против официального руководства Hattrick").
  await db`ALTER TABLE match_research_log ADD COLUMN IF NOT EXISTS home_chances_total SMALLINT`;
  await db`ALTER TABLE match_research_log ADD COLUMN IF NOT EXISTS home_chances_left SMALLINT`;
  await db`ALTER TABLE match_research_log ADD COLUMN IF NOT EXISTS home_chances_center SMALLINT`;
  await db`ALTER TABLE match_research_log ADD COLUMN IF NOT EXISTS home_chances_right SMALLINT`;
  await db`ALTER TABLE match_research_log ADD COLUMN IF NOT EXISTS home_chances_special SMALLINT`;
  await db`ALTER TABLE match_research_log ADD COLUMN IF NOT EXISTS home_chances_other SMALLINT`;
  await db`ALTER TABLE match_research_log ADD COLUMN IF NOT EXISTS away_chances_total SMALLINT`;
  await db`ALTER TABLE match_research_log ADD COLUMN IF NOT EXISTS away_chances_left SMALLINT`;
  await db`ALTER TABLE match_research_log ADD COLUMN IF NOT EXISTS away_chances_center SMALLINT`;
  await db`ALTER TABLE match_research_log ADD COLUMN IF NOT EXISTS away_chances_right SMALLINT`;
  await db`ALTER TABLE match_research_log ADD COLUMN IF NOT EXISTS away_chances_special SMALLINT`;
  await db`ALTER TABLE match_research_log ADD COLUMN IF NOT EXISTS away_chances_other SMALLINT`;
  // Производный сигнал для условия официального бонуса Контратак ("работает
  // только если полузащита ПРОИГРЫВАЕТ сопернику, без учёта самого 7%-
  // снижения" — см. чат "Полный аудит реализации тактик" и docs/
  // hattrick-official-rules.md, раздел "Матч: Тактики"). Сам условный бонус
  // (доп. шансы при перехвате) НЕ реализован — это только сырой признак для
  // будущего статистического анализа, когда данных накопится достаточно:
  // сравнивается ли слабость полузащиты именно у команд с TacticType=2
  // (Контратаки) с тем, что происходит у них с NrOfChances/голами. Тривиально
  // вычисляется из homeZones.midfield/awayZones.midfield, уже читаемых на
  // этой же странице разбора матча — null, если хотя бы одна из сторон не
  // дала зональные рейтинги (не гадаем на неполных данных).
  await db`ALTER TABLE match_research_log ADD COLUMN IF NOT EXISTS home_midfield_weaker BOOLEAN`;
  await db`ALTER TABLE match_research_log ADD COLUMN IF NOT EXISTS away_midfield_weaker BOOLEAN`;
  tableEnsured = true;
}

export interface MatchResearchRecord {
  matchId: string;
  // Сырой HattrickTime ("YYYY-MM-DD HH:MM:SS", UTC) — переводится в Date в
  // toTimestamp ниже перед вставкой.
  matchDate: string | null;
  matchType: number | null;
  cupId: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeFormation: string | null;
  awayFormation: string | null;
  homeTacticType: number | null;
  awayTacticType: number | null;
  homeTeamAttitude: number | null;
  awayTeamAttitude: number | null;
  homeZones: MatchZoneRatings | null;
  awayZones: MatchZoneRatings | null;
  homePowerIndex: number | null;
  awayPowerIndex: number | null;
  homeGoals: number | null;
  awayGoals: number | null;
  // Воронка сбора данных для калибровки тактик (см. чат "Автоматическая
  // воронка сбора данных для будущей калибровки тактик") — счётчики
  // тактических событий (68=Прессинг/343=Атака в центре/344=Атака по
  // флангам, SUSPECTED_TACTIC_EVENT_IDS) и NrOfChances* по каждой стороне.
  homePressingEvents: number | null;
  awayPressingEvents: number | null;
  homeAttackMiddleEvents: number | null;
  awayAttackMiddleEvents: number | null;
  homeAttackWingsEvents: number | null;
  awayAttackWingsEvents: number | null;
  homeChancesTotal: number | null;
  homeChancesLeft: number | null;
  homeChancesCenter: number | null;
  homeChancesRight: number | null;
  homeChancesSpecial: number | null;
  homeChancesOther: number | null;
  awayChancesTotal: number | null;
  awayChancesLeft: number | null;
  awayChancesCenter: number | null;
  awayChancesRight: number | null;
  awayChancesSpecial: number | null;
  awayChancesOther: number | null;
  // Сырой признак для условия бонуса Контратак — см. комментарий у ALTER
  // TABLE выше. null, если homeZones/awayZones.midfield недоступны.
  homeMidfieldWeaker: boolean | null;
  awayMidfieldWeaker: boolean | null;
}

function toTimestamp(raw: string | null): Date | null {
  if (!raw) return null;
  const iso = raw.includes("T") ? raw : `${raw.replace(" ", "T")}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Сохраняет/дополняет запись о сыгранном матче. Вызывается "по требованию" —
// побочным эффектом обычного открытия разбора матча на вкладке "Матчи" (см.
// resolveMatchAnalysis в matchAnalysis.ts), НЕ отдельной фоновой job —
// данные копятся органически по мере того, как подключённые пользователи
// (любые, не только владелец конкретного матча) просматривают свои матчи.
//
// ON CONFLICT (match_id) — COALESCE подставляет новое значение только там,
// где старое было NULL, поэтому запись со временем ДОПОЛНЯЕТСЯ, а не
// перезаписывается менее полными данными. Пример: TeamAttitude команды
// гостей CHPP отдаёт только владельцу той команды — если этот же матч
// позже откроет менеджер соперника (через свой аккаунт HattrickManager),
// его "родное" TeamAttitude дополнит уже существующую строку.
export async function saveMatchForResearch(record: MatchResearchRecord): Promise<void> {
  if (!record.matchId) return;
  await ensureTable();
  const db = sql();
  const hz = record.homeZones;
  const az = record.awayZones;

  await db`
    INSERT INTO match_research_log (
      match_id, match_date, match_type, cup_id, home_team_id, away_team_id,
      home_formation, away_formation, home_tactic_type, away_tactic_type,
      home_team_attitude, away_team_attitude,
      home_left_def, home_mid_def, home_right_def, home_midfield, home_left_att, home_mid_att, home_right_att,
      home_set_pieces_def, home_set_pieces_att,
      away_left_def, away_mid_def, away_right_def, away_midfield, away_left_att, away_mid_att, away_right_att,
      away_set_pieces_def, away_set_pieces_att,
      home_power_index, away_power_index, home_goals, away_goals,
      home_pressing_events, away_pressing_events,
      home_attack_middle_events, away_attack_middle_events,
      home_attack_wings_events, away_attack_wings_events,
      home_chances_total, home_chances_left, home_chances_center, home_chances_right, home_chances_special, home_chances_other,
      away_chances_total, away_chances_left, away_chances_center, away_chances_right, away_chances_special, away_chances_other,
      home_midfield_weaker, away_midfield_weaker,
      updated_at
    ) VALUES (
      ${record.matchId}, ${toTimestamp(record.matchDate)}, ${record.matchType}, ${record.cupId},
      ${record.homeTeamId}, ${record.awayTeamId}, ${record.homeFormation}, ${record.awayFormation},
      ${record.homeTacticType}, ${record.awayTacticType}, ${record.homeTeamAttitude}, ${record.awayTeamAttitude},
      ${hz?.leftDef ?? null}, ${hz?.midDef ?? null}, ${hz?.rightDef ?? null}, ${hz?.midfield ?? null},
      ${hz?.leftAtt ?? null}, ${hz?.midAtt ?? null}, ${hz?.rightAtt ?? null},
      ${hz?.setPiecesDef ?? null}, ${hz?.setPiecesAtt ?? null},
      ${az?.leftDef ?? null}, ${az?.midDef ?? null}, ${az?.rightDef ?? null}, ${az?.midfield ?? null},
      ${az?.leftAtt ?? null}, ${az?.midAtt ?? null}, ${az?.rightAtt ?? null},
      ${az?.setPiecesDef ?? null}, ${az?.setPiecesAtt ?? null},
      ${record.homePowerIndex}, ${record.awayPowerIndex}, ${record.homeGoals}, ${record.awayGoals},
      ${record.homePressingEvents}, ${record.awayPressingEvents},
      ${record.homeAttackMiddleEvents}, ${record.awayAttackMiddleEvents},
      ${record.homeAttackWingsEvents}, ${record.awayAttackWingsEvents},
      ${record.homeChancesTotal}, ${record.homeChancesLeft}, ${record.homeChancesCenter}, ${record.homeChancesRight}, ${record.homeChancesSpecial}, ${record.homeChancesOther},
      ${record.awayChancesTotal}, ${record.awayChancesLeft}, ${record.awayChancesCenter}, ${record.awayChancesRight}, ${record.awayChancesSpecial}, ${record.awayChancesOther},
      ${record.homeMidfieldWeaker}, ${record.awayMidfieldWeaker},
      now()
    )
    ON CONFLICT (match_id) DO UPDATE SET
      match_date = COALESCE(match_research_log.match_date, EXCLUDED.match_date),
      match_type = COALESCE(match_research_log.match_type, EXCLUDED.match_type),
      cup_id = COALESCE(match_research_log.cup_id, EXCLUDED.cup_id),
      home_team_id = COALESCE(match_research_log.home_team_id, EXCLUDED.home_team_id),
      away_team_id = COALESCE(match_research_log.away_team_id, EXCLUDED.away_team_id),
      home_formation = COALESCE(match_research_log.home_formation, EXCLUDED.home_formation),
      away_formation = COALESCE(match_research_log.away_formation, EXCLUDED.away_formation),
      home_tactic_type = COALESCE(match_research_log.home_tactic_type, EXCLUDED.home_tactic_type),
      away_tactic_type = COALESCE(match_research_log.away_tactic_type, EXCLUDED.away_tactic_type),
      home_team_attitude = COALESCE(match_research_log.home_team_attitude, EXCLUDED.home_team_attitude),
      away_team_attitude = COALESCE(match_research_log.away_team_attitude, EXCLUDED.away_team_attitude),
      home_left_def = COALESCE(match_research_log.home_left_def, EXCLUDED.home_left_def),
      home_mid_def = COALESCE(match_research_log.home_mid_def, EXCLUDED.home_mid_def),
      home_right_def = COALESCE(match_research_log.home_right_def, EXCLUDED.home_right_def),
      home_midfield = COALESCE(match_research_log.home_midfield, EXCLUDED.home_midfield),
      home_left_att = COALESCE(match_research_log.home_left_att, EXCLUDED.home_left_att),
      home_mid_att = COALESCE(match_research_log.home_mid_att, EXCLUDED.home_mid_att),
      home_right_att = COALESCE(match_research_log.home_right_att, EXCLUDED.home_right_att),
      home_set_pieces_def = COALESCE(match_research_log.home_set_pieces_def, EXCLUDED.home_set_pieces_def),
      home_set_pieces_att = COALESCE(match_research_log.home_set_pieces_att, EXCLUDED.home_set_pieces_att),
      away_left_def = COALESCE(match_research_log.away_left_def, EXCLUDED.away_left_def),
      away_mid_def = COALESCE(match_research_log.away_mid_def, EXCLUDED.away_mid_def),
      away_right_def = COALESCE(match_research_log.away_right_def, EXCLUDED.away_right_def),
      away_midfield = COALESCE(match_research_log.away_midfield, EXCLUDED.away_midfield),
      away_left_att = COALESCE(match_research_log.away_left_att, EXCLUDED.away_left_att),
      away_mid_att = COALESCE(match_research_log.away_mid_att, EXCLUDED.away_mid_att),
      away_right_att = COALESCE(match_research_log.away_right_att, EXCLUDED.away_right_att),
      away_set_pieces_def = COALESCE(match_research_log.away_set_pieces_def, EXCLUDED.away_set_pieces_def),
      away_set_pieces_att = COALESCE(match_research_log.away_set_pieces_att, EXCLUDED.away_set_pieces_att),
      home_power_index = COALESCE(match_research_log.home_power_index, EXCLUDED.home_power_index),
      away_power_index = COALESCE(match_research_log.away_power_index, EXCLUDED.away_power_index),
      home_goals = COALESCE(match_research_log.home_goals, EXCLUDED.home_goals),
      away_goals = COALESCE(match_research_log.away_goals, EXCLUDED.away_goals),
      home_pressing_events = COALESCE(match_research_log.home_pressing_events, EXCLUDED.home_pressing_events),
      away_pressing_events = COALESCE(match_research_log.away_pressing_events, EXCLUDED.away_pressing_events),
      home_attack_middle_events = COALESCE(match_research_log.home_attack_middle_events, EXCLUDED.home_attack_middle_events),
      away_attack_middle_events = COALESCE(match_research_log.away_attack_middle_events, EXCLUDED.away_attack_middle_events),
      home_attack_wings_events = COALESCE(match_research_log.home_attack_wings_events, EXCLUDED.home_attack_wings_events),
      away_attack_wings_events = COALESCE(match_research_log.away_attack_wings_events, EXCLUDED.away_attack_wings_events),
      home_chances_total = COALESCE(match_research_log.home_chances_total, EXCLUDED.home_chances_total),
      home_chances_left = COALESCE(match_research_log.home_chances_left, EXCLUDED.home_chances_left),
      home_chances_center = COALESCE(match_research_log.home_chances_center, EXCLUDED.home_chances_center),
      home_chances_right = COALESCE(match_research_log.home_chances_right, EXCLUDED.home_chances_right),
      home_chances_special = COALESCE(match_research_log.home_chances_special, EXCLUDED.home_chances_special),
      home_chances_other = COALESCE(match_research_log.home_chances_other, EXCLUDED.home_chances_other),
      away_chances_total = COALESCE(match_research_log.away_chances_total, EXCLUDED.away_chances_total),
      away_chances_left = COALESCE(match_research_log.away_chances_left, EXCLUDED.away_chances_left),
      away_chances_center = COALESCE(match_research_log.away_chances_center, EXCLUDED.away_chances_center),
      away_chances_right = COALESCE(match_research_log.away_chances_right, EXCLUDED.away_chances_right),
      away_chances_special = COALESCE(match_research_log.away_chances_special, EXCLUDED.away_chances_special),
      away_chances_other = COALESCE(match_research_log.away_chances_other, EXCLUDED.away_chances_other),
      home_midfield_weaker = COALESCE(match_research_log.home_midfield_weaker, EXCLUDED.home_midfield_weaker),
      away_midfield_weaker = COALESCE(match_research_log.away_midfield_weaker, EXCLUDED.away_midfield_weaker),
      updated_at = now()
  `;
}
