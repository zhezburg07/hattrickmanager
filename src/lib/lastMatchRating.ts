import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";
import { requestChppXmlRaw, type StoredHattrickTokens } from "./hattrickApi";
import { parseTeamDetailsXml } from "./teamDetails";
import { parseMatchesXml } from "./matches";

// Рейтинг игрока за последний сыгранный матч (звёзды, как на карточке
// игрока) — раньше в проекте таких данных не было: src/data/matchAnalysis.ts
// для "Обзора матча" целиком иллюстративная детерминированная генерация, а
// не реальный ответ CHPP.
//
// Схема: 1) teamdetails.xml → наш TeamID; 2) matches.xml → последний матч со
// статусом FINISHED; 3) matchdetails.xml по его MatchID → состав и рейтинг
// (RatingStars) каждого нашего игрока, вышедшего на поле.
//
// Поля matchdetails.xml (Team/Lineup/Player, RatingStars) не проверялись на
// живом ответе Hattrick — структура предположена по аналогии с уже
// подтверждённым matches.xml (см. src/lib/matches.ts) и общей схемой CHPP.
// Если что-то не совпадёт — функция вернёт пустую карту рейтингов через
// error, вызывающий код (squad/page.tsx) честно оставит рейтинг непоказанным
// у всех игроков, ничего не сломав.
export async function resolveLastMatchRatings(
  tokens: StoredHattrickTokens,
): Promise<{ ratings: Record<number, number>; error: string | null }> {
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
    const lastFinished = matches
      .filter((m) => m.status === "FINISHED" && m.matchId)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!lastFinished) {
      return { ratings: {}, error: null };
    }

    const detailsRaw = await requestChppXmlRaw("matchdetails", { matchID: lastFinished.matchId }, tokens);
    if (detailsRaw.httpStatus < 200 || detailsRaw.httpStatus >= 300) {
      throw new Error(`matchdetails HTTP ${detailsRaw.httpStatus}: ${detailsRaw.rawXml.slice(0, 200)}`);
    }
    return { ratings: parseMatchDetailsRatings(detailsRaw.rawXml, teamId), error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    return { ratings: {}, error: `Рейтинг последнего матча: ${message}` };
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
