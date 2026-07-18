import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";
import { requestChppXmlRaw, type StoredHattrickTokens } from "./hattrickApi";

// Зал славы клуба (hofplayers.xml, v1.2) — подтверждено по независимому
// CHPP-клиенту github.com/lucianoq/hattrick: список игроков, которых клуб
// когда-либо ввёл в свой Зал славы, с датой введения, возрастом на тот
// момент и шуточной "второй карьерой" (ExpertType — судья/агент/продавец
// хот-догов и т.п., официальный список CHPP из 16 вариантов).
const HOF_PLAYERS_VERSION = "1.2";

// "Жизнь игрока после футбола" — официальный список CHPP (HOFExpertType,
// 16 занятий, часть намеренно шуточные — так их и подаёт сам Hattrick).
const expertTypeLabels: Record<number, string> = {
  1: "судья",
  2: "агент",
  3: "представитель профсоюза игроков",
  4: "ведущий телешоу",
  5: "актёр",
  6: "спортивный журналист",
  7: "директор по маркетингу",
  8: "владелец ресторана",
  9: "главный экипировщик",
  10: "предприниматель",
  11: "продавец хот-догов",
  12: "PR-менеджер",
  13: "директор по продажам",
  14: "ведущий рекламных роликов",
  15: "секретарь",
  16: "не работает",
};

export interface HofPlayer {
  playerId: number;
  name: string;
  countryId: string;
  arrivalDate: string;
  hofDate: string;
  hofAge: number;
  expertLabel: string;
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : value ? [value as Record<string, unknown>] : [];
}

export function parseHofPlayersXml(xml: string): HofPlayer[] {
  const parser = new XMLParser();
  const data = parser.parse(xml);
  const root = data?.HattrickData;
  assertNoChppError(root, "hofplayers");

  const playerList = root?.PlayerList as Record<string, unknown> | undefined;
  const rawPlayers = asArray(playerList?.Player);

  return rawPlayers.map((p) => {
    const firstLast = `${p.FirstName ?? ""} ${p.LastName ?? ""}`.trim();
    const name = firstLast || String(p.NickName ?? "") || `Игрок #${p.PlayerID ?? "?"}`;
    const expertType = Number(p.ExpertType ?? 0);
    return {
      playerId: Number(p.PlayerID ?? 0),
      name,
      countryId: String(p.CountryID ?? ""),
      arrivalDate: String(p.ArrivalDate ?? ""),
      hofDate: String(p.HofDate ?? ""),
      hofAge: Number(p.HofAge ?? 0),
      expertLabel: expertTypeLabels[expertType] ?? "неизвестно",
    };
  });
}

export async function resolveHofPlayers(
  tokens: StoredHattrickTokens,
): Promise<{ players: HofPlayer[] | null; error: string | null }> {
  try {
    const raw = await requestChppXmlRaw("hofplayers", { version: HOF_PLAYERS_VERSION }, tokens);
    if (raw.httpStatus < 200 || raw.httpStatus >= 300) {
      throw new Error(`HTTP ${raw.httpStatus}: ${raw.rawXml.slice(0, 200)}`);
    }
    return { players: parseHofPlayersXml(raw.rawXml), error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    return { players: null, error: `Зал славы (hofplayers): ${message}` };
  }
}
