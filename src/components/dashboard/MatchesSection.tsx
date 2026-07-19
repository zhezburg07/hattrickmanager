import { formatMatchDateTime, type MatchResult } from "@/data/dashboard";
import styles from "./Overview.module.css";

const resultClass: Record<MatchResult, string> = {
  win: styles.matchResultWin,
  draw: styles.matchResultDraw,
  loss: styles.matchResultLoss,
};

export interface RecentMatchRow {
  id: string;
  date: string;
  home: boolean;
  opponent: string;
  ourScore: number;
  oppScore: number;
  result: MatchResult;
}

export interface UpcomingMatchRow {
  id: string;
  date: string;
  home: boolean;
  opponent: string;
  competition?: string;
}

// Полное "Команда А — Команда Б" вместо сокращённого "vs Соперник"/"@
// Соперник" — по запросу; порядок отражает дом/гости, своя команда не
// выделяется жирным здесь (в отличие от вкладки "Матчи") — компактный блок
// на Обзоре, без лишнего форматирования.
function matchupLabel(home: boolean, ourTeamName: string, opponent: string): string {
  return home ? `${ourTeamName} — ${opponent}` : `${opponent} — ${ourTeamName}`;
}

export default function MatchesSection({
  ourTeamName,
  recentMatches,
  upcomingMatches,
}: {
  ourTeamName: string;
  recentMatches: RecentMatchRow[];
  upcomingMatches: UpcomingMatchRow[];
}) {
  return (
    <div className={styles.panel}>
      <div className={styles.panelTitle}>Матчи</div>
      <div className={styles.matchesCols}>
        <div>
          <div className={styles.matchesColTitle}>Уже сыграно</div>
          {recentMatches.map((m) => {
            // По запросу — только дата, без точного времени.
            const { shortDate } = formatMatchDateTime(m.date);
            return (
              <div className={styles.matchRow} key={m.id}>
                <span className={styles.matchDate}>{shortDate}</span>
                <span className={styles.matchOpponent}>{matchupLabel(m.home, ourTeamName, m.opponent)}</span>
                <span className={`${styles.matchScore} ${resultClass[m.result]}`}>
                  {m.ourScore}:{m.oppScore}
                </span>
              </div>
            );
          })}
        </div>

        <div>
          <div className={styles.matchesColTitle}>Ближайшие игры</div>
          {upcomingMatches.map((m) => {
            const { shortDate } = formatMatchDateTime(m.date);
            return (
              <div className={styles.matchRow} key={m.id}>
                <span className={styles.matchDate}>{shortDate}</span>
                <span className={styles.matchOpponent}>
                  {matchupLabel(m.home, ourTeamName, m.opponent)}
                  {m.competition ? ` · ${m.competition}` : ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
