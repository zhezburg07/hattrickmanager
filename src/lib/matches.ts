import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";
import { formatMatchDateTime } from "@/data/dashboard";
import type { SeasonMatch } from "@/data/matches";

export type RealMatchStatus = "FINISHED" | "ONGOING" | "UPCOMING";

export interface RealMatch {
  matchId: string;
  date: string; // как прислал Hattrick (ISO-подобная строка)
  home: boolean;
  opponent: string;
  status: RealMatchStatus;
  ourScore: number | null;
  oppScore: number | null;
  matchType: string;
}

// Разбирает XML-ответ CHPP на файл matches.xml — последние и ближайшие
// матчи команды. Hattrick сам решает, что считать "нашей" и "чужой"
// стороной по HomeTeamID/AwayTeamID — здесь просто сравниваем с ourTeamId.
export function parseMatchesXml(xml: string, ourTeamId: string): RealMatch[] {
  const parser = new XMLParser();
  const data = parser.parse(xml);

  const root = data?.HattrickData;
  assertNoChppError(root, "matches");

  const rawMatches = root?.Team?.MatchList?.Match;
  const matches = Array.isArray(rawMatches) ? rawMatches : rawMatches ? [rawMatches] : [];

  return matches.map((m: Record<string, unknown>) => {
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
      status: (String(m.Status ?? "UPCOMING").toUpperCase() as RealMatchStatus) || "UPCOMING",
      ourScore: homeGoals === null || awayGoals === null ? null : isHome ? homeGoals : awayGoals,
      oppScore: homeGoals === null || awayGoals === null ? null : isHome ? awayGoals : homeGoals,
      matchType: String(m.MatchType ?? ""),
    };
  });
}

// Приводит реальные матчи к тому же виду, что и полный календарь сезона
// (SeasonMatch) — для страницы "Матчи". CHPP не даёт номер тура лиги и не
// позволяет надёжно отличить кубок от лиги (см. RealMatch.matchType) —
// поэтому round всегда null, а соревнование — либо "Товарищеский" (matchType
// "0", единственное достоверное значение), либо нейтральный "Официальный".
export function toSeasonMatches(matches: RealMatch[]): SeasonMatch[] {
  const sorted = [...matches].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((m, i) => {
    const { shortDate, time } = formatMatchDateTime(m.date);
    return {
      id: Number(m.matchId) || i + 1,
      round: null,
      competition: m.matchType === "0" ? "Товарищеский" : "Официальный",
      date: time ? `${shortDate} · ${time}` : shortDate,
      opponent: m.opponent,
      home: m.home,
      ourScore: m.status === "FINISHED" ? m.ourScore : null,
      oppScore: m.status === "FINISHED" ? m.oppScore : null,
    };
  });
}
