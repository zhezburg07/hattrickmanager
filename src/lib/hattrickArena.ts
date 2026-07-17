import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";
import { requestChppXmlRaw, type StoredHattrickTokens } from "./hattrickApi";

// "Hattrick Arena" (Pro): заявки на товарищеские матчи через challenges.xml
// — CHPP-файл, подтверждённый по официальным именам (constants "challenges",
// версия "1.6"), но поля ВНУТРИ каждой заявки (TeamID/TeamName/дата) в этом
// проекте не проверялись на живом ответе — структура контейнеров
// (Team.ChallengesByMe.Challenge, Team.OffersByOthers.Offer) подтверждена,
// а поля отдельной заявки — лучшее предположение.
//
// ВАЖНО про "лестницы" (ladder) и приватные турниры: у CHPP нет способа
// узнать, в каких лестницах участвует конкретная команда. ladderlist.xml
// отдаёт общий список ВСЕХ лестниц игры (без привязки к команде), а
// ladderdetails.xml показывает таблицу конкретной лестницы только если уже
// знаешь её LadderID — источника "мой LadderID" в CHPP нет. Поэтому здесь
// эти два файла не вызываются вовсе: честная диагностика (см.
// src/components/dashboard/HattrickArenaSection.tsx) важнее звонка в CHPP
// ради вопроса, на который он структурно не может ответить. Отдельного
// файла для приватных турниров CHPP тоже не описывает.
export interface ArenaChallengeEntry {
  opponentTeamId: string;
  opponentTeamName: string;
  matchDate: string | null;
}

export interface ArenaChallengesResult {
  sentByUs: ArenaChallengeEntry[];
  offersFromOthers: ArenaChallengeEntry[];
  error: string | null;
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : value ? [value as Record<string, unknown>] : [];
}

function parseChallengeEntry(entry: Record<string, unknown>): ArenaChallengeEntry {
  const teamId = String(entry.TeamID ?? entry.TeamId ?? "");
  const teamName = String(entry.TeamName ?? "");
  const matchDateRaw = entry.MatchDate ?? entry.Date ?? entry.ProposedDate;
  return {
    opponentTeamId: teamId,
    opponentTeamName: teamName || `Команда #${teamId || "?"}`,
    matchDate: matchDateRaw !== undefined ? String(matchDateRaw) : null,
  };
}

export async function resolveArenaChallenges(tokens: StoredHattrickTokens): Promise<ArenaChallengesResult> {
  try {
    const raw = await requestChppXmlRaw("challenges", {}, tokens);
    if (raw.httpStatus < 200 || raw.httpStatus >= 300) {
      throw new Error(`HTTP ${raw.httpStatus}: ${raw.rawXml.slice(0, 200)}`);
    }

    const parser = new XMLParser();
    const data = parser.parse(raw.rawXml);
    const root = data?.HattrickData;
    assertNoChppError(root, "challenges");

    const team = root?.Team as Record<string, unknown> | undefined;
    const challengesByMe = asArray((team?.ChallengesByMe as Record<string, unknown> | undefined)?.Challenge);
    const offersByOthers = asArray((team?.OffersByOthers as Record<string, unknown> | undefined)?.Offer);

    return {
      sentByUs: challengesByMe.map(parseChallengeEntry),
      offersFromOthers: offersByOthers.map(parseChallengeEntry),
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    return { sentByUs: [], offersFromOthers: [], error: `Заявки на товарищеские матчи (challenges): ${message}` };
  }
}
