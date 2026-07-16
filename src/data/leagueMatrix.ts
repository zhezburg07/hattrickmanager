import type { MatchOutcome } from "./dashboard";

export type LeagueTableMode = "all" | "home" | "away";

export interface MatrixTeamMeta {
  name: string;
  isOurTeam?: boolean;
}

export interface LeagueMatrixRow {
  position: number;
  name: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  last5?: MatchOutcome[];
  isOurTeam?: boolean;
}

function parseScore(raw: string): [number, number] {
  const [home, away] = raw.split("-").map(Number);
  return [home, away];
}

// Пересчитывает таблицу лиги из сетки очных результатов для одного из трёх
// режимов: "all" — все игры, "home" — только матчи, сыгранные дома, "away" —
// только выездные. Позиции (места) каждый раз считаются заново для
// выбранного режима, а не переносятся из общей таблицы. Используется для
// реальной сетки, построенной из leaguefixtures.xml (см.
// src/lib/realLeagueMatrix.ts).
export function computeStandingsFromMatrix(
  teams: MatrixTeamMeta[],
  matrix: (string | null)[][],
  mode: LeagueTableMode,
): LeagueMatrixRow[] {
  const n = teams.length;
  const stats = teams.map(() => ({
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
  }));

  for (let home = 0; home < n; home++) {
    for (let away = 0; away < n; away++) {
      if (home === away) continue;
      const raw = matrix[home]?.[away];
      if (!raw) continue;
      const [homeGoals, awayGoals] = parseScore(raw);

      if (mode !== "away") {
        const s = stats[home];
        s.played++;
        s.goalsFor += homeGoals;
        s.goalsAgainst += awayGoals;
        if (homeGoals > awayGoals) s.wins++;
        else if (homeGoals === awayGoals) s.draws++;
        else s.losses++;
      }

      if (mode !== "home") {
        const s = stats[away];
        s.played++;
        s.goalsFor += awayGoals;
        s.goalsAgainst += homeGoals;
        if (awayGoals > homeGoals) s.wins++;
        else if (awayGoals === homeGoals) s.draws++;
        else s.losses++;
      }
    }
  }

  const rows: LeagueMatrixRow[] = teams.map((team, i) => ({
    position: 0,
    name: team.name,
    played: stats[i].played,
    wins: stats[i].wins,
    draws: stats[i].draws,
    losses: stats[i].losses,
    goalsFor: stats[i].goalsFor,
    goalsAgainst: stats[i].goalsAgainst,
    points: stats[i].wins * 3 + stats[i].draws,
    isOurTeam: team.isOurTeam,
  }));

  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const diffA = a.goalsFor - a.goalsAgainst;
    const diffB = b.goalsFor - b.goalsAgainst;
    if (diffB !== diffA) return diffB - diffA;
    return b.goalsFor - a.goalsFor;
  });
  rows.forEach((row, i) => (row.position = i + 1));

  return rows;
}

