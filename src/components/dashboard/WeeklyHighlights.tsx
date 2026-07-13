import { squadPlayers, positionGroupLabel } from "@/data/squad";
import { heroOfWeek, zeroOfWeek, type WeeklyHighlight } from "@/data/dashboard";
import styles from "./Overview.module.css";

function Trend({ delta, format }: { delta: number; format: (v: number) => string }) {
  if (delta === 0) return <span className={styles.trendFlat}>—</span>;
  return delta > 0 ? (
    <span className={styles.trendUp}>▲ {format(delta)}</span>
  ) : (
    <span className={styles.trendDown}>▼ {format(-delta)}</span>
  );
}

function HighlightCard({
  title,
  highlight,
  tone,
}: {
  title: string;
  highlight: WeeklyHighlight;
  tone: "hero" | "zero";
}) {
  const player = squadPlayers.find((p) => p.id === highlight.playerId);
  if (!player) return null;

  const formDelta = player.form - highlight.prevForm;
  const tsiDelta = player.tsi - highlight.prevTsi;

  return (
    <div className={`${styles.highlightCard} ${tone === "hero" ? styles.highlightHero : styles.highlightZero}`}>
      <div className={styles.highlightTitle}>{title}</div>
      <div className={styles.highlightName}>{player.name}</div>
      <div className={styles.highlightMeta}>
        {positionGroupLabel[player.positionGroup]} · Рейтинг матча <b>{highlight.rating.toFixed(1)}</b>
      </div>
      <div className={styles.highlightStats}>
        <span>
          Форма {player.form}
          <Trend delta={formDelta} format={(v) => v.toFixed(0)} />
        </span>
        <span>
          TSI {player.tsi.toLocaleString("ru-RU")}
          <Trend delta={tsiDelta} format={(v) => v.toLocaleString("ru-RU")} />
        </span>
      </div>
      <p className={styles.highlightNote}>{highlight.note}</p>
    </div>
  );
}

export default function WeeklyHighlights() {
  return (
    <div className={styles.panel}>
      <div className={styles.panelHeadRow}>
        <div className={styles.panelTitle} style={{ margin: 0 }}>
          Герой и Ноль недели
        </div>
        <span className={styles.panelHint}>Сравнение показателей относительно прошлой недели</span>
      </div>
      <div className={styles.highlightGrid}>
        <HighlightCard title="Лучший игрок недели" highlight={heroOfWeek} tone="hero" />
        <HighlightCard title="Худший игрок недели" highlight={zeroOfWeek} tone="zero" />
      </div>
    </div>
  );
}
