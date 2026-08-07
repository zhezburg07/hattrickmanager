"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { positionGroupLabel, skillLabel, skillWord } from "@/data/squad";
import type { RealYouthPlayer } from "@/lib/youthPlayers";
import NationalityTag from "./NationalityTag";
import styles from "./PlayerDetailModal.module.css";

const skillKeys: (keyof RealYouthPlayer["skills"])[] = [
  "goalkeeping",
  "defending",
  "midfield",
  "winger",
  "passing",
  "scoring",
  "setPieces",
];

function AvatarIcon() {
  return (
    <svg className={styles.avatar} viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
      <circle cx="32" cy="32" r="31" fill="var(--color-bg-darker)" stroke="var(--color-border)" strokeWidth="1.5" />
      <circle cx="32" cy="25" r="11" fill="var(--color-text-muted)" opacity="0.45" />
      <path d="M9 57c0-13.3 10.1-22 23-22s23 8.7 23 22" fill="var(--color-text-muted)" opacity="0.45" />
    </svg>
  );
}

// Карточка юношеского игрока — youthplayerlist.xml (общий список, уже
// используется на вкладке "Юношеская команда") даёт только базовые поля;
// подробности (дата прихода, срок до перевода в основу, карьерная
// статистика, слова скаута, последний матч) — из отдельного файла
// youthplayerdetails.xml, но теперь запрошенного ЗАРАНЕЕ, во время
// синхронизации, на каждого игрока академии сразу (см. chppSync.ts) — сама
// карточка больше не делает живой запрос по клику, просто показывает уже
// готовый player.details.
export default function YouthPlayerDetailModal({
  player,
  onClose,
}: {
  player: RealYouthPlayer;
  onClose: () => void;
}) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const details = player.details;

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Закрыть">
          ×
        </button>

        <div className={styles.head}>
          <AvatarIcon />
          <div className={styles.headInfo}>
            <div className={styles.nameRow}>
              <span className={styles.name}>{player.name}</span>
            </div>
            <div className={styles.headMeta}>
              <NationalityTag nationality={player.nationality} />
              <span>{player.age} лет</span>
              <span>{positionGroupLabel[player.positionGroup]}</span>
            </div>
          </div>
        </div>

        <div className={styles.skills}>
          {skillKeys.map((k) => (
            <div className={styles.skillRow} key={k} title={skillWord(player.skills[k])}>
              <span className={styles.skillLabel}>{skillLabel[k]}</span>
              <span className={styles.skillWordText}>{player.skills[k]}</span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--color-border)", fontSize: 12, lineHeight: 1.6 }}>
          {!details && <span style={{ color: "var(--color-text-muted)" }}>Подробности недоступны для этого игрока.</span>}
          {details && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div>
                Пришёл в академию: <b>{details.arrivalDate || "неизвестно"}</b>
              </div>
              <div>
                {details.canBePromotedIn > 0 ? (
                  <>
                    Может быть переведён в основу через: <b>{details.canBePromotedIn} дн.</b>
                  </>
                ) : (
                  <>Готов к переводу в основную команду</>
                )}
              </div>
              <div>
                Голы за карьеру: <b>{details.careerGoals}</b> (лига {details.leagueGoals}, товарищеские{" "}
                {details.friendlyGoals}), хет-триков — <b>{details.careerHattricks}</b>
              </div>
              {details.lastMatchDate && (
                <div>
                  Последний матч: <b>{details.lastMatchDate}</b>
                  {details.lastMatchRating !== null ? `, рейтинг ${details.lastMatchRating.toFixed(1)}` : ""}
                </div>
              )}
              {details.statement && <div>Высказывание игрока: «{details.statement}»</div>}
              {details.scoutComments.length > 0 && (
                <div>
                  Слова скаута{details.scoutName ? ` (${details.scoutName})` : ""}:
                  <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                    {details.scoutComments.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
