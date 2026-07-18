import type { AchievementsResult } from "@/lib/achievements";
import styles from "./Overview.module.css";

// Реальные достижения менеджера (achievements.xml) — заголовок и описание
// каждого достижения приходят готовым текстом от самого Hattrick, здесь
// только переведена категория (CategoryID) и добавлено оформление.
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
        {data && <span className={styles.panelHint}>Очков всего: {data.maxPoints}</span>}
      </div>

      {error ? (
        <p className={styles.highlightNote}>{error}</p>
      ) : data && data.achievements.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {data.achievements.map((a) => (
            <div key={a.id} className={styles.highlightCard} style={{ flex: "1 1 260px", minWidth: 240 }}>
              <div className={styles.highlightTitle}>{a.categoryLabel}</div>
              <div className={styles.highlightName}>{a.title}</div>
              {a.text && <div className={styles.highlightMeta}>{a.text}</div>}
              <div className={styles.highlightStats} style={{ marginTop: 8 }}>
                <span>{a.points} очк.</span>
                {a.rank > 0 && <span>Ранг {a.rank}</span>}
                {a.eventDate && <span>{a.eventDate}</span>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className={styles.highlightNote}>Достижений пока нет.</p>
      )}
    </div>
  );
}
