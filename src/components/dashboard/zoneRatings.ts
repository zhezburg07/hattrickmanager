import type { Assignments, SlotRole } from "@/data/pitchBoard";
import type { PositionGroup, SquadPlayer, SquadSkills } from "@/data/squad";

export type ZoneKey =
  | "midfield"
  | "attackLeft"
  | "attackCenter"
  | "attackRight"
  | "defenseLeft"
  | "defenseCenter"
  | "defenseRight";

export const zoneLabel: Record<ZoneKey, string> = {
  midfield: "Полузащита",
  attackLeft: "Атака слева",
  attackCenter: "Атака по центру",
  attackRight: "Атака справа",
  defenseLeft: "Защита слева",
  defenseCenter: "Защита по центру",
  defenseRight: "Защита справа",
};

function skill(player: SquadPlayer | null, key: keyof SquadSkills): number {
  return player?.skills[key] ?? 0;
}

function avgSkill(players: (SquadPlayer | null)[], key: keyof SquadSkills): number {
  return players.reduce((sum, p) => sum + skill(p, key), 0) / players.length;
}

function filledCount(players: (SquadPlayer | null)[]): number {
  return players.filter((p) => p !== null).length;
}

// Штраф за перегрузку центральной позиции: 2-3 игрока на одном и том же
// центральном амплуа (ЦЗЩ/ЦПЗ/ЦНАП) не складывают навыки линейно — их
// суммарный вклад в соответствующий зональный рейтинг растёт заметно
// медленнее. Множитель применяется к вкладу КАЖДОГО игрока в группе.
// ЦПЗ штрафуется сильнее всего, ЦНАП умеренно, ЦЗЩ — меньше всего.
type CentralRole = "DEF_CENTRAL" | "MID_CENTRAL" | "FWD_CENTRAL";

const congestionFactors: Record<CentralRole, Record<number, number>> = {
  MID_CENTRAL: { 1: 1, 2: 0.72, 3: 0.52 },
  FWD_CENTRAL: { 1: 1, 2: 0.82, 3: 0.62 },
  DEF_CENTRAL: { 1: 1, 2: 0.88, 3: 0.72 },
};

const congestionZoneLabel: Record<CentralRole, string> = {
  DEF_CENTRAL: "Защита по центру",
  MID_CENTRAL: "Полузащита",
  FWD_CENTRAL: "Атака по центру",
};

function congestionFactor(role: CentralRole, count: number): number {
  return congestionFactors[role][count] ?? 1;
}

export interface ZoneRatingsResult {
  ratings: Record<ZoneKey, number>;
  // Заполнено, только если штраф за перегрузку центра реально сработал где-то —
  // готовый текст для подсказки рядом с панелью
  congestionNote: string | null;
}

// Взвешенное среднее по парам [значение, вес]. Незанятый слот даёт значению 0,
// поэтому дыра в составе (например, нет крайнего защитника) ощутимо тянет
// рейтинг соответствующей зоны вниз — как и в реальном Hattrick.
export function weighted(terms: Array<[number, number]>): number {
  const totalWeight = terms.reduce((sum, [, w]) => sum + w, 0);
  const total = terms.reduce((sum, [value, w]) => sum + value * w, 0);
  return totalWeight > 0 ? total / totalWeight : 0;
}

// Веса навыков по каждой из 7 формальных ролей слота (см. SlotRole в
// pitchBoard.ts) — тот же дух приоритетов, что и в зональных формулах выше,
// только применённый к ОДНОМУ игроку на конкретном слоте, а не усреднённый
// по всей линии. Используется, чтобы показать на занятом слоте поля честный
// расчётный рейтинг силы игрока именно в этой роли (не выдуманную скрытую
// характеристику "Потенциал" — просто взвешенную сумму его реальных навыков).
const slotRoleWeights: Record<SlotRole, Array<[keyof SquadSkills, number]>> = {
  GK: [["goalkeeping", 4], ["defending", 0.5]],
  DEF_WIDE: [["defending", 3], ["winger", 1.5], ["passing", 1]],
  DEF_CENTRAL: [["defending", 3.5], ["passing", 0.8]],
  MID_WIDE: [["winger", 3], ["passing", 1.5], ["defending", 0.8], ["scoring", 0.5]],
  MID_CENTRAL: [["midfield", 3], ["passing", 1.5], ["defending", 0.8], ["scoring", 0.5]],
  FWD_CENTRAL: [["scoring", 3], ["passing", 1], ["winger", 0.5]],
  FWD_WIDE: [["scoring", 2.5], ["winger", 1.5], ["passing", 1]],
};

// ---- Преданность клубу и родной клуб (см. чат "Расширить формулу
// позиционного рейтинга") — ТОЧНЫЕ официальные бонусы (wiki.hattrick.org/
// wiki/Player_loyalty, официальный редакторский анонс от HT-Tjecken,
// 2011-10-03): "+1 skill level on all skills (stamina excluded), after 3
// seasons (336 days)" для преданности, "+0.5 skill level on all skills
// (stamina excluded)" фиксированно для родного клуба, оба бонуса
// складываются (воспитанник с максимальной преданностью получает +1.5).
//
// Кривую "нарастает по дням, половина эффекта на 12-й неделе, максимум на
// 336-й день" реализовывать заново НЕ нужно — Hattrick уже применил её
// сам и отдаёт готовый результат через CHPP: поле Loyalty в players.xml
// (см. squadPlayers.ts) — на ТОЙ ЖЕ шкале 0-20, что и обычные навыки
// (skillWord), где 20 ("божественно"/divine) = полный бонус по вики. Взяв
// это число как есть, мы используем именно официальную кривую Hattrick, а
// не приближение к ней.
const LOYALTY_MAX_SKILL_LEVEL = 20; // та же шкала skillWord, что и у обычных навыков
const LOYALTY_MAX_BONUS = 1; // "божественная" преданность (loyalty=20) = полный бонус

// Только те поля SquadPlayer, что реально читает расчёт рейтинга — по этому
// же подмножеству формула считается и для ЖИВОГО игрока (LineupField.tsx),
// и для ИСТОРИЧЕСКОГО снимка навыков (PlayerStatSnapshot, см.
// playerHistoryDb.ts) при калибровке по прошлым матчам (см. чат "Калибровка
// позиционного рейтинга по реальным звёздам Hattrick", план в
// .claude/plans, шаг 3) — PlayerStatSnapshot структурно уже содержит все
// эти поля, отдельный "поддельный SquadPlayer" собирать не нужно.
type RatingInputs = Pick<SquadPlayer, "skills" | "loyalty" | "isClubProduct" | "experience" | "form">;

function computeLoyaltyBonus(player: RatingInputs): number {
  if (player.loyalty === undefined) return 0; // нет данных — бонус не начисляем, а не гадаем
  return (Math.max(0, Math.min(LOYALTY_MAX_SKILL_LEVEL, player.loyalty)) / LOYALTY_MAX_SKILL_LEVEL) * LOYALTY_MAX_BONUS;
}

const MOTHER_CLUB_BONUS = 0.5; // фиксированный официальный бонус, см. комментарий выше

function computeMotherClubBonus(player: RatingInputs): number {
  return player.isClubProduct ? MOTHER_CLUB_BONUS : 0;
}

// ---- Опыт (см. тот же чат) — ЧЕСТНАЯ ЭВРИСТИКА, не официальная формула.
// У Hattrick нет опубликованной численной формулы влияния опыта на игровой
// рейтинг (в отличие от преданности выше) — здесь небольшой аддитивный
// бонус, растущий линейно с опытом по той же шкале 0-20, что и навыки.
// EXPERIENCE_MAX_BONUS специально небольшой (меньше даже одного бонуса
// родного клуба) — это заведомо ПРИБЛИЖЕНИЕ, которое можно и нужно будет
// уточнить позже по мере накопления статистики реальных матчей (см. тот
// же долгосрочный проект, что и у Индекса силы зон).
const EXPERIENCE_MAX_SKILL_LEVEL = 20;
const EXPERIENCE_MAX_BONUS = 0.3; // ПРИБЛИЖЕНИЕ — предстоит уточнить

function computeExperienceBonus(player: RatingInputs): number {
  return (Math.max(0, Math.min(EXPERIENCE_MAX_SKILL_LEVEL, player.experience)) / EXPERIENCE_MAX_SKILL_LEVEL) * EXPERIENCE_MAX_BONUS;
}

// ---- Форма (см. тот же чат) — ЧЕСТНАЯ ЭВРИСТИКА, не официальная формула.
// Официальной числовой формулы влияния формы на игровой рейтинг Hattrick не
// публикует — применяем текущую Форму (шкала 0-8, formWord) как МНОЖИТЕЛЬ
// к уже собранному рейтингу (навыки + точные бонусы + опыт), а не как ещё
// одно слагаемое: "нормальная" форма 6-7 — база ×1, ниже — понижающий
// множитель, выше — повышающий. FORM_BONUS_PER_LEVEL и клэмп — заведомо
// ПРИБЛИЖЕНИЕ, предстоит уточнить позже по мере накопления статистики
// реальных матчей.
const FORM_BASELINE_LEVEL = 6.5; // середина диапазона "6-7" из задания
const FORM_BONUS_PER_LEVEL = 0.03; // ПРИБЛИЖЕНИЕ — ±3% множителя за каждый уровень формы от базы
const FORM_MULTIPLIER_MIN = 0.8;
const FORM_MULTIPLIER_MAX = 1.12;

function computeFormMultiplier(player: RatingInputs): number {
  const raw = 1 + (player.form - FORM_BASELINE_LEVEL) * FORM_BONUS_PER_LEVEL;
  return Math.max(FORM_MULTIPLIER_MIN, Math.min(FORM_MULTIPLIER_MAX, raw));
}

// ---- Командный дух и уверенность команды (см. чат "Командный дух/
// уверенность в формуле позиционного рейтинга") — ЧЕСТНАЯ ЭВРИСТИКА, не
// официальная формула (Hattrick не публикует, как именно эти показатели
// влияют на результат матча). В отличие от Формы — это ОБЩЕКОМАНДНЫЕ
// значения (training.xml, Team.Morale/Team.SelfConfidence, см.
// src/lib/training.ts), одни и те же для всех игроков команды, а не
// индивидуальные — поэтому передаются отдельными параметрами в
// computeSlotRatingBreakdown ниже, а не полем RatingInputs конкретного
// игрока. Тот же приём "множитель поверх уже собранного рейтинга", что и у
// Формы: нейтральное значение (середина официальной шкалы Hattrick) — ×1,
// ниже — понижающий множитель, выше — повышающий. null (нет данных —
// синхронизация пришлась на матч команды, training.xml не пришёл и т.п.) —
// честно ×1 (нейтрально), а не гадаем.
//
// Командный дух шире известен в сообществе Hattrick как более заметный
// фактор — поэтому диапазон шире, чем у уверенности.
const TEAM_SPIRIT_BASELINE = 5; // TeamSpiritID 0-10, 5="Спокойствие"/Calm — истинная середина шкалы
const TEAM_SPIRIT_BONUS_PER_LEVEL = 0.025; // ПРИБЛИЖЕНИЕ — ±2.5% множителя за каждый уровень духа от базы
const TEAM_SPIRIT_MULTIPLIER_MIN = 0.85;
const TEAM_SPIRIT_MULTIPLIER_MAX = 1.15;

function computeTeamSpiritMultiplier(moraleValue: number | null | undefined): number {
  if (moraleValue === null || moraleValue === undefined) return 1;
  const raw = 1 + (moraleValue - TEAM_SPIRIT_BASELINE) * TEAM_SPIRIT_BONUS_PER_LEVEL;
  return Math.max(TEAM_SPIRIT_MULTIPLIER_MIN, Math.min(TEAM_SPIRIT_MULTIPLIER_MAX, raw));
}

// Уверенность — второстепенный, более мягкий фактор относительно духа, тот
// же принцип, диапазон уже.
const TEAM_CONFIDENCE_BASELINE = 4.5; // SelfConfidence 0-9, 4/5="Прилично"/"Хорошо" — истинная середина шкалы
const TEAM_CONFIDENCE_BONUS_PER_LEVEL = 0.02; // ПРИБЛИЖЕНИЕ — ±2% множителя за каждый уровень уверенности от базы
const TEAM_CONFIDENCE_MULTIPLIER_MIN = 0.9;
const TEAM_CONFIDENCE_MULTIPLIER_MAX = 1.1;

function computeTeamConfidenceMultiplier(confidenceValue: number | null | undefined): number {
  if (confidenceValue === null || confidenceValue === undefined) return 1;
  const raw = 1 + (confidenceValue - TEAM_CONFIDENCE_BASELINE) * TEAM_CONFIDENCE_BONUS_PER_LEVEL;
  return Math.max(TEAM_CONFIDENCE_MULTIPLIER_MIN, Math.min(TEAM_CONFIDENCE_MULTIPLIER_MAX, raw));
}

// ---- Характер игрока (см. тот же чат, пункт 5) — НЕ входит в числовой
// рейтинг силы: черты характера (лидерство и т.п.) не влияют на игровые
// навыки согласно документации Hattrick, они важны для ДРУГИХ решений
// (например, выбор капитана). Показывается отдельным индикатором рядом со
// слотом (см. LineupField.tsx), а не искажает число рейтинга. Порог 6 —
// верхние 2 уровня из 8 (leadershipWord: 6="сносно", 7="хорошо" — лучшая
// доступная метка для лидерства, у этого навыка нет более высоких словесных
// уровней, в отличие от обычных навыков).
export const CAPTAIN_LEADERSHIP_THRESHOLD = 6;

export function isCaptainWorthy(player: SquadPlayer): boolean {
  return player.leadership >= CAPTAIN_LEADERSHIP_THRESHOLD;
}

export interface SlotRatingBreakdown {
  rating: number; // итоговое число, показанное на слоте
  // -- точно (навыки + официальные бонусы Hattrick) --
  baseSkillAverage: number; // взвешенное среднее по навыкам роли, без бонусов
  loyaltyBonus: number; // 0..+1, официальная формула (см. computeLoyaltyBonus)
  motherClubBonus: number; // 0 или +0.5, официальная формула
  hasLoyaltyData: boolean; // false — CHPP не вернул Loyalty для этого игрока, бонус честно 0
  // -- приближённо (эвристики, не официальные формулы) --
  experienceBonus: number;
  formMultiplier: number;
  teamSpiritMultiplier: number; // ×1, если moraleValue не передан/недоступен
  teamConfidenceMultiplier: number; // ×1, если confidenceValue не передан/недоступен
  hasTeamMoraleData: boolean; // false — moraleValue не передан/null, множитель честно ×1, а не "нейтральный дух"
  hasTeamConfidenceData: boolean;
}

// Версия набора весов/бонусов формулы — увеличивать при ЛЮБОМ изменении
// slotRoleWeights или бонусных коэффициентов выше (LOYALTY_MAX_BONUS,
// MOTHER_CLUB_BONUS, EXPERIENCE_MAX_BONUS, FORM_*, TEAM_SPIRIT_*,
// TEAM_CONFIDENCE_*). Записывается вместе с каждым прогнозом в датасет
// калибровки (см. чат "Калибровка позиционного рейтинга по реальным
// звёздам Hattrick", план в .claude/plans, шаг 3-4) — чтобы регрессия не
// смешивала в одной выборке прогнозы, посчитанные разными версиями формулы
// (иначе изменение весов задним числом "портило" бы уже накопленную
// калибровку). УВЕЛИЧЕНО с "1" на "2" при добавлении командного духа/
// уверенности (см. чат "Командный дух/уверенность в формуле позиционного
// рейтинга") — по согласованию сброс накопленной калибровки принят как
// цена, датасет пока маленький (~месяц истории).
export const RATING_FORMULA_VERSION = "2";

// Расчётный рейтинг силы игрока на конкретном слоте — база, как и раньше,
// взвешенное среднее по навыкам роли (та же логика, что и у командных
// зональных показателей), поверх нее — официальные бонусы преданности и
// родного клуба (складываются С КАЖДЫМ навыком по официальному правилу
// Hattrick "+X к каждому навыку", что математически эквивалентно прибавить
// bonus один раз к уже взвешенному среднему — сумма весов не меняется), а
// затем небольшой эвристический бонус за опыт и множители формы/командного
// духа/уверенности поверх всего итога (см. комментарии у соответствующих
// функций выше). teamMoraleValue/teamConfidenceValue — ОБЩЕКОМАНДНЫЕ (одно
// и то же значение для каждого игрока команды на этом расчёте, в отличие от
// per-player Формы), необязательны — не переданы/null → множитель ×1.
export function computeSlotRatingBreakdown(
  player: RatingInputs,
  role: SlotRole,
  teamMoraleValue?: number | null,
  teamConfidenceValue?: number | null,
): SlotRatingBreakdown {
  const terms = slotRoleWeights[role].map(([skillKey, weight]): [number, number] => [player.skills[skillKey], weight]);
  const baseSkillAverage = weighted(terms);

  const loyaltyBonus = computeLoyaltyBonus(player);
  const motherClubBonus = computeMotherClubBonus(player);
  const experienceBonus = computeExperienceBonus(player);
  const formMultiplier = computeFormMultiplier(player);
  const teamSpiritMultiplier = computeTeamSpiritMultiplier(teamMoraleValue);
  const teamConfidenceMultiplier = computeTeamConfidenceMultiplier(teamConfidenceValue);

  const rating =
    (baseSkillAverage + loyaltyBonus + motherClubBonus + experienceBonus) *
    formMultiplier *
    teamSpiritMultiplier *
    teamConfidenceMultiplier;

  return {
    rating,
    baseSkillAverage,
    loyaltyBonus,
    motherClubBonus,
    hasLoyaltyData: player.loyalty !== undefined,
    experienceBonus,
    formMultiplier,
    teamSpiritMultiplier,
    teamConfidenceMultiplier,
    hasTeamMoraleData: teamMoraleValue !== null && teamMoraleValue !== undefined,
    hasTeamConfidenceData: teamConfidenceValue !== null && teamConfidenceValue !== undefined,
  };
}

export function computeSlotRating(
  player: RatingInputs,
  role: SlotRole,
  teamMoraleValue?: number | null,
  teamConfidenceValue?: number | null,
): number {
  return computeSlotRatingBreakdown(player, role, teamMoraleValue, teamConfidenceValue).rating;
}

// Коэффициенты калибровки сырого прогноза к реальной шкале звёзд Hattrick —
// посчитаны в БД через линейную регрессию (regr_slope/regr_intercept, см.
// getAllRoleCalibrations в matchRolePredictionsDb.ts) по накопленным парам
// "прогноз/реальный RatingStars" для этой роли (см. чат "Калибровка
// позиционного рейтинга по реальным звёздам Hattrick", план в
// .claude/plans, шаг 4). Тип объявлен здесь (а не в matchRolePredictionsDb.ts,
// который тянет за собой серверный @neondatabase/serverless) — этот файл
// используется и на сервере, и в клиентском LineupField.tsx.
export interface RoleCalibration {
  slope: number;
  intercept: number;
  sampleCount: number;
}

// Реальный минимум шкалы Hattrick — звёзды начинаются с 0.5. Потолка НЕТ —
// по запросу шкала остаётся открытой сверху (реальные оценки бывают 13 и
// выше), линейная формула сама по себе ничем не ограничена сверху, так что
// достаточно только пола.
const STAR_SCALE_FLOOR = 0.5;

// calibration === null — коэффициентов для этой роли ещё нет (мало
// накопленных матчей, см. MIN_CALIBRATION_SAMPLES в matchRolePredictionsDb.ts)
// или калибровка отключена — честно возвращаем сырой прогноз без изменений,
// а не гадаем на скудных данных.
export function applyCalibration(rawRating: number, calibration: RoleCalibration | null): number {
  if (!calibration) return rawRating;
  return Math.max(STAR_SCALE_FLOOR, calibration.slope * rawRating + calibration.intercept);
}

// Роли слота (SlotRole), которые в принципе относятся к общей позиционной
// группе игрока (PositionGroup) — сама группа не различает фланг/центр,
// поэтому берём ОБЕ подходящие роли и в computePlayerPotential ниже выбираем
// лучшую (см. чат "Унифицировать Потенциал с расчётом на слотах поля").
const POSITION_GROUP_SLOT_ROLES: Record<PositionGroup, SlotRole[]> = {
  GK: ["GK"],
  DEF: ["DEF_WIDE", "DEF_CENTRAL"],
  MID: ["MID_WIDE", "MID_CENTRAL"],
  FWD: ["FWD_WIDE", "FWD_CENTRAL"],
};

// ---- ВРЕМЕННОЕ УПРОЩЕНИЕ ОТОБРАЖЕНИЯ (см. чат "Временно упростить
// отображение позиционного рейтинга") — computeSlotRatingBreakdown без
// калибровки ничем не сжат сверху (взвешенное среднее навыков 0-20 плюс
// небольшие бонусы) и легко показывает "17"-"18" на сильном защитнике —
// непривычно и пугающе рядом с реальной шкалой звёзд Hattrick (0.5 и выше,
// но матчевые оценки обычно 3-9). Пока датасет калибровки (см.
// match_role_predictions, chppSync.ts) ещё маленький и калибровка почти
// нигде не применяется, ПОКАЗЫВАЕМ пользователю вместо этого старую простую
// оценку — один главный навык роли + бонус формы, зажатую в привычный
// диапазон 0-10 (та же логика, что была у estimatePotentialRating в
// squad.ts до "Унифицировать Потенциал с расчётом на слотах поля", только
// теперь по КОНКРЕТНОЙ роли слота, а не по общей позиционной группе —
// главный навык каждой роли взят из уже одобренного slotRoleWeights выше,
// это его навык с наибольшим весом).
//
// Фоновый сбор данных для калибровки (computeSlotRatingBreakdown,
// RATING_FORMULA_VERSION, запись в match_role_predictions в chppSync.ts) НЕ
// затрагивается и продолжает работать полной формулой, как и раньше —
// меняется только то, что видит пользователь. Когда датасет наберётся,
// mainSkillByRole/estimateSimpleSlotPotential ниже нужно убрать и вернуть
// computeSlotRatingBreakdown/applyCalibration как источник отображаемого
// числа и в computePlayerPotential, и в LineupField.tsx.
const mainSkillByRole: Record<SlotRole, keyof SquadSkills> = {
  GK: "goalkeeping",
  DEF_WIDE: "defending",
  DEF_CENTRAL: "defending",
  MID_WIDE: "winger",
  MID_CENTRAL: "midfield",
  FWD_CENTRAL: "scoring",
  FWD_WIDE: "scoring",
};

export function estimateSimpleSlotPotential(player: Pick<RatingInputs, "skills" | "form">, role: SlotRole): number {
  const mainSkill = player.skills[mainSkillByRole[role]];
  const base = (mainSkill / 20) * 8.5;
  const formBonus = (player.form / 8) * 1.5;
  return Math.max(0, Math.min(10, base + formBonus));
}

export function formatSimpleSlotPotentialTooltip(rating: number, roleLabel: string): string {
  return (
    `Ориентировочный потенциал на позиции ${roleLabel}: ${rating.toFixed(1)}★ ` +
    `(упрощённая временная оценка — главный навык роли + бонус формы; полная формула с ` +
    `калибровкой по реальным матчам вернётся, когда накопится достаточно данных).`
  );
}

// "Потенциал" в таблицах "Состав"/"Расстановка" — на время упрощения
// отображения (см. блок выше) использует ту же простую оценку, что и число
// на занятом слоте поля (estimateSimpleSlotPotential), а НЕ
// computeSlotRatingBreakdown/applyCalibration. Игрок вне поля не привязан к
// конкретному слоту (фланг/центр), поэтому берём МАКСИМУМ среди всех ролей
// слота его позиционной группы — "какой лучший рейтинг он в принципе
// способен дать где-то в этой линии прямо сейчас" — та же идея, что и
// раньше, просто на упрощённых числах.
//
// calibrations/teamMoraleValue/teamConfidenceValue временно не используются
// (сигнатура сохранена как есть, чтобы не трогать вызывающий код в
// SquadTable.tsx/LineupPlayerList.tsx/squadCells.tsx — он передаёт их
// по-прежнему) — вернутся в дело при откате упрощения.
export function computePlayerPotential(
  player: RatingInputs,
  positionGroup: PositionGroup,
  calibrations: Partial<Record<SlotRole, RoleCalibration>> = {},
  teamMoraleValue?: number | null,
  teamConfidenceValue?: number | null,
): number {
  const roles = POSITION_GROUP_SLOT_ROLES[positionGroup];
  return Math.max(...roles.map((role) => estimateSimpleSlotPotential(player, role)));
}

// Тренд КОНКРЕТНОГО игрока на конкретной роли — среднее РЕАЛЬНОЕ
// (actual_rating_stars) за последние несколько матчей (см. getPlayerRoleTrends
// в matchRolePredictionsDb.ts, план в .claude/plans, шаг 5). Тип объявлен
// здесь по той же причине, что и RoleCalibration выше — файл общий для
// сервера и клиента, matchRolePredictionsDb.ts (серверный, тянет
// @neondatabase/serverless) импортирует его отсюда, а не наоборот.
export interface PlayerRoleTrend {
  avgActualStars: number;
  sampleCount: number;
}

// Ключ для PlayerRoleTrend/getPlayerRoleTrends — общий для записи
// (matchRolePredictionsDb.ts, серверный) и чтения на клиенте
// (LineupField.tsx), чтобы не разъехаться форматом. Объявлен здесь (не в
// matchRolePredictionsDb.ts) по той же причине, что и остальные типы этого
// блока — нужен и клиентскому компоненту.
export function playerRoleTrendKey(playerId: number, slotRole: SlotRole): string {
  return `${playerId}:${slotRole}`;
}

// Текст подсказки при наведении на число рейтинга слота (см. чат "Расширить
// формулу позиционного рейтинга") — по запросу явно разделяет ТОЧНЫЕ
// компоненты (навыки + официальные бонусы Hattrick — преданность, родной
// клуб) и ПРИБЛИЖЁННЫЕ (эвристики без официальной формулы — опыт, форма),
// чтобы не выдавать честное приближение за официальную точность. calibration
// (см. чат "Калибровка позиционного рейтинга по реальным звёздам Hattrick",
// шаг 4) — если есть, показанное число уже откалибровано к реальной шкале
// звёзд, а сырой прогноз указан отдельной строкой для прозрачности; если
// нет (мало накопленных матчей ещё) — показывается сырое число как есть, с
// честной пометкой, что калибровки пока нет. trend (шаг 5) — если для
// ИМЕННО ЭТОГО игрока на ИМЕННО ЭТОЙ роли есть накопленная история реальных
// матчей, добавляет пример из задания ("прогноз 6.2★, в среднем реально
// получал 5.8★ за последние N игр"); молча пропускается, если истории нет.
export function formatSlotRatingTooltip(
  breakdown: SlotRatingBreakdown,
  roleLabel: string,
  calibration: RoleCalibration | null = null,
  trend: PlayerRoleTrend | null = null,
): string {
  const displayRating = applyCalibration(breakdown.rating, calibration);
  const headline = calibration
    ? `Расчётный рейтинг на позиции ${roleLabel}: ${displayRating.toFixed(1)}★ ` +
      `(откалибровано по ${calibration.sampleCount} реальным матчам игроков этой роли; до калибровки: ${breakdown.rating.toFixed(2)})`
    : `Расчётный рейтинг на позиции ${roleLabel}: ${breakdown.rating.toFixed(1)} ` +
      `(калибровки по реальным звёздам пока нет — мало накопленных матчей)`;
  const trendLine = trend
    ? `Этот игрок на этой позиции в среднем реально получал ${trend.avgActualStars.toFixed(1)}★ ` +
      `за последние ${trend.sampleCount} матч(ей) — против прогноза ${displayRating.toFixed(1)}★ сейчас.`
    : null;

  const loyaltyLine = breakdown.hasLoyaltyData
    ? `Преданность клубу: +${breakdown.loyaltyBonus.toFixed(2)}`
    : "Преданность клубу: +0.00 (CHPP не вернул Loyalty для этого игрока)";
  const motherClubLine =
    breakdown.motherClubBonus > 0 ? `Родной клуб: +${breakdown.motherClubBonus.toFixed(2)} (воспитанник)` : "Родной клуб: +0.00";
  const teamSpiritLine = breakdown.hasTeamMoraleData
    ? `Командный дух: ×${breakdown.teamSpiritMultiplier.toFixed(2)}`
    : "Командный дух: ×1.00 (нет данных training.xml на момент синхронизации)";
  const teamConfidenceLine = breakdown.hasTeamConfidenceData
    ? `Уверенность команды: ×${breakdown.teamConfidenceMultiplier.toFixed(2)}`
    : "Уверенность команды: ×1.00 (нет данных training.xml на момент синхронизации)";

  return [
    headline,
    ...(trendLine ? [trendLine] : []),
    "",
    "Точно (навыки + официальные бонусы Hattrick):",
    `  База по навыкам: ${breakdown.baseSkillAverage.toFixed(2)}`,
    `  ${loyaltyLine}`,
    `  ${motherClubLine}`,
    "",
    "Приближённо (эвристика, не официальная формула — будет уточняться по мере накопления статистики матчей):",
    `  Опыт: +${breakdown.experienceBonus.toFixed(2)}`,
    `  Форма: ×${breakdown.formMultiplier.toFixed(2)}`,
    `  ${teamSpiritLine}`,
    `  ${teamConfidenceLine}`,
  ].join("\n");
}

// Приблизительный, демонстрационный расчёт 7 секторов расстановки (как в
// реальном Hattrick): не точная формула игры, а взвешенная оценка по тем же
// навыкам и в том же порядке значимости, что использует Hattrick.
export function computeZoneRatings(
  assignments: Assignments,
  playersById: Map<number, SquadPlayer>,
): ZoneRatingsResult {
  const getPlayer = (group: PositionGroup, index: number): SquadPlayer | null => {
    const id = assignments[group][index];
    return id !== null ? (playersById.get(id) ?? null) : null;
  };

  const gk = getPlayer("GK", 0);
  const defLeft = getPlayer("DEF", 0); // DEF-0: крайний защитник слева
  const defCenterNearLeft = getPlayer("DEF", 1);
  const defCenter = [getPlayer("DEF", 1), getPlayer("DEF", 2), getPlayer("DEF", 3)];
  const defCenterNearRight = getPlayer("DEF", 3);
  const defRight = getPlayer("DEF", 4); // DEF-4: крайний защитник справа

  const midLeft = getPlayer("MID", 0); // MID-0: крайний полузащитник слева
  const midCenter = [getPlayer("MID", 1), getPlayer("MID", 2), getPlayer("MID", 3)];
  const midRight = getPlayer("MID", 4); // MID-4: крайний полузащитник справа

  const forwards = [getPlayer("FWD", 0), getPlayer("FWD", 1), getPlayer("FWD", 2)];

  const defCenterFactor = congestionFactor("DEF_CENTRAL", filledCount(defCenter));
  const midCenterFactor = congestionFactor("MID_CENTRAL", filledCount(midCenter));
  const fwdCenterFactor = congestionFactor("FWD_CENTRAL", filledCount(forwards));

  const congestedZones = (
    [
      ["DEF_CENTRAL", defCenterFactor],
      ["MID_CENTRAL", midCenterFactor],
      ["FWD_CENTRAL", fwdCenterFactor],
    ] as const
  )
    .filter(([, factor]) => factor < 1)
    .map(([role]) => congestionZoneLabel[role]);

  const congestionNote =
    congestedZones.length > 0
      ? `Несколько игроков на одной позиции снижают эффективность: ${congestedZones.join(", ")}`
      : null;

  const midfield = weighted([
    [avgSkill(midCenter, "midfield") * midCenterFactor, 3],
    [(skill(midLeft, "midfield") + skill(midRight, "midfield")) / 2, 1.5],
    [avgSkill(defCenter, "midfield"), 1],
    [avgSkill(forwards, "midfield"), 0.8],
    [(skill(defLeft, "midfield") + skill(defRight, "midfield")) / 2, 0.5],
  ]);

  function attackSide(wideMid: SquadPlayer | null, wideDef: SquadPlayer | null): number {
    return weighted([
      [skill(wideMid, "winger"), 3],
      [skill(wideDef, "winger"), 2],
      [avgSkill(forwards, "scoring"), 1.5],
      [(avgSkill(midCenter, "passing") + skill(wideMid, "passing")) / 2, 1],
      [(avgSkill(forwards, "winger") + avgSkill(forwards, "passing")) / 2, 0.5],
    ]);
  }

  const attackLeft = attackSide(midLeft, defLeft);
  const attackRight = attackSide(midRight, defRight);

  const attackCenter = weighted([
    [avgSkill(forwards, "scoring") * fwdCenterFactor, 3],
    [avgSkill(forwards, "passing") * fwdCenterFactor, 1.5],
    [avgSkill(midCenter, "passing"), 1],
    [avgSkill(midCenter, "scoring"), 0.8],
  ]);

  function defenseSide(wideDef: SquadPlayer | null, nearCentralDef: SquadPlayer | null, wideMid: SquadPlayer | null): number {
    return weighted([
      [skill(wideDef, "defending"), 3],
      [skill(gk, "goalkeeping"), 1.5],
      [skill(nearCentralDef, "defending"), 1],
      [(skill(wideMid, "defending") + avgSkill(midCenter, "defending")) / 2, 0.6],
    ]);
  }

  const defenseLeft = defenseSide(defLeft, defCenterNearLeft, midLeft);
  const defenseRight = defenseSide(defRight, defCenterNearRight, midRight);

  const defenseCenter = weighted([
    [avgSkill(defCenter, "defending") * defCenterFactor, 3],
    [skill(gk, "goalkeeping"), 1.5],
    [avgSkill(midCenter, "defending"), 1],
    [(avgSkill([defLeft, defRight], "defending") + avgSkill([midLeft, midRight], "defending")) / 2, 0.5],
  ]);

  return {
    ratings: {
      midfield,
      attackLeft,
      attackCenter,
      attackRight,
      defenseLeft,
      defenseCenter,
      defenseRight,
    },
    congestionNote,
  };
}
