import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";

export interface RealTeamDetails {
  teamId: string;
  teamName: string;
  shortTeamName: string;
  leagueName: string;
  leagueId: string; // нужен для worlddetails.xml (валюта страны), см. src/lib/worldCurrency.ts
  leagueLevelUnitId: string;
  teamRank: number | null; // может отсутствовать/быть 0, если рейтинг ещё не посчитан
  trainerPlayerId: string; // тренер в Hattrick — это один из игроков ростера, см. players.xml
  // Реальный "Рейтинг силы" — проверено на живом ответе Hattrick, есть
  // прямо в teamdetails.xml (<PowerRating>), никакой отдельный файл не нужен.
  powerRatingValue: number | null;
  powerRatingGlobalRank: number | null;
  stillInCup: boolean | null; // null — поле <Cup> недоступно в ответе
}

// Разбирает XML-ответ CHPP на файл teamdetails.xml.
export function parseTeamDetailsXml(xml: string): RealTeamDetails {
  const parser = new XMLParser();
  const data = parser.parse(xml);

  const root = data?.HattrickData;
  assertNoChppError(root, "teamdetails");

  const team = root.Team;
  if (!team) {
    throw new Error("В ответе teamdetails.xml нет данных о команде (<Team>).");
  }

  const rank = team.TeamRank !== undefined ? Number(team.TeamRank) : NaN;
  const powerRatingValue = team.PowerRating?.PowerRating !== undefined ? Number(team.PowerRating.PowerRating) : NaN;
  const globalRank =
    team.PowerRating?.GlobalRanking !== undefined ? Number(team.PowerRating.GlobalRanking) : NaN;
  const stillInCupRaw = team.Cup?.StillInCup;

  return {
    teamId: String(team.TeamID ?? ""),
    teamName: String(team.TeamName ?? ""),
    shortTeamName: String(team.ShortTeamName ?? ""),
    leagueName: String(team.League?.LeagueName ?? ""),
    leagueId: String(team.League?.LeagueID ?? ""),
    leagueLevelUnitId: String(team.LeagueLevelUnit?.LeagueLevelUnitID ?? ""),
    teamRank: Number.isNaN(rank) ? null : rank,
    trainerPlayerId: String(team.Trainer?.PlayerID ?? ""),
    powerRatingValue: Number.isNaN(powerRatingValue) ? null : powerRatingValue,
    powerRatingGlobalRank: Number.isNaN(globalRank) ? null : globalRank,
    stillInCup: stillInCupRaw === undefined ? null : String(stillInCupRaw) === "True",
  };
}
