"use client";

import { useMemo, useRef, useState } from "react";
import {
  skillLabel,
  skillWord,
  formWord,
  staminaToLevel,
  playerBadgeCode,
  estimatePotentialRating,
  type SquadPlayer,
  type PlayerStatus,
  type PlayerStatSnapshot,
} from "@/data/squad";
import { usePositionOverrides, type PositionOverrides } from "@/data/positionOverrides";
import { parsePayload, serializePayload, type DragPayload } from "./dragPayload";
import { diffDirection, diffTitle } from "./playerStatChanges";
import FlagIcon from "./FlagIcon";
import {
  skillKeys,
  skillShortLabel,
  diffClass,
  diffTextClass,
  DiffArrow,
  formatAge,
  effectiveAbbrev,
  AmpluaAccent,
  PositionBadgeReadOnly,
  StatusRow,
  SkillNumberCell,
  LoyaltyCell,
  RatingCell,
  type SkillKey,
} from "./squadCells";
import styles from "./SquadTable.module.css";
import lineupStyles from "./Lineup.module.css";

type SortKey =
  | "flag"
  | "name"
  | "positionGroup"
  | "age"
  | "status"
  | "experience"
  | "form"
  | "stamina"
  | SkillKey
  | "tsi"
  | "loyalty"
  | "rating"
  | "potential";
type SortDir = "asc" | "desc";

// Тот же порядок и подписи столбцов, что и в "Составе" (SquadTable.tsx) —
// этот список нарочно держим один-в-один, без возможности менять амплуа
// (см. PositionBadgeReadOnly ниже) и без клика по строке, открывающего
// карточку игрока: клик здесь по-прежнему выбирает игрока для расстановки.
const baseColumns: { key: SortKey; label: string; title?: string }[] = [
  { key: "positionGroup", label: "Поз." },
  { key: "name", label: "Имя" },
  { key: "age", label: "Возр." },
  { key: "flag", label: "Флаг", title: "Национальность" },
  { key: "status", label: "Статус" },
  { key: "tsi", label: "TSI" },
  { key: "form", label: "Форма" },
  { key: "experience", label: "Опыт" },
  { key: "stamina", label: "Вын-ть", title: "Выносливость" },
  ...skillKeys.map((k) => ({ key: k as SortKey, label: skillShortLabel[k], title: skillLabel[k] })),
  { key: "loyalty", label: "Предан.", title: "Преданность клубу" },
  { key: "rating", label: "Рейтинг", title: "Рейтинг за последний сыгранный матч" },
  { key: "potential", label: "Потен.", title: "Потенциальный рейтинг при текущих навыках и форме" },
];

const textColumns = new Set<SortKey>(["flag", "name", "positionGroup", "status"]);

const statusRank: Record<PlayerStatus, number> = { starting: 0, bench: 1, squad: 1, injured: 2 };

function getValue(player: SquadPlayer, key: SortKey, overrides: PositionOverrides): string | number {
  switch (key) {
    case "flag":
      return player.nationality.name;
    case "name":
      return player.name;
    case "positionGroup":
      return effectiveAbbrev(player, overrides);
    case "age":
      return player.age + player.ageDays / 112;
    case "status":
      return statusRank[player.status];
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
    case "potential":
      return estimatePotentialRating(player);
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
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const dragGhostRef = useRef<HTMLSpanElement>(null);
  const { overrides } = usePositionOverrides();

  // Прячем столбцы целиком, если ни у одного игрока нет данных (см.
  // SquadTable.tsx, тот же принцип).
  const hasLoyalty = players.some((p) => p.loyalty !== undefined || p.isClubProduct);
  const hasRating = players.some((p) => p.lastMatchRating !== undefined);
  const columns = baseColumns.filter((c) => (c.key === "loyalty" ? hasLoyalty : c.key === "rating" ? hasRating : true));

  const sorted = useMemo(() => {
    const list = [...players];
    list.sort((a, b) => {
      const va = getValue(a, sortKey, overrides);
      const vb = getValue(b, sortKey, overrides);
      const cmp =
        typeof va === "string" && typeof vb === "string" ? va.localeCompare(vb, "ru") : (va as number) - (vb as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [players, sortKey, sortDir, overrides]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(textColumns.has(key) ? "asc" : "desc");
  }

  return (
    <div className={`${styles.card} ${lineupStyles.gridCard}`}>
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
        className={`${lineupStyles.dragGhost} ${lineupStyles.slotBadge} ${lineupStyles.slotBadgeFilled}`}
      />

      <div
        className={`${lineupStyles.gridWrap} ${isOver ? lineupStyles.gridWrapOver : ""}`}
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
        <table className={styles.table}>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} title={col.title}>
                  <button
                    type="button"
                    className={`${styles.th} ${sortKey === col.key ? styles.thActive : ""}`}
                    onClick={() => handleSort(col.key)}
                  >
                    {col.label}
                    {sortKey === col.key && <span className={styles.sortArrow}>{sortDir === "asc" ? "▲" : "▼"}</span>}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const statusClass = assignedIds.has(p.id)
                ? lineupStyles.gridRowStarting
                : subIds.has(p.id)
                  ? lineupStyles.gridRowSub
                  : "";
              const prev = prevByPlayerId?.[p.id];
              const tsiDiff = diffDirection(p.tsi, prev?.tsi);
              const staminaLevel = staminaToLevel(p.stamina);
              const prevStaminaLevel = prev?.stamina !== undefined ? staminaToLevel(prev.stamina) : undefined;
              const staminaDiff = diffDirection(staminaLevel, prevStaminaLevel);

              return (
                <tr
                  key={p.id}
                  className={`${styles.rowClickable} ${statusClass} ${p.id === selectedPlayerId ? lineupStyles.gridRowSelected : ""}`}
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
                  <td>
                    <PositionBadgeReadOnly player={p} overrides={overrides} />
                  </td>
                  <td className={styles.nameCell}>
                    <AmpluaAccent player={p} overrides={overrides} />
                    {p.name}
                  </td>
                  <td className={styles.numCell}>{formatAge(p.age, p.ageDays)}</td>
                  <td className={styles.flagCell}>
                    <FlagIcon country={p.nationality} />
                  </td>
                  <td>
                    <StatusRow player={p} />
                  </td>
                  <td
                    className={`${styles.moneyCell} ${diffClass(tsiDiff)}`}
                    title={diffTitle("TSI", prev?.tsi, p.tsi, (n) => n.toLocaleString("ru-RU"))}
                  >
                    <span className={diffTextClass(tsiDiff)}>{p.tsi.toLocaleString("ru-RU")}</span>
                    <DiffArrow dir={tsiDiff} />
                  </td>
                  <SkillNumberCell
                    value={p.form}
                    max={8}
                    diff={diffDirection(p.form, prev?.form)}
                    hoverWord={diffTitle("Форма", prev?.form, p.form) ?? formWord(p.form)}
                  />
                  <SkillNumberCell
                    value={p.experience}
                    diff={diffDirection(p.experience, prev?.experience)}
                    hoverWord={diffTitle("Опыт", prev?.experience, p.experience) ?? skillWord(p.experience)}
                  />
                  <SkillNumberCell
                    value={staminaLevel}
                    max={8}
                    diff={staminaDiff}
                    hoverWord={diffTitle("Выносливость", prevStaminaLevel, staminaLevel) ?? formWord(staminaLevel)}
                  />
                  {skillKeys.map((k) => (
                    <SkillNumberCell
                      key={k}
                      value={p.skills[k]}
                      diff={diffDirection(p.skills[k], prev?.skills[k])}
                      hoverWord={diffTitle(skillLabel[k], prev?.skills[k], p.skills[k]) ?? skillWord(p.skills[k])}
                    />
                  ))}
                  {hasLoyalty && <LoyaltyCell player={p} />}
                  {hasRating && <RatingCell rating={p.lastMatchRating} />}
                  <RatingCell rating={estimatePotentialRating(p)} />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
