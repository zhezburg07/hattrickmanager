import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";
import { requestChppXmlRaw, type StoredHattrickTokens } from "./hattrickApi";

// Команды, которые поддерживает наша команда, и команды, которые
// поддерживают нас (supporters.xml, v1.0) — подтверждено по независимому
// CHPP-клиенту github.com/lucianoq/hattrick. Один файл, два режима через
// actionType: "supportedteams" (кого поддерживаем мы) и "mysupporters"
// (кто поддерживает нас) — оба запрашиваются отдельно.
const SUPPORTERS_VERSION = "1.0";

export interface SupporterTeamEntry {
  teamId: string;
  teamName: string;
  leagueName: string;
  // Только для "кого поддерживаем мы" — счёт последнего матча поддерживаемой
  // команды, если он пришёл в ответе.
  lastMatchScore: string | null;
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : value ? [value as Record<string, unknown>] : [];
}

function parseTeamEntry(t: Record<string, unknown>): SupporterTeamEntry {
  const lastMatch = t.LastMatch as Record<string, unknown> | undefined;
  let lastMatchScore: string | null = null;
  if (lastMatch) {
    const homeGoals = lastMatch.LastMatchHomeGoals;
    const awayGoals = lastMatch.LastMatchAwayGoals;
    if (homeGoals !== undefined && awayGoals !== undefined) {
      lastMatchScore = `${lastMatch.LastMatchHomeTeamName ?? "?"} ${homeGoals}:${awayGoals} ${lastMatch.LastMatchAwayTeamName ?? "?"}`;
    }
  }
  return {
    teamId: String(t.TeamId ?? ""),
    teamName: String(t.TeamName ?? ""),
    leagueName: String(t.LeagueName ?? ""),
    lastMatchScore,
  };
}

export function parseSupportedTeamsXml(xml: string): SupporterTeamEntry[] {
  const parser = new XMLParser();
  const data = parser.parse(xml);
  const root = data?.HattrickData;
  assertNoChppError(root, "supporters");
  const container = root?.SupportedTeams as Record<string, unknown> | undefined;
  return asArray(container?.SupportedTeam).map(parseTeamEntry);
}

export function parseMySupportersXml(xml: string): SupporterTeamEntry[] {
  const parser = new XMLParser();
  const data = parser.parse(xml);
  const root = data?.HattrickData;
  assertNoChppError(root, "supporters");
  const container = root?.MySupporters as Record<string, unknown> | undefined;
  return asArray(container?.SupporterTeam).map(parseTeamEntry);
}

export interface SupportersResult {
  weSupport: SupporterTeamEntry[] | null;
  weSupportError: string | null;
  ourSupporters: SupporterTeamEntry[] | null;
  ourSupportersError: string | null;
}

export async function resolveSupporters(tokens: StoredHattrickTokens): Promise<SupportersResult> {
  const [weSupportResult, ourSupportersResult] = await Promise.allSettled([
    requestChppXmlRaw("supporters", { actionType: "supportedteams", pageIndex: "0", version: SUPPORTERS_VERSION }, tokens),
    requestChppXmlRaw("supporters", { actionType: "mysupporters", pageIndex: "0", version: SUPPORTERS_VERSION }, tokens),
  ]);

  let weSupport: SupporterTeamEntry[] | null = null;
  let weSupportError: string | null = null;
  if (weSupportResult.status === "fulfilled") {
    const raw = weSupportResult.value;
    if (raw.httpStatus >= 200 && raw.httpStatus < 300) {
      try {
        weSupport = parseSupportedTeamsXml(raw.rawXml);
      } catch (err) {
        weSupportError = `Кого поддерживаем мы (supporters): ${err instanceof Error ? err.message : "неизвестная ошибка"}`;
      }
    } else {
      weSupportError = `Кого поддерживаем мы (supporters): HTTP ${raw.httpStatus}: ${raw.rawXml.slice(0, 200)}`;
    }
  } else {
    weSupportError = `Кого поддерживаем мы (supporters): ${weSupportResult.reason instanceof Error ? weSupportResult.reason.message : weSupportResult.reason}`;
  }

  let ourSupporters: SupporterTeamEntry[] | null = null;
  let ourSupportersError: string | null = null;
  if (ourSupportersResult.status === "fulfilled") {
    const raw = ourSupportersResult.value;
    if (raw.httpStatus >= 200 && raw.httpStatus < 300) {
      try {
        ourSupporters = parseMySupportersXml(raw.rawXml);
      } catch (err) {
        ourSupportersError = `Кто поддерживает нас (supporters): ${err instanceof Error ? err.message : "неизвестная ошибка"}`;
      }
    } else {
      ourSupportersError = `Кто поддерживает нас (supporters): HTTP ${raw.httpStatus}: ${raw.rawXml.slice(0, 200)}`;
    }
  } else {
    ourSupportersError = `Кто поддерживает нас (supporters): ${ourSupportersResult.reason instanceof Error ? ourSupportersResult.reason.message : ourSupportersResult.reason}`;
  }

  return { weSupport, weSupportError, ourSupporters, ourSupportersError };
}
