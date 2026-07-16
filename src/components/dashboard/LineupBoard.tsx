"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  boardSlots,
  groupOrder,
  emptyAssignments,
  detectFormationLabel,
  fieldPlayerCount,
  subCategories,
  slotCounts,
  type Assignments,
} from "@/data/pitchBoard";
import type { PositionGroup, SquadPlayer, PlayerStatSnapshot } from "@/data/squad";
import { applicableInstructions, type PlayerInstruction } from "@/data/playerInstructions";
import LineupField from "./LineupField";
import LineupPlayerList from "./LineupPlayerList";
import LineupPlayerDetails from "./LineupPlayerDetails";
import OpponentAnalysis from "./OpponentAnalysis";
import { recommendLineup } from "./recommendLineup";
import { formationExperienceLevel } from "./formationExperience";
import type { DragPayload } from "./dragPayload";
import type { OpponentAnalysisResult } from "@/lib/opponentAnalysis";
import styles from "./Lineup.module.css";

// Порядок заполнения слотов линии "снаружи внутрь": сначала оба крайних
// слота, затем следующая пара и т.д., последним — центральный (если слотов
// нечётное число). Нужен, чтобы при неполном комплекте игроков (например,
// 4 защитника из 5 возможных слотов) линия оставалась визуально
// симметричной и центрированной, а не смещалась в одну сторону из-за
// последовательного заполнения по индексу 0,1,2,3...
function symmetricFillOrder(count: number): number[] {
  const order: number[] = [];
  let lo = 0;
  let hi = count - 1;
  while (lo < hi) {
    order.push(lo, hi);
    lo++;
    hi--;
  }
  if (lo === hi) order.push(lo);
  return order;
}

// Для защиты и полузащиты используем симметричный порядок заполнения; у
// вратаря он не нужен (один слот), у нападения оставлен прежний
// последовательный порядок без изменений.
const fillOrder: Partial<Record<PositionGroup, number[]>> = {
  DEF: symmetricFillOrder(slotCounts.DEF),
  MID: symmetricFillOrder(slotCounts.MID),
};

// По умолчанию расставляем игроков со статусом "в основе" на подходящие им слоты,
// остальные слоты сетки остаются пустыми. Для реальных данных CHPP такого
// статуса нет (см. src/lib/squadPlayers.ts) — тогда поле просто остаётся
// пустым, и пользователь либо расставляет игроков сам, либо нажимает
// "Рекомендовать состав".
function initialAssignments(roster: SquadPlayer[]): Assignments {
  const result = emptyAssignments();
  groupOrder.forEach((group) => {
    const starters = roster.filter((p) => p.positionGroup === group && p.status === "starting");
    const order = fillOrder[group];
    if (order) {
      starters.forEach((player, i) => {
        const slotIndex = order[i];
        if (slotIndex !== undefined) result[group][slotIndex] = player.id;
      });
    } else {
      result[group] = result[group].map((_, i) => starters[i]?.id ?? null);
    }
  });
  return result;
}

function cloneAssignments(a: Assignments): Assignments {
  return {
    GK: [...a.GK],
    DEF: [...a.DEF],
    MID: [...a.MID],
    FWD: [...a.FWD],
  };
}

const MAX_FIELD_PLAYERS = 10;

export default function LineupBoard({
  players,
  prevByPlayerId,
  opponentAnalysis,
}: {
  players: SquadPlayer[];
  prevByPlayerId: Record<number, PlayerStatSnapshot | undefined>;
  opponentAnalysis: OpponentAnalysisResult;
}) {
  const roster = players;
  const playersById = useMemo(() => new Map(roster.map((p) => [p.id, p])), [roster]);
  const resolvedPrevByPlayerId = prevByPlayerId;
  const [assignments, setAssignments] = useState<Assignments>(() => initialAssignments(roster));
  const [subs, setSubs] = useState<(number | null)[]>(() => subCategories.map(() => null));
  const [instructions, setInstructions] = useState<Record<number, PlayerInstruction>>({});
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);
  const [captainId, setCaptainId] = useState<number | null>(null);
  const [setPieceTakerId, setSetPieceTakerId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Автопрокрутка во время перетаскивания в обе стороны: когда курсор
  // оказывается у верхней или нижней границы видимой области, страница плавно
  // скроллится в соответствующую сторону, пока курсор там остаётся — так
  // проще попасть на слоты, скрытые сверху или снизу. Скорость нарастает по
  // мере приближения курсора к самому краю экрана.
  useEffect(() => {
    const EDGE_ZONE = 120;
    const MIN_SPEED = 4;
    const MAX_SPEED = 28;
    let direction = 0; // -1 — вверх, 1 — вниз, 0 — не скроллим
    let speed = 0;
    let rafId: number | null = null;

    function maxScrollY() {
      return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    }

    function step() {
      if (direction === -1 && window.scrollY <= 0) {
        stop();
        return;
      }
      if (direction === 1 && window.scrollY >= maxScrollY()) {
        stop();
        return;
      }
      window.scrollBy(0, direction * speed);
      rafId = requestAnimationFrame(step);
    }

    function stop() {
      direction = 0;
      speed = 0;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    function handleDragOver(e: DragEvent) {
      const viewportHeight = window.innerHeight;
      let nextDirection = 0;
      let depth = 0;

      if (e.clientY < EDGE_ZONE) {
        nextDirection = -1;
        depth = (EDGE_ZONE - e.clientY) / EDGE_ZONE;
      } else if (e.clientY > viewportHeight - EDGE_ZONE) {
        nextDirection = 1;
        depth = (e.clientY - (viewportHeight - EDGE_ZONE)) / EDGE_ZONE;
      }

      if (nextDirection === 0) {
        stop();
        return;
      }

      direction = nextDirection;
      speed = MIN_SPEED + (MAX_SPEED - MIN_SPEED) * Math.min(1, Math.max(0, depth));
      if (rafId === null) {
        rafId = requestAnimationFrame(step);
      }
    }

    document.addEventListener("dragover", handleDragOver);
    document.addEventListener("dragend", stop);
    document.addEventListener("drop", stop);

    return () => {
      document.removeEventListener("dragover", handleDragOver);
      document.removeEventListener("dragend", stop);
      document.removeEventListener("drop", stop);
      stop();
    };
  }, []);

  function showToast(message: string) {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2600);
  }

  function handleSelectPlayer(playerId: number) {
    setSelectedPlayerId((prev) => (prev === playerId ? null : playerId));
  }

  function getInstruction(playerId: number): PlayerInstruction {
    return instructions[playerId] ?? "normal";
  }

  function handleSetInstruction(playerId: number, instruction: PlayerInstruction) {
    setInstructions((prev) => ({ ...prev, [playerId]: instruction }));
  }

  // Возвращает true, если перемещение действительно произошло — используется
  // клик-режимом расстановки, чтобы снять выделение только при реальном ходе
  function handleDropOnSlot(group: PositionGroup, index: number, payload: DragPayload): boolean {
    const isNewFieldAddition = payload.from !== "slot" && group !== "GK" && assignments[group][index] === null;
    if (isNewFieldAddition && fieldPlayerCount(assignments) >= MAX_FIELD_PLAYERS) {
      showToast("Максимум 10 полевых игроков — сначала снимите кого-то с поля");
      return false;
    }

    // Перетащили/кликнули на тот же слот, откуда взяли — ничего не делаем
    if (payload.from === "slot" && payload.group === group && payload.index === index) {
      return false;
    }

    const targetOccupant = assignments[group][index];

    setAssignments((prev) => {
      const next = cloneAssignments(prev);

      if (payload.from === "slot") {
        // Целевой слот занят другим игроком с поля — меняем их местами.
        // Целевой слот пуст — игрок просто переезжает, старый слот освобождается.
        next[payload.group][payload.index] = targetOccupant;
      }
      // payload.from === "bench": прежний игрок в целевом слоте (если был)
      // ничем не заменяется — он просто перестаёт быть в assignments и
      // автоматически возвращается в список внизу.
      // payload.from === "sub": обмен со скамейкой запасных обрабатывается
      // ниже через setSubs — освободившийся слот скамейки получает игрока,
      // который был в целевом слоте на поле (а не отправляется в общий список).

      next[group][index] = payload.playerId;
      return next;
    });

    // Игрок вышел на поле из запаса — его слот запасного либо пустеет, либо
    // (если целевой слот на поле был занят) принимает игрока, снятого оттуда
    if (payload.from === "sub") {
      setSubs((prev) => {
        const next = [...prev];
        next[payload.index] = targetOccupant;
        return next;
      });
    }

    return true;
  }

  function handleDropOnBench(payload: DragPayload) {
    if (payload.from === "slot") {
      setAssignments((prev) => {
        const next = cloneAssignments(prev);
        next[payload.group][payload.index] = null;
        return next;
      });
    } else if (payload.from === "sub") {
      setSubs((prev) => {
        const next = [...prev];
        next[payload.index] = null;
        return next;
      });
    }
  }

  // Возвращает true, если перемещение действительно произошло — используется
  // клик-режимом расстановки, чтобы снять выделение только при реальном ходе
  function handleDropOnSub(index: number, payload: DragPayload): boolean {
    const player = playersById.get(payload.playerId);
    if (!player) return false;

    // Подписи ролей на слотах запасных — только ярлык-подсказка: любой игрок
    // может занять любой из 5 слотов, в отличие от слотов на самом поле
    if (payload.from === "sub" && payload.index === index) return false;

    const targetOccupant = subs[index];

    setSubs((prev) => {
      const next = [...prev];
      if (payload.from === "sub") {
        // Целевой слот занят другим запасным — меняем их местами
        next[payload.index] = targetOccupant;
      }
      next[index] = payload.playerId;
      return next;
    });

    // Игрока перевели с поля в запас — его слот на поле либо пустеет, либо
    // (если целевой слот скамейки был занят) принимает игрока, снятого оттуда
    if (payload.from === "slot") {
      setAssignments((prev) => {
        const next = cloneAssignments(prev);
        next[payload.group][payload.index] = targetOccupant;
        return next;
      });
    }

    return true;
  }

  // Определяет, где сейчас находится игрок (на поле / в запасе / в общем
  // списке), чтобы клик-режим расстановки мог переиспользовать ту же логику
  // перемещения/обмена, что и drag-and-drop
  function payloadForPlayer(playerId: number): DragPayload {
    for (const group of groupOrder) {
      const index = assignments[group].indexOf(playerId);
      if (index !== -1) return { playerId, from: "slot", group, index };
    }
    const subIndex = subs.indexOf(playerId);
    if (subIndex !== -1) return { playerId, from: "sub", index: subIndex };
    return { playerId, from: "bench" };
  }

  // Клик по слоту на поле: если ничего не выбрано — клик по занятому слоту
  // выделяет игрока; если игрок уже выбран — клик по любому слоту переносит
  // его туда (обмен местами, если слот занят), клик по слоту самого выбранного
  // игрока снимает выделение
  function handleSlotClick(group: PositionGroup, index: number) {
    const occupantId = assignments[group][index];

    if (selectedPlayerId === null) {
      if (occupantId !== null) handleSelectPlayer(occupantId);
      return;
    }

    if (occupantId === selectedPlayerId) {
      handleSelectPlayer(selectedPlayerId);
      return;
    }

    const moved = handleDropOnSlot(group, index, payloadForPlayer(selectedPlayerId));
    if (moved) setSelectedPlayerId(null);
  }

  // Тот же клик-режим для слотов запасных
  function handleSubSlotClick(index: number) {
    const occupantId = subs[index];

    if (selectedPlayerId === null) {
      if (occupantId !== null) handleSelectPlayer(occupantId);
      return;
    }

    if (occupantId === selectedPlayerId) {
      handleSelectPlayer(selectedPlayerId);
      return;
    }

    const moved = handleDropOnSub(index, payloadForPlayer(selectedPlayerId));
    if (moved) setSelectedPlayerId(null);
  }

  function handleRecommend() {
    setAssignments(recommendLineup(roster));
  }

  const assignedIds = useMemo(() => {
    const ids = new Set<number>();
    groupOrder.forEach((group) => assignments[group].forEach((id) => id !== null && ids.add(id)));
    return ids;
  }, [assignments]);

  const subIds = useMemo(() => {
    const ids = new Set<number>();
    subs.forEach((id) => id !== null && ids.add(id));
    return ids;
  }, [subs]);

  // Показатели считаются только по реально расставленным на поле игрокам
  const lineupPlayers = useMemo(
    () => roster.filter((p) => assignedIds.has(p.id)),
    [roster, assignedIds],
  );

  const formationLabel = useMemo(() => detectFormationLabel(assignments), [assignments]);
  const experienceLevel = useMemo(
    () => formationExperienceLevel(formationLabel, fieldPlayerCount(assignments)),
    [assignments, formationLabel],
  );

  // Капитаном и исполнителем стандартов можно назначить только игрока, реально
  // стоящего на поле — если его сняли в запас, роль снимается вместе с ним
  useEffect(() => {
    if (captainId !== null && !assignedIds.has(captainId)) setCaptainId(null);
  }, [assignedIds, captainId]);

  useEffect(() => {
    if (setPieceTakerId !== null && !assignedIds.has(setPieceTakerId)) setSetPieceTakerId(null);
  }, [assignedIds, setPieceTakerId]);

  // Если игрока переставили на слот другой роли (например, из бокового
  // нападения в центральное), а его текущее указание для новой роли
  // недоступно — сбрасываем указание на "Обычный"
  useEffect(() => {
    setInstructions((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const key of Object.keys(prev)) {
        const playerId = Number(key);
        const instruction = prev[playerId];
        if (instruction === "normal") continue;
        const slot = boardSlots.find((s) => assignments[s.group][s.index] === playerId);
        if (!slot) continue; // не на поле — указание не отображается, трогать не нужно
        if (!applicableInstructions(slot.role).includes(instruction)) {
          next[playerId] = "normal";
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [assignments]);

  function getPlayer(group: PositionGroup, index: number) {
    const id = assignments[group][index];
    return id !== null ? (playersById.get(id) ?? null) : null;
  }

  function getSubPlayer(index: number) {
    const id = subs[index];
    return id !== null ? (playersById.get(id) ?? null) : null;
  }

  const selectedPlayer = selectedPlayerId !== null ? (playersById.get(selectedPlayerId) ?? null) : null;

  return (
    <>
      <div className={styles.pitchGridGroup}>
        <LineupField
          slots={boardSlots}
          getPlayer={getPlayer}
          onDropPlayer={handleDropOnSlot}
          selectedPlayerId={selectedPlayerId}
          onSlotClick={handleSlotClick}
          players={lineupPlayers}
          totalSlots={MAX_FIELD_PLAYERS + 1}
          assignments={assignments}
          subsFilled={subIds.size}
          subsTotal={subCategories.length}
          getSubPlayer={getSubPlayer}
          onDropSub={handleDropOnSub}
          onSubSlotClick={handleSubSlotClick}
          getInstruction={getInstruction}
          onSetInstruction={handleSetInstruction}
          formationLabel={formationLabel}
          experienceLevel={experienceLevel}
          onRecommend={handleRecommend}
        />

        <LineupPlayerList
          players={roster}
          onDropToBench={handleDropOnBench}
          selectedPlayerId={selectedPlayerId}
          onSelectPlayer={handleSelectPlayer}
          assignedIds={assignedIds}
          subIds={subIds}
          payloadForPlayer={payloadForPlayer}
          prevByPlayerId={resolvedPrevByPlayerId}
        />
      </div>

      <div className={`${styles.card} ${styles.rolesBar}`}>
        <div className={styles.roleItem}>
          <div className={styles.roleItemHead}>
            <span className={styles.captainBarIcon}>★</span>
            <label className={styles.roleSelectLabel}>
              Капитан
              <select
                className={styles.roleSelect}
                value={captainId ?? ""}
                onChange={(e) => setCaptainId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Не выбран</option>
                {lineupPlayers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <span className={styles.roleHint}>Учитывается опыт и лидерские качества игрока</span>
        </div>

        <div className={styles.roleDivider} />

        <div className={styles.roleItem}>
          <div className={styles.roleItemHead}>
            <span className={styles.setPieceBarIcon}>⚽</span>
            <label className={styles.roleSelectLabel}>
              Стандарты
              <select
                className={styles.roleSelect}
                value={setPieceTakerId ?? ""}
                onChange={(e) => setSetPieceTakerId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Не выбран</option>
                {lineupPlayers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <span className={styles.roleHint}>
            Отвечает за штрафные, угловые и пенальти. Если не выбрать, тренер назначит игрока с лучшим навыком
            Стандарты автоматически
          </span>
        </div>
      </div>

      <LineupPlayerDetails player={selectedPlayer} prev={selectedPlayer ? resolvedPrevByPlayerId[selectedPlayer.id] : undefined} />

      <OpponentAnalysis
        analysis={opponentAnalysis}
        roster={roster}
        onRecommendAgainstOpponent={(next) => setAssignments(next)}
      />

      {toast && <div className={styles.toast}>{toast}</div>}
    </>
  );
}
