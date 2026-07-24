import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";
import { parseArenaDetailsXml } from "./arena";
import { requestChppXmlRaw, type StoredHattrickTokens } from "./hattrickApi";
import { stripHtml } from "./htmlText";

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
  return { chancesTotal, goals, missed, chancesLeft, chancesCenter, chancesRight, chancesSpecialEvents, chancesOther };
}

export type MatchTimelineKind = "goal" | "card" | "sub" | "injury";
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
const SUBSTITUTION_PATTERN = /(substitut|comes on for|replaces .*(for|as)|заменил|заменяет|выходит вместо|вышел вместо)/i;

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
function debugEventTypeBreakdown(match: Record<string, unknown>): string {
  const eventList = match.EventList as Record<string, unknown> | undefined;
  const events = asArray(eventList?.Event);
  if (events.length === 0) return "EventList пуст или отсутствует (matchEvents=true не вернул событий).";
  const byType = new Map<string, { count: number; sample: string }>();
  for (const e of events) {
    const typeId = String(e.EventTypeID ?? "?");
    if (!byType.has(typeId)) {
      byType.set(typeId, { count: 1, sample: stripHtml(String(e.EventText ?? "")).slice(0, 70) });
    } else {
      byType.get(typeId)!.count += 1;
    }
  }
  return [...byType.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([id, { count, sample }]) => `#${id}×${count} ("${sample}")`)
    .join(" | ");
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
      const text = stripHtml(String(e.EventText ?? ""));
      if (!SUBSTITUTION_PATTERN.test(text)) continue;
      const teamId = String(e.SubjectTeamID ?? e.SubjectTeamId ?? "");
      const minute = Number(e.Minute ?? NaN);
      entries.push({
        minute: Number.isNaN(minute) ? 0 : minute,
        matchPart: Number(e.MatchPart ?? 0) || 0,
        text,
        kind: "sub",
        teamSide: teamSideOf(teamId, homeTeamId),
      });
    } catch {
      // Пропускаем один нестандартный элемент, не теряя остальные.
    }
  }
  return { entries, rawCount: rawEvents.length };
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
    debug.push(
      `attackStats — хозяева: моментов всего=${homeAttackStats?.chancesTotal ?? "—"}, голов=${homeAttackStats?.goals ?? "—"}, ` +
        `нереализовано=${homeAttackStats?.missed ?? "—"}; гости: моментов всего=${awayAttackStats?.chancesTotal ?? "—"}, ` +
        `голов=${awayAttackStats?.goals ?? "—"}, нереализовано=${awayAttackStats?.missed ?? "—"} (итоги за весь матч, без разбивки по минутам)`,
    );
    debug.push(`EventList — разбивка по EventTypeID: ${debugEventTypeBreakdown(match)}`);
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
    debug.push(
      `хронология — сырые элементы: Scorers/Goal=${goalsRawCount}, Bookings/Booking=${bookingsRawCount}, ` +
        `Injuries/Injury=${injuriesRawCount}, EventList=${eventRawCount} (из них похоже на замену: ${subEntries.length})`,
    );

    const merged = [...goalsCardsEntries, ...injuryEntries, ...subEntries].sort((a, b) => a.minute - b.minute);
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
