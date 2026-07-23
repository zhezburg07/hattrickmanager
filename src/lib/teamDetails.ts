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
  // ID активного кубка команды, если Hattrick кладёт его прямо в <Cup> рядом
  // со StillInCup — не проверено на живом ответе, читаем защитно (см.
  // src/lib/cupMatches.ts, там же нужен параметр CupID для cupmatches.xml).
  cupId: string | null;
  // Название этого кубка (<CupName>) — по подтверждённой реальной схеме
  // teamdetails.xml (см. независимый CHPP-клиент github.com/lucianoq/hattrick,
  // chpp/file_teamdetails.go) <Cup> всегда содержит РОВНО ОДИН активный кубок
  // команды, а не список всех кубков сразу — то есть если команда выбыла из
  // Национального Кубка, но всё ещё в Кубке Надежды, здесь должно быть имя
  // именно Кубка Надежды. Показывается в диагностике на "Кубках", чтобы
  // явно видеть, какому кубку соответствует найденный CupID, а не гадать.
  cupName: string | null;
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
  // Пробуем несколько вероятных названий поля — не проверено на живом
  // ответе, какое именно использует CHPP (если вообще использует).
  const cupIdRaw = team.Cup?.CupID ?? team.Cup?.CupId ?? team.CupID;
  const cupId = cupIdRaw !== undefined && String(cupIdRaw) !== "" && String(cupIdRaw) !== "0" ? String(cupIdRaw) : null;
  const cupNameRaw = team.Cup?.CupName;
  const cupName = cupNameRaw !== undefined && String(cupNameRaw) !== "" ? String(cupNameRaw) : null;

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
    cupId,
    cupName,
  };
}
