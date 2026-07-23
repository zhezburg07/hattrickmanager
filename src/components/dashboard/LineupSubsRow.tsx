"use client";

import { useState } from "react";
import { subCategories } from "@/data/pitchBoard";
import type { SquadPlayer } from "@/data/squad";
import { parsePayload, serializePayload, type DragPayload } from "./dragPayload";
import styles from "./Lineup.module.css";

export default function LineupSubsRow({
  getPlayer,
  onDropSub,
  selectedPlayerId,
  onSlotClick,
}: {
  getPlayer: (index: number) => SquadPlayer | null;
  onDropSub: (index: number, payload: DragPayload) => void;
  selectedPlayerId: number | null;
  onSlotClick: (index: number) => void;
}) {
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  return (
    <div className={styles.benchStrip} title="Скамейка запасных">
      <span className={styles.benchStripTag}>Скамейка</span>

      {subCategories.map((cat, index) => {
        const player = getPlayer(index);
        const isOver = dragOverIndex === index;
        const isSelected = player !== null && player.id === selectedPlayerId;

        return (
          <div key={cat.key} className={styles.benchSlotWrap}>
            <div
              className={`${styles.benchSlot} ${isOver ? styles.slotOver : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragOverIndex !== index) setDragOverIndex(index);
              }}
              onDragLeave={() => setDragOverIndex((i) => (i === index ? null : i))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverIndex(null);
                const payload = parsePayload(e.dataTransfer.getData("text/plain"));
                if (payload) onDropSub(index, payload);
              }}
            >
              <span
                className={`${styles.slotCard} ${styles.benchCard} ${player ? styles.slotBadgeFilled : styles.slotBadgeEmpty} ${isSelected ? styles.slotBadgeSelected : ""}`}
                title={player ? `${player.name} — ${cat.label}` : cat.label}
                draggable={Boolean(player)}
                onClick={() => onSlotClick(index)}
                onDragStart={(e) => {
                  if (!player) return;
                  const payload: DragPayload = { playerId: player.id, from: "sub", index };
                  e.dataTransfer.setData("text/plain", serializePayload(payload));
                  e.dataTransfer.effectAllowed = "move";
                }}
              >
                {player ? (
                  <>
                    <span className={styles.slotCardNumber}>{player.squadNumber}</span>
                    <span className={styles.slotCardName}>{player.name.split(" ")[1] ?? player.name}</span>
                    <span className={styles.slotCardRole}>{cat.shortLabel}</span>
                  </>
                ) : (
                  cat.shortLabel
                )}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
