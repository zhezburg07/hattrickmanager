"use client";

import { useEffect, useState } from "react";
import type { PositionGroup } from "./squad";

const STORAGE_KEY = "hattrick-position-overrides";

// Ручные переопределения амплуа: playerId -> назначенная группа позиций.
// Отсутствие записи означает "используется естественное амплуа" (positionGroup
// из тестовых данных). Хранится в localStorage, чтобы оставаться одинаковым
// на вкладках "Состав" и "Расстановка" — общего React-контекста между этими
// двумя независимыми страницами в приложении нет.
export type PositionOverrides = Record<number, PositionGroup>;

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

// Эффективное амплуа игрока: ручное переопределение, если оно задано,
// иначе — естественное амплуа из тестовых данных.
export function effectivePositionGroup(
  player: { id: number; positionGroup: PositionGroup },
  overrides: PositionOverrides,
): PositionGroup {
  return overrides[player.id] ?? player.positionGroup;
}

export function usePositionOverrides() {
  const [overrides, setOverrides] = useState<PositionOverrides>({});

  // Загружаем сохранённые переопределения после монтирования (не при первом
  // рендере), чтобы серверный и первый клиентский рендер совпадали и React
  // не ругался на несовпадение разметки (localStorage недоступен на сервере).
  useEffect(() => {
    setOverrides(readStorage());
  }, []);

  function setOverride(playerId: number, group: PositionGroup | null) {
    setOverrides((prev) => {
      const next = { ...prev };
      if (group === null) delete next[playerId];
      else next[playerId] = group;
      writeStorage(next);
      return next;
    });
  }

  return { overrides, setOverride };
}
