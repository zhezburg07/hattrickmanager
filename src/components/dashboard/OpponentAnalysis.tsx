"use client";

import type { OpponentAnalysisResult } from "@/lib/opponentAnalysis";
import type { SquadPlayer } from "@/data/squad";
import type { Assignments } from "@/data/pitchBoard";
import { formatMatchDateTime } from "@/data/dashboard";
import { zoneLabel, type ZoneKey } from "./zoneRatings";
import { recommendLineupAgainstOpponent } from "./recommendLineup";
import ProLockOverlay from "./ProLockOverlay";
import lineupStyles from "./Lineup.module.css";
import styles from "./OpponentAnalysis.module.css";

const zoneOrder: ZoneKey[] = [
  "defenseLeft",
  "defenseCenter",
  "defenseRight",
  "midfield",
  "attackLeft",
  "attackCenter",
  "attackRight",
];

function zoneBadgeStyle(value: number): React.CSSProperties {
  const ratio = Math.max(0, Math.min(1, value / 10));
  if (ratio < 0.4) return { background: "rgba(192, 80, 63, 0.25)", color: "var(--color-bad)" };
  if (ratio < 0.65) return { background: "rgba(217, 164, 65, 0.22)", color: "var(--color-warn)" };
  return { background: "rgba(76, 175, 111, 0.22)", color: "var(--color-good)" };
}

export default function OpponentAnalysis({
  analysis,
  roster,
  onRecommendAgainstOpponent,
}: {
  analysis: OpponentAnalysisResult;
  roster: SquadPlayer[];
  onRecommendAgainstOpponent: (assignments: Assignments) => void;
}) {
  if (analysis.error) {
    return (
      <div className={lineupStyles.card}>
        <div className={lineupStyles.cardTitle}>Анализ соперника</div>
        <p className={styles.unavailable}>{analysis.error}</p>
      </div>
    );
  }

  const { shortDate } = analysis.upcomingMatchDate ? formatMatchDateTime(analysis.upcomingMatchDate) : { shortDate: "—" };
  const lastMatch = analysis.lastMatch;
  const scoreClass = lastMatch
    ? lastMatch.goalsFor > lastMatch.goalsAgainst
      ? styles.scoreWin
      : lastMatch.goalsFor < lastMatch.goalsAgainst
        ? styles.scoreLoss
        : styles.scoreDraw
    : "";

  function handleRecommendClick() {
    const assignments = recommendLineupAgainstOpponent(roster, analysis.zoneStrength.ratings);
    onRecommendAgainstOpponent(assignments);
  }

  return (
    <div className={lineupStyles.card}>
      <div className={lineupStyles.cardTitle}>Анализ соперника</div>

      <div className={styles.summaryRow}>
        <div>
          <div className={styles.opponentName}>{analysis.opponentTeamName ?? "—"}</div>
          <div className={styles.metaLine}>Ближайший матч: {shortDate}</div>
        </div>

        <div className={styles.statPill}>
          <span className={styles.statLabel}>Формация</span>
          <span className={styles.statValue}>{analysis.formation ?? "недоступно"}</span>
        </div>

        <div className={styles.statPill}>
          <span className={styles.statLabel}>Тактика</span>
          <span className={styles.statValue}>{lastMatch?.tacticLabel ?? "недоступно"}</span>
        </div>

        <div className={styles.statPill}>
          <span className={styles.statLabel}>Соперник в последней игре</span>
          {lastMatch ? (
            <span className={`${styles.scoreLine} ${scoreClass}`}>
              {lastMatch.goalsFor}:{lastMatch.goalsAgainst} ({lastMatch.isHome ? "дома" : "в гостях"})
            </span>
          ) : (
            <span className={styles.unavailable}>{analysis.lastMatchUnavailableReason ?? "недоступно"}</span>
          )}
        </div>
      </div>

      {analysis.zoneStrength.available ? (
        <>
          <div className={styles.zoneGrid}>
            {zoneOrder
              .filter((zone) => analysis.zoneStrength.ratings[zone] !== undefined)
              .map((zone) => {
                const value = analysis.zoneStrength.ratings[zone]!;
                return (
                  <div className={styles.zoneRow} key={zone}>
                    <span className={styles.zoneRowLabel}>{zoneLabel[zone]}</span>
                    <span className={styles.zoneRowValue} style={zoneBadgeStyle(value)}>
                      {value.toFixed(1)}
                    </span>
                  </div>
                );
              })}
          </div>
          <p className={styles.disclaimer}>
            ⚠ Разбивка по зонам построена по неподтверждённому сопоставлению позиций игроков — Hattrick не
            документирует эти коды официально, точность не гарантирована.
          </p>
        </>
      ) : (
        <p className={styles.unavailable}>
          {analysis.zoneStrength.unavailableReason ?? "Зональная разбивка соперника недоступна."}
        </p>
      )}

      <div className={styles.recommendSection}>
        <p className={styles.recommendPreview}>
          {analysis.zoneStrength.available
            ? "Подбирает состав с приоритетом на слабые зоны соперника."
            : "Данные о зонах соперника недоступны — рекомендация будет такой же, как обычный автоподбор."}
        </p>
        <ProLockOverlay
          title="Рекомендовать состав против этого соперника"
          description="Доступно на тарифе Pro — автоподбор состава с учётом слабых зон конкретного соперника."
        >
          <button type="button" className={lineupStyles.pitchHeaderBtn} onClick={handleRecommendClick}>
            Рекомендовать состав против этого соперника
          </button>
        </ProLockOverlay>
      </div>
    </div>
  );
}
