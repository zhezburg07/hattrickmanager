"use client";

import { useState } from "react";
import { squad } from "@/data/players";
import PlayerCard from "./PlayerCard";
import styles from "./FootballPitch.module.css";

export default function FootballPitch() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selectedPlayer = squad.find((p) => p.id === selectedId) ?? null;

  return (
    <div className={styles.wrapper}>
      <div className={styles.pitch}>
        <span className={styles.formationLabel}>Формация 4-4-2</span>
        <div className={styles.centerLine} />
        <div className={styles.centerCircle} />
        <div className={styles.penaltyBoxTop} />
        <div className={styles.penaltyBoxBottom} />

        {squad.map((player) => (
          <button
            key={player.id}
            type="button"
            className={`${styles.playerDot} ${player.id === selectedId ? styles.active : ""}`}
            style={{ left: `${player.x}%`, top: `${player.y}%` }}
            onClick={() => setSelectedId(player.id)}
            aria-label={`${player.name}, ${player.positionLabel}`}
          >
            <span className={styles.badge}>{player.position}</span>
            <span className={styles.name}>{player.name.split(" ")[1] ?? player.name}</span>
          </button>
        ))}
      </div>

      <PlayerCard player={selectedPlayer} />
    </div>
  );
}
