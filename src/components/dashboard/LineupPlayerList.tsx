"use client";

import { useMemo, useRef, useState } from "react";
import {
  positionGroupShort,
  positionGroupAccentColor,
  skillLabel,
  skillWord,
  formWord,
  staminaToLevel,
  playerBadgeCode,
  type SquadPlayer,
  type SquadSkills,
  type PlayerStatSnapshot,
} from "@/data/squad";
import { usePositionOverrides, effectivePositionGroup, type PositionOverrides } from "@/data/positionOverrides";
import { parsePayload, serializePayload, type DragPayload } from "./dragPayload";
import { diffDirection, diffTitle } from "./playerStatChanges";
import FlagIcon from "./FlagIcon";
import HeartIcon from "./HeartIcon";
import styles from "./Lineup.module.css";
import diffStyles from "./StatDiff.module.css";

function diffClass(dir: "up" | "down" | "none"): string {
  return dir === "up" ? diffStyles.statUp : dir === "down" ? diffStyles.statDown : "";
}

// Цветовая метка амплуа перед именем — та же акцентная полоска, что и на
// карточках игроков на поле и в таблице "Состав". Цвет берётся из
// эффективного амплуа (ручное переопределение, если оно задано, иначе
// естественная позиция) — зависит только от самого игрока, а не от того,
// где он сейчас числится (на поле/на скамейке/в общем списке).
function AmpluaAccent({ player, overrides }: { player: SquadPlayer; overrides: PositionOverrides }) {
  const effective = effectivePositionGroup(player, overrides);
  return <span className={styles.ampluaAccent} style={{ background: positionGroupAccentColor[effective] }} />;
}

type SkillKey = keyof SquadSkills;
type SortKey =
  | "nationality"
  | "name"
  | "positionGroup"
  | "age"
  | "experience"
  | "form"
  | "stamina"
  | SkillKey
  | "tsi"
  | "loyalty"
  | "rating";
type SortDir = "asc" | "desc";

const skillKeys: SkillKey[] = ["goalkeeping", "defending", "midfield", "winger", "passing", "scoring", "setPieces"];

const skillShortLabel: Record<SkillKey, string> = {
  goalkeeping: "ВР",
  defending: "ЗАЩ",
  midfield: "ПЗ",
  winger: "ФЛ",
  passing: "ПАС",
  scoring: "НАП",
  setPieces: "СТ",
};

const baseColumns: { key: SortKey; label: string; title?: string }[] = [
  { key: "nationality", label: "Флаг", title: "Национальность" },
  { key: "name", label: "Имя" },
  { key: "positionGroup", label: "Поз", title: "Позиция" },
  { key: "age", label: "Возр", title: "Возраст" },
  { key: "experience", label: "Опыт" },
  { key: "form", label: "Форма" },
  { key: "stamina", label: "Вын", title: "Выносливость" },
  ...skillKeys.map((k) => ({ key: k as SortKey, label: skillShortLabel[k], title: skillLabel[k] })),
  { key: "tsi", label: "TSI" },
  { key: "loyalty", label: "Предан.", title: "Преданность клубу" },
  { key: "rating", label: "Рейтинг", title: "Рейтинг за последний сыгранный матч" },
];

const textColumns = new Set<SortKey>(["nationality", "name", "positionGroup"]);

function getValue(player: SquadPlayer, key: SortKey): string | number {
  switch (key) {
    case "nationality":
      return player.nationality.name;
    case "name":
      return player.name;
    case "positionGroup":
      return positionGroupShort[player.positionGroup];
    case "age":
      return player.age;
    case "experience":
      return player.experience;
    case "form":
      return player.form;
    case "stamina":
      return player.stamina;
    case "tsi":
      return player.tsi;
    case "loyalty":
      return player.isClubProduct ? 21 : (player.loyalty ?? -1);
    case "rating":
      return player.lastMatchRating ?? -1;
    default:
      return player.skills[key as SkillKey];
  }
}

export default function LineupPlayerList({
  players,
  onDropToBench,
  selectedPlayerId,
  onSelectPlayer,
  assignedIds,
  subIds,
  payloadForPlayer,
  prevByPlayerId,
}: {
  players: SquadPlayer[];
  onDropToBench: (payload: DragPayload) => void;
  selectedPlayerId: number | null;
  onSelectPlayer: (playerId: number) => void;
  assignedIds: Set<number>;
  subIds: Set<number>;
  payloadForPlayer: (playerId: number) => DragPayload;
  prevByPlayerId?: Record<number, PlayerStatSnapshot | undefined>;
}) {
  const [isOver, setIsOver] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const dragGhostRef = useRef<HTMLSpanElement>(null);
  const { overrides } = usePositionOverrides();

  // Прячем столбцы целиком, если ни у одного игрока нет данных, вместо
  // пустых прочерков в каждой строке (см. SquadTable.tsx, тот же принцип).
  const hasLoyalty = players.some((p) => p.loyalty !== undefined || p.isClubProduct);
  const hasRating = players.some((p) => p.lastMatchRating !== undefined);
  const columns = baseColumns.filter((c) => (c.key === "loyalty" ? hasLoyalty : c.key === "rating" ? hasRating : true));

  const sorted = useMemo(() => {
    if (!sortKey) return players;
    const list = [...players];
    list.sort((a, b) => {
      const va = getValue(a, sortKey);
      const vb = getValue(b, sortKey);
      const cmp =
        typeof va === "string" && typeof vb === "string" ? va.localeCompare(vb, "ru") : (va as number) - (vb as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [players, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(textColumns.has(key) ? "asc" : "desc");
  }

  return (
    <div className={`${styles.card} ${styles.gridCard}`}>
      <div className={styles.cardTitle}>Все игроки ({players.length})</div>
      <p className={styles.hint}>
        Строка подсвечена зелёным — игрок в основе, золотым — в запасе, без подсветки — не в составе. Перетащите
        игрока на свободный слот на поле или скамейке выше, чтобы поставить/переставить его, или кликните на игрока,
        а затем на нужный слот. Перетащите игрока сюда, чтобы снять его с поля/скамейки. Клик по заголовку столбца
        сортирует таблицу.
      </p>

      <span
        ref={dragGhostRef}
        aria-hidden="true"
        className={`${styles.dragGhost} ${styles.slotBadge} ${styles.slotBadgeFilled}`}
      />

      <div
        className={`${styles.gridWrap} ${isOver ? styles.gridWrapOver : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!isOver) setIsOver(true);
        }}
        onDragLeave={() => setIsOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsOver(false);
          const payload = parsePayload(e.dataTransfer.getData("text/plain"));
          if (payload) onDropToBench(payload);
        }}
      >
        <table className={styles.grid}>
          <thead>
            <tr>
              {columns.map((col, i) => (
                <th key={`${col.key}-${i}`} title={col.title}>
                  <button
                    type="button"
                    className={`${styles.gridSortBtn} ${sortKey === col.key ? styles.gridSortActive : ""}`}
                    onClick={() => handleSort(col.key)}
                  >
                    {col.label}
                    {sortKey === col.key && (
                      <span className={styles.gridSortArrow}>{sortDir === "asc" ? "▲" : "▼"}</span>
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const statusClass = assignedIds.has(p.id)
                ? styles.gridRowStarting
                : subIds.has(p.id)
                  ? styles.gridRowSub
                  : "";
              const prev = prevByPlayerId?.[p.id];
              const staminaLevel = staminaToLevel(p.stamina);
              const prevStaminaLevel = prev?.stamina !== undefined ? staminaToLevel(prev.stamina) : undefined;

              return (
              <tr
                key={p.id}
                className={`${styles.gridRow} ${statusClass} ${p.id === selectedPlayerId ? styles.gridRowSelected : ""}`}
                draggable
                onClick={() => onSelectPlayer(p.id)}
                onDragStart={(e) => {
                  const payload = payloadForPlayer(p.id);
                  e.dataTransfer.setData("text/plain", serializePayload(payload));
                  e.dataTransfer.effectAllowed = "move";

                  const ghost = dragGhostRef.current;
                  if (ghost) {
                    ghost.textContent = playerBadgeCode(p);
                    e.dataTransfer.setDragImage(ghost, 22, 22);
                  }
                }}
              >
                <td className={styles.gridFlagCell}>
                  <FlagIcon country={p.nationality} />
                </td>
                <td className={styles.gridNameCell}>
                  <AmpluaAccent player={p} overrides={overrides} />
                  {p.name}
                </td>
                <td>{positionGroupShort[p.positionGroup]}</td>
                <td className={styles.gridNumCell}>{p.age}</td>
                <td
                  className={`${styles.gridNumCell} ${diffClass(diffDirection(p.experience, prev?.experience))}`}
                  title={diffTitle("Опыт", prev?.experience, p.experience) ?? skillWord(p.experience)}
                >
                  {p.experience}
                </td>
                <td
                  className={`${styles.gridNumCell} ${diffClass(diffDirection(p.form, prev?.form))}`}
                  title={diffTitle("Форма", prev?.form, p.form) ?? formWord(p.form)}
                >
                  {p.form}
                </td>
                <td
                  className={`${styles.gridNumCell} ${diffClass(diffDirection(staminaLevel, prevStaminaLevel))}`}
                  title={diffTitle("Выносливость", prevStaminaLevel, staminaLevel) ?? formWord(staminaLevel)}
                >
                  {staminaLevel}
                </td>
                {skillKeys.map((k) => (
                  <td
                    className={`${styles.gridNumCell} ${diffClass(diffDirection(p.skills[k], prev?.skills[k]))}`}
                    key={k}
                    title={diffTitle(skillLabel[k], prev?.skills[k], p.skills[k]) ?? skillWord(p.skills[k])}
                  >
                    {p.skills[k]}
                  </td>
                ))}
                <td
                  className={`${styles.gridNumCell} ${diffClass(diffDirection(p.tsi, prev?.tsi))}`}
                  title={diffTitle("TSI", prev?.tsi, p.tsi, (n) => n.toLocaleString("ru-RU"))}
                >
                  {p.tsi.toLocaleString("ru-RU")}
                </td>
                {hasLoyalty && (
                  <td className={styles.gridNumCell} title={p.isClubProduct ? "Воспитанник родного клуба" : p.loyalty !== undefined ? skillWord(p.loyalty) : undefined}>
                    {p.isClubProduct ? <HeartIcon /> : (p.loyalty ?? "—")}
                  </td>
                )}
                {hasRating && (
                  <td className={styles.gridNumCell} title={p.lastMatchRating !== undefined ? `${p.lastMatchRating.toFixed(1)} из 10` : undefined}>
                    {p.lastMatchRating !== undefined ? `★ ${p.lastMatchRating.toFixed(1)}` : "—"}
                  </td>
                )}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
