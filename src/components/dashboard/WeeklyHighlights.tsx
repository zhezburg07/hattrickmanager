import { positionGroupLabel } from "@/data/squad";
import type { WeeklyTsiEntry } from "@/lib/playerHistoryDb";
import styles from "./Overview.module.css";

function fmtTsi(n: number): string {
  return n.toLocaleString("ru-RU");
}

function HighlightCard({ title, entry, tone }: { title: string; entry: WeeklyTsiEntry; tone: "hero" | "zero" }) {
  const isUp = entry.delta >= 0;
  return (
    <div className={`${styles.highlightCard} ${tone === "hero" ? styles.highlightHero : styles.highlightZero}`}>
      <div className={styles.highlightTitle}>{title}</div>
      <div className={styles.highlightName}>{entry.name}</div>
      <div className={styles.highlightMeta}>{positionGroupLabel[entry.positionGroup]}</div>
      <div className={styles.highlightStats}>
        <span>
          TSI {fmtTsi(entry.tsiNow)}{" "}
          <span className={isUp ? styles.trendUp : styles.trendDown}>
            {isUp ? "▲" : "▼"} {fmtTsi(Math.abs(entry.delta))}
          </span>
        </span>
      </div>
    </div>
  );
}

// Реальный расчёт по накопленной истории TSI (см. src/lib/playerHistoryDb.ts,
// resolveWeeklyTsiHighlights) — раньше здесь всегда показывались два
// захардкоженных демо-игрока с выдуманным рейтингом матча и комментарием,
// даже на подключённых реальных аккаунтах. История копится сама по себе при
// каждом визите на Состав/Расстановку — если пользователь ни разу не заходил
// туда неделю назад, сравнивать не с чем, и вместо выдумки честно показываем
// заглушку.
export default function WeeklyHighlights({
  gainer,
  loser,
  hasEnoughHistory,
}: {
  gainer: WeeklyTsiEntry | null;
  loser: WeeklyTsiEntry | null;
  hasEnoughHistory: boolean;
}) {
  return (
    <div className={styles.panel}>
      <div className={styles.panelHeadRow}>
        <div className={styles.panelTitle} style={{ margin: 0 }}>
          Герой и Ноль недели
        </div>
        <span className={styles.panelHint}>Изменение TSI за последнюю неделю</span>
      </div>
      {hasEnoughHistory && gainer && loser ? (
        <div className={styles.highlightGrid}>
          <HighlightCard title="Лучший игрок недели" entry={gainer} tone="hero" />
          <HighlightCard title="Худший игрок недели" entry={loser} tone="zero" />
        </div>
      ) : (
        <p className={styles.highlightNote}>Пока недостаточно данных для сравнения, приходите через неделю.</p>
      )}
    </div>
  );
}
