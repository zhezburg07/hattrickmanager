import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";
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

  homeRatings: MatchPlayerRating[];
  awayRatings: MatchPlayerRating[];
  ratingsError: string | null;

  homeZones: MatchZoneRatings | null;
  awayZones: MatchZoneRatings | null;
  zonesError: string | null;

  attendance: MatchAttendance | null;
  attendanceError: string | null;

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

async function fetchTeamLineupRatings(
  tokens: StoredHattrickTokens,
  matchId: string,
  teamId: string,
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
  for (const p of players) {
    const id = Number(p.PlayerID ?? 0);
    const ratingRaw = p.RatingStarsEndOfMatch ?? p.RatingStars;
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
  return [...byId.values()].sort((a, b) => b.rating - a.rating);
}

export async function resolveMatchAnalysis(tokens: StoredHattrickTokens, matchId: string): Promise<MatchAnalysisResult> {
  const debug: string[] = [];
  const empty: MatchAnalysisResult = {
    homeTeamName: "",
    awayTeamName: "",
    homeRatings: [],
    awayRatings: [],
    ratingsError: null,
    homeZones: null,
    awayZones: null,
    zonesError: null,
    attendance: null,
    attendanceError: null,
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
    fetchTeamLineupRatings(tokens, matchId, homeTeamId),
    fetchTeamLineupRatings(tokens, matchId, awayTeamId),
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
    homeRatings,
    awayRatings,
    ratingsError,
    homeZones,
    awayZones,
    zonesError,
    attendance,
    attendanceError,
    timeline,
    timelineSource,
    timelineError,
    debug,
    error: null,
  };
}
