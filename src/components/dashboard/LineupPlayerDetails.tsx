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

export default function LineupPlayerDetails({
  player,
  prev,
}: {
  player: SquadPlayer | null;
  prev?: PlayerStatSnapshot;
}) {
  // Раньше здесь стоял пустой блок с подсказкой "Нажмите на игрока на поле
  // ...", когда игрок не выбран — по запросу текст убран (см. чат "Убрать
  // пояснительные тексты-инструкции"), а вместе с ним и сама карточка:
  // пустая карточка с одним заголовком "Игрок" без текста выглядела бы как
  // недорисованный интерфейс, а не как понятный пустой стейт.
  if (!player) return null;

  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>Игрок</div>

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
