"use client";

import { useEffect, useState } from "react";
import type { PositionGroup } from "./squad";

const STORAGE_KEY = "hattrick-position-overrides";

// Ручное значение амплуа, которое можно выбрать в "Составе" (см.
// PositionBadge в SquadTable.tsx). Раньше здесь был только PositionGroup (4
// варианта) — но подпись/цвет полузащиты дальше делится на "CM" (центральный)
// и "W" (фланговый) в зависимости от навыков игрока, и раньше эту под-подпись
// нельзя было задать вручную (выбор всегда откатывался к тому, что подсказывали
// навыки). "WING" — отдельное значение именно для явного выбора "W", наравне
// с GK/DEF/MID(=CM)/FWD; для группировки/фильтров/расстановки оно по-прежнему
// означает группу MID (см. effectivePositionGroup ниже).
export type PositionOverrideValue = PositionGroup | "WING";

// Ручные переопределения амплуа: playerId -> назначенное значение.
// Отсутствие записи означает "используется естественное амплуа" (positionGroup
// из тестовых данных, либо расчёт по навыкам для CM/W). Хранится в
// localStorage, чтобы оставаться одинаковым на вкладках "Состав" и
// "Расстановка" — общего React-контекста между этими двумя независимыми
// страницами в приложении нет.
export type PositionOverrides = Record<number, PositionOverrideValue>;

function readStorage(): PositionOverrides {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PositionOverrides) : {};
  } catch {
    return {};
  }
}

function writeStorage(overrides: PositionOverrides) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // приватный режим браузера / переполненная квота — просто не сохраняем
  }
}

// Эффективная ГРУППА амплуа игрока (GK/DEF/MID/FWD) — для расстановки,
// фильтров и сортировки, где различие CM/W внутри MID не важно. Ручное
// переопределение, если оно задано ("WING" тоже даёт "MID" на этом уровне),
// иначе — естественное амплуа из тестовых данных.
export function effectivePositionGroup(
  player: { id: number; positionGroup: PositionGroup },
  overrides: PositionOverrides,
): PositionGroup {
  const override = overrides[player.id];
  if (override === undefined) return player.positionGroup;
  return override === "WING" ? "MID" : override;
}

export function usePositionOverrides() {
  const [overrides, setOverrides] = useState<PositionOverrides>({});

  // Загружаем сохранённые переопределения после монтирования (не при первом
  // рендере), чтобы серверный и первый клиентский рендер совпадали и React
  // не ругался на несовпадение разметки (localStorage недоступен на сервере).
  useEffect(() => {
    setOverrides(readStorage());
  }, []);

  function setOverride(playerId: number, value: PositionOverrideValue | null) {
    setOverrides((prev) => {
      const next = { ...prev };
      if (value === null) delete next[playerId];
      else next[playerId] = value;
      writeStorage(next);
      return next;
    });
  }

  return { overrides, setOverride };
}
