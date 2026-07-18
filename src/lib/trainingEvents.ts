import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";
import { requestChppXmlRaw, type StoredHattrickTokens } from "./hattrickApi";

// Официальный журнал изменений навыков игрока (trainingevents.xml, v1.3) —
// подтверждено по независимому CHPP-клиенту github.com/lucianoq/hattrick.
// В отличие от собственной БД проекта (см. src/lib/playerHistoryDb.ts,
// снимок раз в неделю при каждом визите на Состав/Расстановку), это
// официальный список КОНКРЕТНЫХ скачков навыка (было X → стало Y),
// привязанный не к календарной дате, а к игровым единицам Hattrick (сезон,
// тур лиги, день недели 1-7) — сопоставить его 1-в-1 с обычной датой без
// отдельного знания даты начала конкретного сезона нельзя, поэтому здесь
// это отдельный, дополнительный источник ("официальный журнал"), а не
// замена собственной БД-истории.
const TRAINING_EVENTS_VERSION = "1.3";

// SkillID — тот же официальный список CHPP, что и в transfersearch.xml
// (см. src/components/dashboard/TransferSearchPanel.tsx).
const skillIdLabels: Record<number, string> = {
  1: "Вратарь",
  2: "Выносливость",
  3: "Стандарты",
  4: "Защита",
  5: "Нападение",
  6: "Фланг",
  7: "Пас",
  8: "Плеймейкинг",
  9: "Тренерство",
  10: "Лидерство",
  11: "Опыт",
};

export interface TrainingEvent {
  skillLabel: string;
  oldLevel: number;
  newLevel: number;
  season: number;
  matchRound: number;
  dayNumber: number;
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : value ? [value as Record<string, unknown>] : [];
}

export function parseTrainingEventsXml(xml: string): TrainingEvent[] {
  const parser = new XMLParser();
  const data = parser.parse(xml);
  const root = data?.HattrickData;
  assertNoChppError(root, "trainingevents");

  const player = root?.Player as Record<string, unknown> | undefined;
  const trainingEvents = player?.TrainingEvents as Record<string, unknown> | undefined;
  const rawEvents = asArray(trainingEvents?.TrainingEvent);

  const events: TrainingEvent[] = rawEvents.map((e) => {
    const skillId = Number(e.SkillID ?? 0);
    return {
      skillLabel: skillIdLabels[skillId] ?? `Навык #${skillId}`,
      oldLevel: Number(e.OldLevel ?? 0),
      newLevel: Number(e.NewLevel ?? 0),
      season: Number(e.Season ?? 0),
      matchRound: Number(e.MatchRound ?? 0),
      dayNumber: Number(e.DayNumber ?? 0),
    };
  });

  // Сортировка по сезону/туру/дню — от новых к старым.
  return events.sort((a, b) => b.season - a.season || b.matchRound - a.matchRound || b.dayNumber - a.dayNumber);
}

export async function resolveTrainingEvents(
  tokens: StoredHattrickTokens,
  playerId: string,
): Promise<{ events: TrainingEvent[] | null; error: string | null }> {
  try {
    const raw = await requestChppXmlRaw("trainingevents", { playerID: playerId, version: TRAINING_EVENTS_VERSION }, tokens);
    if (raw.httpStatus < 200 || raw.httpStatus >= 300) {
      throw new Error(`HTTP ${raw.httpStatus}: ${raw.rawXml.slice(0, 200)}`);
    }
    return { events: parseTrainingEventsXml(raw.rawXml), error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    return { events: null, error: `Журнал тренировок (trainingevents): ${message}` };
  }
}
