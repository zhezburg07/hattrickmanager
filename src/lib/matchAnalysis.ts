import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";
import { parseArenaDetailsXml } from "./arena";
import { requestChppXmlRaw, type StoredHattrickTokens } from "./hattrickApi";
import { stripHtml } from "./htmlText";
import { CUP_MATCH_TYPE } from "./matches";
import { saveMatchForResearch } from "./matchResearchDb";

// Реальный разбор матча по конкретному MatchID — раньше на "Обзоре матча"
// (раскрытая строка сыгранного матча в календаре) показывались полностью
// выдуманные рейтинги/зоны/хронология/посещаемость (см. git-историю
// src/data/matchAnalysis.ts, удалён), а затем — только рейтинги игроков (и
// то пустые, см. ниже).
//
// ИСПРАВЛЕНО (повторная проверка реальной схемы matchdetails.xml v3.1 через
// независимый CHPP-клиент github.com/lucianoq/hattrick):
// 1) Рейтинги игроков раньше читались из matchdetails.xml
//    (HomeTeam/AwayTeam → Lineup → Player → RatingStars) — этого поля там
//    ПРОСТО НЕТ, отсюда и пустой список. Список игроков с рейтингом отдаёт
//    ОТДЕЛЬНЫЙ файл matchlineup.xml (v2.1), по одному запросу на команду
//    (свою — без teamID, чужую — с explicit teamID). Также отдаёт RoleID —
//    формальную позицию игрока на поле (100-113 — стартовый состав, см.
//    positionOf ниже), используется для расстановки маркеров на поле.
// 2) matchdetails.xml (v3.1) реально содержит: командные показатели по
//    зонам (RatingMidfield/RatingRightDef/RatingMidDef/RatingLeftDef/
//    RatingRightAtt/RatingMidAtt/RatingLeftAtt/RatingIndirectSetPieces{Def,
//    Att}, шкала 1-80 — та же система тиров, что и обычные навыки 0-20,
//    только в 4 раза подробнее), посещаемость матча (Arena → SoldTerraces/
//    SoldBasic/SoldRoof/SoldVIP/SoldTotal — реальные проданные билеты,
//    БЕЗ дохода: цену за место и выручку по конкретному матчу CHPP нигде
//    не отдаёт, только количество мест — см. src/lib/arena.ts), список
//    голов (Scorers/Goal) и карточек (Bookings/Booking) — оба всегда
//    приходят без доп. параметров, и полный список событий матча
//    (EventList/Event с EventTypeID/EventText), но ТОЛЬКО если явно
//    запросить параметр matchEvents=true — без него контейнер просто не
//    приходит в ответе, что и стало причиной прежнего вывода "недоступно".
//
// ВАЖНО: каждая секция (рейтинги/зоны/посещаемость/хронология) разбирается
// в своём собственном try/catch — раньше исключение в разборе ЛЮБОЙ одной
// секции (например, из-за нестандартной формы конкретного события в
// EventList для конкретного матча) обрушивало ВЕСЬ resolveMatchAnalysis,
// из-за чего для одних матчей отчёт показывался целиком, а для других —
// нет (нестабильное поведение). Теперь падение одной секции не мешает
// остальным, а раздел debug ниже показывает сырые счётчики, чтобы не
// гадать вслепую при следующей похожей жалобе.
export interface MatchPlayerRating {
  playerId: number;
  name: string;
  rating: number;
  // RoleID из matchlineup.xml — формальная позиция на поле (100-113 —
  // одна из 11 стартовых позиций, всё остальное — скамейка/спецроль).
  // null, если поле не пришло вовсе.
  roleId: number | null;
}

// Зональные показатели команды за конкретный матч — шкала CHPP 1-80,
// приводится к словесной шкале навыков (skillWord, 0-20) через rating/4.
export interface MatchZoneRatings {
  midfield: number | null;
  rightDef: number | null;
  midDef: number | null;
  leftDef: number | null;
  rightAtt: number | null;
  midAtt: number | null;
  leftAtt: number | null;
  setPiecesDef: number | null;
  setPiecesAtt: number | null;
}

export interface MatchAttendance {
  arenaName: string;
  terraces: number;
  basic: number;
  roof: number;
  vip: number;
  total: number;
  // Вместимость стадиона по категориям — ОТДЕЛЬНЫЙ реальный запрос
  // arenadetails.xml (см. src/lib/arena.ts), по ArenaID именно ЭТОГО матча
  // (matchdetails->Arena->ArenaID), а не "своего" стадиона: на выездном
  // матче посещаемость считается от вместимости стадиона СОПЕРНИКА.
  // null, если запрос не удался или ArenaID не пришёл.
  capacityTerraces: number | null;
  capacityBasic: number | null;
  capacityRoof: number | null;
  capacityVip: number | null;
  capacityTotal: number | null;
}

// Статистика атакующих моментов команды за матч — реальные подтверждённые
// поля matchdetails.xml (chpp/file_matchdetails.go, независимый CHPP-клиент
// github.com/lucianoq/hattrick): NrOfChancesLeft/Center/Right/
// SpecialEvents/Other — ЭТО ИТОГИ ЗА ВЕСЬ МАТЧ, без разбивки по минутам
// (в отличие от Scorers/Goal, у которых есть точная минута каждого гола).
// goals — HomeGoals/AwayGoals, тоже итог за матч (используется просто как
// точное число реализованных моментов). missed — производное значение
// (chancesTotal - goals), тоже итог за матч, НЕ распределённый по времени.
export interface MatchAttackStats {
  chancesTotal: number | null;
  goals: number | null;
  missed: number | null;
  // Разбивка ВСЕХ моментов (не только нереализованных) по зонам атаки —
  // подтверждённые поля matchdetails.xml, но у Hattrick НЕТ отдельного
  // счётчика именно "нереализованных" моментов по зоне (только их сумма с
  // голами) — см. комментарий у parseAttackStats ниже и debugScalarTeamFields
  // в debug. Каждое поле null, только если сам контейнер team отсутствует.
  chancesLeft: number | null;
  chancesCenter: number | null;
  chancesRight: number | null;
  chancesSpecialEvents: number | null;
  chancesOther: number | null;
  // Та же разбивка, но ОТДЕЛЬНО голы и отдельно нереализованные моменты —
  // вычисляется из отдельных событий EventList по EventTypeID (см.
  // classifyEventTypeId/computeAttackZoneBreakdown ниже), а не из готового
  // поля matchdetails (такого поля у Hattrick нет). Каждое поле null, если
  // разбивку не удалось сверить с официальными итогами выше для этого
  // конкретного матча (EventList не пришёл, расхождение с известными
  // суммами и т.п.) — тогда честно не показываем эти числа.
  goalsLeft: number | null;
  goalsCenter: number | null;
  goalsRight: number | null;
  goalsSpecialEvents: number | null;
  goalsOther: number | null;
  missedLeft: number | null;
  missedCenter: number | null;
  missedRight: number | null;
  missedSpecialEvents: number | null;
  missedOther: number | null;
}

// Тактический приказ команды на матч — подтверждённое поле <TacticType>
// (независимый CHPP-клиент github.com/lucianoq/hattrick,
// chpp/type_match_tactic_type.go), присылается для обеих команд без
// ограничений.
const MATCH_TACTIC_LABEL: Record<number, string> = {
  0: "Обычная игра",
  1: "Прессинг",
  2: "Контратаки",
  3: "Атака по центру",
  4: "Атака по флангам",
  7: "Игра на публику",
  8: "Дальние удары",
};

// "Отношение к матчу" (мотивационная речь тренера) — подтверждённое поле
// <TeamAttitude> (chpp/type_match_team_attitude.go), НО по документации
// того же клиента отдаётся только владельцу команды — для чужой стороны
// поле просто отсутствует в ответе, что здесь честно даёт null (не "0"/
// "Обычная" по умолчанию).
const TEAM_ATTITUDE_LABEL: Record<number, string> = {
  [-1]: "Не гореть желанием",
  0: "Как обычно",
  1: "Матч сезона",
};

// Погода — подтверждённое поле <WeatherID> (chpp/type_weather.go): значения
// описывают только облачность/осадки, отдельного поля температуры в
// matchdetails.xml не найдено ни в одном независимом CHPP-клиенте.
const MATCH_WEATHER_LABEL: Record<number, string> = {
  0: "Дождь",
  1: "Пасмурно",
  2: "Переменная облачность",
  3: "Солнечно",
};

function parseWeatherLabel(match: Record<string, unknown>): string | null {
  const arena = match.Arena as Record<string, unknown> | undefined;
  if (!arena || arena.WeatherID === undefined || arena.WeatherID === null || arena.WeatherID === "") return null;
  const n = Number(arena.WeatherID);
  if (Number.isNaN(n)) return null;
  return MATCH_WEATHER_LABEL[n] ?? `Погода (тип ${n})`;
}

// Итоговая (не по минутам) статистика атакующих моментов — см. MatchAttackStats
// выше. NrOfChances* — подтверждённые поля, но каждое всегда присутствует как
// число (0, если моментов не было), поэтому "нет данных" отличаем по
// отсутствию самого контейнера team, а не по конкретному полю.
function parseAttackStats(team: Record<string, unknown> | undefined, goalsRaw: unknown): MatchAttackStats | null {
  if (!team) return null;
  const chancesLeft = numOrNull(team.NrOfChancesLeft);
  const chancesCenter = numOrNull(team.NrOfChancesCenter);
  const chancesRight = numOrNull(team.NrOfChancesRight);
  const chancesSpecialEvents = numOrNull(team.NrOfChancesSpecialEvents);
  const chancesOther = numOrNull(team.NrOfChancesOther);
  const chanceFields = [chancesLeft, chancesCenter, chancesRight, chancesSpecialEvents, chancesOther];
  const hasChanceData = chanceFields.some((v) => v !== null);
  const chancesTotal = hasChanceData ? chanceFields.reduce((sum: number, v) => sum + (v ?? 0), 0) : null;
  const goals = numOrNull(goalsRaw);
  const missed = chancesTotal !== null && goals !== null ? chancesTotal - goals : null;
  if (chancesTotal === null && goals === null) return null;
  return {
    chancesTotal,
    goals,
    missed,
    chancesLeft,
    chancesCenter,
    chancesRight,
    chancesSpecialEvents,
    chancesOther,
    // Заполняется отдельно, см. computeAttackZoneBreakdown ниже — только
    // если разбивку по EventTypeID удалось сверить с итогами выше.
    goalsLeft: null,
    goalsCenter: null,
    goalsRight: null,
    goalsSpecialEvents: null,
    goalsOther: null,
    missedLeft: null,
    missedCenter: null,
    missedRight: null,
    missedSpecialEvents: null,
    missedOther: null,
  };
}

// Разбивка голов/нереализованных моментов ПО ЗОНАМ через отдельные события
// EventList (matchEvents=true, уже запрашиваем для замен/травм выше) — а не
// через готовое поле matchdetails (такого поля с разбивкой именно голов или
// именно нереализованного по зоне у Hattrick нет, см. MatchAttackStats).
// EventTypeID официально Hattrick НЕ документирует, но open-source проект
// HattrickOrganizer (github.com/ho-dev/HattrickOrganizer,
// core/model/match/MatchEvent.java, enum MatchEventID) — активно
// поддерживаемый десятилетиями сообществом ассистент для Hattrick —
// содержит полную расшифровку кодов 100-190 (голы) и 200-290
// (соответствующие "непопадания", те же категории +100 к ID гола: реже
// прямо совпадает по смещению, поэтому ниже перечислены явные числа, не
// формула). Категории по коду: "чистый" гол в конкретную зону (лево/центр/
// право), гол со спецсобытием (SE_*, тот же смысл, что и
// NrOfChancesSpecialEvents), и гол "другим способом" — штрафной, пенальти,
// контратака (только вариант _FREE_KICK, без зоны), непрямой штрафной,
// дальний удар (та же корзина, что и NrOfChancesOther) — Hattrick, судя по
// всему, зоны не считает именно для этих способов взятия ворот.
//
// ИСПРАВЛЕНО (см. чат "Разбивка по зонам: неправильная категоризация") —
// диагностика на реальном матче нашла ровно компенсирующее друг друга
// расхождение (одна зона недосчитана, "Другое" — с избытком), что указывало
// на СМЕЩЕНИЕ категории одного события, а не на пропажу/нераспознанный код.
// Прямая сверка с enum MatchEventID (полный текст, не только уже
// процитированные фрагменты) вскрыла причину: "контратака" — это НЕ одна
// корзина без зоны (как считалось раньше), а такая же четвёрка _FREE_KICK/
// _MIDDLE/_LEFT/_RIGHT, как и у всех остальных семейств кодов — только
// _FREE_KICK (140 гол / 240 непопадание) у контратаки безадресный, а
// _MIDDLE/_LEFT/_RIGHT (141-143 / 241-243) — самые обычные зональные коды,
// ошибочно записанные в GOAL_OTHER/MISSED_OTHER целиком все четыре. Заново
// сверены ВСЕ коды в обеих таблицах (100-190/200-290) построчно с полным
// текстом enum — остальные расхождений не нашлось.
const GOAL_ZONE_LEFT = new Set([102, 112, 122, 132, 142, 152, 162, 172, 182]);
const GOAL_ZONE_CENTER = new Set([101, 111, 121, 131, 141, 151, 161, 171, 181]);
const GOAL_ZONE_RIGHT = new Set([103, 113, 123, 133, 143, 153, 163, 173, 183]);
const GOAL_SPECIAL_EVENT = new Set([105, 106, 108, 109, 115, 116, 117, 118, 119, 125, 135, 136, 137, 138, 139, 190]);
const GOAL_OTHER = new Set([
  100, 110, 120, 130, 150, 160, 170, 180, // штрафной (свободный)
  104, 114, 124, 134, 154, 164, 174, 184, // пенальти
  140, 186, // контратака — только безадресный вариант (свободный/непрямой штрафной)
  185, // непрямой штрафной
  107, 187, // дальний удар
]);
const MISSED_ZONE_LEFT = new Set([202, 212, 222, 232, 242, 252, 262, 272, 282]);
const MISSED_ZONE_CENTER = new Set([201, 211, 221, 231, 241, 251, 261, 271, 281]);
const MISSED_ZONE_RIGHT = new Set([203, 213, 223, 233, 243, 253, 263, 273, 283]);
const MISSED_SPECIAL_EVENT = new Set([205, 206, 208, 209, 215, 216, 217, 218, 219, 225, 235, 236, 237, 239, 289, 290]);
const MISSED_OTHER = new Set([
  200, 210, 220, 230, 250, 260, 270, 280,
  204, 214, 224, 234, 254, 264, 274, 284,
  240, 286, // контратака — только безадресный вариант (свободный/непрямой штрафной)
  285,
  207, 287, 288,
]);

interface AttackZoneBreakdown {
  goalsLeft: number | null;
  goalsCenter: number | null;
  goalsRight: number | null;
  goalsSpecialEvents: number | null;
  goalsOther: number | null;
  missedLeft: number | null;
  missedCenter: number | null;
  missedRight: number | null;
  missedSpecialEvents: number | null;
  missedOther: number | null;
}

const EMPTY_ZONE_BREAKDOWN: AttackZoneBreakdown = {
  goalsLeft: null,
  goalsCenter: null,
  goalsRight: null,
  goalsSpecialEvents: null,
  goalsOther: null,
  missedLeft: null,
  missedCenter: null,
  missedRight: null,
  missedSpecialEvents: null,
  missedOther: null,
};

// Считает разбивку по EventList и СВЕРЯЕТ её с уже подтверждёнными
// официальными итогами (NrOfChances*/HomeGoals-AwayGoals, см. stats) —
// сумма расшифровки по каждой категории (Л/Ц/П/Спецсобытия/Другое, отдельно
// голы и отдельно нереализованные) должна ТОЧНО совпасть с официальным
// числом. Расшифровка кодов неофициальная (см. комментарий выше), поэтому
// если хоть одна сверка не сходится — не показываем разбивку вовсе (честные
// null), а не наполовину верные числа; причина расхождения всегда попадает
// в debug, чтобы не гадать вслепую при следующей жалобе.
function computeAttackZoneBreakdown(
  match: Record<string, unknown>,
  teamId: string,
  stats: MatchAttackStats | null,
  sideLabel: string,
  debug: string[],
): AttackZoneBreakdown {
  if (!stats || !teamId) return EMPTY_ZONE_BREAKDOWN;
  const eventList = match.EventList as Record<string, unknown> | undefined;
  const events = asArray(eventList?.Event);
  if (events.length === 0) {
    debug.push(`Разбивка по зонам (${sideLabel}) из EventList: EventList пуст — расчёт не выполнялся.`);
    return EMPTY_ZONE_BREAKDOWN;
  }

  let goalsLeft = 0,
    goalsCenter = 0,
    goalsRight = 0,
    goalsSpecial = 0,
    goalsOther = 0;
  let missedLeft = 0,
    missedCenter = 0,
    missedRight = 0,
    missedSpecial = 0,
    missedOther = 0;
  let unclassified = 0;

  for (const e of events) {
    if (String(e.SubjectTeamID ?? "") !== teamId) continue;
    const typeId = Number(e.EventTypeID ?? NaN);
    if (Number.isNaN(typeId)) continue;
    if (GOAL_ZONE_LEFT.has(typeId)) goalsLeft++;
    else if (GOAL_ZONE_CENTER.has(typeId)) goalsCenter++;
    else if (GOAL_ZONE_RIGHT.has(typeId)) goalsRight++;
    else if (GOAL_SPECIAL_EVENT.has(typeId)) goalsSpecial++;
    else if (GOAL_OTHER.has(typeId)) goalsOther++;
    else if (MISSED_ZONE_LEFT.has(typeId)) missedLeft++;
    else if (MISSED_ZONE_CENTER.has(typeId)) missedCenter++;
    else if (MISSED_ZONE_RIGHT.has(typeId)) missedRight++;
    else if (MISSED_SPECIAL_EVENT.has(typeId)) missedSpecial++;
    else if (MISSED_OTHER.has(typeId)) missedOther++;
    else if (typeId >= 100 && typeId < 300) unclassified++;
  }

  const checks: [string, number | null, number][] = [
    ["Л", stats.chancesLeft, goalsLeft + missedLeft],
    ["Ц", stats.chancesCenter, goalsCenter + missedCenter],
    ["П", stats.chancesRight, goalsRight + missedRight],
    ["Спецсобытия", stats.chancesSpecialEvents, goalsSpecial + missedSpecial],
    ["Другое", stats.chancesOther, goalsOther + missedOther],
    ["Голы (сумма по зонам)", stats.goals, goalsLeft + goalsCenter + goalsRight + goalsSpecial + goalsOther],
    ["Нереализовано (сумма по зонам)", stats.missed, missedLeft + missedCenter + missedRight + missedSpecial + missedOther],
  ];
  // Расхождение считается как computed − real (см. чат "Разбивка по зонам:
  // диагностика для конкретного матча") — знак сразу показывает направление:
  // "+1" значит по EventList насчитали на 1 БОЛЬШЕ, чем в официальном итоге
  // (лишнее/задвоенное событие или неверно классифицированный код),
  // "-1" — на 1 МЕНЬШЕ (пропущенное событие или неопознанный код, см.
  // "нераспознанных кодов" ниже — типичная причина недостачи).
  const mismatches = checks
    .filter(([, real, computed]) => real !== null && real !== computed)
    .map(([label, real, computed]) => {
      const delta = computed - (real as number);
      return `${label}: официально ${real}, по EventList ${computed} (расхождение ${delta > 0 ? "+" : ""}${delta})`;
    });

  debug.push(
    `Разбивка по зонам (${sideLabel}) из EventList: голы Л/Ц/П/Спец/Друг=${goalsLeft}/${goalsCenter}/${goalsRight}/${goalsSpecial}/${goalsOther}, ` +
      `нереализовано Л/Ц/П/Спец/Друг=${missedLeft}/${missedCenter}/${missedRight}/${missedSpecial}/${missedOther}, ` +
      `нераспознанных кодов в диапазоне гола/непопадания (100-299)=${unclassified}. ` +
      (mismatches.length === 0
        ? "сходится со всеми официальными итогами — показываем в таблице."
        : `НЕ сходится (${mismatches.join("; ")}) — не показываем ни "Голы", ни "Нереализованные моменты" по зонам для этой команды ` +
          `(проверка "всё или ничего": одной несошедшейся категории достаточно, чтобы обнулить ОБЕ строки, см. computeAttackZoneBreakdown) — ` +
          `оставляем честные прочерки в таблице, "Всего моментов" (готовое поле matchdetails, не из EventList) не затронуто.`),
  );

  if (mismatches.length > 0) return EMPTY_ZONE_BREAKDOWN;
  return {
    goalsLeft,
    goalsCenter,
    goalsRight,
    goalsSpecialEvents: goalsSpecial,
    goalsOther,
    missedLeft,
    missedCenter,
    missedRight,
    missedSpecialEvents: missedSpecial,
    missedOther,
  };
}

export type MatchTimelineKind = "goal" | "card" | "sub" | "injury" | "miss" | "special";
// Есть ли в ответе полный EventList (matchEvents=true сработал) — от этого
// зависит только наличие замен (см. parseSubstitutionsFromEventList выше):
// голы/карточки/травмы всегда из своих отдельных подтверждённых контейнеров,
// EventList не нужен ни для чего, кроме попытки распознать замены.
export type MatchTimelineSource = "with-subs" | "without-subs";

export interface MatchTimelineEntry {
  minute: number;
  matchPart: number;
  text: string;
  kind: MatchTimelineKind;
  teamSide: "home" | "away" | null;
  // Только для kind="sub" (см. чат "Хронология: подсказка 'Игрок А на
  // Игрок Б' для замены") — сырые SubjectPlayerID/ObjectPlayerID события,
  // используются ТОЛЬКО чтобы собрать text в формате "замена — А на Б" (см.
  // resolveSubstitutionTexts ниже), после чего значения этих полей уже не
  // нужны получателю. null — поле не пришло в этом событии.
  subjectPlayerId?: number | null;
  objectPlayerId?: number | null;
}

export interface MatchAnalysisResult {
  homeTeamName: string;
  awayTeamName: string;
  homeTeamId: string;
  awayTeamId: string;

  homeRatings: MatchPlayerRating[];
  awayRatings: MatchPlayerRating[];
  ratingsError: string | null;

  homeZones: MatchZoneRatings | null;
  awayZones: MatchZoneRatings | null;
  zonesError: string | null;

  // Индекс силы — СВОЙ собственный расчётный показатель (не официальный
  // Hattrick, не HatStats/LoddarStats и их формула не копируется), см.
  // computePowerIndex ниже. null, если хотя бы одна из 7 зон не пришла.
  homePowerIndex: number | null;
  awayPowerIndex: number | null;

  // Тактика — подтверждённое поле <TacticType>, есть для обеих команд.
  homeTactic: string | null;
  awayTactic: string | null;
  // "Отношение к матчу" — подтверждённое поле <TeamAttitude>, но CHPP
  // отдаёт его только владельцу команды: для чужой стороны честно null.
  homeTeamAttitude: string | null;
  awayTeamAttitude: string | null;

  attendance: MatchAttendance | null;
  attendanceError: string | null;

  // Погода матча — подтверждённое поле <Arena><WeatherID> (chpp/type_weather.go,
  // независимый CHPP-клиент github.com/lucianoq/hattrick): 0=дождь,
  // 1=пасмурно, 2=переменная облачность, 3=солнечно. Отдельного поля
  // температуры в matchdetails.xml не подтверждено — не выдумываем.
  weather: string | null;

  homeAttackStats: MatchAttackStats | null;
  awayAttackStats: MatchAttackStats | null;

  timeline: MatchTimelineEntry[] | null;
  timelineSource: MatchTimelineSource | null;
  timelineError: string | null;

  // Сырые счётчики для диагностики нестабильной хронологии (см.
  // SHOW_MATCH_ANALYSIS_DEBUG в MatchDetailAnalysis.tsx) — сколько сырых
  // элементов реально пришло в каждом контейнере matchdetails, независимо
  // от того, удалось ли их разобрать в MatchTimelineEntry.
  debug: string[];

  // Полный отказ (не удалось получить даже сам matchdetails) — остальные
  // секции в этом случае тоже пустые, страница честно покажет одну общую
  // ошибку вместо частично отрисованного отчёта.
  error: string | null;
}

const MATCH_DETAILS_VERSION = "3.1";
const MATCH_LINEUP_VERSION = "2.1";

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : value ? [value as Record<string, unknown>] : [];
}

function numOrNull(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function teamSideOf(teamId: string, homeTeamId: string): "home" | "away" | null {
  if (!teamId) return null;
  return teamId === homeTeamId ? "home" : "away";
}

function parseZoneRatings(team: Record<string, unknown> | undefined): MatchZoneRatings | null {
  if (!team) return null;
  const zones: MatchZoneRatings = {
    midfield: numOrNull(team.RatingMidfield),
    rightDef: numOrNull(team.RatingRightDef),
    midDef: numOrNull(team.RatingMidDef),
    leftDef: numOrNull(team.RatingLeftDef),
    rightAtt: numOrNull(team.RatingRightAtt),
    midAtt: numOrNull(team.RatingMidAtt),
    leftAtt: numOrNull(team.RatingLeftAtt),
    setPiecesDef: numOrNull(team.RatingIndirectSetPiecesDef),
    setPiecesAtt: numOrNull(team.RatingIndirectSetPiecesAtt),
  };
  const hasAny = Object.values(zones).some((v) => v !== null);
  return hasAny ? zones : null;
}

// "Индекс силы" — НАШ СОБСТВЕННЫЙ расчётный показатель силы команды в этом
// конкретном матче, а не официальный показатель Hattrick и не формула
// HatStats/LoddarStats (та запатентована сообществом и не публикуется —
// здесь просто своя комбинация уже подтверждённых зональных рейтингов
// матча, 1-80 каждая):
//   Защита = леваяЗащита + центрЗащита + праваяЗащита (3-240)
//   Атака  = леваяАтака + центрАтака + праваяАтака (3-240)
//   Полузащита — одна зона (1-80), выступает МНОЖИТЕЛЕМ, а не слагаемым:
//   команда с одинаковой защитой/атакой, но более сильной полузащитой,
//   получает более высокий индекс — коэффициент 0.75 (полузащита=0) .. 1.25
//   (полузащита=80), 1.0 при полузащите=40 (середина шкалы).
//   Итог нормализован делением на теоретический максимум (защита=240,
//   атака=240, коэффициент=1.25) так, чтобы жёстко получалось 0-100.
// Считается только если ВСЕ 7 зон пришли реальными числами — при частичных
// данных честно null, а не расчёт на угадываемых нулях.
function computePowerIndex(zones: MatchZoneRatings | null): number | null {
  if (!zones) return null;
  const { leftDef, midDef, rightDef, midfield, leftAtt, midAtt, rightAtt } = zones;
  if ([leftDef, midDef, rightDef, midfield, leftAtt, midAtt, rightAtt].some((v) => v === null)) return null;
  const defense = (leftDef as number) + (midDef as number) + (rightDef as number);
  const attack = (leftAtt as number) + (midAtt as number) + (rightAtt as number);
  const coefficient = 0.75 + ((midfield as number) / 80) * 0.5;
  const maxRaw = (240 + 240) * 1.25;
  const raw = (defense + attack) * coefficient;
  return Math.max(0, Math.min(100, Math.round((raw / maxRaw) * 100)));
}

function parseTacticLabel(team: Record<string, unknown> | undefined): string | null {
  if (!team || team.TacticType === undefined) return null;
  const n = Number(team.TacticType);
  return MATCH_TACTIC_LABEL[n] ?? `Тактика (тип ${n})`;
}

function parseTeamAttitudeLabel(team: Record<string, unknown> | undefined): string | null {
  if (!team) return null;
  const raw = team.TeamAttitude;
  if (raw === undefined || raw === null || raw === "") return null;
  const n = Number(raw);
  if (Number.isNaN(n)) return null;
  return TEAM_ATTITUDE_LABEL[n] ?? `Настрой (${n})`;
}

// ВРЕМЕННАЯ диагностика — вкладка "Зоны поля" по запросу должна показать ещё
// два блока показателей ("Loddar Stats" и тройку Тайм/Состав/Рейтинг), для
// которых подтверждённого источника в matchdetails.xml НЕ найдено (ни один
// известный клиент CHPP не описывает поле с таким названием) — вместо того
// чтобы гадать и показывать выдуманные числа, здесь дамп ВСЕХ скалярных
// (не вложенных) полей <HomeTeam>/<AwayTeam>, включая уже неиспользуемые в
// интерфейсе NrOfChances*/TacticSkill/DressURI и т.п. — чтобы на реальном
// ответе увидеть, какое из этих полей (если оно вообще существует) и есть
// искомые показатели, а не додумывать вслепую.
function debugScalarTeamFields(team: Record<string, unknown> | undefined): string {
  if (!team) return "(нет данных)";
  const entries = Object.entries(team).filter(([, v]) => typeof v !== "object" || v === null);
  return entries.length > 0 ? entries.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ") : "(только вложенные контейнеры)";
}

function parseAttendance(match: Record<string, unknown>): MatchAttendance | null {
  const arena = match.Arena as Record<string, unknown> | undefined;
  if (!arena) return null;
  const terraces = numOrNull(arena.SoldTerraces);
  const basic = numOrNull(arena.SoldBasic);
  const roof = numOrNull(arena.SoldRoof);
  const vip = numOrNull(arena.SoldVIP);
  const total = numOrNull(arena.SoldTotal);
  if (terraces === null && basic === null && roof === null && vip === null && total === null) return null;
  return {
    arenaName: String(arena.ArenaName ?? ""),
    terraces: terraces ?? 0,
    basic: basic ?? 0,
    roof: roof ?? 0,
    vip: vip ?? 0,
    total: total ?? 0,
    capacityTerraces: null,
    capacityBasic: null,
    capacityRoof: null,
    capacityVip: null,
    capacityTotal: null,
  };
}

// Голы (Scorers) и карточки (Bookings) — оба всегда приходят без доп.
// параметров (не зависят от matchEvents=true) и дают точную структурированную
// информацию (игрок/команда/минута), поэтому это ЕДИНСТВЕННЫЙ и всегда
// используемый источник для этих двух видов событий — никогда не читаются
// из EventList, чтобы не задваивать одно и то же событие двумя разными
// текстами.
function parseGoalsAndCardsTimeline(
  match: Record<string, unknown>,
  homeTeamId: string,
  homeTeamName: string,
  awayTeamName: string,
): { entries: MatchTimelineEntry[]; goalsRawCount: number; bookingsRawCount: number } {
  const goals = asArray((match.Scorers as Record<string, unknown> | undefined)?.Goal);
  const bookings = asArray((match.Bookings as Record<string, unknown> | undefined)?.Booking);

  const teamName = (teamId: string) => (teamId === homeTeamId ? homeTeamName : awayTeamName);

  const entries: MatchTimelineEntry[] = [];
  for (const g of goals) {
    try {
      const teamId = String(g.ScorerTeamID ?? "");
      const scorerName = String(g.ScorerPlayerName ?? "").trim() || "Неизвестный игрок";
      const minute = Number(g.ScorerMinute ?? NaN);
      entries.push({
        minute: Number.isNaN(minute) ? 0 : minute,
        matchPart: Number(g.MatchPart ?? 0) || 0,
        text: `Гол — ${scorerName} (${teamName(teamId)}), ${g.ScorerHomeGoals ?? 0}:${g.ScorerAwayGoals ?? 0}`,
        kind: "goal",
        teamSide: teamSideOf(teamId, homeTeamId),
      });
    } catch {
      // Пропускаем один нестандартный элемент.
    }
  }
  for (const b of bookings) {
    try {
      const teamId = String(b.BookingTeamID ?? "");
      const playerName = String(b.BookingPlayerName ?? "").trim() || "Неизвестный игрок";
      const cardLabel = Number(b.BookingType ?? 0) === 2 ? "Красная карточка" : "Жёлтая карточка";
      const minute = Number(b.BookingMinute ?? NaN);
      entries.push({
        minute: Number.isNaN(minute) ? 0 : minute,
        matchPart: Number(b.MatchPart ?? 0) || 0,
        text: `${cardLabel} — ${playerName} (${teamName(teamId)})`,
        kind: "card",
        teamSide: teamSideOf(teamId, homeTeamId),
      });
    } catch {
      // Пропускаем один нестандартный элемент.
    }
  }
  entries.sort((a, b) => a.minute - b.minute);
  return { entries, goalsRawCount: goals.length, bookingsRawCount: bookings.length };
}

// Травмы — ПОДТВЕРЖДЁННЫЙ реальный контейнер <Injuries><Injury> (см.
// независимый CHPP-клиент github.com/lucianoq/hattrick, chpp/file_matchdetails.go)
// — приходит всегда, без matchEvents=true, той же структурой (по одной
// записи на игрока/команду/минуту), что и Scorers/Bookings выше. Раньше
// травмы вообще не читались из matchdetails — только предполагались через
// EventList. InjuryType переиспользует ту же нумерацию, что и BookingType,
// но означает другое: 1 = ушиб (лёгкая), 2 = травма (серьёзная).
function parseInjuriesTimeline(
  match: Record<string, unknown>,
  homeTeamId: string,
  homeTeamName: string,
  awayTeamName: string,
): { entries: MatchTimelineEntry[]; rawCount: number } {
  const injuries = asArray((match.Injuries as Record<string, unknown> | undefined)?.Injury);
  const teamName = (teamId: string) => (teamId === homeTeamId ? homeTeamName : awayTeamName);

  const entries: MatchTimelineEntry[] = [];
  for (const inj of injuries) {
    try {
      const teamId = String(inj.InjuryTeamID ?? "");
      const playerName = String(inj.InjuryPlayerName ?? "").trim() || "Неизвестный игрок";
      const severity = Number(inj.InjuryType ?? 0) === 2 ? "серьёзная травма" : "лёгкая травма (ушиб)";
      const minute = Number(inj.InjuryMinute ?? NaN);
      entries.push({
        minute: Number.isNaN(minute) ? 0 : minute,
        matchPart: Number(inj.MatchPart ?? 0) || 0,
        text: `Травма — ${playerName} (${teamName(teamId)}), ${severity}`,
        kind: "injury",
        teamSide: teamSideOf(teamId, homeTeamId),
      });
    } catch {
      // Пропускаем один нестандартный элемент.
    }
  }
  return { entries, rawCount: injuries.length };
}

// Замены — у CHPP НЕТ отдельного подтверждённого контейнера для замен (в
// отличие от голов/карточек/травм выше), единственный источник — полный
// список событий EventList (доступен только при matchEvents=true). Точное
// значение EventTypeID для замены нигде не подтверждено, поэтому здесь
// используется определение по ключевым словам в самом тексте события —
// ЛУЧШАЯ ДОСТУПНАЯ ОЦЕНКА, не гарантия (текст EventText приходит от Hattrick
// на языке аккаунта, поэтому проверяются и английские, и русские варианты).
// Все остальные 30+ событий EventList (начало тайма, составы, атаки без
// гола и т.п.) сюда НЕ попадают и в хронологии не показываются — по запросу
// показываем только содержательные события (голы/карточки/травмы/замены).
// РАСШИРЕНО (см. чат "Хронология: замены — код 424, «вступил в игру»") —
// диагностика debugSubstitutionCandidates на реальном матче нашла событие
// #424×1, текст которого ("Sayat Barkenov вступил в игру.") ни разу не
// попадал под старый паттерн (были только "заменил"/"выходит вместо" —
// формулировки для игрока, КОТОРОГО заменяют, а не для того, кто выходит
// НА замену). Добавлена сама подтверждённая фраза (стем "вступ.* в игру"
// покрывает "вступил"/"вступила"/"вступает") и по запросу — правдоподобные
// соседние русские формулировки ("вышел на замену", "заменён на"/"заменен
// на"), ни одна из которых пока не подтверждена на живых данных — только
// "вступил в игру" реально видена в ответе CHPP.
const SUBSTITUTION_PATTERN =
  /(substitut|comes on for|replaces .*(for|as)|заменил|заменяет|заменён|заменен|выходит вместо|вышел вместо|вышел на замену|вступ\S* в игру)/i;

// ВРЕМЕННАЯ диагностика для пункта "статистика атакующих моментов по ходу
// матча": EventTypeID в EventList официально не документирован НИ для
// одного значения, и неизвестно, помечены ли там отдельно нереализованные
// атакующие моменты (в отличие от голов/карточек/травм — у них есть свои
// подтверждённые контейнеры Scorers/Bookings/Injuries с точной минутой).
// Комментарий в chpp/file_matchdetails.go у SubjectTeamID/SubjectPlayerID/
// ObjectPlayerID прямо упоминает "for goals AND CHANCES" — значит отдельные
// нереализованные моменты, вероятно, ЕСТЬ где-то в EventList, но под каким
// именно EventTypeID — не подтверждено. Этот дамп считает, сколько раз
// встретился каждый EventTypeID в реальном ответе, и даёт пример текста —
// чтобы можно было визуально сопоставить (а не гадать), какие ID похожи на
// "момент/атаку", прежде чем строить по ним точную по минутам диаграмму.
// Разбивка по EventTypeID делится на "дома"/"гости" по SubjectTeamID (см.
// комментарий выше — "for goals and chances" намекает, что SubjectTeamID у
// чанс-событий — атакующая команда) и даёт до 2 разных примеров текста на
// тип. ДОПОЛНИТЕЛЬНО: сравнивает счётчик каждого EventTypeID по каждой
// стороне с уже ПОДТВЕРЖДЁННЫМИ реальными числами этой же команды (Голы —
// Scorers, Всего/Нереализовано/Л/Ц/П/Спецсобытия/Другое — NrOfChances* из
// matchdetails) — точное числовое совпадение не доказывает соответствие
// (могло совпасть случайно), но даёт конкретную, проверяемую по тексту
// событий гипотезу вместо слепого перебора 30+ типов событий.
function debugEventTypeBreakdown(
  match: Record<string, unknown>,
  homeTeamId: string,
  homeStats: MatchAttackStats | null,
  awayStats: MatchAttackStats | null,
): string {
  const eventList = match.EventList as Record<string, unknown> | undefined;
  const events = asArray(eventList?.Event);
  if (events.length === 0) return "EventList пуст или отсутствует (matchEvents=true не вернул событий).";
  const byType = new Map<string, { count: number; home: number; away: number; samples: string[] }>();
  for (const e of events) {
    const typeId = String(e.EventTypeID ?? "?");
    const teamId = String(e.SubjectTeamID ?? "");
    const text = stripHtml(String(e.EventText ?? "")).slice(0, 70);
    const entry = byType.get(typeId) ?? { count: 0, home: 0, away: 0, samples: [] };
    entry.count += 1;
    if (teamId && teamId === homeTeamId) entry.home += 1;
    else if (teamId) entry.away += 1;
    if (entry.samples.length < 2 && !entry.samples.includes(text)) entry.samples.push(text);
    byType.set(typeId, entry);
  }

  const matchHints = (side: string, count: number, stats: MatchAttackStats | null): string[] => {
    if (!stats || count === 0) return [];
    const checks: [string, number | null][] = [
      ["Всего моментов", stats.chancesTotal],
      ["Нереализовано", stats.missed],
      ["Голы", stats.goals],
      ["Л (лево)", stats.chancesLeft],
      ["Ц (центр)", stats.chancesCenter],
      ["П (право)", stats.chancesRight],
      ["Спецсобытия", stats.chancesSpecialEvents],
      ["Другое", stats.chancesOther],
    ];
    return checks.filter(([, real]) => real !== null && real === count).map(([label]) => `${side}=${label}`);
  };

  return [...byType.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([id, { count, home, away, samples }]) => {
      const hints = [...matchHints("хозяева", home, homeStats), ...matchHints("гости", away, awayStats)];
      const hintStr = hints.length > 0 ? ` ⚡совпадение с: ${hints.join(", ")}` : "";
      return `#${id}×${count} (дома:${home}/гости:${away})${hintStr} [${samples.map((s) => `"${s}"`).join(", ")}]`;
    })
    .join(" | ");
}

// Подпись зоны для маркера нереализованного момента на шкале — переиспользует
// те же списки EventTypeID, что и computeAttackZoneBreakdown выше. Не
// требует, чтобы разбивка по зонам для ВСЕЙ таблицы была "верифицирована"
// (сошлась с официальными итогами) — здесь это просто человекочитаемая
// подпись у конкретного события, а сам факт "это нереализованный момент"
// уже гарантирован диапазоном ID (см. parseMissedChancesFromEventList).
function missedChanceZoneLabel(typeId: number): string {
  if (MISSED_ZONE_LEFT.has(typeId)) return "слева";
  if (MISSED_ZONE_CENTER.has(typeId)) return "по центру";
  if (MISSED_ZONE_RIGHT.has(typeId)) return "справа";
  if (MISSED_SPECIAL_EVENT.has(typeId)) return "спецсобытие";
  return "другой способ";
}

// Нереализованные моменты — реальные события EventList: диапазон
// EventTypeID 200-299 у Hattrick — это ровно "непопадание" (isNonGoalEvent
// в HattrickOrganizer, тот же источник, что и у computeAttackZoneBreakdown
// выше), симметрично голам (100-199). У этих событий, как и у замен, нет
// отдельного подтверждённого XML-контейнера — единственный источник это
// EventList (matchEvents=true), с точной минутой (поле Minute у каждого
// события, та же структура, что и у parseSubstitutionsFromEventList). Раньше
// эти события на шкале не показывались вовсе — ошибочно считалось, что у
// Hattrick есть только ИТОГ за матч (NrOfChances*), без минуты; на деле
// каждое отдельное событие в EventList минуту всё же несёт.
// Нереализованные СПЕЦСОБЫТИЯ (MISSED_SPECIAL_EVENT) сюда не попадают —
// они выделены в отдельную категорию "special", см. parseSpecialEventsFromEventList
// ниже, чтобы не показывать один и тот же момент дважды под двумя видами.
function parseMissedChancesFromEventList(
  match: Record<string, unknown>,
  homeTeamId: string,
  homeTeamName: string,
  awayTeamName: string,
): { entries: MatchTimelineEntry[]; rawCount: number } {
  const eventList = match.EventList as Record<string, unknown> | undefined;
  const rawEvents = asArray(eventList?.Event);
  const teamName = (teamId: string) => (teamId === homeTeamId ? homeTeamName : awayTeamName);
  const entries: MatchTimelineEntry[] = [];
  let rawCount = 0;
  for (const e of rawEvents) {
    try {
      const typeId = Number(e.EventTypeID ?? NaN);
      if (Number.isNaN(typeId) || typeId < 200 || typeId >= 300) continue;
      if (MISSED_SPECIAL_EVENT.has(typeId)) continue;
      rawCount++;
      const teamId = String(e.SubjectTeamID ?? "");
      const minute = Number(e.Minute ?? NaN);
      entries.push({
        minute: Number.isNaN(minute) ? 0 : minute,
        matchPart: Number(e.MatchPart ?? 0) || 0,
        text: `Нереализованный момент — ${missedChanceZoneLabel(typeId)} (${teamName(teamId)})`,
        kind: "miss",
        teamSide: teamSideOf(teamId, homeTeamId),
      });
    } catch {
      // Пропускаем один нестандартный элемент, не теряя остальные.
    }
  }
  return { entries, rawCount };
}

// Специальные события — те же списки EventTypeID, что уже используются в
// computeAttackZoneBreakdown (GOAL_SPECIAL_EVENT/MISSED_SPECIAL_EVENT,
// подтверждено тем же источником — HattrickOrganizer, specialME). Раньше
// голы через спецсобытие тонули среди обычных голов (Scorers не различает
// способ гола), а нереализованные спецсобытия были неотличимы от обычных
// нереализованных моментов — здесь оба случая получают свой отдельный
// маркер "special" на шкале. Для голов это ДОПОЛНИТЕЛЬНЫЙ маркер рядом с
// обычным голом из Scorers (а не замена) — оба факта реальны и оба видны:
// "гол был" и "гол случился именно через спецсобытие".
function parseSpecialEventsFromEventList(
  match: Record<string, unknown>,
  homeTeamId: string,
  homeTeamName: string,
  awayTeamName: string,
): { entries: MatchTimelineEntry[]; rawCount: number } {
  const eventList = match.EventList as Record<string, unknown> | undefined;
  const rawEvents = asArray(eventList?.Event);
  const teamName = (teamId: string) => (teamId === homeTeamId ? homeTeamName : awayTeamName);
  const entries: MatchTimelineEntry[] = [];
  let rawCount = 0;
  for (const e of rawEvents) {
    try {
      const typeId = Number(e.EventTypeID ?? NaN);
      if (Number.isNaN(typeId)) continue;
      const isGoalSpecial = GOAL_SPECIAL_EVENT.has(typeId);
      const isMissSpecial = MISSED_SPECIAL_EVENT.has(typeId);
      if (!isGoalSpecial && !isMissSpecial) continue;
      rawCount++;
      const teamId = String(e.SubjectTeamID ?? "");
      const minute = Number(e.Minute ?? NaN);
      entries.push({
        minute: Number.isNaN(minute) ? 0 : minute,
        matchPart: Number(e.MatchPart ?? 0) || 0,
        text: `Специальное событие — ${isGoalSpecial ? "привело к голу" : "гол не состоялся"} (${teamName(teamId)})`,
        kind: "special",
        teamSide: teamSideOf(teamId, homeTeamId),
      });
    } catch {
      // Пропускаем один нестандартный элемент, не теряя остальные.
    }
  }
  return { entries, rawCount };
}

// ИСПРАВЛЕНО: раньше замены распознавались ТОЛЬКО по ключевым словам в
// тексте события (SUBSTITUTION_PATTERN) — эвристика, зависящая от языка
// ответа Hattrick, из-за чего замены могли вообще не находиться. Тот же
// источник, что уже даёт зоны голов/непопаданий (HattrickOrganizer,
// core/model/match/MatchEvent.MatchEventID), называет коды именно для
// замены игрока: PLAYER_SUBSTITUTION_TEAM_IS_BEHIND(350),
// PLAYER_SUBSTITUTION_TEAM_IS_AHEAD(351), PLAYER_SUBSTITUTION_MINUTE(352).
//
// ОПРОВЕРГНУТО диагностикой на реальном матче (см. чат "Хронология: замены
// не отображаются на временной шкале") — ни один из этих трёх кодов не
// встретился ни разу в реальном EventList, где замена точно была. Коды
// оставлены здесь как незатратный запасной вариант (вдруг встретятся в
// другом контексте на другом матче), но полагаться на них как на основной
// сигнал больше нельзя — см. чат "Хронология: замены — код 424, «вступил
// в игру»". Реальный сигнал сейчас — SUBSTITUTION_PATTERN по тексту (см.
// ниже), код 424 — НЕ добавлен сюда: подтверждён текстом только на ОДНОМ
// событии одного матча, надёжность самого кода (а не разового текстового
// совпадения) ещё не проверена на нескольких разных матчах — см.
// debugSubstitutionCandidates ниже, раздел "другие коды с текстом,
// похожим на замену", это и есть механизм накопления такой проверки.
const SUBSTITUTION_EVENT_IDS = new Set([350, 351, 352]);

// ВРЕМЕННАЯ диагностика (см. чат "Хронология: замены не отображаются на
// временной шкале") — прямая проверка гипотезы SUBSTITUTION_EVENT_IDS
// (350/351/352, из HattrickOrganizer) на реальном ответе: отдельно
// показывает (1) сколько раз именно эти три кода реально встретились и с
// каким текстом, и (2) есть ли события с ДРУГИМ EventTypeID, чей текст всё
// же похож на замену по SUBSTITUTION_PATTERN — это был бы настоящий код,
// если гипотеза 350/351/352 неверна для этого аккаунта/языка. Если оба
// списка пусты — в этом матче либо действительно не было замен, либо
// EventList не содержит для неё узнаваемого текста вообще (тогда нужно
// вручную сверяться с общим дампом debugEventTypeBreakdown выше).
function debugSubstitutionCandidates(match: Record<string, unknown>): string {
  const eventList = match.EventList as Record<string, unknown> | undefined;
  const events = asArray(eventList?.Event);
  if (events.length === 0) return "EventList пуст — сравнение кодов невозможно.";

  const byGuessedCode = new Map<string, { count: number; samples: string[] }>();
  const byTextMatchOtherCode = new Map<string, { count: number; samples: string[] }>();

  for (const e of events) {
    const typeId = Number(e.EventTypeID ?? NaN);
    const text = stripHtml(String(e.EventText ?? "")).slice(0, 90);
    const isGuessedCode = SUBSTITUTION_EVENT_IDS.has(typeId);
    const isTextMatch = SUBSTITUTION_PATTERN.test(text);
    if (isGuessedCode) {
      const key = String(typeId);
      const entry = byGuessedCode.get(key) ?? { count: 0, samples: [] };
      entry.count += 1;
      if (entry.samples.length < 3 && text && !entry.samples.includes(text)) entry.samples.push(text);
      byGuessedCode.set(key, entry);
    } else if (isTextMatch) {
      const key = String(Number.isNaN(typeId) ? "?" : typeId);
      const entry = byTextMatchOtherCode.get(key) ?? { count: 0, samples: [] };
      entry.count += 1;
      if (entry.samples.length < 3 && text && !entry.samples.includes(text)) entry.samples.push(text);
      byTextMatchOtherCode.set(key, entry);
    }
  }

  const fmt = (m: Map<string, { count: number; samples: string[] }>) =>
    m.size === 0
      ? "нет"
      : [...m.entries()]
          .map(([id, { count, samples }]) => `#${id}×${count} [${samples.map((s) => `"${s}"`).join(", ")}]`)
          .join(", ");

  return (
    `коды-гипотеза 350/351/352 в ответе: ${fmt(byGuessedCode)} | ` +
    `другие коды с текстом, похожим на замену: ${fmt(byTextMatchOtherCode)}`
  );
}

function parseSubstitutionsFromEventList(
  match: Record<string, unknown>,
  homeTeamId: string,
): { entries: MatchTimelineEntry[]; rawCount: number } {
  const eventList = match.EventList as Record<string, unknown> | undefined;
  const rawEvents = asArray(eventList?.Event);
  const entries: MatchTimelineEntry[] = [];
  for (const e of rawEvents) {
    try {
      const typeId = Number(e.EventTypeID ?? NaN);
      const text = stripHtml(String(e.EventText ?? ""));
      if (!SUBSTITUTION_EVENT_IDS.has(typeId) && !SUBSTITUTION_PATTERN.test(text)) continue;
      const teamId = String(e.SubjectTeamID ?? e.SubjectTeamId ?? "");
      const minute = Number(e.Minute ?? NaN);
      // SubjectPlayerID/ObjectPlayerID — официально подтверждены только для
      // голов/моментов (см. комментарий у GOAL_ZONE_LEFT выше, chpp/
      // file_matchdetails.go: "For other events, usually indicates the
      // primarily active player" / ObjectPlayerID описан только для голов).
      // Для замен их значение НЕ задокументировано официально — извлекаются
      // здесь как гипотеза, подтверждается или отклоняется по факту (см.
      // resolveSubstitutionTexts ниже — сверка с реальным текстом события),
      // а не как готовый факт.
      const subjectPlayerIdRaw = Number(e.SubjectPlayerID ?? e.SubjectPlayerId ?? NaN);
      const objectPlayerIdRaw = Number(e.ObjectPlayerID ?? e.ObjectPlayerId ?? NaN);
      entries.push({
        minute: Number.isNaN(minute) ? 0 : minute,
        matchPart: Number(e.MatchPart ?? 0) || 0,
        text,
        kind: "sub",
        teamSide: teamSideOf(teamId, homeTeamId),
        subjectPlayerId: Number.isNaN(subjectPlayerIdRaw) || subjectPlayerIdRaw === 0 ? null : subjectPlayerIdRaw,
        objectPlayerId: Number.isNaN(objectPlayerIdRaw) || objectPlayerIdRaw === 0 ? null : objectPlayerIdRaw,
      });
    } catch {
      // Пропускаем один нестандартный элемент, не теряя остальные.
    }
  }
  return { entries, rawCount: rawEvents.length };
}

// Собирает text замены в формате "замена — [выходит] на [выходит на замену]"
// (см. чат "Хронология: подсказка 'Игрок А на Игрок Б' для замены") —
// ПОСЛЕ того, как получены рейтинги обеих команд (matchlineup.xml, нужны
// имена по PlayerID). ИСПРАВЛЕНО (см. чат "Замены — гипотеза почти верна,
// просто перепутаны роли") — диагностика на реальном событии ("Sayat
// Barkenov вступил в игру") подтвердила совпадение с ObjectPlayerID, а не
// с SubjectPlayerID, как предполагалось изначально. Верная схема:
// ObjectPlayerID = выходящий НА замену (тот, о ком говорит EventText),
// SubjectPlayerID = уходящий с поля. Гипотеза всё равно ПРОВЕРЯЕТСЯ на
// каждом событии отдельно — имя, разрешённое по ObjectPlayerID, должно
// реально встретиться в исходном EventText; если нет (гипотеза не
// подтвердилась, ID не пришли, или имя не нашлось в matchlineup) —
// исходный текст события НЕ трогаем и оставляем честный след в debug,
// вместо того чтобы гадать, кто есть кто.
function resolveSubstitutionTexts(
  timeline: MatchTimelineEntry[],
  homeRatings: MatchPlayerRating[],
  awayRatings: MatchPlayerRating[],
  debug: string[],
): void {
  const nameById = new Map<number, string>();
  for (const r of [...homeRatings, ...awayRatings]) {
    if (r.playerId) nameById.set(r.playerId, r.name);
  }

  const subEntries = timeline.filter((ev) => ev.kind === "sub");
  if (subEntries.length === 0) return;

  let resolvedCount = 0;
  const unresolvedSamples: string[] = [];

  for (const ev of subEntries) {
    const subjectId = ev.subjectPlayerId ?? null;
    const objectId = ev.objectPlayerId ?? null;
    if (!subjectId || !objectId) {
      if (unresolvedSamples.length < 3) unresolvedSamples.push(`"${ev.text}" (SubjectPlayerID/ObjectPlayerID не пришли)`);
      continue;
    }
    const subjectName = nameById.get(subjectId);
    const objectName = nameById.get(objectId);
    if (!subjectName || !objectName) {
      if (unresolvedSamples.length < 3) {
        unresolvedSamples.push(
          `"${ev.text}" (ID есть, но имя не нашлось в matchlineup: subject=${subjectId}, object=${objectId})`,
        );
      }
      continue;
    }
    if (ev.text.includes(objectName)) {
      ev.text = `замена — ${subjectName} на ${objectName}`;
      resolvedCount++;
    } else if (ev.text.includes(subjectName)) {
      if (unresolvedSamples.length < 3) {
        unresolvedSamples.push(
          `"${ev.text}" (совпало имя SubjectPlayerID=${subjectId} "${subjectName}", а не ObjectPlayerID — гипотеза не подтвердилась для этого события)`,
        );
      }
    } else if (unresolvedSamples.length < 3) {
      unresolvedSamples.push(
        `"${ev.text}" (ни SubjectPlayerID=${subjectId} "${subjectName}", ни ObjectPlayerID=${objectId} "${objectName}" не встретились в тексте)`,
      );
    }
  }

  debug.push(
    `Замены — сборка "Игрок А на Игрок Б": из ${subEntries.length} событий уверенно собрано ${resolvedCount}` +
      (unresolvedSamples.length > 0 ? `; не собрано (оставлен исходный текст события): ${unresolvedSamples.join(" | ")}` : ""),
  );
}

// Подтверждённая реальная схема matchlineup.xml (независимый CHPP-клиент
// github.com/lucianoq/hattrick, chpp/file_matchlineup.go): RatingStars и
// RatingStarsEndOfMatch — оба типа float64, то есть Hattrick уже присылает
// готовое десятичное число звёзд (например "7.5"), никакого масштабирования
// (÷10, ÷100 и т.п.) не требуется — Number() и toFixed(1) в вызывающем коде
// (MatchDetailAnalysis.tsx) тут ничего не портят.
//
// ИСПРАВЛЕНО (подтверждено на живых данных): раньше отдавалось предпочтение
// RatingStarsEndOfMatch — это НЕ то же самое, что "рейтинг за матч": по
// документации того же CHPP-клиента RatingStarsEndOfMatch — рейтинг ИМЕННО
// к концу игры, уже сниженный усталостью к 90-й минуте, тогда как RatingStars
// — основной рейтинг за матч, который Hattrick официально показывает как
// "звёзды" игрока. Из-за неверного приоритета рейтинги были систематически
// занижены (например, Elimbetov 7.5 на hattrick.org vs 5.5 здесь, Farstad
// 11.5 vs 9, Usenov 8 vs 5.5).
async function fetchTeamLineupRatings(
  tokens: StoredHattrickTokens,
  matchId: string,
  teamId: string,
  debug: string[],
  sideLabel: string,
): Promise<MatchPlayerRating[]> {
  const raw = await requestChppXmlRaw(
    "matchlineup",
    { matchID: matchId, teamID: teamId, version: MATCH_LINEUP_VERSION, sourceSystem: "hattrick" },
    tokens,
  );
  if (raw.httpStatus < 200 || raw.httpStatus >= 300) {
    throw new Error(`HTTP ${raw.httpStatus}: ${raw.rawXml.slice(0, 200)}`);
  }
  const parser = new XMLParser();
  const data = parser.parse(raw.rawXml);
  const root = data?.HattrickData;
  assertNoChppError(root, "matchlineup");

  const team = root?.Team as Record<string, unknown> | undefined;
  const lineup = team?.Lineup as Record<string, unknown> | undefined;
  const players = asArray(lineup?.Player);

  // Игрок может встретиться в списке несколько раз (например, отдельная
  // запись под спецролью вроде "капитан"/"пробивающий пенальти" — см.
  // MatchRole 17/18/22-32 в справочнике CHPP). Группируем по PlayerID и для
  // расстановки на поле (RoleID 100-113 — один из 11 стартовых слотов)
  // предпочитаем ту запись, где формальная позиция определена; это
  // защищает и от задвоения игрока в списке, и от потери его позиции.
  const byId = new Map<number, MatchPlayerRating>();
  const rawSample: string[] = [];
  for (const p of players) {
    const id = Number(p.PlayerID ?? 0);
    const ratingRaw = p.RatingStars ?? p.RatingStarsEndOfMatch;
    if (rawSample.length < 4) {
      rawSample.push(
        `#${id}: RatingStars=${JSON.stringify(p.RatingStars)}, RatingStarsEndOfMatch=${JSON.stringify(p.RatingStarsEndOfMatch)}, использовано=${JSON.stringify(ratingRaw)}`,
      );
    }
    if (!id || ratingRaw === undefined) continue;
    const rating = Number(ratingRaw);
    if (Number.isNaN(rating)) continue;
    const firstLast = `${p.FirstName ?? ""} ${p.LastName ?? ""}`.trim();
    const name = firstLast || String(p.NickName ?? "") || `Игрок #${id}`;
    const roleIdRaw = p.RoleID ?? p.RoleId;
    const roleId = roleIdRaw !== undefined ? Number(roleIdRaw) : null;

    const existing = byId.get(id);
    const isFieldRole = roleId !== null && roleId >= 100 && roleId <= 113;
    if (!existing || isFieldRole) {
      byId.set(id, { playerId: id, name, rating, roleId: isFieldRole ? roleId : (existing?.roleId ?? roleId) });
    }
  }
  if (rawSample.length > 0) {
    debug.push(`matchlineup (${sideLabel}) — сырые значения рейтинга: ${rawSample.join(" | ")}`);
  }
  return [...byId.values()].sort((a, b) => b.rating - a.rating);
}

export async function resolveMatchAnalysis(tokens: StoredHattrickTokens, matchId: string): Promise<MatchAnalysisResult> {
  const debug: string[] = [];
  const empty: MatchAnalysisResult = {
    homeTeamName: "",
    awayTeamName: "",
    homeTeamId: "",
    awayTeamId: "",
    homeRatings: [],
    awayRatings: [],
    ratingsError: null,
    homeZones: null,
    awayZones: null,
    zonesError: null,
    homePowerIndex: null,
    awayPowerIndex: null,
    homeTactic: null,
    awayTactic: null,
    homeTeamAttitude: null,
    awayTeamAttitude: null,
    attendance: null,
    attendanceError: null,
    weather: null,
    homeAttackStats: null,
    awayAttackStats: null,
    timeline: null,
    timelineSource: null,
    timelineError: null,
    debug,
    error: null,
  };

  let match: Record<string, unknown>;
  let homeTeamId = "";
  let awayTeamId = "";
  let homeTeamName = "";
  let awayTeamName = "";
  try {
    const raw = await requestChppXmlRaw(
      "matchdetails",
      { matchID: matchId, version: MATCH_DETAILS_VERSION, matchEvents: "true", sourceSystem: "hattrick" },
      tokens,
    );
    if (raw.httpStatus < 200 || raw.httpStatus >= 300) {
      throw new Error(`HTTP ${raw.httpStatus}: ${raw.rawXml.slice(0, 200)}`);
    }

    const parser = new XMLParser();
    const data = parser.parse(raw.rawXml);
    const root = data?.HattrickData;
    assertNoChppError(root, "matchdetails");

    match = (root?.Match ?? root) as Record<string, unknown>;
    const homeTeam = match.HomeTeam as Record<string, unknown> | undefined;
    const awayTeam = match.AwayTeam as Record<string, unknown> | undefined;
    homeTeamId = String(homeTeam?.HomeTeamID ?? "");
    awayTeamId = String(awayTeam?.AwayTeamID ?? "");
    homeTeamName = String(homeTeam?.HomeTeamName ?? "");
    awayTeamName = String(awayTeam?.AwayTeamName ?? "");
    debug.push(`matchdetails.xml: HTTP ${raw.httpStatus}, homeTeamId=${homeTeamId}, awayTeamId=${awayTeamId}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    debug.push(`matchdetails.xml: ошибка — ${message}`);
    return { ...empty, error: `Разбор матча (matchdetails): ${message}` };
  }

  const homeTeam = match.HomeTeam as Record<string, unknown> | undefined;
  const awayTeam = match.AwayTeam as Record<string, unknown> | undefined;

  let homeZones: MatchZoneRatings | null = null;
  let awayZones: MatchZoneRatings | null = null;
  let zonesError: string | null;
  try {
    homeZones = parseZoneRatings(homeTeam);
    awayZones = parseZoneRatings(awayTeam);
    zonesError = !homeZones && !awayZones ? "Зональные показатели (RatingMidfield и т.п.) отсутствуют в ответе matchdetails для этого матча." : null;
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    zonesError = `Не удалось разобрать зональные показатели: ${message}`;
    debug.push(`zones: исключение при разборе — ${message}`);
  }

  let homePowerIndex: number | null = null;
  let awayPowerIndex: number | null = null;
  try {
    homePowerIndex = computePowerIndex(homeZones);
    awayPowerIndex = computePowerIndex(awayZones);
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    debug.push(`Индекс силы: исключение при расчёте — ${message}`);
  }

  let homeTactic: string | null = null;
  let awayTactic: string | null = null;
  let homeTeamAttitude: string | null = null;
  let awayTeamAttitude: string | null = null;
  try {
    homeTactic = parseTacticLabel(homeTeam);
    awayTactic = parseTacticLabel(awayTeam);
    homeTeamAttitude = parseTeamAttitudeLabel(homeTeam);
    awayTeamAttitude = parseTeamAttitudeLabel(awayTeam);
    debug.push(`HomeTeam сырые поля: ${debugScalarTeamFields(homeTeam)}`);
    debug.push(`AwayTeam сырые поля: ${debugScalarTeamFields(awayTeam)}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    debug.push(`тактика/настрой: исключение при разборе — ${message}`);
  }

  let attendance: MatchAttendance | null = null;
  let attendanceError: string | null;
  try {
    attendance = parseAttendance(match);
    attendanceError = attendance
      ? null
      : "Данные о посещаемости (<Arena><SoldTerraces>/<SoldBasic>/<SoldRoof>/<SoldVIP>) отсутствуют в ответе matchdetails для этого матча.";
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    attendanceError = `Не удалось разобрать посещаемость: ${message}`;
    debug.push(`attendance: исключение при разборе — ${message}`);
  }

  // Вместимость стадиона — ОТДЕЛЬНЫЙ запрос arenadetails.xml по ArenaID
  // именно ЭТОГО матча (arenadetails поддерживает произвольный arenaID, не
  // только "свой" стадион — подтверждено, chpp/api/arenadetails.go:
  // GetArena(arenaID)). Важно брать ArenaID из matchdetails, а не всегда
  // запрашивать "свой" стадион: на выездном матче посещаемость считается от
  // вместимости стадиона СОПЕРНИКА, а не нашего.
  if (attendance) {
    const arena = match.Arena as Record<string, unknown> | undefined;
    const arenaId = arena?.ArenaID !== undefined && arena?.ArenaID !== null ? String(arena.ArenaID) : "";
    if (arenaId) {
      try {
        const arenaRaw = await requestChppXmlRaw("arenadetails", { arenaID: arenaId, sourceSystem: "hattrick" }, tokens);
        if (arenaRaw.httpStatus < 200 || arenaRaw.httpStatus >= 300) {
          throw new Error(`HTTP ${arenaRaw.httpStatus}`);
        }
        const capacity = parseArenaDetailsXml(arenaRaw.rawXml);
        attendance = {
          ...attendance,
          capacityTerraces: capacity.terraces,
          capacityBasic: capacity.basic,
          capacityRoof: capacity.roof,
          capacityVip: capacity.vip,
          capacityTotal: capacity.total,
        };
        debug.push(`arenadetails (ArenaID=${arenaId}): вместимость всего ${capacity.total}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "неизвестная ошибка";
        debug.push(`arenadetails (ArenaID=${arenaId}): не удалось получить вместимость — ${message}`);
      }
    } else {
      debug.push("arenadetails: ArenaID не пришёл в matchdetails, вместимость не запрошена.");
    }
  }

  let weather: string | null = null;
  try {
    weather = parseWeatherLabel(match);
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    debug.push(`погода: исключение при разборе — ${message}`);
  }

  let homeAttackStats: MatchAttackStats | null = null;
  let awayAttackStats: MatchAttackStats | null = null;
  try {
    homeAttackStats = parseAttackStats(homeTeam, homeTeam?.HomeGoals);
    awayAttackStats = parseAttackStats(awayTeam, awayTeam?.AwayGoals);
    // "нет поля" — CHPP вообще не прислал это поле для этого матча (честно
    // неизвестно); реальный 0 (например, 0 специальных событий) отличается от
    // этого и печатается как обычное число — чтобы при жалобе "в таблице
    // пусто/ноль" сразу было видно, какой из двух случаев произошёл на самом
    // деле, а не гадать.
    const fmtDebugNum = (v: number | null | undefined) => (v === null || v === undefined ? "нет поля" : String(v));
    const attackStatsLine = (label: string, stats: MatchAttackStats | null) =>
      `${label} — сырые поля matchdetails: Л=${fmtDebugNum(stats?.chancesLeft)}, Ц=${fmtDebugNum(stats?.chancesCenter)}, ` +
      `П=${fmtDebugNum(stats?.chancesRight)}, Спецсобытия=${fmtDebugNum(stats?.chancesSpecialEvents)}, ` +
      `Другое=${fmtDebugNum(stats?.chancesOther)}, Всего=${fmtDebugNum(stats?.chancesTotal)}, ` +
      `Голов=${fmtDebugNum(stats?.goals)}, Нереализовано=${fmtDebugNum(stats?.missed)}`;
    debug.push(attackStatsLine("attackStats (хозяева)", homeAttackStats));
    debug.push(attackStatsLine("attackStats (гости)", awayAttackStats));
    debug.push(
      `EventList — разбивка по EventTypeID: ${debugEventTypeBreakdown(match, homeTeamId, homeAttackStats, awayAttackStats)}`,
    );

    // Разбивка голов/нереализованного ПО ЗОНАМ через отдельные события
    // EventList (см. computeAttackZoneBreakdown выше) — заполняет ранее
    // всегда-null поля goalsLeft/.../missedOther, но только если сходится с
    // уже подтверждёнными официальными итогами.
    const homeZoneBreakdown = computeAttackZoneBreakdown(match, homeTeamId, homeAttackStats, "хозяева", debug);
    const awayZoneBreakdown = computeAttackZoneBreakdown(match, awayTeamId, awayAttackStats, "гости", debug);
    if (homeAttackStats) homeAttackStats = { ...homeAttackStats, ...homeZoneBreakdown };
    if (awayAttackStats) awayAttackStats = { ...awayAttackStats, ...awayZoneBreakdown };
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    debug.push(`attackStats: исключение при разборе — ${message}`);
  }

  let timeline: MatchTimelineEntry[] | null = null;
  let timelineSource: MatchTimelineSource | null = null;
  let timelineError: string | null = null;
  try {
    const { entries: goalsCardsEntries, goalsRawCount, bookingsRawCount } = parseGoalsAndCardsTimeline(
      match,
      homeTeamId,
      homeTeamName,
      awayTeamName,
    );
    const { entries: injuryEntries, rawCount: injuriesRawCount } = parseInjuriesTimeline(
      match,
      homeTeamId,
      homeTeamName,
      awayTeamName,
    );
    const { entries: subEntries, rawCount: eventRawCount } = parseSubstitutionsFromEventList(match, homeTeamId);
    const { entries: missEntries, rawCount: missRawCount } = parseMissedChancesFromEventList(
      match,
      homeTeamId,
      homeTeamName,
      awayTeamName,
    );
    const { entries: specialEntries, rawCount: specialRawCount } = parseSpecialEventsFromEventList(
      match,
      homeTeamId,
      homeTeamName,
      awayTeamName,
    );
    debug.push(
      `хронология — сырые элементы: Scorers/Goal=${goalsRawCount}, Bookings/Booking=${bookingsRawCount}, ` +
        `Injuries/Injury=${injuriesRawCount}, EventList=${eventRawCount} (из них похоже на замену по коду/тексту: ${subEntries.length}, ` +
        `нереализованных моментов по коду события (200-299, без спецсобытий): ${missRawCount}, ` +
        `специальных событий по коду (голы+непопадания): ${specialRawCount})`,
    );
    debug.push(`Замены — прямая проверка кодов: ${debugSubstitutionCandidates(match)}`);

    const merged = [...goalsCardsEntries, ...injuryEntries, ...subEntries, ...missEntries, ...specialEntries].sort(
      (a, b) => a.minute - b.minute,
    );
    if (merged.length > 0) {
      timeline = merged;
      // EventList (matchEvents=true) нужен ТОЛЬКО для попытки распознать
      // замены выше — если сырых элементов не пришло вовсе, значит для
      // этого матча замены просто не будут показаны (честно, а не молча).
      timelineSource = eventRawCount > 0 ? "with-subs" : "without-subs";
    } else {
      timeline = null;
      timelineSource = null;
      timelineError =
        "Хронология событий недоступна для этого матча — ни голы/карточки/травмы, ни список событий (EventList) не вернулись из matchdetails.";
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    timelineError = `Не удалось разобрать хронологию: ${message}`;
    debug.push(`хронология: исключение при разборе — ${message}`);
  }

  const [homeResult, awayResult] = await Promise.allSettled([
    fetchTeamLineupRatings(tokens, matchId, homeTeamId, debug, "хозяева"),
    fetchTeamLineupRatings(tokens, matchId, awayTeamId, debug, "гости"),
  ]);

  const homeRatings = homeResult.status === "fulfilled" ? homeResult.value : [];
  const awayRatings = awayResult.status === "fulfilled" ? awayResult.value : [];
  const ratingErrors = [
    homeResult.status === "rejected" ? `наша сторона: ${homeResult.reason instanceof Error ? homeResult.reason.message : homeResult.reason}` : null,
    awayResult.status === "rejected" ? `сторона соперника: ${awayResult.reason instanceof Error ? awayResult.reason.message : awayResult.reason}` : null,
  ].filter((v): v is string => v !== null);
  const ratingsError =
    ratingErrors.length > 0
      ? `Рейтинги игроков (matchlineup): ${ratingErrors.join("; ")}`
      : homeRatings.length === 0 && awayRatings.length === 0
        ? "Рейтинги игроков (matchlineup) вернулись пустыми для обеих команд."
        : null;
  debug.push(`matchlineup — рейтинги: наша сторона ${homeRatings.length}, соперник ${awayRatings.length}`);

  // Собрать text замены в формате "замена — А на Б" (см. чат "Хронология:
  // подсказка 'Игрок А на Игрок Б' для замены") — только теперь, после того
  // как получены имена игроков (matchlineup.xml выше); до этого момента
  // subEntries.text содержал только исходный EventText.
  if (timeline) resolveSubstitutionTexts(timeline, homeRatings, awayRatings, debug);

  // Долгосрочное обезличенное логирование в match_research_log (см.
  // src/lib/matchResearchDb.ts) — "по требованию", побочным эффектом уже
  // выполненного запроса matchdetails, а не отдельной фоновой задачей.
  // Никогда не должно повлиять на ответ пользователю — ошибка молча
  // проглатывается (.catch), сам вызов не await'ится (fire-and-forget).
  try {
    const matchContextIdRaw = match.MatchContextId ?? match.MatchContextID;
    const matchTypeNum = match.MatchType !== undefined ? Number(match.MatchType) : null;
    const cupId =
      matchTypeNum === CUP_MATCH_TYPE && matchContextIdRaw !== undefined && String(matchContextIdRaw) !== "0"
        ? String(matchContextIdRaw)
        : null;
    const homeTeamAttitudeRaw =
      homeTeam?.TeamAttitude !== undefined && homeTeam.TeamAttitude !== null ? Number(homeTeam.TeamAttitude) : null;
    const awayTeamAttitudeRaw =
      awayTeam?.TeamAttitude !== undefined && awayTeam.TeamAttitude !== null ? Number(awayTeam.TeamAttitude) : null;
    saveMatchForResearch({
      matchId,
      matchDate: match.MatchDate !== undefined ? String(match.MatchDate) : null,
      matchType: matchTypeNum,
      cupId,
      homeTeamId: homeTeamId || null,
      awayTeamId: awayTeamId || null,
      homeFormation: homeTeam?.Formation !== undefined ? String(homeTeam.Formation) : null,
      awayFormation: awayTeam?.Formation !== undefined ? String(awayTeam.Formation) : null,
      homeTacticType: homeTeam?.TacticType !== undefined ? Number(homeTeam.TacticType) : null,
      awayTacticType: awayTeam?.TacticType !== undefined ? Number(awayTeam.TacticType) : null,
      homeTeamAttitude: homeTeamAttitudeRaw,
      awayTeamAttitude: awayTeamAttitudeRaw,
      homeZones,
      awayZones,
      homePowerIndex,
      awayPowerIndex,
      homeGoals: homeAttackStats?.goals ?? null,
      awayGoals: awayAttackStats?.goals ?? null,
    }).catch(() => {});
  } catch {
    // Никогда не должно ломать основной ответ.
  }

  return {
    homeTeamName,
    awayTeamName,
    homeTeamId,
    awayTeamId,
    homeRatings,
    awayRatings,
    ratingsError,
    homeZones,
    awayZones,
    zonesError,
    homePowerIndex,
    awayPowerIndex,
    homeTactic,
    awayTactic,
    homeTeamAttitude,
    awayTeamAttitude,
    attendance,
    attendanceError,
    weather,
    homeAttackStats,
    awayAttackStats,
    timeline,
    timelineSource,
    timelineError,
    debug,
    error: null,
  };
}
