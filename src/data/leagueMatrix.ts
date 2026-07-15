import type { MatchOutcome } from "./dashboard";

// Полная сетка результатов между всеми 8 командами лиги (тестовые данные) —
// двойной круговой турнир (каждая команда встречается с каждой дважды: раз
// дома, раз в гостях), как в настоящем дивизионе Hattrick. Строка — команда
// дома, столбец — команда в гостях, значение — счёт "голы хозяев-голы
// гостей". На диагонали (команда сама с собой) — null.
//
// Именно эта сетка — единственный источник данных: таблица "Все игры" и
// вкладки "Домашние/Гостевые игры" на Обзоре считаются из неё же (см.
// computeLeagueStandings ниже), поэтому все три режима и сама сетка всегда
// согласованы друг с другом.
export interface LeagueMatrixTeamMeta {
  name: string;
  last5: MatchOutcome[]; // последние 5 игр (не зависит от режима "дома/в гостях")
  isOurTeam?: boolean;
}

export const leagueMatrixTeams: LeagueMatrixTeamMeta[] = [
  { name: "Атлетик Норд", last5: ["win", "win", "draw", "win", "win"] },
  { name: "Юнион Стар", last5: ["draw", "win", "win", "loss", "win"] },
  { name: "FC Заря", last5: ["win", "draw", "loss", "draw", "win"], isOurTeam: true },
  { name: "Дракон Сити", last5: ["win", "draw", "win", "draw", "loss"] },
  { name: "Ред Фалькон", last5: ["loss", "win", "draw", "loss", "draw"] },
  { name: "Стальные Волки", last5: ["draw", "loss", "win", "draw", "win"] },
  { name: "Гранит СК", last5: ["loss", "loss", "draw", "loss", "win"] },
  { name: "Феникс Юнайтед", last5: ["loss", "loss", "loss", "draw", "loss"] },
];

// results[домашняя][гостевая] = "голыДома-голыГостей"; null — по диагонали
export const leagueResultsMatrix: (string | null)[][] = [
  [null, "2-1", "3-1", "3-0", "4-0", "5-1", "5-0", "6-0"],
  ["1-1", null, "2-1", "3-1", "3-0", "4-1", "4-0", "5-0"],
  ["1-2", "1-1", null, "2-1", "2-0", "3-1", "3-0", "4-0"],
  ["0-2", "1-2", "1-1", null, "2-1", "2-0", "3-1", "3-0"],
  ["0-3", "0-2", "1-2", "1-1", null, "2-1", "2-0", "3-1"],
  ["0-4", "0-3", "0-2", "1-2", "1-1", null, "2-1", "2-0"],
  ["0-5", "0-4", "0-3", "1-3", "1-2", "1-1", null, "2-1"],
  ["0-6", "0-5", "0-4", "0-3", "1-3", "1-2", "1-1", null],
];

export type LeagueTableMode = "all" | "home" | "away";

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
  last5: MatchOutcome[];
  isOurTeam?: boolean;
}

function parseScore(raw: string): [number, number] {
  const [home, away] = raw.split("-").map(Number);
  return [home, away];
}

// Пересчитывает таблицу лиги из сетки результатов для одного из трёх
// режимов: "all" — все игры (как обычно), "home" — только матчи, сыгранные
// домa, "away" — только выездные. Позиции (места) каждый раз считаются
// заново для выбранного режима, а не переносятся из общей таблицы.
export function computeLeagueStandings(mode: LeagueTableMode): LeagueMatrixRow[] {
  const n = leagueMatrixTeams.length;
  const stats = leagueMatrixTeams.map(() => ({
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
      const raw = leagueResultsMatrix[home][away];
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

  const rows: LeagueMatrixRow[] = leagueMatrixTeams.map((team, i) => ({
    position: 0,
    name: team.name,
    played: stats[i].played,
    wins: stats[i].wins,
    draws: stats[i].draws,
    losses: stats[i].losses,
    goalsFor: stats[i].goalsFor,
    goalsAgainst: stats[i].goalsAgainst,
    points: stats[i].wins * 3 + stats[i].draws,
    last5: team.last5,
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
