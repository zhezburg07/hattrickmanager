import type { HofPlayer } from "@/lib/hofPlayers";
import styles from "./Overview.module.css";

// Реальный Зал славы клуба (hofplayers.xml) — список игроков, которых клуб
// когда-либо ввёл в свой Зал славы. Если пусто (клуб пока никого не ввёл)
// или CHPP не ответил — честно показываем заглушку, а не выдумываем состав.
export default function HofPlayersSection({
  players,
  error,
}: {
  players: HofPlayer[] | null;
  error: string | null;
}) {
  return (
    <div className={styles.panel}>
      <div className={styles.panelHeadRow}>
        <div className={styles.panelTitle} style={{ margin: 0 }}>
          Зал славы клуба
        </div>
        <span className={styles.panelHint}>Легенды команды, введённые в Зал славы</span>
      </div>

      {error ? (
        <p className={styles.highlightNote}>{error}</p>
      ) : players && players.length > 0 ? (
        <div className={styles.denseTableWrap}>
          <table className={styles.denseTable}>
            <thead>
              <tr>
                <th>Игрок</th>
                <th style={{ textAlign: "right" }}>Возраст при вводе</th>
                <th>Дата ввода</th>
                <th>Пришёл в клуб</th>
                <th>Чем занимается сейчас</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.playerId}>
                  <td className={styles.teamCell}>{p.name}</td>
                  <td className={styles.numCell}>{p.hofAge}</td>
                  <td>{p.hofDate}</td>
                  <td>{p.arrivalDate}</td>
                  <td>{p.expertLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={styles.highlightNote}>Клуб пока не ввёл ни одного игрока в свой Зал славы.</p>
      )}
    </div>
  );
}
