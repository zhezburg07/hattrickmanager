"use client";

import { useRef, useState } from "react";
import type { Assignments, BoardSlot, RoleAccent } from "@/data/pitchBoard";
import { roleAccent, roleFullLabel } from "@/data/pitchBoard";
import {
  formWord,
  positionAccentColor,
  positionGroupLabel,
  skillWordWithLevel,
  type PositionGroup,
  type SquadPlayer,
  type PlayerStatSnapshot,
} from "@/data/squad";
import { usePositionOverrides, effectivePositionGroup } from "@/data/positionOverrides";
import { parsePayload, serializePayload, type DragPayload } from "./dragPayload";
import { computeZoneRatings, computeSlotRating, zoneLabel, type ZoneKey } from "./zoneRatings";
import { applicableInstructions, instructionArrow, instructionLabel, type PlayerInstruction } from "@/data/playerInstructions";
import { formationExperienceHint } from "./formationExperience";
import LineupSubsRow from "./LineupSubsRow";
import LineupPlayerExpandedCard from "./LineupPlayerExpandedCard";
import styles from "./Lineup.module.css";

type ViewMode = "squad" | "stats";

function average(values: number[]): string {
  if (values.length === 0) return "—";
  const sum = values.reduce((a, b) => a + b, 0);
  return (sum / values.length).toFixed(1);
}

// Акцентная цветовая кодировка карточек по типу позиции (см. roleAccent в
// pitchBoard.ts): вратарь зелёный, вся защита оранжевая, центральный
// полузащитник жёлтый, крайний полузащитник зелёный (совпадает с вратарём —
// не мешает, т.к. вратарь всегда один), нападение красное.
const accentClassByKey: Record<RoleAccent, string> = {
  gk: styles.slotAccentGk,
  defense: styles.slotAccentDefense,
  midCentral: styles.slotAccentMidCentral,
  midWide: styles.slotAccentMidWide,
  fwd: styles.slotAccentFwd,
};

// Режим "Показатели" не привязан к слотам игроков — это ровно 6 (плюс полузащита)
// общекомандных зональных рейтинга, каждый показан один раз, в той трети поля,
// к которой относится: защита слева/по центру/справа, полузащита по центру,
// атака слева/по центру/справа. Никакой разбивки по конкретным игрокам здесь нет —
// та осталась в режиме "Состав" (клик по игроку открывает его личную карточку).
const zonePositions: { key: ZoneKey; x: number; y: number }[] = [
  { key: "defenseLeft", x: 28, y: 12 },
  { key: "defenseCenter", x: 28, y: 50 },
  { key: "defenseRight", x: 28, y: 88 },
  { key: "midfield", x: 56, y: 50 },
  { key: "attackLeft", x: 86, y: 20 },
  { key: "attackCenter", x: 86, y: 50 },
  { key: "attackRight", x: 86, y: 80 },
];

// Заливка зоны: краснее — слабее, зеленее — сильнее (плавный градиент через золотой)
function lerpChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function zoneFillColor(level: number): string {
  const ratio = Math.max(0, Math.min(1, level / 20));
  const bad: [number, number, number] = [192, 80, 63];
  const warn: [number, number, number] = [217, 164, 65];
  const good: [number, number, number] = [76, 175, 111];
  const [from, to, t] = ratio < 0.5 ? [bad, warn, ratio / 0.5] : [warn, good, (ratio - 0.5) / 0.5];
  const r = lerpChannel(from[0], to[0], t as number);
  const g = lerpChannel(from[1], to[1], t as number);
  const b = lerpChannel(from[2], to[2], t as number);
  return `rgba(${r}, ${g}, ${b}, 0.6)`;
}

export default function LineupField({
  slots,
  getPlayer,
  onDropPlayer,
  selectedPlayerId,
  onSlotClick,
  players,
  totalSlots,
  assignments,
  subsFilled,
  subsTotal,
  getSubPlayer,
  onDropSub,
  onSubSlotClick,
  getInstruction,
  onSetInstruction,
  formationLabel,
  experienceLevel,
  onRecommend,
  prevByPlayerId,
}: {
  slots: BoardSlot[];
  getPlayer: (group: PositionGroup, index: number) => SquadPlayer | null;
  onDropPlayer: (group: PositionGroup, index: number, payload: DragPayload) => void;
  selectedPlayerId: number | null;
  onSlotClick: (group: PositionGroup, index: number) => void;
  players: SquadPlayer[];
  totalSlots: number;
  assignments: Assignments;
  subsFilled: number;
  subsTotal: number;
  getSubPlayer: (index: number) => SquadPlayer | null;
  onDropSub: (index: number, payload: DragPayload) => void;
  onSubSlotClick: (index: number) => void;
  getInstruction: (playerId: number) => PlayerInstruction;
  onSetInstruction: (playerId: number, instruction: PlayerInstruction) => void;
  formationLabel: string;
  experienceLevel: number | null;
  onRecommend: () => void;
  prevByPlayerId?: Record<number, PlayerStatSnapshot | undefined>;
}) {
  const [mode, setMode] = useState<ViewMode>("squad");
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const { overrides } = usePositionOverrides();
  // Тройной клик по игроку на поле разворачивает его карточку показателей
  // прямо в потоке страницы (см. LineupPlayerExpandedCard ниже) — тот же
  // принцип, что уже используется в MatchesCalendar.tsx для разбора матча:
  // не всплывающее окно поверх поля, а блок, раздвигающий остальной
  // контент. Одинарный/двойной клик (выбор/снятие выбора) не меняются —
  // см. обработчик клика на самом слоте ниже.
  const [expandedPlayerId, setExpandedPlayerId] = useState<number | null>(null);

  const playersById = new Map(players.map((p) => [p.id, p]));
  const { ratings: zones, congestionNote } = computeZoneRatings(assignments, playersById);

  const expandedSlot =
    mode === "squad" && expandedPlayerId !== null
      ? slots.find((s) => getPlayer(s.group, s.index)?.id === expandedPlayerId)
      : undefined;
  const expandedFieldPlayer = expandedSlot ? getPlayer(expandedSlot.group, expandedSlot.index) : null;

  // Считаем тройной клик сами, а не через MouseEvent.detail — тот зависит от
  // системного порога сдвига курсора между кликами (ОС считает клик "новым",
  // если рука чуть дрогнула), из-за чего живой тройной клик мышью реально
  // срабатывает намного реже, чем в синтетическом тесте с нулевым сдвигом.
  // Здесь важно только время между кликами по ТОМУ ЖЕ слоту, а не точность
  // курсора — таймер каждый раз продлевается, окно ~500мс между кликами
  // (не суммарно на все три). 1-й и 2-й клики так и уходят в обычную логику
  // onSlotClick (выбор/снятие выбора, без изменений) — 3-й её не запускает,
  // а разворачивает карточку и сбрасывает счётчик.
  const clickTrackerRef = useRef<{ key: string; count: number; timer: ReturnType<typeof setTimeout> | null }>({
    key: "",
    count: 0,
    timer: null,
  });
  const MULTI_CLICK_WINDOW_MS = 500;

  function handleSlotBadgeClick(slot: BoardSlot, player: SquadPlayer | null) {
    const key = `${slot.group}-${slot.index}`;
    const tracker = clickTrackerRef.current;
    if (tracker.timer) clearTimeout(tracker.timer);

    tracker.count = tracker.key === key ? tracker.count + 1 : 1;
    tracker.key = key;

    if (tracker.count >= 3) {
      tracker.count = 0;
      tracker.key = "";
      tracker.timer = null;
      if (player) setExpandedPlayerId((id) => (id === player.id ? null : player.id));
      return;
    }

    tracker.timer = setTimeout(() => {
      tracker.count = 0;
      tracker.key = "";
      tracker.timer = null;
    }, MULTI_CLICK_WINDOW_MS);

    onSlotClick(slot.group, slot.index);
  }

  return (
    <div className={styles.card}>
      <div className={styles.fieldHeader}>
        <div className={styles.cardTitle} style={{ margin: 0 }}>
          Расстановка
          {congestionNote && (
            <span className={styles.congestionHint} title={congestionNote}>
              ⓘ
            </span>
          )}
        </div>

        <div className={styles.fieldHeaderRight}>
          <div className={styles.quickStatsInline}>
            <span>
              Основа <b>{players.length}</b> / {totalSlots}
            </span>
            <span>
              Запасные <b>{subsFilled}</b> / {subsTotal}
            </span>
            <span>
              Форма <b>{average(players.map((p) => p.form))}</b>
            </span>
            <span>
              Вын-ть <b>{average(players.map((p) => p.stamina))}</b>
            </span>
          </div>

          <div className={styles.viewToggle}>
            <button
              type="button"
              className={`${styles.viewToggleBtn} ${mode === "squad" ? styles.viewToggleBtnActive : ""}`}
              onClick={() => setMode("squad")}
            >
              Состав
            </button>
            <button
              type="button"
              className={`${styles.viewToggleBtn} ${mode === "stats" ? styles.viewToggleBtnActive : ""}`}
              onClick={() => setMode("stats")}
            >
              Показатели
            </button>
          </div>
        </div>
      </div>

      <div className={styles.pitchWrap}>
      <div className={styles.pitchHeaderStrip}>
        <span className={styles.pitchHeaderInfo}>
          Расстановка: <b>{formationLabel}</b>
          {experienceLevel !== null && <> · {formWord(experienceLevel)}</>}
          <span className={styles.infoHint} title={formationExperienceHint}>
            ⓘ
          </span>
        </span>
        <button type="button" className={styles.pitchHeaderBtn} onClick={onRecommend}>
          Рекомендовать состав
        </button>
      </div>
      <div className={styles.pitch}>
        <div className={styles.centerLine} />
        <div className={styles.centerCircle} />
        <div className={styles.penaltyBoxLeft} />
        <div className={styles.penaltyBoxRight} />
        <div className={styles.goalAreaLeft} />
        <div className={styles.goalAreaRight} />
        <div className={`${styles.cornerArc} ${styles.cornerArcTL}`} />
        <div className={`${styles.cornerArc} ${styles.cornerArcTR}`} />
        <div className={`${styles.cornerArc} ${styles.cornerArcBL}`} />
        <div className={`${styles.cornerArc} ${styles.cornerArcBR}`} />

        {mode === "stats"
          ? zonePositions.map((zp) => (
              <div key={zp.key} className={styles.slot} style={{ left: `${zp.x}%`, top: `${zp.y}%` }}>
                <div
                  className={styles.zoneSlotBadge}
                  style={{ background: zoneFillColor(zones[zp.key]) }}
                  title={zoneLabel[zp.key]}
                >
                  <div className={styles.zoneSlotValue}>{skillWordWithLevel(zones[zp.key])}</div>
                  <div className={styles.zoneSlotLabel}>{zoneLabel[zp.key]}</div>
                </div>
              </div>
            ))
          : slots.map((slot) => {
              const player = getPlayer(slot.group, slot.index);
              const isOver = dragOverId === slot.id;
              const isSelected = player !== null && player.id === selectedPlayerId;
              const effectiveGroup = player ? effectivePositionGroup(player, overrides) : null;
              const isPositionOverridden = player !== null && effectiveGroup !== player.positionGroup;
              // Цвет карточки берётся из амплуа самого игрока (то же значение,
              // что красит его в "Составе" и в общем списке), а не из типа
              // слота — слот раскрашен по роли (accentClassByKey) только пока
              // он пуст, это просто подсказка "кто здесь ожидается".
              const cardAccentClass = player ? "" : accentClassByKey[roleAccent[slot.role]];
              const cardAccentStyle = player
                ? ({ "--slot-accent": positionAccentColor(effectiveGroup!, player!.skills) } as React.CSSProperties)
                : undefined;

              return (
                <div
                  key={slot.id}
                  className={`${styles.slot} ${isOver ? styles.slotOver : ""}`}
                  style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragOverId !== slot.id) setDragOverId(slot.id);
                  }}
                  onDragLeave={() => setDragOverId((id) => (id === slot.id ? null : id))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverId(null);
                    const payload = parsePayload(e.dataTransfer.getData("text/plain"));
                    if (payload) onDropPlayer(slot.group, slot.index, payload);
                  }}
                >
                  <div className={styles.badgeWrap}>
                    <span
                      className={`${styles.slotCard} ${cardAccentClass} ${player ? styles.slotBadgeFilled : styles.slotBadgeEmpty} ${isSelected ? styles.slotBadgeSelected : ""}`}
                      style={cardAccentStyle}
                      title={player ? `${player.name} — ${roleFullLabel[slot.role]}` : roleFullLabel[slot.role]}
                      draggable={Boolean(player)}
                      onClick={() => handleSlotBadgeClick(slot, player)}
                      onDragStart={(e) => {
                        if (!player) return;
                        const payload: DragPayload = {
                          playerId: player.id,
                          from: "slot",
                          group: slot.group,
                          index: slot.index,
                        };
                        e.dataTransfer.setData("text/plain", serializePayload(payload));
                        e.dataTransfer.effectAllowed = "move";
                      }}
                    >
                      {player ? (
                        <>
                          <span className={styles.slotCardNumber}>{player.squadNumber}</span>
                          <span className={styles.slotCardName}>{player.name.split(" ")[1] ?? player.name}</span>
                          <span
                            className={styles.slotCardRole}
                            title={`Расчётный рейтинг на позиции ${roleFullLabel[slot.role]}`}
                          >
                            {computeSlotRating(player, slot.role).toFixed(1)}
                          </span>
                        </>
                      ) : (
                        slot.roleLabel
                      )}
                    </span>

                    {isPositionOverridden && (
                      <span
                        className={styles.overrideMark}
                        title={`Амплуа изменено вручную — естественная позиция: ${positionGroupLabel[player!.positionGroup]}`}
                      >
                        ✎
                      </span>
                    )}

                    {player && slot.role !== "GK" && (
                      <button
                        type="button"
                        className={`${styles.instructionIcon} ${getInstruction(player.id) !== "normal" ? styles.instructionIconActive : ""}`}
                        title={`${player.name} — ${instructionLabel[getInstruction(player.id)]} (нажмите, чтобы сменить)`}
                        onClick={(e) => {
                          e.stopPropagation();
                          const options = applicableInstructions(slot.role);
                          const currentIndex = options.indexOf(getInstruction(player.id));
                          const next = options[(currentIndex + 1) % options.length];
                          onSetInstruction(player.id, next);
                        }}
                      >
                        {instructionArrow(getInstruction(player.id), slot.y) || "▾"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
      </div>

      <LineupSubsRow
        getPlayer={getSubPlayer}
        onDropSub={onDropSub}
        selectedPlayerId={selectedPlayerId}
        onSlotClick={onSubSlotClick}
      />
      </div>

      {expandedFieldPlayer && (
        <LineupPlayerExpandedCard
          player={expandedFieldPlayer}
          prev={prevByPlayerId?.[expandedFieldPlayer.id]}
          onClose={() => setExpandedPlayerId(null)}
        />
      )}
    </div>
  );
}
