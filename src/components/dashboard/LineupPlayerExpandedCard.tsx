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

// Разворачивающаяся карточка показателей игрока — по тройному клику на его
// строку в общем списке игроков (см. LineupPlayerList.tsx). Рендерится
// прямо в потоке страницы (под строкой в таблице), раздвигая остальные
// строки вниз — тот же приём, что уже используется в MatchesCalendar.tsx
// для разбора матча (клик по строке — разворот блока под ней), а не
// всплывающее окно. Обычный клик по строке списка выбирает игрока для
// расстановки и не имеет отношения к этой карточке.
export default function LineupPlayerExpandedCard({
  player,
  prev,
  onClose,
}: {
  player: SquadPlayer;
  prev?: PlayerStatSnapshot;
  onClose: () => void;
}) {
  return (
    <div className={styles.expandedPlayerCard}>
      <button type="button" className={styles.expandedPlayerClose} onClick={onClose} aria-label="Свернуть">
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
  );
}
