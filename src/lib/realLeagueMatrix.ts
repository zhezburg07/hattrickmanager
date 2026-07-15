import type { MatrixTeamMeta } from "@/data/leagueMatrix";
import type { RealLeagueStandingRow } from "./leagueDetails";
import type { RealFixtureMatch } from "./leagueFixtures";

export interface RealLeagueMatrix {
  teams: MatrixTeamMeta[];
  matrix: (string | null)[][];
}

// Строит сетку очных результатов (см. src/data/leagueMatrix.ts) из настоящих
// данных: порядок и состав команд — из таблицы лиги (leaguedetails.xml,
// чтобы порядок совпадал с местами в таблице), а сами счета — из
// leaguefixtures.xml (единственный файл CHPP, отдающий результаты ВСЕХ
// команд лиги, а не только своей). Только сыгранные матчи попадают в сетку;
// диагональ и ещё не сыгранные пары остаются null.
export function buildRealLeagueMatrix(
  standings: RealLeagueStandingRow[],
  fixtures: RealFixtureMatch[],
): RealLeagueMatrix {
  const teams: MatrixTeamMeta[] = standings.map((s) => ({ name: s.teamName, isOurTeam: s.isOurTeam }));
  const indexByTeamId = new Map(standings.map((s, i) => [s.teamId, i]));

  const n = teams.length;
  const matrix: (string | null)[][] = Array.from({ length: n }, () => Array(n).fill(null));

  for (const match of fixtures) {
    if (match.homeGoals === null || match.awayGoals === null) continue; // ещё не сыгран
    const homeIndex = indexByTeamId.get(match.homeTeamId);
    const awayIndex = indexByTeamId.get(match.awayTeamId);
    if (homeIndex === undefined || awayIndex === undefined || homeIndex === awayIndex) continue;
    matrix[homeIndex][awayIndex] = `${match.homeGoals}-${match.awayGoals}`;
  }

  return { teams, matrix };
}
