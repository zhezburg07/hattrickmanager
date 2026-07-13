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

export default function MatchesSection({
  recentMatches,
  upcomingMatches,
}: {
  recentMatches: RecentMatchRow[];
  upcomingMatches: UpcomingMatchRow[];
}) {
  return (
    <div className={`${styles.panel} ${styles.span2}`}>
      <div className={styles.panelTitle}>Матчи</div>
      <div className={styles.matchesCols}>
        <div>
          <div className={styles.matchesColTitle}>Уже сыграно</div>
          {recentMatches.map((m) => {
            const { shortDate, time } = formatMatchDateTime(m.date);
            return (
              <div className={styles.matchRow} key={m.id}>
                <span className={styles.matchDate}>
                  {shortDate}
                  {time && <span className={styles.matchTime}> · {time}</span>}
                </span>
                <span className={styles.matchOpponent}>
                  {m.home ? "vs" : "@"} {m.opponent}
                </span>
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
            const { shortDate, time } = formatMatchDateTime(m.date);
            return (
              <div className={styles.matchRow} key={m.id}>
                <span className={styles.matchDate}>
                  {shortDate}
                  {time && <span className={styles.matchTime}> · {time}</span>}
                </span>
                <span className={styles.matchOpponent}>
                  {m.home ? "vs" : "@"} {m.opponent}
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
