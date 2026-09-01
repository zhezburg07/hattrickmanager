import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";

export interface RealYouthFixtureMatch {
  matchId: string;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  matchDate: string;
  homeGoals: number | null; // null — матч ещё не сыгран
  awayGoals: number | null;
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : value ? [value as Record<string, unknown>] : [];
}

// Разбирает XML-ответ CHPP на файл youthleaguefixtures.xml (v1.0) —
// календарь ВСЕЙ юношеской серии (по параметру youthleagueid, полученному из
// youthleaguedetails.xml), прямой аналог leaguefixtures.xml для основной
// команды (см. src/lib/leagueFixtures.ts).
//
// ПОДТВЕРЖДЕНО по реальному захваченному ответу CHPP (независимый Python-
// клиент github.com/PiGo86/pychpp, tests/test_resources/
// file=youthleaguefixtures&version=1.0&youthleagueid=251460.xml) —
// структура здесь тоже ОТЛИЧАЕТСЯ от leaguefixtures.xml: матчи лежат в
// <Matches><Match> (с оберткой), а не голым списком <Match> прямо под
// HattrickData, как у основной лиги (см. подробный комментарий в
// leagueFixtures.ts про анонимное встраивание — у юношей его нет). У каждого
// матча есть явный <Status> ("FINISHED" и т.п.), но статус "сыгран" всё
// равно определяется по наличию голов (тот же приём, что и у основной лиги)
// — набор возможных значений Status не проверен полностью, а голы — более
// прямой и уже проверенный сигнал. Параметр запроса — youthleagueid
// (строчными).
export function parseYouthLeagueFixturesXml(xml: string): RealYouthFixtureMatch[] {
  const parser = new XMLParser();
  const data = parser.parse(xml);

  const root = data?.HattrickData;
  assertNoChppError(root, "youthleaguefixtures");

  const rawMatches = (root?.Matches as Record<string, unknown> | undefined)?.Match;
  const matches = asArray(rawMatches);

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
      matchDate: String(m.MatchDate ?? ""),
      homeGoals: isPlayed ? homeGoalsRaw : null,
      awayGoals: isPlayed ? awayGoalsRaw : null,
    };
  });
}
