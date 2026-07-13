import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";

export interface RealLeagueStandingRow {
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

export interface RealLeagueInfo {
  leagueName: string;
  leagueLevelUnitName: string;
  currentMatchRound: number | null;
  // Таблица лиги (список команд с местами/очками). В межсезонье, пока новые
  // группы ещё не сформированы, CHPP отдаёт leaguedetails.xml БЕЗ <Team> —
  // тогда здесь будет пустой массив, и таблицу лучше брать из демо-данных.
  // После старта сезона (группы сформированы) список появляется — это
  // подтверждено реальным ответом Hattrick.
  standings: RealLeagueStandingRow[];
}

// Разбирает XML-ответ CHPP на файл leagueDetails.xml.
export function parseLeagueDetailsXml(xml: string, ourTeamId: string): RealLeagueInfo {
  const parser = new XMLParser();
  const data = parser.parse(xml);

  const root = data?.HattrickData;
  assertNoChppError(root, "leaguedetails");

  const round = root?.CurrentMatchRound !== undefined ? Number(root.CurrentMatchRound) : NaN;

  const rawTeams = root?.Team;
  const teamList: any[] = rawTeams === undefined ? [] : Array.isArray(rawTeams) ? rawTeams : [rawTeams];

  const standings: RealLeagueStandingRow[] = teamList.map((t) => ({
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
    isOurTeam: String(t.TeamID ?? "") === ourTeamId,
  }));
  standings.sort((a, b) => a.position - b.position);

  return {
    leagueName: String(root?.LeagueName ?? ""),
    leagueLevelUnitName: String(root?.LeagueLevelUnitName ?? ""),
    currentMatchRound: Number.isNaN(round) ? null : round,
    standings,
  };
}
