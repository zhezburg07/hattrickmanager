import type { Player } from "@/data/players";
import styles from "./FootballPitch.module.css";

function staminaColor(stamina: number): string {
  if (stamina >= 70) return "var(--color-good)";
  if (stamina >= 40) return "var(--color-warn)";
  return "var(--color-bad)";
}

export default function PlayerCard({ player }: { player: Player | null }) {
  if (!player) {
    return (
      <div className={styles.card}>
        <div className={styles.cardEmpty}>
          Нажмите на игрока на поле, чтобы увидеть подробности о нём
        </div>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <div className={styles.cardName}>{player.name}</div>
      <div className={styles.cardPosition}>{player.positionLabel}</div>

      <div className={styles.cardStat}>
        <div className={styles.cardStatHeader}>
          <span>Форма</span>
          <span>{player.form} / 8</span>
        </div>
        <div className={styles.formStars}>
          {Array.from({ length: 8 }).map((_, i) => (
            <span
              key={i}
              className={`${styles.star} ${i < player.form ? styles.starFilled : ""}`}
            />
          ))}
        </div>
      </div>

      <div className={styles.cardStat}>
        <div className={styles.cardStatHeader}>
          <span>Выносливость</span>
          <span>{player.stamina}%</span>
        </div>
        <div className={styles.barTrack}>
          <div
            className={styles.barFill}
            style={{
              width: `${player.stamina}%`,
              background: staminaColor(player.stamina),
            }}
          />
        </div>
      </div>
    </div>
  );
}
