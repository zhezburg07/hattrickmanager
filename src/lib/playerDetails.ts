import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";
import { requestChppXmlRaw, type StoredHattrickTokens } from "./hattrickApi";

// Подробные данные об игроке сверх общего списка players.xml (playerdetails.xml,
// v3.2) — подтверждено по независимому CHPP-клиенту github.com/lucianoq/hattrick.
// Здесь собрано только то, чего НЕТ в общем списке состава (SquadPlayer,
// см. src/data/squad.ts): полная разбивка карьерных голов/передач по видам
// соревнований, сборная и молодёжные вызовы, черты характера, родной клуб,
// статус на трансфере. Требует actionType=view + playerID.
const PLAYER_DETAILS_VERSION = "3.2";

const agreeabilityLabels = ["скандалист", "спорная личность", "приятный парень", "симпатичный парень", "популярный парень", "любимец команды"];
const aggressivenessLabels = ["спокойный", "хладнокровный", "уравновешенный", "вспыльчивый", "горячий", "неуправляемый"];
const honestyLabels = ["печально известен", "нечестный", "честный", "порядочный", "праведный", "святой"];

function traitLabel(labels: string[], value: number): string | null {
  if (value < 0 || value >= labels.length) return null;
  return labels[value];
}

export interface PlayerCareerDetails {
  careerGoals: number;
  careerHattricks: number;
  careerAssists: number;
  leagueGoals: number;
  cupGoals: number;
  friendliesGoals: number;
  matchesCurrentTeam: number;
  goalsCurrentTeam: number;
  assistsCurrentTeam: number;
  caps: number;
  capsU20: number;
  nationalTeamName: string | null;
  agreeability: string | null;
  aggressiveness: string | null;
  honesty: string | null;
  motherClubName: string | null;
  motherClubBonus: boolean;
  statement: string | null;
  transferListed: boolean;
  transferAskingPrice: number | null;
  transferDeadline: string | null;
  transferHighestBid: number | null;
}

export function parsePlayerDetailsXml(xml: string): PlayerCareerDetails {
  const parser = new XMLParser();
  const data = parser.parse(xml);
  const root = data?.HattrickData;
  assertNoChppError(root, "playerdetails");

  const player = root?.Player as Record<string, unknown> | undefined;
  if (!player) {
    throw new Error("В ответе playerdetails.xml нет данных об игроке (<Player>).");
  }

  const motherClub = player.MotherClub as Record<string, unknown> | undefined;
  const transferDetails = player.TransferDetails as Record<string, unknown> | undefined;

  // CupGoals в исходной схеме — элемент с атрибутом Available (только для
  // диагностики "нет данных, пока идёт матч") и текстовым содержимым
  // (число голов). fast-xml-parser здесь использован без ignoreAttributes:
  // false ни разу в проекте, так что этот и другие XML-атрибуты по всему
  // коду читать не пытаемся — они просто отбрасываются парсером, и
  // player.CupGoals приходит сюда уже как обычное число/строка.

  return {
    careerGoals: Number(player.CareerGoals ?? 0),
    careerHattricks: Number(player.CareerHattricks ?? 0),
    careerAssists: Number(player.CareerAssists ?? 0),
    leagueGoals: Number(player.LeagueGoals ?? 0),
    cupGoals: Number(player.CupGoals ?? 0),
    friendliesGoals: Number(player.FriendliesGoals ?? 0),
    matchesCurrentTeam: Number(player.MatchesCurrentTeam ?? 0),
    goalsCurrentTeam: Number(player.GoalsCurrentTeam ?? 0),
    assistsCurrentTeam: Number(player.AssistsCurrentTeam ?? 0),
    caps: Number(player.Caps ?? 0),
    capsU20: Number(player.CapsU20 ?? 0),
    nationalTeamName: player.NationalTeamName ? String(player.NationalTeamName) : null,
    agreeability: traitLabel(agreeabilityLabels, Number(player.Agreeability ?? -1)),
    aggressiveness: traitLabel(aggressivenessLabels, Number(player.Aggressiveness ?? -1)),
    honesty: traitLabel(honestyLabels, Number(player.Honesty ?? -1)),
    motherClubName: motherClub?.TeamName ? String(motherClub.TeamName) : null,
    motherClubBonus: String(player.MotherClubBonus ?? "").toLowerCase() === "true",
    statement: player.Statement ? String(player.Statement) : null,
    transferListed: String(player.TransferListed ?? "").toLowerCase() === "true",
    transferAskingPrice: transferDetails?.AskingPrice !== undefined ? Number(transferDetails.AskingPrice) : null,
    transferDeadline: transferDetails?.Deadline !== undefined ? String(transferDetails.Deadline) : null,
    transferHighestBid: transferDetails?.HighestBid !== undefined ? Number(transferDetails.HighestBid) : null,
  };
}

export async function resolvePlayerDetails(
  tokens: StoredHattrickTokens,
  playerId: string,
): Promise<{ data: PlayerCareerDetails | null; error: string | null }> {
  try {
    const raw = await requestChppXmlRaw(
      "playerdetails",
      { actionType: "view", playerID: playerId, version: PLAYER_DETAILS_VERSION },
      tokens,
    );
    if (raw.httpStatus < 200 || raw.httpStatus >= 300) {
      throw new Error(`HTTP ${raw.httpStatus}: ${raw.rawXml.slice(0, 200)}`);
    }
    return { data: parsePlayerDetailsXml(raw.rawXml), error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    return { data: null, error: `Подробности игрока (playerdetails): ${message}` };
  }
}
