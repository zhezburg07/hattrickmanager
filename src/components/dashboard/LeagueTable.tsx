"use client";

import { useState } from "react";
import type { MatchOutcome } from "@/data/dashboard";
import { computeLeagueStandings, leagueMatrixTeams, leagueResultsMatrix, type LeagueTableMode } from "@/data/leagueMatrix";
import styles from "./Overview.module.css";

const outcomeIcon: Record<MatchOutcome, { symbol: string; cls: string; title: string }> = {
  win: { symbol: "✓", cls: styles.last5Win, title: "Победа" },
  draw: { symbol: "–", cls: styles.last5Draw, title: "Ничья" },
  loss: { symbol: "✕", cls: styles.last5Loss, title: "Поражение" },
};

type Zone = "promotion" | "playoff" | "relegation" | null;

function getZone(position: number): Zone {
  if (position === 1) return "promotion";
  if (position === 5 || position === 6) return "playoff";
  if (position === 7 || position === 8) return "relegation";
  return null;
}

const zoneClass: Record<Exclude<Zone, null>, string> = {
  promotion: styles.zonePromotion,
  playoff: styles.zonePlayoff,
  relegation: styles.zoneRelegation,
};

export interface LeagueTableRow {
  position: number;
  name: string;
  played: number;
  wins?: number;
  draws?: number;
  losses?: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  last5?: MatchOutcome[];
  isOurTeam?: boolean;
}

const modeTabs: { mode: LeagueTableMode; label: string }[] = [
  { mode: "all", label: "Все игры" },
  { mode: "home", label: "Домашние игры" },
  { mode: "away", label: "Гостевые игры" },
];

// Сетка очных результатов между всеми командами лиги — строки: команда
// дома, столбцы: команда в гостях, на пересечении — счёт "голы хозяев-голы
// гостей", как на оригинальной странице лиги в Hattrick. Диагональ пустая.
// Существует только для тестовых данных (см. showResultsMatrix в LeagueTable).
function ResultsMatrix() {
  return (
    <div className={styles.matrixWrap}>
      <table className={styles.matrixTable}>
        <thead>
          <tr>
            <th className={styles.matrixCorner} />
            {leagueMatrixTeams.map((team) => (
              <th key={team.name} className={team.isOurTeam ? styles.matrixHeadUs : undefined}>
                <a href="#" onClick={(e) => e.preventDefault()} title={team.name}>
                  {team.name}
                </a>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {leagueMatrixTeams.map((homeTeam, homeIndex) => (
            <tr key={homeTeam.name}>
              <th className={homeTeam.isOurTeam ? styles.matrixHeadUs : undefined} scope="row">
                <a href="#" onClick={(e) => e.preventDefault()} title={homeTeam.name}>
                  {homeTeam.name}
                </a>
              </th>
              {leagueMatrixTeams.map((awayTeam, awayIndex) => {
                const isDiagonal = homeIndex === awayIndex;
                const highlighted = homeTeam.isOurTeam || awayTeam.isOurTeam;
                return (
                  <td
                    key={awayTeam.name}
                    className={`${styles.matrixCell} ${highlighted ? styles.matrixCellUs : ""}`}
                  >
                    {isDiagonal ? "" : leagueResultsMatrix[homeIndex][awayIndex]}
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

export default function LeagueTable({
  rows,
  leagueName,
  showResultsMatrix,
}: {
  rows: LeagueTableRow[];
  leagueName?: string;
  showResultsMatrix?: boolean;
}) {
  const [mode, setMode] = useState<LeagueTableMode>("all");

  // Переключатель "Все/Домашние/Гостевые игры" пересчитывает таблицу из
  // сетки результатов (только для тестовых данных — CHPP не отдаёт очные
  // результаты всех команд лиги, поэтому для реальных данных showResultsMatrix
  // не передаётся, и здесь всегда используется исходный rows).
  const displayedRows: LeagueTableRow[] = showResultsMatrix ? computeLeagueStandings(mode) : rows;

  // В реальном режиме CHPP не даёт отдельно победы/ничьи/поражения и
  // "последние 5 матчей" — только общее число игр. Прячем эти столбцы,
  // если данных для них нет ни у одной строки, вместо того чтобы показывать
  // пустые ячейки.
  const hasWdl = displayedRows.some((r) => r.wins !== undefined);
  const hasLast5 = displayedRows.some((r) => r.last5 !== undefined);

  return (
    <div className={`${styles.panel} ${styles.span2}`}>
      <div className={styles.panelTitle}>{leagueName ? `Команда / ${leagueName}` : "Команда / Лига"}</div>

      {showResultsMatrix && (
        <div className={styles.modeTabs} role="tablist">
          {modeTabs.map((tab) => (
            <button
              key={tab.mode}
              type="button"
              role="tab"
              aria-selected={mode === tab.mode}
              className={`${styles.modeTab} ${mode === tab.mode ? styles.modeTabActive : ""}`}
              onClick={() => setMode(tab.mode)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      <div className={styles.denseTableWrap}>
        <table className={styles.denseTable}>
          <thead>
            <tr>
              <th>#</th>
              <th>Команда</th>
              <th style={{ textAlign: "right" }} title="Игры">
                И
              </th>
              {hasWdl && (
                <>
                  <th style={{ textAlign: "right" }} title="Выигрыши">
                    В
                  </th>
                  <th style={{ textAlign: "right" }} title="Ничьи">
                    Н
                  </th>
                  <th style={{ textAlign: "right" }} title="Поражения">
                    П
                  </th>
                </>
              )}
              <th style={{ textAlign: "right" }} title="Разница мячей">
                ±
              </th>
              <th style={{ textAlign: "right" }} title="Очки">
                О
              </th>
              {hasLast5 && <th>Ф</th>}
            </tr>
          </thead>
          <tbody>
            {displayedRows.map((row) => {
              const zone = getZone(row.position);
              const rowClass = [zone ? zoneClass[zone] : "", row.isOurTeam ? styles.rowUs : ""]
                .filter(Boolean)
                .join(" ");

              return (
                <tr key={row.position} className={rowClass}>
                  <td className={styles.posCell}>{row.position}</td>
                  <td className={styles.teamCell}>{row.name}</td>
                  <td className={styles.numCell}>{row.played}</td>
                  {hasWdl && (
                    <>
                      <td className={styles.numCell}>{row.wins}</td>
                      <td className={styles.numCell}>{row.draws}</td>
                      <td className={styles.numCell}>{row.losses}</td>
                    </>
                  )}
                  <td className={styles.numCell}>
                    {row.goalsFor - row.goalsAgainst > 0
                      ? `+${row.goalsFor - row.goalsAgainst}`
                      : row.goalsFor - row.goalsAgainst}
                  </td>
                  <td className={styles.numCell}>
                    <b>{row.points}</b>
                  </td>
                  {hasLast5 && (
                    <td>
                      <div className={styles.last5}>
                        {row.last5?.map((outcome, i) => {
                          const icon = outcomeIcon[outcome];
                          return (
                            <span key={i} className={`${styles.last5Icon} ${icon.cls}`} title={icon.title}>
                              {icon.symbol}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showResultsMatrix && (
        <>
          <div className={styles.matrixTitle}>Результаты между командами</div>
          <ResultsMatrix />
        </>
      )}
    </div>
  );
}
