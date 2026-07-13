"use client";

import { useEffect, useState } from "react";
import type { SquadPlayer, PlayerStatSnapshot } from "@/data/squad";

// Тестовые данные уже знают "прошлое" значение каждого игрока (player.prev,
// детерминированная случайная динамика — см. src/data/squad.ts). У реальных
// данных сервер не хранит историю между запросами (каждая синхронизация —
// это просто новый снимок players.xml), поэтому для них значения от прошлого
// визита сохраняются здесь, в браузере, и сравниваются с текущими при
// следующей синхронизации.
const STORAGE_KEY = "hm_player_stats_v1";

function readStorage(): Record<number, PlayerStatSnapshot> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<number, PlayerStatSnapshot>) : {};
  } catch {
    return {};
  }
}

function writeStorage(data: Record<number, PlayerStatSnapshot>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage недоступен (приватный режим и т.п.) — просто не сохраняем историю
  }
}

function snapshotOf(p: SquadPlayer): PlayerStatSnapshot {
  return { skills: { ...p.skills }, experience: p.experience, form: p.form, stamina: p.stamina, tsi: p.tsi };
}

// Возвращает "предыдущий" снимок показателей для каждого игрока (по id) —
// используется, чтобы подсветить рост/падение скиллов, опыта, формы,
// выносливости и TSI между синхронизациями.
export function usePlayerStatChanges(players: SquadPlayer[]): Record<number, PlayerStatSnapshot | undefined> {
  const [prevMap, setPrevMap] = useState<Record<number, PlayerStatSnapshot | undefined>>({});

  useEffect(() => {
    const stored = readStorage();
    const nextPrev: Record<number, PlayerStatSnapshot | undefined> = {};
    const nextStored: Record<number, PlayerStatSnapshot> = { ...stored };

    for (const p of players) {
      if (p.prev) {
        nextPrev[p.id] = p.prev; // тестовые данные — сравнение уже посчитано
      } else {
        nextPrev[p.id] = stored[p.id]; // реальные данные — то, что сохранили в прошлый визит (может отсутствовать)
        nextStored[p.id] = snapshotOf(p);
      }
    }

    setPrevMap(nextPrev);
    writeStorage(nextStored);
  }, [players]);

  return prevMap;
}

export type DiffDirection = "up" | "down" | "none";

export function diffDirection(curr: number, prev: number | undefined): DiffDirection {
  if (prev === undefined || prev === curr) return "none";
  return curr > prev ? "up" : "down";
}

// Текст всплывающей подсказки для изменившегося значения, например
// "Пас: 8 → 9 (+1)" или "TSI: 14 200 → 13 850 (−350)". Возвращает undefined,
// если сравнивать не с чем или значение не изменилось — тогда подсказку
// показывать не нужно.
export function diffTitle(
  label: string,
  prev: number | undefined,
  curr: number,
  format: (n: number) => string = (n) => String(n),
): string | undefined {
  if (prev === undefined || prev === curr) return undefined;
  const delta = curr - prev;
  const sign = delta > 0 ? "+" : "−";
  return `${label}: ${format(prev)} → ${format(curr)} (${sign}${format(Math.abs(delta))})`;
}
