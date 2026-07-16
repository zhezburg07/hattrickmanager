import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";
import { requestChppXmlRaw, type StoredHattrickTokens } from "./hattrickApi";
import { parseTeamDetailsXml } from "./teamDetails";
import { parseMatchesXml } from "./matches";
import type { ZoneKey } from "@/components/dashboard/zoneRatings";
import type { PositionGroup } from "@/data/squad";

// "Анализ соперника" — новое расширение калькулятора расстановки.
//
// Схема реальных запросов: 1) teamdetails.xml → наш TeamID; 2) matches.xml
// (наша команда) → ближайший ещё не сыгранный матч → TeamID соперника (см.
// новое поле RealMatch.opponentTeamId в src/lib/matches.ts); 3) matches.xml
// с параметром teamID=соперник (CHPP официально поддерживает запрос чужой
// команды по этому параметру) → последний сыгранный матч соперника; 4)
// matchdetails.xml по этому MatchID → состав и рейтинги соперника.
//
// ВАЖНО про честность данных: рейтинги игроков (RatingStars) — это уже
// подтверждённое на практике поле (см. src/lib/lastMatchRating.ts,
// src/lib/matchAnalysis.ts). А вот тактика (TacticType) и позиция каждого
// игрока (RoleID) — поля, которые в этом проекте НИКОГДА не проверялись на
// живом ответе Hattrick ни для одной команды, включая собственную. Их
// названия и коды ниже — лучшее предположение по документации сообщества
// Hattrick, не по официальной, гарантированной схеме. Если поле не найдётся
// вовсе — соответствующий блок ("формация", "тактика", "разбивка по зонам")
// честно помечается недоступным, а не заполняется угадайкой без всякой
// опоры. Если поле НАЙДЕНО, но код внутри него не входит в таблицу ниже —
// тоже недоступно, а не "первое попавшееся".
export interface OpponentPlayerRating {
  playerId: number;
  name: string;
  rating: number;
  zone: ZoneKey | "GK" | null;
}

export interface OpponentLastMatch {
  matchId: string;
  date: string;
  isHome: boolean; // была ли эта игра для соперника домашней
  goalsFor: number; // голы, забитые соперником в этом матче
  goalsAgainst: number; // голы, пропущенные соперником в этом матче
  ratings: OpponentPlayerRating[];
  // null — не удалось определить (см. комментарий выше про TacticType)
  tacticLabel: string | null;
}

export interface OpponentZoneStrength {
  ratings: Partial<Record<ZoneKey, number>>;
  available: boolean;
  unavailableReason: string | null;
}

export interface OpponentAnalysisResult {
  opponentTeamId: string | null;
  opponentTeamName: string | null;
  upcomingMatchDate: string | null;
  formation: string | null; // например "4-4-2" — null, если позиции игроков не определить (см. выше)
  lastMatch: OpponentLastMatch | null;
  lastMatchUnavailableReason: string | null;
  zoneStrength: OpponentZoneStrength;
  error: string | null; // заполнено только при полном провале (не удалось определить самого соперника)
}

const emptyZoneStrength: OpponentZoneStrength = { ratings: {}, available: false, unavailableReason: null };

function emptyResult(error: string | null): OpponentAnalysisResult {
  return {
    opponentTeamId: null,
    opponentTeamName: null,
    upcomingMatchDate: null,
    formation: null,
    lastMatch: null,
    lastMatchUnavailableReason: null,
    zoneStrength: emptyZoneStrength,
    error,
  };
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : value ? [value as Record<string, unknown>] : [];
}

// Коды TacticType в matchdetails.xml — по неофициальной, но широко
// цитируемой в сообществе Hattrick схеме (0/1/2/4/7/8; 3, 5, 6 в разных
// источниках описываются противоречиво). НЕ сверено с живым ответом.
const tacticTypeLabel: Record<number, string> = {
  0: "Обычная",
  1: "Прессинг",
  2: "Контратаки",
  4: "Атака флангами",
  7: "Дальние удары",
  8: "Творческая игра",
};

// Позиционные коды RoleID — тоже по неофициальной схеме сообщества, тоже НЕ
// сверено с живым ответом ни разу за весь проект. Если реальный код не
// входит в эту таблицу — игрок просто не попадёт ни в одну зону, а не будет
// отнесён "куда-то наугад".
const roleCodeToZone: Record<number, ZoneKey | "GK"> = {
  100: "GK",
  101: "defenseRight",
  102: "defenseCenter",
  103: "defenseCenter",
  104: "defenseLeft",
  105: "attackRight",
  106: "midfield",
  107: "midfield",
  108: "attackLeft",
  109: "attackCenter",
  110: "attackRight",
  111: "attackCenter",
  112: "attackCenter",
  113: "attackLeft",
};

function zoneToPositionGroup(zone: ZoneKey | "GK"): PositionGroup {
  if (zone === "GK") return "GK";
  if (zone === "defenseLeft" || zone === "defenseCenter" || zone === "defenseRight") return "DEF";
  if (zone === "midfield") return "MID";
  return "FWD";
}

function readRoleCode(p: Record<string, unknown>): number | null {
  const raw = p.RoleID ?? p.Role ?? p.PositionID ?? p.Position ?? p.TacticalPosition;
  if (raw === undefined || raw === null || raw === "") return null;
  const code = Number(raw);
  return Number.isNaN(code) ? null : code;
}

function parseOpponentLineup(
  team: Record<string, unknown> | undefined,
): { ratings: OpponentPlayerRating[]; anyRoleCodeFound: boolean } {
  const lineup = team?.Lineup as Record<string, unknown> | undefined;
  const players = asArray(lineup?.Player);

  const ratings: OpponentPlayerRating[] = [];
  let anyRoleCodeFound = false;

  for (const p of players) {
    const id = Number(p.PlayerID ?? p.PlayerId ?? 0);
    const ratingRaw = p.RatingStars ?? p.Rating ?? p.PlayerRating;
    if (!id || ratingRaw === undefined) continue;
    const rating = Number(ratingRaw);
    if (Number.isNaN(rating)) continue;

    const firstLast = `${p.FirstName ?? ""} ${p.LastName ?? ""}`.trim();
    const name = String(p.PlayerName ?? "") || firstLast || `Игрок #${id}`;

    const roleCode = readRoleCode(p);
    if (roleCode !== null) anyRoleCodeFound = true;
    const zone = roleCode !== null ? (roleCodeToZone[roleCode] ?? null) : null;

    ratings.push({ playerId: id, name, rating, zone });
  }

  return { ratings: ratings.sort((a, b) => b.rating - a.rating), anyRoleCodeFound };
}

function deriveFormation(ratings: OpponentPlayerRating[]): string | null {
  const counted = ratings.filter((r) => r.zone !== null && r.zone !== "GK");
  if (counted.length === 0) return null;
  let def = 0;
  let mid = 0;
  let fwd = 0;
  for (const r of counted) {
    const group = zoneToPositionGroup(r.zone!);
    if (group === "DEF") def++;
    else if (group === "MID") mid++;
    else if (group === "FWD") fwd++;
  }
  return `${def}-${mid}-${fwd}`;
}

function computeZoneStrength(ratings: OpponentPlayerRating[], anyRoleCodeFound: boolean): OpponentZoneStrength {
  if (!anyRoleCodeFound) {
    return {
      ratings: {},
      available: false,
      unavailableReason:
        "Hattrick не передал позиции игроков соперника в ответе matchdetails — зональная разбивка недоступна.",
    };
  }

  const buckets: Partial<Record<ZoneKey, number[]>> = {};
  for (const r of ratings) {
    if (r.zone === null || r.zone === "GK") continue;
    (buckets[r.zone] ??= []).push(r.rating);
  }

  const result: Partial<Record<ZoneKey, number>> = {};
  for (const [zone, values] of Object.entries(buckets) as [ZoneKey, number[]][]) {
    result[zone] = values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  if (Object.keys(result).length === 0) {
    return {
      ratings: {},
      available: false,
      unavailableReason: "Не удалось сопоставить ни один код позиции игрока с известной зоной поля.",
    };
  }

  return { ratings: result, available: true, unavailableReason: null };
}

export async function resolveOpponentAnalysis(tokens: StoredHattrickTokens): Promise<OpponentAnalysisResult> {
  let ourTeamId: string;
  try {
    const teamRaw = await requestChppXmlRaw("teamdetails", {}, tokens);
    if (teamRaw.httpStatus < 200 || teamRaw.httpStatus >= 300) {
      throw new Error(`HTTP ${teamRaw.httpStatus}`);
    }
    ourTeamId = parseTeamDetailsXml(teamRaw.rawXml).teamId;
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    return emptyResult(`Не удалось определить нашу команду (teamdetails): ${message}`);
  }

  let upcoming: { opponentTeamId: string; opponentName: string; date: string } | null = null;
  try {
    const matchesRaw = await requestChppXmlRaw("matches", {}, tokens);
    if (matchesRaw.httpStatus < 200 || matchesRaw.httpStatus >= 300) {
      throw new Error(`HTTP ${matchesRaw.httpStatus}`);
    }
    const ourMatches = parseMatchesXml(matchesRaw.rawXml, ourTeamId);
    const next = ourMatches
      .filter((m) => m.status !== "FINISHED" && m.matchId)
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    if (!next || !next.opponentTeamId) {
      return emptyResult("Не найден ближайший предстоящий матч с известным соперником — проверьте вкладку «Матчи».");
    }
    upcoming = { opponentTeamId: next.opponentTeamId, opponentName: next.opponent, date: next.date };
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    return emptyResult(`Не удалось получить ближайший матч (matches): ${message}`);
  }

  const result = emptyResult(null);
  result.opponentTeamId = upcoming.opponentTeamId;
  result.opponentTeamName = upcoming.opponentName;
  result.upcomingMatchDate = upcoming.date;

  let lastPlayed: { matchId: string; date: string; isHome: boolean; goalsFor: number; goalsAgainst: number } | null =
    null;
  try {
    const oppMatchesRaw = await requestChppXmlRaw("matches", { teamID: upcoming.opponentTeamId }, tokens);
    if (oppMatchesRaw.httpStatus < 200 || oppMatchesRaw.httpStatus >= 300) {
      throw new Error(`HTTP ${oppMatchesRaw.httpStatus}`);
    }
    const oppMatches = parseMatchesXml(oppMatchesRaw.rawXml, upcoming.opponentTeamId);
    const last = oppMatches
      .filter((m) => m.status === "FINISHED" && m.matchId && m.ourScore !== null && m.oppScore !== null)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!last) {
      result.lastMatchUnavailableReason = "У соперника пока нет сыгранных матчей в ответе CHPP.";
      return result;
    }
    lastPlayed = {
      matchId: last.matchId,
      date: last.date,
      isHome: last.home,
      goalsFor: last.ourScore!,
      goalsAgainst: last.oppScore!,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    result.lastMatchUnavailableReason = `Не удалось получить матчи соперника (matches, teamID=${upcoming.opponentTeamId}): ${message}`;
    return result;
  }

  try {
    const detailsRaw = await requestChppXmlRaw("matchdetails", { matchID: lastPlayed.matchId }, tokens);
    if (detailsRaw.httpStatus < 200 || detailsRaw.httpStatus >= 300) {
      throw new Error(`HTTP ${detailsRaw.httpStatus}`);
    }

    const parser = new XMLParser();
    const data = parser.parse(detailsRaw.rawXml);
    const root = data?.HattrickData;
    assertNoChppError(root, "matchdetails");

    const match = (root?.Match ?? root) as Record<string, unknown> | undefined;
    const homeTeam = match?.HomeTeam as Record<string, unknown> | undefined;
    const awayTeam = match?.AwayTeam as Record<string, unknown> | undefined;
    const isHomeSide = String(homeTeam?.HomeTeamID ?? "") === upcoming.opponentTeamId;
    const opponentTeam = isHomeSide ? homeTeam : awayTeam;

    const { ratings, anyRoleCodeFound } = parseOpponentLineup(opponentTeam);

    const tacticCodeRaw =
      opponentTeam?.TacticType ?? (opponentTeam?.Tactics as Record<string, unknown> | undefined)?.TacticType;
    const tacticCode = tacticCodeRaw !== undefined ? Number(tacticCodeRaw) : NaN;
    const tacticLabel = !Number.isNaN(tacticCode) ? (tacticTypeLabel[tacticCode] ?? null) : null;

    result.formation = deriveFormation(ratings);
    result.zoneStrength = computeZoneStrength(ratings, anyRoleCodeFound);
    result.lastMatch = {
      matchId: lastPlayed.matchId,
      date: lastPlayed.date,
      isHome: lastPlayed.isHome,
      goalsFor: lastPlayed.goalsFor,
      goalsAgainst: lastPlayed.goalsAgainst,
      ratings,
      tacticLabel,
    };
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    result.lastMatchUnavailableReason = `Не удалось разобрать состав последнего матча соперника (matchdetails): ${message}`;
    return result;
  }
}
