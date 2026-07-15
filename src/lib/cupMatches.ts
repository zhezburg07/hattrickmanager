import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";

export type RealCupMatchStatus = "FINISHED" | "ONGOING" | "UPCOMING";

export interface RealCupMatch {
  matchId: string;
  date: string;
  home: boolean;
  opponent: string;
  status: RealCupMatchStatus;
  ourScore: number | null;
  oppScore: number | null;
}

// Разбирает XML-ответ CHPP на файл cupmatches.xml — ни разу не пробовался
// в этом проекте живьём до сих пор. Схема матча (HomeTeam/HomeTeamID/
// HomeTeamName, AwayTeam/AwayTeamID/AwayTeamName, HomeGoals/AwayGoals,
// MatchDate, Status) взята по аналогии с уже подтверждённой на живых
// данных src/lib/matches.ts — CHPP переиспользует один и тот же тип
// <Match> в разных файлах. Если реальный ответ устроен иначе — вызывающий
// код (src/app/dashboard/cup/page.tsx) поймает ошибку и честно останется
// без этого блока, ничего не сломав.
export function parseCupMatchesXml(xml: string, ourTeamId: string): RealCupMatch[] {
  const parser = new XMLParser();
  const data = parser.parse(xml);

  const root = data?.HattrickData;
  assertNoChppError(root, "cupmatches");

  const rawMatches = root?.Team?.MatchList?.Match ?? root?.MatchList?.Match;
  const matches: Record<string, unknown>[] = Array.isArray(rawMatches) ? rawMatches : rawMatches ? [rawMatches] : [];

  return matches.map((m) => {
    const homeTeam = m.HomeTeam as Record<string, unknown> | undefined;
    const awayTeam = m.AwayTeam as Record<string, unknown> | undefined;
    const isHome = String(homeTeam?.HomeTeamID ?? "") === ourTeamId;
    const opponent = isHome ? String(awayTeam?.AwayTeamName ?? "") : String(homeTeam?.HomeTeamName ?? "");

    const homeGoals = m.HomeGoals !== undefined ? Number(m.HomeGoals) : null;
    const awayGoals = m.AwayGoals !== undefined ? Number(m.AwayGoals) : null;

    return {
      matchId: String(m.MatchID ?? ""),
      date: String(m.MatchDate ?? ""),
      home: isHome,
      opponent,
      status: (String(m.Status ?? "UPCOMING").toUpperCase() as RealCupMatchStatus) || "UPCOMING",
      ourScore: homeGoals === null || awayGoals === null ? null : isHome ? homeGoals : awayGoals,
      oppScore: homeGoals === null || awayGoals === null ? null : isHome ? awayGoals : homeGoals,
    };
  });
}
