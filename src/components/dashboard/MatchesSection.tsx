"use client";

import { useState } from "react";
import { formatMatchDateTime, type MatchResult } from "@/data/dashboard";
import type { FanExpectation } from "@/lib/fanExpectation";
import type { MatrixTeamMeta } from "@/data/leagueMatrix";
import ResultsMatrix from "./ResultsMatrix";
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
  // Индикатор ожиданий болельщиков — см. src/lib/fanExpectation.ts. Уже
  // сыгранный матч — считается на синхронизации из реального "Индекса
  // силы" (matchdetails.xml), NEUTRAL, если данные недоступны.
  fanExpectation: FanExpectation;
}

export interface UpcomingMatchRow {
  id: string;
  date: string;
  home: boolean;
  opponent: string;
  competition?: string;
  // Предстоящий матч ещё не сыгран — зональных рейтингов физически не
  // существует, поэтому здесь всегда NEUTRAL_FAN_EXPECTATION (см.
  // getStoredOverviewData в src/lib/chppSync.ts).
  fanExpectation: FanExpectation;
}

// Полное "Команда А — Команда Б" вместо сокращённого "vs Соперник"/"@
// Соперник" — по запросу; порядок отражает дом/гости, своя команда не
// выделяется жирным здесь (в отличие от вкладки "Матчи") — компактный блок
// на Обзоре, без лишнего форматирования.
function matchupLabel(home: boolean, ourTeamName: string, opponent: string): string {
  return home ? `${ourTeamName} — ${opponent}` : `${opponent} — ${ourTeamName}`;
}

// Значок индикатора ожиданий болельщиков — СВОЙ собственный расчётный
// показатель (не официальный прогноз Hattrick, см. подробный комментарий в
// src/lib/fanExpectation.ts), поэтому подсказка при наведении явно называет
// категорию словами, а не оставляет эмодзи говорить самой за себя.
function FanExpectationBadge({ expectation }: { expectation: FanExpectation }) {
  return (
    <span className={styles.fanExpectation} title={expectation.label} aria-label={expectation.label}>
      {expectation.symbol}
    </span>
  );
}

export default function MatchesSection({
  ourTeamName,
  recentMatches,
  upcomingMatches,
  matrixTeams,
  resultsMatrix,
}: {
  ourTeamName: string;
  recentMatches: RecentMatchRow[];
  upcomingMatches: UpcomingMatchRow[];
  // Есть только когда доступна сетка очных результатов лиги (см. LeagueTable.tsx)
  // — переключатель ниже показывается только если оба поля заполнены.
  matrixTeams?: MatrixTeamMeta[];
  resultsMatrix?: (string | null)[][];
}) {
  const [showMatrix, setShowMatrix] = useState(false);
  const canShowMatrix = !!matrixTeams && !!resultsMatrix;

  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <div className={styles.panelTitle} style={{ margin: 0 }}>
          Матчи
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
              // По запросу — только дата, без точного времени.
              const { shortDate } = formatMatchDateTime(m.date);
              return (
                <div className={styles.matchRow} key={m.id}>
                  <span className={styles.matchDate}>{shortDate}</span>
                  <span className={styles.matchOpponent}>{matchupLabel(m.home, ourTeamName, m.opponent)}</span>
                  <FanExpectationBadge expectation={m.fanExpectation} />
                  <span className={`${styles.matchScore} ${resultClass[m.result]}`}>
                    {m.ourScore}:{m.oppScore}
                  </span>
                </div>
              );
            })}
          </div>

          <div>
            {upcomingMatches.map((m) => {
              // Тот же .matchRow (сетка), что и у сыгранных матчей — просто
              // без 4-го элемента (счёта), чтобы название и индикатор
              // оказывались в тех же координатах по горизонтали, что и у
              // сыгранных, а не были отдельно центрированной группой (см.
              // чат "Выровнять предстоящие под сыгранными").
              const { shortDate } = formatMatchDateTime(m.date);
              return (
                <div className={styles.matchRow} key={m.id}>
                  <span className={styles.matchDate}>{shortDate}</span>
                  <span className={styles.matchOpponent}>
                    {matchupLabel(m.home, ourTeamName, m.opponent)}
                    {m.competition ? ` ${m.competition}` : ""}
                  </span>
                  <FanExpectationBadge expectation={m.fanExpectation} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
