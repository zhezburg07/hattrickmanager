import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";
import { requestChppXmlRaw, type StoredHattrickTokens } from "./hattrickApi";
import { parseTeamDetailsXml } from "./teamDetails";
import { parseMatchesXml } from "./matches";

// Рейтинг игрока за сыгранные матчи (звёзды, 0-10, как в самой Hattrick) —
// раньше в проекте таких данных не было: src/data/matchAnalysis.ts (теперь
// удалён) для "Обзора матча" был целиком иллюстративной детерминированной
// генерацией, а не реальным ответом CHPP.
//
// Схема: 1) teamdetails.xml → наш TeamID; 2) matches.xml → последние N
// матчей со статусом FINISHED; 3) matchdetails.xml по каждому MatchID →
// состав и рейтинг (RatingStars) наших игроков, вышедших на поле. Из этого
// же набора считаются два показателя разом (без повторных запросов
// teamdetails/matches): рейтинг за самый последний матч и лучший рейтинг
// среди последних RECENT_MATCH_COUNT матчей — "пиковая форма" игрока за
// это время.
//
// Поля matchdetails.xml (Team/Lineup/Player, RatingStars) не проверялись на
// живом ответе Hattrick — структура предположена по аналогии с уже
// подтверждённым matches.xml (см. src/lib/matches.ts) и общей схемой CHPP.
// Если что-то не совпадёт — функция вернёт пустые карты рейтингов через
// error, вызывающий код (squad/page.tsx) честно оставит рейтинг непоказанным
// у всех игроков, ничего не сломав.
const RECENT_MATCH_COUNT = 3;

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

    const detailsRaws = await Promise.all(
      recentFinished.map((m) => requestChppXmlRaw("matchdetails", { matchID: m.matchId }, tokens)),
    );

    const perMatchRatings = detailsRaws.map((raw) => {
      if (raw.httpStatus < 200 || raw.httpStatus >= 300) return {};
      try {
        return parseMatchDetailsRatings(raw.rawXml, teamId);
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

function parseMatchDetailsRatings(xml: string, ourTeamId: string): Record<number, number> {
  const parser = new XMLParser();
  const data = parser.parse(xml);
  const root = data?.HattrickData;
  assertNoChppError(root, "matchdetails");

  const match = (root?.Match ?? root) as Record<string, unknown> | undefined;
  const homeTeam = match?.HomeTeam as Record<string, unknown> | undefined;
  const awayTeam = match?.AwayTeam as Record<string, unknown> | undefined;
  const isHome = String(homeTeam?.HomeTeamID ?? "") === ourTeamId;
  const ourTeam = isHome ? homeTeam : awayTeam;

  const lineup = ourTeam?.Lineup as Record<string, unknown> | undefined;
  const players = asArray(lineup?.Player);

  const ratings: Record<number, number> = {};
  for (const p of players) {
    const id = Number(p.PlayerID ?? p.PlayerId ?? 0);
    const ratingRaw = p.RatingStars ?? p.Rating ?? p.PlayerRating;
    if (!id || ratingRaw === undefined) continue;
    const rating = Number(ratingRaw);
    if (!Number.isNaN(rating)) ratings[id] = rating;
  }
  return ratings;
}
