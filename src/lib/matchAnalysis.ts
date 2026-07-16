import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";
import { requestChppXmlRaw, type StoredHattrickTokens } from "./hattrickApi";

// Реальный разбор матча по конкретному MatchID — раньше на "Обзоре матча"
// (раскрытая строка сыгранного матча в календаре) показывались полностью
// выдуманные рейтинги/зоны/хронология/посещаемость (см. git-историю
// src/data/matchAnalysis.ts, удалён). Здесь — только то, для чего в CHPP
// вообще есть правдоподобный реальный источник: рейтинг каждого игрока
// обеих команд (см. src/lib/lastMatchRating.ts — та же идея, но только для
// "нашей" стороны и только для последнего матча; здесь — для любого матча и
// обеих сторон). Зоны владения и посещаемость по конкретному матчу CHPP не
// предоставляет вообще ни в каком файле — эти вкладки просто убраны, а не
// заменены на что-то ещё. Хронология голов тоже не подключена: без живого
// ответа Hattrick нет уверенности, как называется список событий матча и
// какими кодами он размечает тип события (гол/карточка/замена) — угадывать
// это без всякой опоры на уже подтверждённые поля рискованнее, чем просто
// показать честное "недоступно".
export interface MatchPlayerRating {
  playerId: number;
  name: string;
  rating: number;
}

export interface MatchAnalysisResult {
  homeTeamName: string;
  awayTeamName: string;
  homeRatings: MatchPlayerRating[];
  awayRatings: MatchPlayerRating[];
  error: string | null;
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : value ? [value as Record<string, unknown>] : [];
}

function parseTeamRatings(team: Record<string, unknown> | undefined): MatchPlayerRating[] {
  const lineup = team?.Lineup as Record<string, unknown> | undefined;
  const players = asArray(lineup?.Player);

  const ratings: MatchPlayerRating[] = [];
  for (const p of players) {
    const id = Number(p.PlayerID ?? p.PlayerId ?? 0);
    const ratingRaw = p.RatingStars ?? p.Rating ?? p.PlayerRating;
    if (!id || ratingRaw === undefined) continue;
    const rating = Number(ratingRaw);
    if (Number.isNaN(rating)) continue;
    const firstLast = `${p.FirstName ?? ""} ${p.LastName ?? ""}`.trim();
    const name = String(p.PlayerName ?? "") || firstLast;
    ratings.push({ playerId: id, name: name || `Игрок #${id}`, rating });
  }
  return ratings.sort((a, b) => b.rating - a.rating);
}

export async function resolveMatchAnalysis(tokens: StoredHattrickTokens, matchId: string): Promise<MatchAnalysisResult> {
  const empty: MatchAnalysisResult = { homeTeamName: "", awayTeamName: "", homeRatings: [], awayRatings: [], error: null };
  try {
    const raw = await requestChppXmlRaw("matchdetails", { matchID: matchId }, tokens);
    if (raw.httpStatus < 200 || raw.httpStatus >= 300) {
      throw new Error(`HTTP ${raw.httpStatus}: ${raw.rawXml.slice(0, 200)}`);
    }

    const parser = new XMLParser();
    const data = parser.parse(raw.rawXml);
    const root = data?.HattrickData;
    assertNoChppError(root, "matchdetails");

    const match = (root?.Match ?? root) as Record<string, unknown> | undefined;
    const homeTeam = match?.HomeTeam as Record<string, unknown> | undefined;
    const awayTeam = match?.AwayTeam as Record<string, unknown> | undefined;

    return {
      homeTeamName: String(homeTeam?.HomeTeamName ?? ""),
      awayTeamName: String(awayTeam?.AwayTeamName ?? ""),
      homeRatings: parseTeamRatings(homeTeam),
      awayRatings: parseTeamRatings(awayTeam),
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    return { ...empty, error: `Рейтинги матча (matchdetails): ${message}` };
  }
}
