import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";
import { requestChppXmlRaw, type StoredHattrickTokens } from "./hattrickApi";

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
//    (свою — без teamID, чужую — с explicit teamID).
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
export interface MatchPlayerRating {
  playerId: number;
  name: string;
  rating: number;
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

export type MatchTimelineKind = "goal" | "card" | "event";
export type MatchTimelineSource = "events" | "goals-cards";

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

// Полная хронология — приходит только если matchdetails запрошен с
// matchEvents=true. EventText — уже готовый текст события от самого
// Hattrick (как в отчёте о матче), поэтому декодировать сотни числовых
// кодов EventTypeID самим не нужно.
function parseEventListTimeline(match: Record<string, unknown>, homeTeamId: string): MatchTimelineEntry[] {
  const eventList = match.EventList as Record<string, unknown> | undefined;
  const rawEvents = asArray(eventList?.Event);
  return rawEvents
    .map((e) => {
      const teamId = String(e.SubjectTeamID ?? e.SubjectTeamId ?? "");
      const text = String(e.EventText ?? "").trim();
      return {
        minute: Number(e.Minute ?? 0),
        matchPart: Number(e.MatchPart ?? 0),
        text: text || `Событие (тип ${e.EventTypeID ?? "?"})`,
        kind: "event" as const,
        teamSide: teamSideOf(teamId, homeTeamId),
      };
    })
    .sort((a, b) => a.minute - b.minute);
}

// Запасной вариант — голы (Scorers) и карточки (Bookings) приходят всегда,
// без matchEvents=true, так что это честная хронология и без полного
// EventList (менее подробная — только голы и карточки, без прочих
// игровых моментов).
function parseGoalsAndCardsTimeline(
  match: Record<string, unknown>,
  homeTeamId: string,
  homeTeamName: string,
  awayTeamName: string,
): MatchTimelineEntry[] {
  const goals = asArray((match.Scorers as Record<string, unknown> | undefined)?.Goal);
  const bookings = asArray((match.Bookings as Record<string, unknown> | undefined)?.Booking);

  const teamName = (teamId: string) => (teamId === homeTeamId ? homeTeamName : awayTeamName);

  const goalEntries: MatchTimelineEntry[] = goals.map((g) => {
    const teamId = String(g.ScorerTeamID ?? "");
    const scorerName = String(g.ScorerPlayerName ?? "").trim() || "Неизвестный игрок";
    return {
      minute: Number(g.ScorerMinute ?? 0),
      matchPart: Number(g.MatchPart ?? 0),
      text: `Гол — ${scorerName} (${teamName(teamId)}), ${g.ScorerHomeGoals ?? 0}:${g.ScorerAwayGoals ?? 0}`,
      kind: "goal" as const,
      teamSide: teamSideOf(teamId, homeTeamId),
    };
  });

  const cardEntries: MatchTimelineEntry[] = bookings.map((b) => {
    const teamId = String(b.BookingTeamID ?? "");
    const playerName = String(b.BookingPlayerName ?? "").trim() || "Неизвестный игрок";
    const cardLabel = Number(b.BookingType ?? 0) === 2 ? "Красная карточка" : "Жёлтая карточка";
    return {
      minute: Number(b.BookingMinute ?? 0),
      matchPart: Number(b.MatchPart ?? 0),
      text: `${cardLabel} — ${playerName} (${teamName(teamId)})`,
      kind: "card" as const,
      teamSide: teamSideOf(teamId, homeTeamId),
    };
  });

  return [...goalEntries, ...cardEntries].sort((a, b) => a.minute - b.minute);
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

  const ratings: MatchPlayerRating[] = [];
  for (const p of players) {
    const id = Number(p.PlayerID ?? 0);
    const ratingRaw = p.RatingStarsEndOfMatch ?? p.RatingStars;
    if (!id || ratingRaw === undefined) continue;
    const rating = Number(ratingRaw);
    if (Number.isNaN(rating)) continue;
    const firstLast = `${p.FirstName ?? ""} ${p.LastName ?? ""}`.trim();
    const name = firstLast || String(p.NickName ?? "") || `Игрок #${id}`;
    ratings.push({ playerId: id, name, rating });
  }
  return ratings.sort((a, b) => b.rating - a.rating);
}

export async function resolveMatchAnalysis(tokens: StoredHattrickTokens, matchId: string): Promise<MatchAnalysisResult> {
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
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    return { ...empty, error: `Разбор матча (matchdetails): ${message}` };
  }

  const homeTeam = match.HomeTeam as Record<string, unknown> | undefined;
  const awayTeam = match.AwayTeam as Record<string, unknown> | undefined;

  const homeZones = parseZoneRatings(homeTeam);
  const awayZones = parseZoneRatings(awayTeam);
  const zonesError = !homeZones && !awayZones ? "Зональные показатели (RatingMidfield и т.п.) отсутствуют в ответе matchdetails для этого матча." : null;

  const attendance = parseAttendance(match);
  const attendanceError = attendance
    ? null
    : "Данные о посещаемости (<Arena><SoldTerraces>/<SoldBasic>/<SoldRoof>/<SoldVIP>) отсутствуют в ответе matchdetails для этого матча.";

  const eventTimeline = parseEventListTimeline(match, homeTeamId);
  let timeline: MatchTimelineEntry[] | null;
  let timelineSource: MatchTimelineSource | null;
  let timelineError: string | null = null;
  if (eventTimeline.length > 0) {
    timeline = eventTimeline;
    timelineSource = "events";
  } else {
    const fallback = parseGoalsAndCardsTimeline(match, homeTeamId, homeTeamName, awayTeamName);
    if (fallback.length > 0) {
      timeline = fallback;
      timelineSource = "goals-cards";
    } else {
      timeline = null;
      timelineSource = null;
      timelineError =
        "Хронология событий недоступна для этого матча — ни полный список событий (EventList, запрошен с matchEvents=true), ни список голов/карточек не вернулись из matchdetails.";
    }
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
    error: null,
  };
}
