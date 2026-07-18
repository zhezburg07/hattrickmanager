import { positionGroupLabel } from "@/data/squad";
import type { WeeklyTsiEntry } from "@/lib/playerHistoryDb";
import styles from "./Overview.module.css";

function fmtTsi(n: number): string {
  return n.toLocaleString("ru-RU");
}

function HighlightCard({ title, entry }: { title: string; entry: WeeklyTsiEntry }) {
  const isUp = entry.delta >= 0;
  return (
    <div className={`${styles.highlightCard} ${styles.highlightHero}`}>
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
//
// По запросу оставлен только лучший игрок недели ("Ноль недели"/худший
// игрок убран из блока — см. git-историю, если понадобится вернуть).
export default function WeeklyHighlights({
  gainer,
  hasEnoughHistory,
}: {
  gainer: WeeklyTsiEntry | null;
  hasEnoughHistory: boolean;
}) {
  return (
    <div className={styles.panel}>
      <div className={styles.panelHeadRow}>
        <div className={styles.panelTitle} style={{ margin: 0 }}>
          Герой недели
        </div>
        <span className={styles.panelHint}>Изменение TSI за последнюю неделю</span>
      </div>
      {hasEnoughHistory && gainer ? (
        <div className={styles.highlightGrid} style={{ gridTemplateColumns: "1fr", maxWidth: 280 }}>
          <HighlightCard title="Лучший игрок недели" entry={gainer} />
        </div>
      ) : (
        <p className={styles.highlightNote}>Пока недостаточно данных для сравнения, приходите через неделю.</p>
      )}
    </div>
  );
}
