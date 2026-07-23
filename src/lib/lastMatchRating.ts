import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";
import { requestChppXmlRaw, type StoredHattrickTokens } from "./hattrickApi";
import { parseTeamDetailsXml } from "./teamDetails";
import { parseMatchesXml } from "./matches";

// Рейтинг игрока за сыгранные матчи (звёзды, как в самой Hattrick) —
// раньше в проекте таких данных не было: src/data/matchAnalysis.ts (теперь
// удалён) для "Обзора матча" был целиком иллюстративной детерминированной
// генерацией, а не реальным ответом CHPP.
//
// Схема: 1) teamdetails.xml → наш TeamID; 2) matches.xml → последние N
// матчей со статусом FINISHED; 3) matchlineup.xml по каждому MatchID →
// наш состав и рейтинг (RatingStars) вышедших на поле игроков.
//
// ИСПРАВЛЕНО: раньше здесь запрашивался matchdetails.xml и читалось
// Team/Lineup/Player/RatingStars — это поле никогда не было подтверждено
// на живом ответе и было лишь предположением по аналогии с matches.xml.
// Проверка реальной схемы matchdetails.xml (v3.1, через независимый CHPP-
// клиент github.com/lucianoq/hattrick) показала, что HomeTeam/AwayTeam там
// вообще не содержат Lineup/Player — только командные показатели (Rating*
// по зонам, Formation, TacticType и т.п.). Список игроков с их рейтингом
// (RatingStars/RatingStarsEndOfMatch) отдаёт ОТДЕЛЬНЫЙ файл — matchlineup.xml
// (v2.1), причём по одному запросу на одну команду (свою — без teamID,
// чужую — с явным teamID). Здесь нужна только "наша" сторона, поэтому одного
// запроса на матч достаточно (teamID не передаём — CHPP по умолчанию отдаёт
// команду залогиненного пользователя).
const RECENT_MATCH_COUNT = 3;
const MATCH_LINEUP_VERSION = "2.1";

export interface RecentMatchRatingsResult {
  lastMatchRatings: Record<number, number>;
  bestOfRecentRatings: Record<number, number>;
  error: string | null;
}

export async function resolveLastMatchRatings(tokens: StoredHattrickTokens): Promise<RecentMatchRatingsResult> {
  const empty: RecentMatchRatingsResult = { lastMatchRatings: {}, bestOfRecentRatings: {}, error: null };
  try {
    const teamRaw = await requestChppXmlRaw("teamdetails", {}, tokens);
    if (teamRaw.httpStatus < 200 || teamRaw.httpStatus >= 300) {
      throw new Error(`teamdetails HTTP ${teamRaw.httpStatus}`);
    }
    const teamId = parseTeamDetailsXml(teamRaw.rawXml).teamId;

    const matchesRaw = await requestChppXmlRaw("matches", {}, tokens);
    if (matchesRaw.httpStatus < 200 || matchesRaw.httpStatus >= 300) {
      throw new Error(`matches HTTP ${matchesRaw.httpStatus}`);
    }
    const matches = parseMatchesXml(matchesRaw.rawXml, teamId);
    const recentFinished = matches
      .filter((m) => m.status === "FINISHED" && m.matchId)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, RECENT_MATCH_COUNT);
    if (recentFinished.length === 0) {
      return empty;
    }

    const lineupRaws = await Promise.all(
      recentFinished.map((m) =>
        requestChppXmlRaw("matchlineup", { matchID: m.matchId, version: MATCH_LINEUP_VERSION, sourceSystem: "hattrick" }, tokens),
      ),
    );

    const perMatchRatings = lineupRaws.map((raw) => {
      if (raw.httpStatus < 200 || raw.httpStatus >= 300) return {};
      try {
        return parseMatchLineupRatings(raw.rawXml);
      } catch {
        return {};
      }
    });

    const lastMatchRatings = perMatchRatings[0] ?? {};
    const bestOfRecentRatings: Record<number, number> = {};
    for (const ratings of perMatchRatings) {
      for (const [playerId, rating] of Object.entries(ratings)) {
        const id = Number(playerId);
        bestOfRecentRatings[id] = bestOfRecentRatings[id] !== undefined ? Math.max(bestOfRecentRatings[id], rating) : rating;
      }
    }

    return { lastMatchRatings, bestOfRecentRatings, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    return { ...empty, error: `Рейтинг последних матчей: ${message}` };
  }
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : value ? [value as Record<string, unknown>] : [];
}

function parseMatchLineupRatings(xml: string): Record<number, number> {
  const parser = new XMLParser();
  const data = parser.parse(xml);
  const root = data?.HattrickData;
  assertNoChppError(root, "matchlineup");

  const team = root?.Team as Record<string, unknown> | undefined;
  const lineup = team?.Lineup as Record<string, unknown> | undefined;
  const players = asArray(lineup?.Player);

  // ИСПРАВЛЕНО: RatingStars — основной рейтинг за матч (то, что Hattrick
  // официально показывает как "звёзды" игрока за игру); RatingStarsEndOfMatch —
  // отдельное поле, дающее рейтинг именно К КОНЦУ матча, уже сниженный
  // усталостью к 90-й минуте. Раньше здесь бралось RatingStarsEndOfMatch
  // первым — из-за этого столбец "Рейтинг последнего матча" в "Составе"
  // систематически показывал заниженные значения по сравнению с реальным
  // hattrick.org (подтверждено на живых данных: например, Elimbetov 7.5 на
  // сайте Hattrick vs 5.5 здесь, Farstad 11.5 vs 9, Usenov 8 vs 5.5).
  const ratings: Record<number, number> = {};
  for (const p of players) {
    const id = Number(p.PlayerID ?? p.PlayerId ?? 0);
    const ratingRaw = p.RatingStars ?? p.RatingStarsEndOfMatch;
    if (!id || ratingRaw === undefined) continue;
    const rating = Number(ratingRaw);
    if (!Number.isNaN(rating)) ratings[id] = rating;
  }
  return ratings;
}
