import type { WeeklyTsiEntry } from "@/lib/playerHistoryDb";
import { positionGroupLabel } from "@/data/squad";
import styles from "./Overview.module.css";

function fmt(n: number): string {
  return n.toLocaleString("ru-RU");
}

// Процент изменения — отношение изменения к ТЕКУЩЕМУ (итоговому) TSI
// игрока, не к прошлому недельному значению (по запросу). toFixed вместо
// toLocaleString — ru-RU даёт запятую как разделитель дробной части
// ("8,2"), а нужна точка ("8.2"), как в примере формата.
function fmtPercent(delta: number, tsiNow: number): string {
  if (!tsiNow) return "0.0";
  return Math.abs((delta / tsiNow) * 100).toFixed(1);
}

function TsiRow({ entry }: { entry: WeeklyTsiEntry }) {
  const isUp = entry.delta >= 0;
  const sign = isUp ? "+" : "−";
  return (
    <div className={styles.tsiRow}>
      <div className={styles.tsiRowTop}>
        <span className={styles.tsiName}>{entry.name}</span>
        <span className={isUp ? styles.tsiUp : styles.tsiDown}>
          <span className={styles.tsiPercent}>
            {sign}
            {fmtPercent(entry.delta, entry.tsiNow)}%
          </span>{" "}
          {isUp ? "▲" : "▼"} {sign}
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
            <div className={styles.matchesColTitle}>Топ-8 прогресса</div>
            {topGainers.map((entry) => (
              <TsiRow key={entry.playerId} entry={entry} />
            ))}
          </div>

          <div>
            <div className={styles.matchesColTitle}>Топ-8 регресса</div>
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
