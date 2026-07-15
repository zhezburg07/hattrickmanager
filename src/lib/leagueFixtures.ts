import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";

export interface RealFixtureMatch {
  matchId: string;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  homeGoals: number | null; // null — матч ещё не сыгран
  awayGoals: number | null;
}

// Разбирает XML-ответ CHPP на файл leaguefixtures.xml — календарь ВСЕЙ серии
// (LeagueLevelUnitID), а не только своей команды: все матчи между всеми
// командами лиги за сезон, с результатами уже сыгранных. Используется, чтобы
// построить настоящую сетку очных результатов на Обзоре (см.
// src/lib/realLeagueMatrix.ts) — то же самое, что сейчас показывается на
// тестовых данных (src/data/leagueMatrix.ts), но из реального CHPP.
//
// Поля <HomeTeam>/<AwayTeam> и <HomeGoals>/<AwayGoals> — та же структура,
// что уже подтверждена на живых данных в matches.xml (см. src/lib/matches.ts);
// CHPP переиспользует один и тот же тип <Match> в разных файлах. Несыгранные
// матчи Hattrick отдаёт с голами "-1" (тот же приём, что и InjuryLevel в
// players.xml) — здесь это превращается в null.
export function parseLeagueFixturesXml(xml: string): RealFixtureMatch[] {
  const parser = new XMLParser();
  const data = parser.parse(xml);

  const root = data?.HattrickData;
  assertNoChppError(root, "leaguefixtures");

  const rawMatches = root?.MatchList?.Match ?? root?.Team?.MatchList?.Match;
  const matches: Record<string, unknown>[] = Array.isArray(rawMatches)
    ? rawMatches
    : rawMatches
      ? [rawMatches]
      : [];

  return matches.map((m) => {
    const homeTeam = m.HomeTeam as Record<string, unknown> | undefined;
    const awayTeam = m.AwayTeam as Record<string, unknown> | undefined;

    const homeGoalsRaw = m.HomeGoals !== undefined ? Number(m.HomeGoals) : NaN;
    const awayGoalsRaw = m.AwayGoals !== undefined ? Number(m.AwayGoals) : NaN;
    const isPlayed = !Number.isNaN(homeGoalsRaw) && !Number.isNaN(awayGoalsRaw) && homeGoalsRaw >= 0 && awayGoalsRaw >= 0;

    return {
      matchId: String(m.MatchID ?? ""),
      homeTeamId: String(homeTeam?.HomeTeamID ?? ""),
      homeTeamName: String(homeTeam?.HomeTeamName ?? ""),
      awayTeamId: String(awayTeam?.AwayTeamID ?? ""),
      awayTeamName: String(awayTeam?.AwayTeamName ?? ""),
      homeGoals: isPlayed ? homeGoalsRaw : null,
      awayGoals: isPlayed ? awayGoalsRaw : null,
    };
  });
}
