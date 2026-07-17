import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";
import { formatMatchDateTime } from "@/data/dashboard";
import type { SeasonMatch } from "@/data/matches";

export type RealMatchStatus = "FINISHED" | "ONGOING" | "UPCOMING";

export interface RealMatch {
  matchId: string;
  date: string; // как прислал Hattrick (ISO-подобная строка)
  home: boolean;
  opponent: string;
  // TeamID соперника — используется для "Анализа соперника" (см.
  // src/lib/opponentAnalysis.ts), чтобы запросить matches.xml/matchdetails.xml
  // уже для ЕГО команды. HomeTeamID/AwayTeamID — те же подтверждённые поля,
  // что уже используются на строке выше для определения opponent.
  opponentTeamId: string;
  status: RealMatchStatus;
  ourScore: number | null;
  oppScore: number | null;
  matchType: string;
  // ID кубка — заполнено только у кубковых матчей, если Hattrick вообще
  // кладёт это поле сюда (не проверено на живом ответе; нужно для
  // cupmatches.xml, см. src/lib/cupMatches.ts).
  cupId: string | null;
  // Какая игровая система сгенерировала матч — по независимому CHPP-клиенту
  // (github.com/lucianoq/hattrick), поле <SourceSystem> принимает одно из
  // трёх строковых значений: "hattrick" (основная команда, обычные лига/
  // кубок/квалификация/товарищеские), "youth" (юношеская команда), или
  // "htointegrated" (внешние интегрированные турниры — сюда попадают
  // Hattrick Arena/Masters/лестницы/приватные турниры). Не проверено на
  // живом ответе этого проекта — если поле отсутствует, остаётся null и
  // матч по умолчанию считается относящимся к основной команде (см.
  // filterTrainingRelevantMatches), чтобы отсутствие поля не обнулило весь
  // список.
  sourceSystem: string | null;
  // Правила проведения товарищеского матча — 0 обычные, 1 по кубковым
  // правилам, 12 матч сборной (нам, клубу, встретиться не должен, но
  // проверяем на всякий случай) — тоже не проверено на живом ответе.
  matchRuleId: string | null;
}

// Разбирает XML-ответ CHPP на файл matches.xml (или matchesarchive.xml —
// более длинная история сезонов; Hattrick переиспользует ту же структуру
// <Match>, см. аналогичный приём в src/lib/cupMatches.ts) — последние и
// ближайшие матчи команды. Hattrick сам решает, что считать "нашей" и
// "чужой" стороной по HomeTeamID/AwayTeamID — здесь просто сравниваем с
// ourTeamId.
export function parseMatchesXml(xml: string, ourTeamId: string): RealMatch[] {
  const parser = new XMLParser();
  const data = parser.parse(xml);

  const root = data?.HattrickData;
  assertNoChppError(root, "matches");

  const rawMatches = root?.Team?.MatchList?.Match ?? root?.MatchList?.Match;
  const matches = Array.isArray(rawMatches) ? rawMatches : rawMatches ? [rawMatches] : [];

  return matches.map((m: Record<string, unknown>) => {
    const homeTeam = m.HomeTeam as Record<string, unknown> | undefined;
    const awayTeam = m.AwayTeam as Record<string, unknown> | undefined;
    const isHome = String(homeTeam?.HomeTeamID ?? "") === ourTeamId;
    const opponent = isHome ? String(awayTeam?.AwayTeamName ?? "") : String(homeTeam?.HomeTeamName ?? "");
    const opponentTeamId = String(isHome ? (awayTeam?.AwayTeamID ?? "") : (homeTeam?.HomeTeamID ?? ""));

    const homeGoals = m.HomeGoals !== undefined ? Number(m.HomeGoals) : null;
    const awayGoals = m.AwayGoals !== undefined ? Number(m.AwayGoals) : null;

    const cupIdRaw = m.CupID ?? m.CupId;
    const cupId = cupIdRaw !== undefined && String(cupIdRaw) !== "" && String(cupIdRaw) !== "0" ? String(cupIdRaw) : null;

    const sourceSystemRaw = m.SourceSystem;
    const sourceSystem = sourceSystemRaw !== undefined ? String(sourceSystemRaw).toLowerCase() : null;

    const matchRuleRaw = m.MatchRuleId ?? m.MatchRuleID;
    const matchRuleId = matchRuleRaw !== undefined ? String(matchRuleRaw) : null;

    return {
      matchId: String(m.MatchID ?? ""),
      date: String(m.MatchDate ?? ""),
      home: isHome,
      opponent,
      opponentTeamId,
      status: (String(m.Status ?? "UPCOMING").toUpperCase() as RealMatchStatus) || "UPCOMING",
      ourScore: homeGoals === null || awayGoals === null ? null : isHome ? homeGoals : awayGoals,
      oppScore: homeGoals === null || awayGoals === null ? null : isHome ? awayGoals : homeGoals,
      matchType: String(m.MatchType ?? ""),
      cupId,
      sourceSystem,
      matchRuleId,
    };
  });
}

// Оставляет только сыгранные матчи основной команды, реально учитываемые
// Hattrick для тренировки: обычная игровая система ("hattrick" в
// SourceSystem), исключая юношескую команду ("youth") и интегрированные
// внешние турниры ("htointegrated" — Hattrick Arena, Masters, лестницы,
// приватные турниры, которые правилами Hattrick не дают тренировки). Если
// SourceSystem у матча не пришёл вовсе — матч по умолчанию считается
// относящимся к основной команде (см. комментарий у RealMatch.sourceSystem),
// чтобы отсутствие поля не срезало всю историю. matchRuleId "12" (товарищеский
// матч сборной) исключается отдельно, на случай прямого совпадения.
export function filterTrainingRelevantMatches(matches: RealMatch[]): RealMatch[] {
  return matches.filter((m) => {
    if (m.status !== "FINISHED" || m.ourScore === null || m.oppScore === null) return false;
    if (m.sourceSystem !== null && m.sourceSystem !== "hattrick") return false;
    if (m.matchRuleId === "12") return false;
    return true;
  });
}

// Убирает дубликаты при объединении matches.xml (текущий сезон) и
// matchesarchive.xml (более длинная история) — оба файла могут вернуть один
// и тот же матч текущего сезона, оставляем только одну запись на MatchID.
export function dedupeMatches(matches: RealMatch[]): RealMatch[] {
  const seen = new Map<string, RealMatch>();
  for (const m of matches) {
    if (m.matchId) seen.set(m.matchId, m);
  }
  return [...seen.values()];
}

// Приводит реальные матчи к тому же виду, что и полный календарь сезона
// (SeasonMatch) — для страницы "Матчи". Сортировка — от новых/ближайших к
// старым (сверху вниз), а не наоборот. CHPP не даёт номер тура лиги —
// round всегда null. Соревнование: "Товарищеский" — единственное
// достоверное значение (matchType "0"); "Кубок" — определяется по CupID
// (см. RealMatch.cupId, не проверено на живом ответе); всё остальное
// помечается "Лига" как наиболее вероятный вариант для обычного клуба, хотя
// MatchType в CHPP на самом деле — контекстный ID турнира, а не простая
// категория, так что для редких случаев (например, международные товарищеские
// турниры) эта метка может быть неточной.
export function toSeasonMatches(matches: RealMatch[]): SeasonMatch[] {
  const sorted = [...matches].sort((a, b) => b.date.localeCompare(a.date));
  return sorted.map((m, i) => {
    const { shortDate, time } = formatMatchDateTime(m.date);
    const competition = m.matchType === "0" ? "Товарищеский" : m.cupId !== null ? "Кубок" : "Лига";
    return {
      id: Number(m.matchId) || i + 1,
      round: null,
      competition,
      date: time ? `${shortDate} · ${time}` : shortDate,
      opponent: m.opponent,
      home: m.home,
      ourScore: m.status === "FINISHED" ? m.ourScore : null,
      oppScore: m.status === "FINISHED" ? m.oppScore : null,
    };
  });
}
