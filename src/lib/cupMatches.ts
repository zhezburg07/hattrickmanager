import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";
import { requestChppXmlRaw, type StoredHattrickTokens } from "./hattrickApi";

export type RealCupMatchStatus = "FINISHED" | "ONGOING" | "UPCOMING";

export interface RealCupMatch {
  matchId: string;
  date: string;
  home: boolean;
  opponent: string;
  status: RealCupMatchStatus;
  ourScore: number | null;
  oppScore: number | null;
  round: number;
}

export interface OurCupPathResult {
  cupId: string;
  cupName: string;
  season: number;
  currentRound: number;
  // Наши матчи, по одному на раунд, отсортированы от раунда 1 до текущего.
  // Раунд может отсутствовать в списке (мы могли войти в этот кубок позже,
  // например, после вылета из другого — тогда честно пропускаем, не
  // выдумывая матч).
  path: RealCupMatch[];
  debug: string[];
  error: string | null;
}

// ИСПРАВЛЕНО (важный баг): cupmatches.xml по данному CupID отдаёт МАТЧИ ЦЕЛОГО
// РАУНДА ВСЕГО турнира (сотни пар команд, не только нашей — подтверждено
// исходным кодом независимого CHPP-клиента github.com/lucianoq/hattrick,
// api/cupmatches.go: ответ пагинирован по 256 записей, GetCupMatchesLast
// возвращает "последний раунд", GetCupMatches(cup, season, round) — любой
// конкретный прошедший раунд по явным Season+CupRound). Раньше здесь ВСЕ
// матчи раунда ошибочно превращались в "наш" матч (home/opponent
// считались так, будто мы всегда участвуем) — на деле нужно сначала найти
// СРЕДИ этих матчей тот единственный, где мы реально участвуем (домашняя
// или гостевая команда), а остальные ~99% отбросить.
const CUP_MATCHES_VERSION = "1.4";
const CUP_PAGE_SIZE = 256;
const MAX_PAGES_PER_ROUND = 8; // до ~2048 матчей на раунд — защита от лишних запросов, если наш матч не находится

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : value ? [value as Record<string, unknown>] : [];
}

function teamIdOf(team: Record<string, unknown> | undefined): string {
  return String(team?.TeamId ?? team?.TeamID ?? "");
}

function toRealCupMatch(m: Record<string, unknown>, ourTeamId: string, round: number): RealCupMatch {
  const homeTeam = m.HomeTeam as Record<string, unknown> | undefined;
  const awayTeam = m.AwayTeam as Record<string, unknown> | undefined;
  const homeTeamId = teamIdOf(homeTeam);
  const isHome = homeTeamId === ourTeamId;
  const opponent = isHome ? String(awayTeam?.TeamName ?? "") : String(homeTeam?.TeamName ?? "");

  const result = m.MatchResult as Record<string, unknown> | undefined;
  const homeGoalsRaw = result?.HomeGoals;
  const awayGoalsRaw = result?.AwayGoals;
  const homeGoals = homeGoalsRaw !== undefined ? Number(homeGoalsRaw) : NaN;
  const awayGoals = awayGoalsRaw !== undefined ? Number(awayGoalsRaw) : NaN;
  const availableRaw = result?.["@_Available"];
  const isPlayed =
    availableRaw !== undefined ? String(availableRaw) === "True" : !Number.isNaN(homeGoals) && !Number.isNaN(awayGoals);

  return {
    matchId: String(m.MatchID ?? ""),
    date: String(m.MatchDate ?? ""),
    home: isHome,
    opponent,
    status: isPlayed ? "FINISHED" : "UPCOMING",
    ourScore: isPlayed && !Number.isNaN(homeGoals) && !Number.isNaN(awayGoals) ? (isHome ? homeGoals : awayGoals) : null,
    oppScore: isPlayed && !Number.isNaN(homeGoals) && !Number.isNaN(awayGoals) ? (isHome ? awayGoals : homeGoals) : null,
    round,
  };
}

interface FetchedRound {
  cupName: string;
  season: number;
  round: number;
  ourMatch: RealCupMatch | null;
  rawMatchCount: number;
}

// Запрашивает ОДИН раунд кубка (без seasonRound — CHPP сам отдаёт ПОСЛЕДНИЙ/
// текущий раунд; с seasonRound — конкретный прошедший). Пагинирует
// (StartAfterMatchID), пока не найдёт наш матч среди сотен чужих или не
// исчерпает страницы/лимит.
async function fetchCupRound(
  tokens: StoredHattrickTokens,
  cupId: string,
  ourTeamId: string,
  seasonRound?: { season: number; round: number },
): Promise<{ result: FetchedRound | null; error: string | null }> {
  let startAfterMatchId: string | undefined;
  let cupMeta: Record<string, unknown> | undefined;
  let ourMatchRaw: Record<string, unknown> | undefined;
  let totalSeen = 0;

  try {
    for (let page = 0; page < MAX_PAGES_PER_ROUND; page++) {
      const params: Record<string, string> = { CupID: cupId, version: CUP_MATCHES_VERSION };
      if (seasonRound) {
        params.Season = String(seasonRound.season);
        params.CupRound = String(seasonRound.round);
      }
      if (startAfterMatchId) params.StartAfterMatchID = startAfterMatchId;

      const raw = await requestChppXmlRaw("cupmatches", params, tokens);
      if (raw.httpStatus < 200 || raw.httpStatus >= 300) {
        throw new Error(`HTTP ${raw.httpStatus}: ${raw.rawXml.slice(0, 200)}`);
      }

      const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
      const data = parser.parse(raw.rawXml);
      const root = data?.HattrickData;
      assertNoChppError(root, "cupmatches");

      const cup = root?.Cup as Record<string, unknown> | undefined;
      if (!cup) break;
      if (!cupMeta) cupMeta = cup;

      const matchList = cup.MatchList as Record<string, unknown> | undefined;
      const matches = asArray(matchList?.Match);
      totalSeen += matches.length;

      const found = matches.find((m) => {
        const homeTeam = m.HomeTeam as Record<string, unknown> | undefined;
        const awayTeam = m.AwayTeam as Record<string, unknown> | undefined;
        return teamIdOf(homeTeam) === ourTeamId || teamIdOf(awayTeam) === ourTeamId;
      });
      if (found) {
        ourMatchRaw = found;
        break;
      }

      if (matches.length < CUP_PAGE_SIZE) break; // последняя страница этого раунда
      const lastMatch = matches[matches.length - 1];
      const lastMatchId = String(lastMatch.MatchID ?? "");
      if (!lastMatchId) break;
      startAfterMatchId = lastMatchId;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    return { result: null, error: message };
  }

  if (!cupMeta) return { result: null, error: "Пустой ответ cupmatches (нет контейнера Cup)." };

  const round = Number(cupMeta.CupRound ?? 0);
  const season = Number(cupMeta.CupSeason ?? 0);
  const cupName = String(cupMeta.CupName ?? "");
  const ourMatch = ourMatchRaw ? toRealCupMatch(ourMatchRaw, ourTeamId, round) : null;

  return { result: { cupName, season, round, ourMatch, rawMatchCount: totalSeen }, error: null };
}

// Строит РЕАЛЬНЫЙ путь нашей команды по раундам конкретного кубка: сначала
// текущий/последний раунд (без явного Season/CupRound), затем каждый
// предыдущий раунд (1..текущий-1) отдельным запросом с явными Season+
// CupRound — то же самое, что делает официальный сайт Hattrick при показе
// истории кубка команды, только через отдельные вызовы CHPP вместо одной
// "сетки" (такого готового файла-сетки CHPP не предоставляет). Будущие
// раунды (после текущего) не запрашиваются — соперник в них ещё не определён
// самим Hattrick, пока не сыгран текущий этап, так что там честно нечего
// показывать.
export async function resolveOurCupPath(
  tokens: StoredHattrickTokens,
  cupId: string,
  ourTeamId: string,
): Promise<OurCupPathResult> {
  const debug: string[] = [];
  const { result: current, error } = await fetchCupRound(tokens, cupId, ourTeamId);
  if (error || !current) {
    return {
      cupId,
      cupName: "",
      season: 0,
      currentRound: 0,
      path: [],
      debug,
      error: error ?? "Не удалось получить текущий раунд кубка.",
    };
  }
  debug.push(
    `Текущий/последний раунд "${current.cupName}": раунд ${current.round}, сезон ${current.season}, ` +
      `матчей в раунде=${current.rawMatchCount}, наш матч ${current.ourMatch ? "найден" : "НЕ найден"}.`,
  );

  const path: RealCupMatch[] = [];
  if (current.ourMatch) path.push(current.ourMatch);

  for (let round = current.round - 1; round >= 1; round--) {
    const { result: past, error: pastError } = await fetchCupRound(tokens, cupId, ourTeamId, {
      season: current.season,
      round,
    });
    if (pastError) {
      debug.push(`Раунд ${round}: ошибка запроса — ${pastError}`);
      continue;
    }
    if (past?.ourMatch) {
      path.unshift(past.ourMatch);
      debug.push(`Раунд ${round}: наш матч найден (соперник «${past.ourMatch.opponent}», матчей в раунде=${past.rawMatchCount}).`);
    } else {
      debug.push(
        `Раунд ${round}: нашего матча нет среди ${past?.rawMatchCount ?? "—"} матчей этого раунда — либо мы ещё не участвовали в этом кубке на этом этапе, либо не найден за ${MAX_PAGES_PER_ROUND} страниц.`,
      );
    }
  }

  return { cupId, cupName: current.cupName, season: current.season, currentRound: current.round, path, debug, error: null };
}
