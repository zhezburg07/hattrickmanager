"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  positionGroupLabel,
  statusLabel,
  skillLabel,
  skillWordWithLevel,
  formWord,
  type SquadPlayer,
  type SquadSkills,
  type PlayerStatSnapshot,
} from "@/data/squad";
import NationalityTag from "./NationalityTag";
import { diffDirection, diffTitle } from "./playerStatChanges";
import styles from "./Lineup.module.css";
import squadStyles from "./SquadTable.module.css";
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

function StatusTag({ status }: { status: SquadPlayer["status"] }) {
  const cls =
    status === "starting"
      ? squadStyles.statusStarting
      : status === "bench" || status === "squad"
        ? squadStyles.statusBench
        : squadStyles.statusInjured;
  return (
    <span className={`${squadStyles.statusTag} ${cls}`}>
      <span className={squadStyles.statusDot} />
      {statusLabel[status]}
    </span>
  );
}

const POPUP_WIDTH = 260;
const MARGIN = 10;
const ESTIMATED_HEIGHT = 340;

// Всплывающая карточка показателей игрока прямо у его позиции на поле — тот
// же принцип, что и у маркеров рейтинга на поле разбора матча (вкладка
// "Матчи"), только здесь ещё и с реальным клиентским позиционированием, а
// не просто % от поля: карточка привязана к настоящему DOM-элементу слота
// (anchorEl), а не к слоту поля напрямую, чтобы не зависеть от overflow:
// hidden у .pitch (см. LineupField.tsx) — рендерится порталом в
// document.body, как и остальные модалки/карточки игроков в проекте
// (PlayerDetailModal, YouthPlayerDetailModal). Раньше показатели игрока при
// клике на поле уходили в постоянную боковую панель (LineupPlayerDetails) —
// она осталась только для игроков в запасе/общем списке, у которых нет
// позиции на поле, к которой можно привязаться (см. LineupBoard.tsx).
export default function LineupPlayerStatsPopup({
  player,
  prev,
  anchorEl,
  onClose,
}: {
  player: SquadPlayer;
  prev?: PlayerStatSnapshot;
  anchorEl: HTMLElement | null;
  onClose: () => void;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchorEl) {
      setPos(null);
      return;
    }
    function updatePosition() {
      const rect = anchorEl!.getBoundingClientRect();
      let left = rect.left + rect.width / 2 - POPUP_WIDTH / 2;
      left = Math.max(MARGIN, Math.min(left, window.innerWidth - POPUP_WIDTH - MARGIN));

      let top = rect.bottom + 8;
      if (top + ESTIMATED_HEIGHT > window.innerHeight - MARGIN) {
        // Снизу не помещается — показываем над игроком вместо под ним.
        top = Math.max(MARGIN, rect.top - ESTIMATED_HEIGHT - 8);
      }
      setPos({ top, left });
    }
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorEl]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  if (!pos) return null;

  return createPortal(
    <>
      <div className={styles.statsPopupBackdrop} onClick={onClose} />
      <div
        className={styles.statsPopupCard}
        style={{ top: pos.top, left: pos.left, width: POPUP_WIDTH }}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className={styles.statsPopupClose} onClick={onClose} aria-label="Закрыть">
          ×
        </button>

        <div className={squadStyles.playerCardHead}>
          <span className={squadStyles.playerCardName}>{player.name}</span>
          <StatusTag status={player.status} />
        </div>

        <div className={squadStyles.playerCardMeta}>
          <NationalityTag nationality={player.nationality} />
          <span>{positionGroupLabel[player.positionGroup]}</span>
          <span>
            <b>{player.age}</b> лет
          </span>
          <span
            className={diffClass(diffDirection(player.form, prev?.form))}
            title={diffTitle("Форма", prev?.form, player.form)}
          >
            Форма <b>{formWord(player.form)}</b>
          </span>
          <span
            className={diffClass(diffDirection(player.stamina, prev?.stamina))}
            title={diffTitle("Выносливость", prev?.stamina, player.stamina, (n) => `${n}%`)}
          >
            Вын-ть <b>{player.stamina}%</b>
          </span>
        </div>

        <div className={squadStyles.playerCardSkills}>
          {skillKeys.map((k) => (
            <div
              className={`${squadStyles.playerCardSkillRow} ${diffClass(diffDirection(player.skills[k], prev?.skills[k]))}`}
              key={k}
              title={diffTitle(skillLabel[k], prev?.skills[k], player.skills[k])}
            >
              <span className={squadStyles.playerCardSkillLabel}>{skillLabel[k]}</span>
              <span className={squadStyles.playerCardSkillValue}>{skillWordWithLevel(player.skills[k])}</span>
            </div>
          ))}
        </div>
      </div>
    </>,
    document.body,
  );
}
