"use client";

import { useState } from "react";
import { formatMatchDateTime, type MatchResult } from "@/data/dashboard";
import type { MatrixTeamMeta } from "@/data/leagueMatrix";
import ResultsMatrix from "./ResultsMatrix";
import styles from "./Overview.module.css";

const resultClass: Record<MatchResult, string> = {
  win: styles.matchResultWin,
  draw: styles.matchResultDraw,
  loss: styles.matchResultLoss,
};

// Урезанный вариант RecentMatchRow/UpcomingMatchRow (см. MatchesSection.tsx)
// — БЕЗ fanExpectation: тот индикатор считается по "Индексу силы" соперника
// (matchdetails.xml/собственный расчёт, см. src/lib/fanExpectation.ts),
// который никогда не запрашивается для соперников по юношеской лиге — плоское
// заполнение NEUTRAL на каждый матч выглядело бы как настоящие данные, но
// таковыми не является.
export interface YouthMatchRow {
  id: string;
  date: string;
  home: boolean;
  opponent: string;
  // Есть только у уже сыгранных матчей.
  ourScore?: number;
  oppScore?: number;
  result?: MatchResult;
}

function matchupLabel(home: boolean, ourTeamName: string, opponent: string): string {
  return home ? `${ourTeamName} — ${opponent}` : `${opponent} — ${ourTeamName}`;
}

export default function YouthMatchesSection({
  ourTeamName,
  recentMatches,
  upcomingMatches,
  matrixTeams,
  resultsMatrix,
}: {
  ourTeamName: string;
  recentMatches: YouthMatchRow[];
  upcomingMatches: YouthMatchRow[];
  // Есть только когда доступна сетка очных результатов юношеской лиги (см.
  // LeagueTable.tsx/realLeagueMatrix.ts) — переключатель ниже показывается
  // только если оба поля заполнены.
  matrixTeams?: MatrixTeamMeta[];
  resultsMatrix?: (string | null)[][];
}) {
  const [showMatrix, setShowMatrix] = useState(false);
  const canShowMatrix = !!matrixTeams && !!resultsMatrix;

  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <div className={styles.panelTitle} style={{ margin: 0 }}>
          Матчи юношеской лиги
        </div>
        {canShowMatrix && (
          <button
            type="button"
            className={`${styles.modeTab} ${showMatrix ? styles.modeTabActive : ""}`}
            onClick={() => setShowMatrix((v) => !v)}
            title="Результаты между командами"
          >
            {showMatrix ? "Список матчей" : "Результаты между командами"}
          </button>
        )}
      </div>

      {showMatrix && matrixTeams && resultsMatrix ? (
        <ResultsMatrix teams={matrixTeams} matrix={resultsMatrix} />
      ) : (
        <div className={styles.matchesCols}>
          <div>
            {recentMatches.map((m) => {
              const { shortDate } = formatMatchDateTime(m.date);
              return (
                <div className={styles.matchRow} key={m.id}>
                  <span className={styles.matchDate}>{shortDate}</span>
                  <span className={styles.matchOpponent}>{matchupLabel(m.home, ourTeamName, m.opponent)}</span>
                  {/* Пустой placeholder — держит ту же 4-колоночную сетку
                      .matchRow (78px/1fr/48px/1fr), что и MatchesSection.tsx:
                      у юношей нет данных для 3-й колонки (индикатор ожиданий
                      болельщиков, см. комментарий у YouthMatchRow выше), но
                      без неё счёт съехал бы в узкую 48px-колонку вместо
                      широкой 1fr. */}
                  <span aria-hidden="true" />
                  <span className={`${styles.matchScore} ${m.result ? resultClass[m.result] : ""}`}>
                    {/* ИСПРАВЛЕНО (см. чат "Расхождение в счёте: Inner Focus
                        Club — Zhezburg 4:3") — унаследовано при копировании
                        с MatchesSection.tsx, тот же приём, что и в
                        MatchDetailAnalysis.tsx. */}
                    {m.home ? `${m.ourScore}:${m.oppScore}` : `${m.oppScore}:${m.ourScore}`}
                  </span>
                </div>
              );
            })}
          </div>

          <div>
            {upcomingMatches.map((m) => {
              const { shortDate } = formatMatchDateTime(m.date);
              return (
                <div className={styles.matchRow} key={m.id}>
                  <span className={styles.matchDate}>{shortDate}</span>
                  <span className={styles.matchOpponent}>{matchupLabel(m.home, ourTeamName, m.opponent)}</span>
                  <span aria-hidden="true" />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
