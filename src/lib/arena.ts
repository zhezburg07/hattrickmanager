import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";

export interface RealArenaCapacity {
  arenaName: string;
  terraces: number;
  basic: number;
  roof: number;
  vip: number;
  total: number;
}

// Разбирает XML-ответ CHPP на файл arenadetails.xml. Даёт только реальное
// число мест по 4 категориям — доход/содержание за место CHPP не отдаёт
// (это либо цены на билеты, которые задаёт сам менеджер, либо не
// раскрываемые через API константы), поэтому для денежных прикидок
// по-прежнему используются ориентировочные ставки из тестовых данных.
export function parseArenaDetailsXml(xml: string): RealArenaCapacity {
  const parser = new XMLParser();
  const data = parser.parse(xml);

  const root = data?.HattrickData;
  assertNoChppError(root, "arenadetails");

  const arena = root?.Arena;
  if (!arena) {
    throw new Error("В ответе arenadetails.xml нет данных о стадионе (<Arena>).");
  }

  const capacity = arena.CurrentCapacity ?? {};

  return {
    arenaName: String(arena.ArenaName ?? ""),
    terraces: Number(capacity.Terraces ?? 0),
    basic: Number(capacity.Basic ?? 0),
    roof: Number(capacity.Roof ?? 0),
    vip: Number(capacity.VIP ?? 0),
    total: Number(capacity.Total ?? 0),
  };
}
