import { squadPlayers, positionGroupLabel, type SquadPlayer } from "@/data/squad";
import { currentWeek } from "@/data/dashboard";
import styles from "./Overview.module.css";

function fmt(n: number): string {
  return n.toLocaleString("ru-RU");
}

function TsiRow({ player, delta }: { player: SquadPlayer; delta: number }) {
  const isUp = delta >= 0;
  return (
    <div className={styles.tsiRow}>
      <div className={styles.tsiRowTop}>
        <span className={styles.tsiName}>{player.name}</span>
        <span className={isUp ? styles.tsiUp : styles.tsiDown}>
          {isUp ? "▲" : "▼"} {isUp ? "+" : "−"}
          {fmt(Math.abs(delta))}
        </span>
      </div>
      <div className={styles.tsiRowSub}>
        {positionGroupLabel[player.positionGroup]} · {fmt(player.prev?.tsi ?? player.tsi)} → {fmt(player.tsi)}
      </div>
    </div>
  );
}

export default function TsiWeeklyChanges() {
  const withDelta = squadPlayers.map((p) => ({ player: p, delta: p.tsi - (p.prev?.tsi ?? p.tsi) }));
  const gainers = [...withDelta].sort((a, b) => b.delta - a.delta).slice(0, 3);
  const losers = [...withDelta].sort((a, b) => a.delta - b.delta).slice(0, 3);

  return (
    <div className={`${styles.panel} ${styles.span3}`}>
      <div className={styles.panelHeadRow}>
        <div className={styles.panelTitle} style={{ margin: 0 }}>
          Изменения TSI
        </div>
        <span className={styles.panelHint}>Изменения за неделю {currentWeek}</span>
      </div>

      <div className={styles.tsiCols}>
        <div>
          <div className={styles.matchesColTitle}>Топ-3 прогресса</div>
          {gainers.map(({ player, delta }) => (
            <TsiRow key={player.id} player={player} delta={delta} />
          ))}
        </div>

        <div>
          <div className={styles.matchesColTitle}>Топ-3 регресса</div>
          {losers.map(({ player, delta }) => (
            <TsiRow key={player.id} player={player} delta={delta} />
          ))}
        </div>
      </div>
    </div>
  );
}
