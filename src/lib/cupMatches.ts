import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";

export type RealCupMatchStatus = "FINISHED" | "ONGOING" | "UPCOMING";

export interface RealCupMatch {
  matchId: string;
  date: string;
  home: boolean;
  opponent: string;
  status: RealCupMatchStatus;
  ourScore: number | null;
  oppScore: number | null;
}

// Разбирает XML-ответ CHPP на файл cupmatches.xml.
//
// ИСПРАВЛЕНО по реальной схеме (подтверждено через исходный код независимого
// CHPP-клиента github.com/lucianoq/hattrick, chpp/file_cupmatches.go — там
// struct-теги читаются из реального ответа, а не угадываются): прежняя
// версия этого файла предполагала ту же форму, что и matches.xml
// (<Team><MatchList><Match>, с полями <HomeTeamID>/<HomeTeamName>,
// счётом прямо в <Match>, полем <Status>) — на деле cupmatches.xml устроен
// иначе:
//   - корневой контейнер — <Cup> (не <Team>);
//   - матчи — <Cup><MatchList><Match>;
//   - команды — <HomeTeam>/<AwayTeam>, но с полями <TeamId>/<TeamName>
//     (не <HomeTeamID>/<HomeTeamName>, как в matches.xml — разные файлы
//     CHPP называют одно и то же по-разному);
//   - счёт — не прямо в <Match>, а во вложенном <MatchResult>
//     <HomeGoals>/<AwayGoals>, который заполнен только когда матч уже
//     сыгран (это отмечено атрибутом Available="True"/"False" на самом
//     контейнере <MatchResult>);
//   - отдельного поля <Status> ("FINISHED"/"UPCOMING") в этом файле нет
//     вовсе (оно есть только в matches.xml) — статус матча приходится
//     определять по Available.
// Проект везде использует fast-xml-parser без чтения атрибутов (см.
// src/lib/playerEvents.ts) — здесь это ЕДИНСТВЕННОЕ место, где это
// переопределено локально, специально чтобы прочитать Available; на случай,
// если атрибут всё же не придёт (или в реальном ответе этого аккаунта
// устроено иначе), статус подстраховывается ещё и присутствием самих голов
// — тот же приём, что уже используется в src/lib/leagueFixtures.ts.
export function parseCupMatchesXml(xml: string, ourTeamId: string): RealCupMatch[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const data = parser.parse(xml);

  const root = data?.HattrickData;
  assertNoChppError(root, "cupmatches");

  const cup = root?.Cup as Record<string, unknown> | undefined;
  const matchList = cup?.MatchList as Record<string, unknown> | undefined;
  // Запасной вариант на случай, если реальный ответ всё же ближе к прежнему
  // предположению (Team>MatchList>Match) — не должно понадобиться, но не
  // стоит терять весь список из-за одной неверно угаданной детали.
  const legacyTeam = root?.Team as Record<string, unknown> | undefined;
  const legacyMatchList = (legacyTeam?.MatchList ?? root?.MatchList) as Record<string, unknown> | undefined;
  const rawMatches = matchList?.Match ?? legacyMatchList?.Match;
  const matches: Record<string, unknown>[] = Array.isArray(rawMatches) ? rawMatches : rawMatches ? [rawMatches] : [];

  return matches.map((m) => {
    const homeTeam = m.HomeTeam as Record<string, unknown> | undefined;
    const awayTeam = m.AwayTeam as Record<string, unknown> | undefined;
    const homeTeamId = String(homeTeam?.TeamId ?? homeTeam?.TeamID ?? homeTeam?.HomeTeamID ?? "");
    const isHome = homeTeamId === ourTeamId;
    const opponent = isHome
      ? String(awayTeam?.TeamName ?? awayTeam?.AwayTeamName ?? "")
      : String(homeTeam?.TeamName ?? homeTeam?.HomeTeamName ?? "");

    const result = m.MatchResult as Record<string, unknown> | undefined;
    const homeGoalsRaw = result?.HomeGoals ?? m.HomeGoals;
    const awayGoalsRaw = result?.AwayGoals ?? m.AwayGoals;
    const homeGoals = homeGoalsRaw !== undefined ? Number(homeGoalsRaw) : NaN;
    const awayGoals = awayGoalsRaw !== undefined ? Number(awayGoalsRaw) : NaN;
    const availableRaw = result?.["@_Available"];
    const isPlayed =
      availableRaw !== undefined
        ? String(availableRaw) === "True"
        : !Number.isNaN(homeGoals) && !Number.isNaN(awayGoals);

    return {
      matchId: String(m.MatchID ?? ""),
      date: String(m.MatchDate ?? ""),
      home: isHome,
      opponent,
      status: isPlayed ? "FINISHED" : "UPCOMING",
      ourScore: isPlayed && !Number.isNaN(homeGoals) && !Number.isNaN(awayGoals) ? (isHome ? homeGoals : awayGoals) : null,
      oppScore: isPlayed && !Number.isNaN(homeGoals) && !Number.isNaN(awayGoals) ? (isHome ? awayGoals : homeGoals) : null,
    };
  });
}
