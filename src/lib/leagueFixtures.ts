import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";

export interface RealFixtureMatch {
  matchId: string;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  homeGoals: number | null; // null — матч ещё не сыгран
  awayGoals: number | null;
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : value ? [value as Record<string, unknown>] : [];
}

// Разбирает XML-ответ CHPP на файл leaguefixtures.xml — календарь ВСЕЙ серии
// (LeagueLevelUnitID), а не только своей команды: все матчи между всеми
// командами лиги за сезон, с результатами уже сыгранных. Используется, чтобы
// построить настоящую сетку очных результатов на Обзоре (см.
// src/lib/realLeagueMatrix.ts) — то же самое, что сейчас показывается на
// тестовых данных (src/data/leagueMatrix.ts), но из реального CHPP.
//
// ИСПРАВЛЕНО (см. чат "Сетка результатов лиги: HTTP 200, но 0 матчей") —
// раньше здесь предполагался контейнер <MatchList><Match> (по аналогии с
// matches.xml) — НИКОГДА не проверенный на живом ответе именно этого файла.
// Независимый CHPP-клиент (github.com/lucianoq/hattrick,
// chpp/file_leaguefixtures.go): верхний тип встраивает `*SeriesFixtures`
// АНОНИМНО (без xml-тега) — по тому же паттерну, что и встроенный `Envelope`
// в каждом файле этого клиента (проверено отдельно на file_teamdetails.go:
// анонимное встраивание там means "поля переносятся на родительский элемент
// напрямую, без обёртки" — Envelope-поля лежат прямо в HattrickData). Значит
// <Match> лежит НАПРЯМУЮ под <HattrickData>, БЕЗ обёртки <SeriesFixtures> —
// не так, как можно ошибочно предположить по одному только названию Go-типа.
// Старые пути (MatchList, SeriesFixtures.Match) оставлены запасными
// вариантами на случай, если реальный ответ всё же не совпадёт и с этим.
export function parseLeagueFixturesXml(xml: string): RealFixtureMatch[] {
  const parser = new XMLParser();
  const data = parser.parse(xml);

  const root = data?.HattrickData;
  assertNoChppError(root, "leaguefixtures");

  const rawMatches =
    root?.Match ??
    (root?.SeriesFixtures as Record<string, unknown> | undefined)?.Match ??
    root?.MatchList?.Match ??
    root?.Team?.MatchList?.Match;
  const matches = asArray(rawMatches);

  return matches.map((m) => {
    const homeTeam = m.HomeTeam as Record<string, unknown> | undefined;
    const awayTeam = m.AwayTeam as Record<string, unknown> | undefined;

    const homeGoalsRaw = m.HomeGoals !== undefined ? Number(m.HomeGoals) : NaN;
    const awayGoalsRaw = m.AwayGoals !== undefined ? Number(m.AwayGoals) : NaN;
    const isPlayed = !Number.isNaN(homeGoalsRaw) && !Number.isNaN(awayGoalsRaw) && homeGoalsRaw >= 0 && awayGoalsRaw >= 0;

    return {
      matchId: String(m.MatchID ?? ""),
      homeTeamId: String(homeTeam?.HomeTeamID ?? ""),
      homeTeamName: String(homeTeam?.HomeTeamName ?? ""),
      awayTeamId: String(awayTeam?.AwayTeamID ?? ""),
      awayTeamName: String(awayTeam?.AwayTeamName ?? ""),
      homeGoals: isPlayed ? homeGoalsRaw : null,
      awayGoals: isPlayed ? awayGoalsRaw : null,
    };
  });
}

// Номер текущего сезона + дата самого раннего матча (round 1) этого сезона
// — единственный бесплатный источник "якоря" для вычисления номера сезона
// по дате в matches.xml/matchesarchive.xml (у которых поля Season нет
// вообще, см. чат "Матчи по сезонам" — computeSeasonNumber в matches.ts).
// leaguefixtures.xml УЖЕ запрашивается для сетки результатов лиги выше —
// это не отдельный запрос. Официально подтверждено (wiki.hattrick.org/wiki/
// CHPP_Development/XML/leagueFixtures): HattrickData/Season = "сезон, к
// которому относятся данные" — раз мы не передаём параметр season, CHPP
// отдаёт текущий. earliestMatchDate — минимум MatchDate по ВСЕМ матчам
// ответа (весь сезон целиком, включая ещё не сыгранные раунды), что и есть
// дата 1-го тура, без отдельного чтения поля MatchRound.
export function parseLeagueFixturesSeasonInfo(xml: string): { season: number | null; earliestMatchDate: string | null } {
  const parser = new XMLParser();
  const data = parser.parse(xml);
  const root = data?.HattrickData as Record<string, unknown> | undefined;
  const seasonRaw = root?.Season;
  const season = seasonRaw !== undefined && seasonRaw !== null && !Number.isNaN(Number(seasonRaw)) ? Number(seasonRaw) : null;

  const rawMatches =
    root?.Match ??
    (root?.SeriesFixtures as Record<string, unknown> | undefined)?.Match ??
    (root?.MatchList as Record<string, unknown> | undefined)?.Match ??
    ((root?.Team as Record<string, unknown> | undefined)?.MatchList as Record<string, unknown> | undefined)?.Match;
  const matches = asArray(rawMatches);

  let earliestMatchDate: string | null = null;
  for (const m of matches) {
    const d = m.MatchDate !== undefined ? String(m.MatchDate) : null;
    if (d && (earliestMatchDate === null || d < earliestMatchDate)) earliestMatchDate = d;
  }

  return { season, earliestMatchDate };
}

// ДИАГНОСТИКА (тот же приём, что уже выручил с tournamentfixtures.xml, см.
// debugTournamentFixturesRawStructure в hattrickArena.ts) — пробует
// несколько вероятных путей к списку матчей одновременно и дампит ПОЛНЫЙ
// первый найденный сырой матч (все поля как есть), чтобы одним взглядом
// подтвердить или опровергнуть путь root.Match, выбранный выше по логике
// анонимного встраивания, а не гадать по одному полю за раз ещё раз.
export function debugLeagueFixturesRawStructure(xml: string): string {
  const parser = new XMLParser();
  const data = parser.parse(xml);
  const root = data?.HattrickData as Record<string, unknown> | undefined;
  if (!root) return "root (HattrickData) не найден — либо другой корневой тег, либо XML не разобрался";

  const rootKeys = Object.keys(root);
  const candidates: { path: string; count: number; sample: string }[] = [];
  const record = (path: string, value: unknown) => {
    const arr = asArray(value);
    candidates.push({ path, count: arr.length, sample: arr.length > 0 ? JSON.stringify(arr[0]).slice(0, 400) : "" });
  };

  record("root.Match", root.Match);
  record("root.SeriesFixtures.Match", (root.SeriesFixtures as Record<string, unknown> | undefined)?.Match);
  record("root.MatchList.Match", (root.MatchList as Record<string, unknown> | undefined)?.Match);
  record("root.Team.MatchList.Match", ((root.Team as Record<string, unknown> | undefined)?.MatchList as Record<string, unknown> | undefined)?.Match);

  const summary = candidates
    .map((c) => `${c.path}: ${c.count} эл.${c.sample ? ` первый=${c.sample}` : ""}`)
    .join(" | ");
  return `Ключи HattrickData: [${rootKeys.join(", ")}]. ${summary}`;
}
