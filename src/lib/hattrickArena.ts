import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";
import { requestChppXmlRaw, type StoredHattrickTokens } from "./hattrickApi";
import { LADDER_MATCH_TYPE, type RealMatch } from "./matches";

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

// Разбор вынесен отдельно от fetch (см. чат "Фаза 3") — синхронизация
// (src/lib/chppSync.ts) переиспользует уже полученный raw XML вместо
// повторного запроса challenges.xml.
export function parseChallengesXml(xml: string): Omit<ArenaChallengesResult, "error"> {
  const parser = new XMLParser();
  const data = parser.parse(xml);
  const root = data?.HattrickData;
  assertNoChppError(root, "challenges");

  const team = root?.Team as Record<string, unknown> | undefined;
  const challengesByMe = asArray((team?.ChallengesByMe as Record<string, unknown> | undefined)?.Challenge);
  const offersByOthers = asArray((team?.OffersByOthers as Record<string, unknown> | undefined)?.Offer);

  return {
    sentByUs: challengesByMe.map(parseChallengeEntry),
    offersFromOthers: offersByOthers.map(parseChallengeEntry),
  };
}

export async function resolveArenaChallenges(tokens: StoredHattrickTokens): Promise<ArenaChallengesResult> {
  try {
    const raw = await requestChppXmlRaw("challenges", {}, tokens);
    if (raw.httpStatus < 200 || raw.httpStatus >= 300) {
      throw new Error(`HTTP ${raw.httpStatus}: ${raw.rawXml.slice(0, 200)}`);
    }
    const { sentByUs, offersFromOthers } = parseChallengesXml(raw.rawXml);
    return { sentByUs, offersFromOthers, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    return { sentByUs: [], offersFromOthers: [], error: `Заявки на товарищеские матчи (challenges): ${message}` };
  }
}

// ---------- Последние сыгранные Arena-матчи (см. чат "Hattrick Arena:
// синхронизация последних сыгранных матчей") ----------
//
// CHPP не даёт отдельного файла "результаты Arena/лестницы" — единственный
// источник для СЫГРАННЫХ матчей вообще это matches.xml/matchesarchive.xml
// (уже разбираются в matches.ts, RealMatch). Выделяем среди них именно
// Arena-матчи по MatchType === LADDER_MATCH_TYPE (62) — см. комментарий
// там же про источник и степень уверенности в этом значении.
export interface ArenaRecentMatch {
  matchId: string;
  date: string;
  home: boolean;
  opponent: string;
  ourScore: number;
  oppScore: number;
}

// limit=10 — по запросу ("последние 10 сыгранных матчей"). Сортировка по
// дате по убыванию — те же строки MatchDate, что и везде в проекте
// (лексикографически сортируемый формат), см. TransferHistoryEntry.deadline.
export function filterRecentArenaMatches(matches: RealMatch[], limit = 10): ArenaRecentMatch[] {
  return matches
    .filter(
      (m) =>
        Number(m.matchType) === LADDER_MATCH_TYPE &&
        m.status === "FINISHED" &&
        m.ourScore !== null &&
        m.oppScore !== null,
    )
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit)
    .map((m) => ({
      matchId: m.matchId,
      date: m.date,
      home: m.home,
      opponent: m.opponent,
      ourScore: m.ourScore as number,
      oppScore: m.oppScore as number,
    }));
}

// ---------- ИССЛЕДОВАНИЕ: tournamentlist.xml (см. чат "матчи Ладдер/
// Турнир не попадают в выборку из matches.xml") ----------
//
// Пользователь подтвердил на реальном hattrick.org: десятки сыгранных
// матчей типов "Ладдер" И "Турнир" за последний месяц — но диагностика
// (MatchType=62 и полная гистограмма) показала 0 совпадений среди 61
// сыгранного матча из matches.xml/matchesarchive.xml. Это означает, что
// матчи Arena-системы, ПОХОЖЕ, вообще не приходят через обычный список
// матчей команды — нужен другой источник.
//
// Независимый CHPP-клиент (github.com/lucianoq/hattrick) описывает ОТДЕЛЬНУЮ
// от лестниц группу файлов: tournamentlist.xml/tournamentdetails.xml/
// tournamentfixtures.xml ("HTO tournaments" — турниры, создаваемые
// пользователями). В отличие от ladderlist.xml (общий список ВСЕХ лестниц
// игры, без привязки к команде — см. комментарий выше про Ladder), докстрока
// у tournamentlist.xml прямо говорит: "The list of tournaments the given
// team takes part in" — то есть, в отличие от лестниц, для турниров у CHPP,
// похоже, ЕСТЬ команд-специфичный источник. НЕ проверено на живых данных
// этого аккаунта — это диагностика, а не готовая функциональность: сначала
// подтверждаем, что файл вообще отвечает и содержит турниры именно нашей
// команды, и только потом (если подтвердится) строим на этом
// tournamentfixtures.xml для реальных результатов матчей.
export const TOURNAMENT_LIST_VERSION = "1.0";

export function debugTournamentListXml(xml: string): string {
  const parser = new XMLParser();
  const data = parser.parse(xml);
  const root = data?.HattrickData;
  assertNoChppError(root, "tournamentlist");

  const tournaments = asArray((root?.Tournaments as Record<string, unknown> | undefined)?.Tournament);
  if (tournaments.length === 0) {
    return "0 турниров в ответе (либо команда ни в одном не участвует, либо контейнер/поле называется иначе, чем предполагалось)";
  }
  return tournaments
    .map(
      (t) =>
        `TournamentId=${JSON.stringify(t.TournamentId ?? t.TournamentID)} Name=${JSON.stringify(t.Name)} ` +
        `TournamentType=${JSON.stringify(t.TournamentType)} Season=${JSON.stringify(t.Season)} ` +
        `IsMatchesOngoing=${JSON.stringify(t.IsMatchesOngoing)}`,
    )
    .join(" || ");
}
