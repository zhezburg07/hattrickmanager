import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";

export interface RealYouthLeagueStandingRow {
  teamId: string;
  position: number;
  teamName: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  isOurTeam: boolean;
}

export interface RealYouthLeagueInfo {
  youthLeagueId: string;
  leagueName: string;
  nrOfTeamsInLeague: number | null;
  standings: RealYouthLeagueStandingRow[];
}

// Разбирает XML-ответ CHPP на файл youthleaguedetails.xml (v1.1) — таблица
// юношеской лиги, прямой аналог leaguedetails.xml для основной команды (см.
// src/lib/leagueDetails.ts).
//
// ПОДТВЕРЖДЕНО по реальному захваченному ответу CHPP (независимый Python-
// клиент github.com/PiGo86/pychpp, tests/test_resources/
// file=youthleaguedetails&version=1.0.xml) — структура ОТЛИЧАЕТСЯ от
// leaguedetails.xml в одном важном месте: команды лежат в <Teams><Team>
// (с оберткой), а не голым списком <Team> прямо под HattrickData, как у
// основной лиги. Полей LeagueLevelUnitName/CurrentMatchRound, как у
// основной лиги, здесь нет — вместо них YouthLeagueType/NrOfTeamsInLeague/
// LastMatchRound. Запрос без параметров — CHPP отдаёт лигу СВОЕЙ юношеской
// команды по токену (тот же принцип, что и у leaguedetails.xml).
export function parseYouthLeagueDetailsXml(xml: string, ourYouthTeamId: string): RealYouthLeagueInfo {
  const parser = new XMLParser();
  const data = parser.parse(xml);

  const root = data?.HattrickData;
  assertNoChppError(root, "youthleaguedetails");

  const nrOfTeamsRaw = root?.NrOfTeamsInLeague;
  const nrOfTeamsInLeague = nrOfTeamsRaw !== undefined ? Number(nrOfTeamsRaw) : NaN;

  const rawTeams = root?.Teams?.Team;
  const teamList: any[] = rawTeams === undefined ? [] : Array.isArray(rawTeams) ? rawTeams : [rawTeams];

  const standings: RealYouthLeagueStandingRow[] = teamList.map((t) => ({
    teamId: String(t.TeamID ?? ""),
    position: Number(t.Position ?? 0),
    teamName: String(t.TeamName ?? ""),
    played: Number(t.Matches ?? 0),
    wins: Number(t.Won ?? 0),
    draws: Number(t.Draws ?? 0),
    losses: Number(t.Lost ?? 0),
    goalsFor: Number(t.GoalsFor ?? 0),
    goalsAgainst: Number(t.GoalsAgainst ?? 0),
    points: Number(t.Points ?? 0),
    isOurTeam: String(t.TeamID ?? "") === ourYouthTeamId,
  }));
  standings.sort((a, b) => a.position - b.position);

  return {
    youthLeagueId: String(root?.YouthLeagueID ?? ""),
    leagueName: String(root?.YouthLeagueName ?? ""),
    nrOfTeamsInLeague: Number.isNaN(nrOfTeamsInLeague) ? null : nrOfTeamsInLeague,
    standings,
  };
}
