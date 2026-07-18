import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";
import { requestChppXmlRaw, type StoredHattrickTokens } from "./hattrickApi";
import { stripHtml } from "./htmlText";

// Подробные данные о юношеском игроке сверх общего списка
// youthplayerlist.xml (youthplayerdetails.xml, v1.3) — подтверждено по
// независимому CHPP-клиенту github.com/lucianoq/hattrick. Параметр
// называется "youthPlayerId" (со строчной "d", в отличие от youthTeamID) —
// подтверждено в исходнике клиента. showScoutCall/showLastMatch запрошены
// явно, чтобы получить комментарии скаута и последний сыгранный матч.
const YOUTH_PLAYER_DETAILS_VERSION = "1.3";

export interface YouthPlayerDetailsResult {
  arrivalDate: string;
  canBePromotedIn: number;
  careerGoals: number;
  careerHattricks: number;
  leagueGoals: number;
  friendlyGoals: number;
  statement: string | null;
  scoutName: string | null;
  scoutComments: string[];
  lastMatchDate: string | null;
  lastMatchRating: number | null;
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : value ? [value as Record<string, unknown>] : [];
}

export function parseYouthPlayerDetailsXml(xml: string): YouthPlayerDetailsResult {
  const parser = new XMLParser();
  const data = parser.parse(xml);
  const root = data?.HattrickData;
  assertNoChppError(root, "youthplayerdetails");

  const player = root?.YouthPlayer as Record<string, unknown> | undefined;
  if (!player) {
    throw new Error("В ответе youthplayerdetails.xml нет данных об игроке (<YouthPlayer>).");
  }

  const scoutCall = player.ScoutCall as Record<string, unknown> | undefined;
  const scout = scoutCall?.Scout as Record<string, unknown> | undefined;
  const scoutComments = asArray((scoutCall?.ScoutComments as Record<string, unknown> | undefined)?.ScoutComment).map((c) =>
    stripHtml(String(c.CommentText ?? "")),
  );

  const lastMatch = player.LastMatch as Record<string, unknown> | undefined;

  return {
    arrivalDate: String(player.ArrivalDate ?? ""),
    canBePromotedIn: Number(player.CanBePromotedIn ?? 0),
    careerGoals: Number(player.CareerGoals ?? 0),
    careerHattricks: Number(player.CareerHattricks ?? 0),
    leagueGoals: Number(player.LeagueGoals ?? 0),
    friendlyGoals: Number(player.FriendlyGoals ?? 0),
    statement: player.Statement ? stripHtml(String(player.Statement)) : null,
    scoutName: scout?.ScoutName ? String(scout.ScoutName) : null,
    scoutComments: scoutComments.filter((c) => c.length > 0),
    lastMatchDate: lastMatch?.Date ? String(lastMatch.Date) : null,
    lastMatchRating: lastMatch?.Rating !== undefined ? Number(lastMatch.Rating) : null,
  };
}

export async function resolveYouthPlayerDetails(
  tokens: StoredHattrickTokens,
  youthPlayerId: string,
): Promise<{ data: YouthPlayerDetailsResult | null; error: string | null }> {
  try {
    const raw = await requestChppXmlRaw(
      "youthplayerdetails",
      {
        youthPlayerId,
        showScoutCall: "true",
        showLastMatch: "true",
        version: YOUTH_PLAYER_DETAILS_VERSION,
      },
      tokens,
    );
    if (raw.httpStatus < 200 || raw.httpStatus >= 300) {
      throw new Error(`HTTP ${raw.httpStatus}: ${raw.rawXml.slice(0, 200)}`);
    }
    return { data: parseYouthPlayerDetailsXml(raw.rawXml), error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    return { data: null, error: `Подробности юношеского игрока (youthplayerdetails): ${message}` };
  }
}
