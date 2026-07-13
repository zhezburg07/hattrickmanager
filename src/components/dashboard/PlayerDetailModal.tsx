"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import {
  positionGroupLabel,
  skillLabel,
  skillWord,
  formWord,
  staminaWord,
  leadershipWord,
  levelWord,
  type SquadPlayer,
  type SquadSkills,
  type PositionGroup,
  type PlayerStatSnapshot,
} from "@/data/squad";
import { lastDataUpdate } from "@/data/dashboard";
import NationalityTag from "./NationalityTag";
import { diffDirection, diffTitle } from "./playerStatChanges";
import styles from "./PlayerDetailModal.module.css";
import diffStyles from "./StatDiff.module.css";

function diffClass(dir: "up" | "down" | "none"): string {
  return dir === "up" ? diffStyles.statUp : dir === "down" ? diffStyles.statDown : "";
}

const skillKeys: (keyof SquadSkills)[] = [
  "goalkeeping",
  "defending",
  "midfield",
  "winger",
  "passing",
  "scoring",
  "setPieces",
];

function formatSalary(value: number): string {
  return `${value.toLocaleString("ru-RU")} ₸`;
}

// Русское склонение по числу (1 год / 2-4 года / 5+ лет)
function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

// Условный рейтинг игрока звёздами (1-5), в духе рейтинга матча — считается
// по главному навыку его амплуа
const mainSkillByGroup: Record<PositionGroup, keyof SquadSkills> = {
  GK: "goalkeeping",
  DEF: "defending",
  MID: "midfield",
  FWD: "scoring",
};

function starRating(player: SquadPlayer): number {
  const level = player.skills[mainSkillByGroup[player.positionGroup]];
  return Math.max(1, Math.min(5, Math.round((level / 20) * 5)));
}

function Stars({ count }: { count: number }) {
  return (
    <span className={styles.stars} aria-label={`Рейтинг ${count} из 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < count ? styles.starFilled : styles.starEmpty}>
          ★
        </span>
      ))}
    </span>
  );
}

function SkillBar({ level }: { level: number }) {
  const segments = 10;
  const filled = Math.round((level / 20) * segments);
  return (
    <span className={styles.skillBar}>
      {Array.from({ length: segments }, (_, i) => (
        <span key={i} className={i < filled ? styles.skillSegmentFilled : styles.skillSegmentEmpty} />
      ))}
    </span>
  );
}

// Простая иконка-силуэт вместо фото игрока
function AvatarIcon() {
  return (
    <svg className={styles.avatar} viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
      <circle cx="32" cy="32" r="31" fill="var(--color-bg-darker)" stroke="var(--color-border)" strokeWidth="1.5" />
      <circle cx="32" cy="25" r="11" fill="var(--color-text-muted)" opacity="0.45" />
      <path d="M9 57c0-13.3 10.1-22 23-22s23 8.7 23 22" fill="var(--color-text-muted)" opacity="0.45" />
    </svg>
  );
}

export default function PlayerDetailModal({
  player,
  prev,
  onClose,
}: {
  player: SquadPlayer;
  prev?: PlayerStatSnapshot;
  onClose: () => void;
}) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

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
              <span className={styles.number}>{player.squadNumber}</span>
              <span className={styles.name}>{player.name}</span>
            </div>

            <div className={styles.headMeta}>
              <NationalityTag nationality={player.nationality} />
              <span>
                {player.age} {pluralize(player.age, "год", "года", "лет")} и {player.ageDays}{" "}
                {pluralize(player.ageDays, "день", "дня", "дней")}
              </span>
            </div>

            <div className={styles.headStats}>
              <span
                className={diffClass(diffDirection(player.tsi, prev?.tsi))}
                title={diffTitle("TSI", prev?.tsi, player.tsi, (n) => n.toLocaleString("ru-RU"))}
              >
                TSI <b>{player.tsi.toLocaleString("ru-RU")}</b>
              </span>
              <span>
                Зарплата <b>{formatSalary(player.salary)}</b> / неделю
              </span>
            </div>
          </div>
        </div>

        <div className={styles.infoRows}>
          <div className={styles.infoRow}>
            <span
              className={diffClass(diffDirection(player.form, prev?.form))}
              title={diffTitle("Форма", prev?.form, player.form)}
            >
              Форма: <b>{formWord(player.form)}</b>
            </span>
            <span
              className={diffClass(diffDirection(player.stamina, prev?.stamina))}
              title={diffTitle("Выносливость", prev?.stamina, player.stamina, (n) => `${n}%`)}
            >
              Выносливость: <b>{staminaWord(player.stamina)}</b>
            </span>
          </div>
          <div className={styles.infoRow}>
            <span
              className={diffClass(diffDirection(player.experience, prev?.experience))}
              title={diffTitle("Опыт", prev?.experience, player.experience)}
            >
              Опыт: <b>{levelWord(player.experience)}</b>
            </span>
            <span>
              Лидерские качества: <b>{leadershipWord(player.leadership)}</b>
            </span>
          </div>
          {player.loyalty !== undefined && (
            <div className={styles.infoRow}>
              <span>
                Преданность клубу: <b>{levelWord(player.loyalty)}</b>
              </span>
            </div>
          )}
        </div>

        <div className={styles.skills}>
          {skillKeys.map((k) => (
            <div
              className={`${styles.skillRow} ${diffClass(diffDirection(player.skills[k], prev?.skills[k]))}`}
              key={k}
              title={diffTitle(skillLabel[k], prev?.skills[k], player.skills[k])}
            >
              <span className={styles.skillLabel}>{skillLabel[k]}</span>
              <SkillBar level={player.skills[k]} />
              <span className={styles.skillWordText}>{skillWord(player.skills[k])}</span>
            </div>
          ))}
        </div>

        <div className={styles.footer}>
          <span>Обновлено: {lastDataUpdate}</span>
          <span>
            <Stars count={starRating(player)} /> ({positionGroupLabel[player.positionGroup]})
          </span>
        </div>

        <div className={styles.career}>
          {player.gamesPlayed !== undefined && (
            <span>
              Игр за клуб: <b>{player.gamesPlayed}</b>
            </span>
          )}
          <span>
            Голов за клуб: <b>{player.goalsScored}</b>
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
