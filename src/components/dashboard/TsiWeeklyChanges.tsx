import type { WeeklyTsiEntry } from "@/lib/playerHistoryDb";
import { positionGroupLabel } from "@/data/squad";
import styles from "./Overview.module.css";

function fmt(n: number): string {
  return n.toLocaleString("ru-RU");
}

function TsiRow({ entry }: { entry: WeeklyTsiEntry }) {
  const isUp = entry.delta >= 0;
  return (
    <div className={styles.tsiRow}>
      <div className={styles.tsiRowTop}>
        <span className={styles.tsiName}>{entry.name}</span>
        <span className={isUp ? styles.tsiUp : styles.tsiDown}>
          {isUp ? "▲" : "▼"} {isUp ? "+" : "−"}
          {fmt(Math.abs(entry.delta))}
        </span>
      </div>
      <div className={styles.tsiRowSub}>
        {positionGroupLabel[entry.positionGroup]} · {fmt(entry.tsiWeekAgo)} → {fmt(entry.tsiNow)}
      </div>
    </div>
  );
}

// Реальный расчёт по накопленной истории TSI (см.
// src/lib/playerHistoryDb.ts, resolveWeeklyTsiHighlights) — раньше здесь
// всегда пересчитывался топ-3 из демо-состава, даже на реальном аккаунте.
export default function TsiWeeklyChanges({
  topGainers,
  topLosers,
  hasEnoughHistory,
}: {
  topGainers: WeeklyTsiEntry[];
  topLosers: WeeklyTsiEntry[];
  hasEnoughHistory: boolean;
}) {
  return (
    <div className={`${styles.panel} ${styles.span3}`}>
      <div className={styles.panelHeadRow}>
        <div className={styles.panelTitle} style={{ margin: 0 }}>
          Изменения TSI
        </div>
        <span className={styles.panelHint}>Изменения за последнюю неделю</span>
      </div>

      {hasEnoughHistory ? (
        <div className={styles.tsiCols}>
          <div>
            <div className={styles.matchesColTitle}>Топ-3 прогресса</div>
            {topGainers.map((entry) => (
              <TsiRow key={entry.playerId} entry={entry} />
            ))}
          </div>

          <div>
            <div className={styles.matchesColTitle}>Топ-3 регресса</div>
            {topLosers.map((entry) => (
              <TsiRow key={entry.playerId} entry={entry} />
            ))}
          </div>
        </div>
      ) : (
        <p className={styles.panelHint}>Пока недостаточно данных для сравнения, приходите через неделю.</p>
      )}
    </div>
  );
}
