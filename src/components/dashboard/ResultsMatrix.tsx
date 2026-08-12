import type { MatrixTeamMeta } from "@/data/leagueMatrix";
import styles from "./Overview.module.css";

// Сетка очных результатов между всеми командами лиги — строки: команда
// дома, столбцы: команда в гостях, на пересечении — счёт "голы хозяев-голы
// гостей", как на оригинальной странице лиги в Hattrick. Диагональ пустая.
// Работает и с тестовыми данными (src/data/leagueMatrix.ts), и с реальными,
// построенными из leaguefixtures.xml (src/lib/realLeagueMatrix.ts) — сама
// таблица не знает, откуда пришли данные. Вынесено в отдельный файл (см.
// чат "Матчи на Обзоре: переключатель на сетку результатов") — используется
// и под таблицей лиги (LeagueTable.tsx), и как альтернативный вид блока
// "Матчи" (MatchesSection.tsx).
export default function ResultsMatrix({ teams, matrix }: { teams: MatrixTeamMeta[]; matrix: (string | null)[][] }) {
  return (
    <div className={styles.matrixWrap}>
      <table className={styles.matrixTable}>
        <thead>
          <tr>
            <th className={styles.matrixCorner} />
            {teams.map((team) => (
              <th key={team.name} className={team.isOurTeam ? styles.matrixHeadUs : undefined}>
                <a href="#" onClick={(e) => e.preventDefault()} title={team.name}>
                  {team.name}
                </a>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {teams.map((homeTeam, homeIndex) => (
            <tr key={homeTeam.name}>
              <th className={homeTeam.isOurTeam ? styles.matrixHeadUs : undefined} scope="row">
                <a href="#" onClick={(e) => e.preventDefault()} title={homeTeam.name}>
                  {homeTeam.name}
                </a>
              </th>
              {teams.map((awayTeam, awayIndex) => {
                const isDiagonal = homeIndex === awayIndex;
                const highlighted = homeTeam.isOurTeam || awayTeam.isOurTeam;
                return (
                  <td
                    key={awayTeam.name}
                    className={`${styles.matrixCell} ${highlighted ? styles.matrixCellUs : ""}`}
                  >
                    {isDiagonal ? "" : matrix[homeIndex]?.[awayIndex]}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
