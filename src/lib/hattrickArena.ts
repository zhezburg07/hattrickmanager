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
// CHPP не даёт единого файла "результаты Arena" — источники РАЗНЫЕ для
// разных подсистем Arena, и это ПОДТВЕРЖДЕНО на реальных данных (см. чат
// "Отличная новость по Турнирам"):
//   - "Ладдер" (лестница): подтверждено — физически недоступен через CHPP
//     ни в каком виде. matches.xml/matchesarchive.xml НЕ содержат эти матчи
//     вообще (сверено по датам с реальными матчами на hattrick.org — полное
//     отсутствие, не вопрос неверного MatchType). ladderlist.xml/
//     ladderdetails.xml тоже не годятся (см. комментарий выше про Ladder).
//     LADDER_MATCH_TYPE (62) оставлен как есть — вдруг на каком-то другом
//     аккаунте это всё же сработает, но на практике пока ни разу не дал
//     результата, и дальше не угадываем (решение пользователя — честное
//     ограничение, не самоцель "найти любой ценой").
//   - "Турнир": подтверждено — tournamentlist.xml реально отдаёт турниры
//     ИМЕННО нашей команды (докстрока независимого клиента "The list of
//     tournaments the given team takes part in" оказалась верной), а
//     tournamentfixtures.xml по TournamentID даёт реальные результаты
//     матчей. Основной, рабочий источник для этого раздела теперь — здесь.
export interface ArenaRecentMatch {
  matchId: string;
  date: string;
  home: boolean;
  opponent: string;
  ourScore: number;
  oppScore: number;
  source: "ladder" | "tournament";
  tournamentName?: string;
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
      source: "ladder" as const,
    }));
}

// ---------- tournamentlist.xml / tournamentfixtures.xml (см. чат
// "Отличная новость по Турнирам") — подтверждённый рабочий источник ----------
//
// tournamentlist.xml (v1.0) — список турниров ИМЕННО нашей команды.
// Подтверждено на реальных данных: 2 турнира ("Champions League (Small
// club)" TournamentId=6994463, "Kazakhstan Cup - Liga: III"
// TournamentId=5484335). Не требует параметров, кроме версии — сам User
// определяется по OAuth-токену, как и остальные "мои данные" файлы.
export const TOURNAMENT_LIST_VERSION = "1.0";

export interface TournamentListEntry {
  tournamentId: string;
  name: string;
}

export function parseTournamentListXml(xml: string): TournamentListEntry[] {
  const parser = new XMLParser();
  const data = parser.parse(xml);
  const root = data?.HattrickData;
  assertNoChppError(root, "tournamentlist");

  const tournaments = asArray((root?.Tournaments as Record<string, unknown> | undefined)?.Tournament);
  return tournaments.map((t) => ({
    tournamentId: String(t.TournamentId ?? t.TournamentID ?? ""),
    name: String(t.Name ?? `Турнир #${t.TournamentId ?? t.TournamentID ?? "?"}`),
  }));
}

// tournamentfixtures.xml (v1.1) — реальные матчи (включая счёт) конкретного
// турнира, ПО ВСЕМ участникам, а не только нашей команде (структура
// TournamentFixture по независимому клиенту: HomeTeamID/AwayTeamID/
// HomeGoals/AwayGoals/Status на КАЖДЫЙ матч турнира) — поэтому здесь, как и
// в matches.ts, нужно самим отфильтровать по ourTeamId и определить
// домашнюю/гостевую сторону.
//
// ПАРАМЕТР ЗАПРОСА НЕ ПОДТВЕРЖДЁН НА ЖИВЫХ ДАННЫХ: официальная документация
// CHPP по этому файлу недоступна из песочницы (сайты chpp.hattrick.org и
// hattrick.org недоступны отсюда), а независимый клиент lucianoq/hattrick
// содержит только формы ответа, не параметры запроса. Используется
// "tournamentID" по аналогии с остальными ID-параметрами проекта
// (cupID/matchID/youthPlayerId) — если CHPP ответит ошибкой/пустым списком,
// это будет видно в диагностике (см. chppSync.ts) и параметр нужно будет
// подобрать по-другому, а не считать, что турниров действительно нет.
export const TOURNAMENT_FIXTURES_VERSION = "1.1";

export function parseTournamentFixturesXml(
  xml: string,
  ourTeamId: string,
  tournamentName: string,
): ArenaRecentMatch[] {
  const parser = new XMLParser();
  const data = parser.parse(xml);
  const root = data?.HattrickData;
  assertNoChppError(root, "tournamentfixtures");

  const rawMatches = asArray((root?.Matches as Record<string, unknown> | undefined)?.Match);

  return rawMatches
    .filter((m) => {
      const homeId = String(m.HomeTeamId ?? m.HomeTeamID ?? "");
      const awayId = String(m.AwayTeamId ?? m.AwayTeamID ?? "");
      const status = String(m.Status ?? "").toUpperCase();
      return (homeId === ourTeamId || awayId === ourTeamId) && status === "FINISHED";
    })
    .map((m) => {
      const homeId = String(m.HomeTeamId ?? m.HomeTeamID ?? "");
      const isHome = homeId === ourTeamId;
      const homeGoals = m.HomeGoals !== undefined ? Number(m.HomeGoals) : 0;
      const awayGoals = m.AwayGoals !== undefined ? Number(m.AwayGoals) : 0;
      const opponent = isHome ? String(m.AwayTeamName ?? "") : String(m.HomeTeamName ?? "");
      return {
        matchId: String(m.MatchId ?? m.MatchID ?? ""),
        date: String(m.MatchDate ?? ""),
        home: isHome,
        opponent,
        ourScore: isHome ? homeGoals : awayGoals,
        oppScore: isHome ? awayGoals : homeGoals,
        source: "tournament" as const,
        tournamentName,
      };
    });
}
