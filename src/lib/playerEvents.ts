import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";
import { requestChppXmlRaw, type StoredHattrickTokens } from "./hattrickApi";
import { stripHtml } from "./htmlText";

// Карьерная история игрока (playerevents.xml, v1.3) — подтверждено по
// независимому CHPP-клиенту github.com/lucianoq/hattrick. PlayerEventTypeID
// нигде официально не документирован как фиксированный список (сам клиент
// прямо пишет: "No fixed list of event types is documented") — используем
// готовый EventText от Hattrick напрямую, как и для хронологии матча (см.
// src/lib/matchAnalysis.ts), а не пытаемся угадывать категорию по коду.
// EventText может содержать HTML-разметку — чистим через stripHtml.
const PLAYER_EVENTS_VERSION = "1.3";

export interface PlayerCareerEvent {
  date: string;
  text: string;
}

export interface PlayerEventsResult {
  available: boolean;
  events: PlayerCareerEvent[];
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : value ? [value as Record<string, unknown>] : [];
}

export function parsePlayerEventsXml(xml: string): PlayerEventsResult {
  const parser = new XMLParser();
  const data = parser.parse(xml);
  const root = data?.HattrickData;
  assertNoChppError(root, "playerevents");

  const player = root?.Player as Record<string, unknown> | undefined;
  const playerEvents = player?.PlayerEvents as Record<string, unknown> | undefined;
  // Available — XML-атрибут ("Available,attr" в исходной схеме), у
  // fast-xml-parser по умолчанию атрибуты не читаются вовсе (ignoreAttributes:
  // true) — если он всё же понадобится точно, придётся включить parseAttributeValue;
  // пока честно считаем "доступно", если пришёл хотя бы один Event.
  const rawEvents = asArray(playerEvents?.PlayerEvent);

  const events: PlayerCareerEvent[] = rawEvents.map((e) => ({
    date: String(e.EventDate ?? ""),
    text: stripHtml(String(e.EventText ?? "")),
  }));

  return {
    available: events.length > 0,
    events: events.sort((a, b) => b.date.localeCompare(a.date)),
  };
}

export async function resolvePlayerEvents(
  tokens: StoredHattrickTokens,
  playerId: string,
): Promise<{ data: PlayerEventsResult | null; error: string | null }> {
  try {
    const raw = await requestChppXmlRaw("playerevents", { playerID: playerId, version: PLAYER_EVENTS_VERSION }, tokens);
    if (raw.httpStatus < 200 || raw.httpStatus >= 300) {
      throw new Error(`HTTP ${raw.httpStatus}: ${raw.rawXml.slice(0, 200)}`);
    }
    return { data: parsePlayerEventsXml(raw.rawXml), error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    return { data: null, error: `История карьеры (playerevents): ${message}` };
  }
}
