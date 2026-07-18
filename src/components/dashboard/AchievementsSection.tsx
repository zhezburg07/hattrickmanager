import type { AchievementsResult } from "@/lib/achievements";
import styles from "./Overview.module.css";

// Реальные достижения менеджера (achievements.xml) — по запросу упрощено
// до одной строки с общим количеством очков, без развёрнутой витрины
// (см. git-историю, если понадобится вернуть полный список).
export default function AchievementsSection({
  data,
  error,
}: {
  data: AchievementsResult | null;
  error: string | null;
}) {
  return (
    <div className={styles.panel}>
      <div className={styles.panelHeadRow}>
        <div className={styles.panelTitle} style={{ margin: 0 }}>
          Достижения менеджера
        </div>
      </div>

      {error ? (
        <p className={styles.highlightNote}>{error}</p>
      ) : data ? (
        <p className={styles.highlightNote} style={{ marginTop: 0 }}>
          Очков всего: <b style={{ color: "var(--color-text)" }}>{data.maxPoints}</b>
        </p>
      ) : (
        <p className={styles.highlightNote}>Достижений пока нет.</p>
      )}
    </div>
  );
}
