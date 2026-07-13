import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";

export interface RealSeriesRow {
  teamId: string;
  position: number;
  teamName: string;
  played: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  isOurTeam: boolean;
}

// Разбирает XML-ответ CHPP на файл seriescup.xml (с actionType=viewGroups) —
// именно ЗДЕСЬ находится таблица лиги, а не в leaguedetails.xml, как
// предполагалось раньше. В Hattrick обычная лига технически устроена как
// разновидность "серии кубка" (CupSeriesScores), отсюда и название файла.
export function parseSeriesCupXml(xml: string, ourTeamId: string): RealSeriesRow[] {
  const parser = new XMLParser();
  const data = parser.parse(xml);

  const root = data?.HattrickData;
  assertNoChppError(root, "seriescup");

  const rawTeams = root?.CupSeriesScores?.Team;
  const teams = Array.isArray(rawTeams) ? rawTeams : rawTeams ? [rawTeams] : [];

  const rows: RealSeriesRow[] = teams.map((team: Record<string, unknown>) => ({
    teamId: String(team.TeamID ?? ""),
    position: Number(team.Place ?? 0),
    teamName: String(team.TeamName ?? ""),
    played: Number(team.MatchesPlayed ?? 0),
    goalsFor: Number(team.GoalsFor ?? 0),
    goalsAgainst: Number(team.GoalsAgainst ?? 0),
    points: Number(team.Points ?? 0),
    isOurTeam: String(team.TeamID ?? "") === ourTeamId,
  }));

  rows.sort((a, b) => a.position - b.position);
  return rows;
}
