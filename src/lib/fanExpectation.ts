import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";
import { requestChppXmlRaw, type StoredHattrickTokens } from "./hattrickApi";
import { parseZoneRatings, computePowerIndex, MATCH_DETAILS_VERSION } from "./matchAnalysis";

// "Ожидания болельщиков" — НАШ СОБСТВЕННЫЙ расчётный индикатор (эмодзи-шкала
// по аналогии с реальной механикой Hattrick "ожидания болельщиков"), НЕ
// официальный прогноз Hattrick. Строится на разнице уже реализованного
// "Индекса силы" (computePowerIndex, matchAnalysis.ts) нашей команды и
// соперника В КОНКРЕТНОМ МАТЧЕ (диапазон каждого индекса 0-100, разница —
// -100..+100) — диапазон разницы поделён на 11 примерно равных категорий.
// См. чат "Матчи на Обзоре: индикатор ожиданий болельщиков".
//
// ВАЖНО: индекс силы считается ТОЛЬКО из зональных рейтингов matchdetails.xml
// конкретного матча — эти данные принципиально существуют только для уже
// сыгранных матчей. Для предстоящих (ещё не сыгранных) матчей — всегда
// честный нейтральный индикатор, а не гадание по чужим текущим навыкам.
export type FanExpectationLevel =
  | "must-thrash"
  | "easy-win"
  | "should-win"
  | "we-favor"
  | "slight-us"
  | "even"
  | "slight-opponent"
  | "opponent-favor"
  | "likely-lose"
  | "avoid-thrashing"
  | "dont-embarrass"
  | "unknown";

export interface FanExpectation {
  level: FanExpectationLevel;
  label: string;
  symbol: string;
}

// От наименее выгодной для нас разницы к наиболее выгодной — индекс в
// массиве растёт вместе с разницей "наш индекс силы − индекс соперника"
// (см. fanExpectationForDiff ниже).
const LEVELS: FanExpectation[] = [
  { level: "dont-embarrass", label: "Лучше не позориться", symbol: "🟥🟥🟥🟥🟥" },
  { level: "avoid-thrashing", label: "Не разгромили бы нас", symbol: "🟥🟥🟥🟥" },
  { level: "likely-lose", label: "Наверняка проиграем", symbol: "🟥🟥🟥" },
  { level: "opponent-favor", label: "Фаворит — соперник", symbol: "🟥🟥" },
  { level: "slight-opponent", label: "Небольшое преимущество у соперника", symbol: "🟥" },
  { level: "even", label: "Соперники равны", symbol: "🟩🟥" },
  { level: "slight-us", label: "Небольшое преимущество у нас", symbol: "🟩" },
  { level: "we-favor", label: "Мы фавориты", symbol: "🟩🟩" },
  { level: "should-win", label: "Должны побеждать", symbol: "🟩🟩🟩" },
  { level: "easy-win", label: "Лёгкая победа", symbol: "🟩🟩🟩🟩" },
  { level: "must-thrash", label: "Обязаны разгромить", symbol: "🟩🟩🟩🟩🟩" },
];

export const NEUTRAL_FAN_EXPECTATION: FanExpectation = {
  level: "unknown",
  label: "Собственная оценка недоступна — зональные рейтинги этого матча ещё не известны",
  symbol: "⬜",
};

// Делит диапазон разницы "Индекс силы (мы) − Индекс силы (соперник)"
// (-100..+100) на 11 примерно равных категорий (см. LEVELS выше).
export function fanExpectationForDiff(diff: number): FanExpectation {
  const clamped = Math.max(-100, Math.min(100, diff));
  const bucketWidth = 200 / LEVELS.length;
  const idx = Math.min(LEVELS.length - 1, Math.floor((clamped + 100) / bucketWidth));
  return LEVELS[idx];
}

// Лёгкий запрос matchdetails.xml ТОЛЬКО ради зональных рейтингов обеих команд
// конкретного уже сыгранного матча (без matchlineup.xml/EventList — тех
// данных здесь не нужно, см. resolveMatchAnalysis в matchAnalysis.ts для
// полного разбора матча). Любая недоступность данных (ошибка запроса,
// неполные зоны хотя бы у одной из сторон) — честный нейтральный индикатор,
// а не догадка.
export async function resolveMatchFanExpectation(
  tokens: StoredHattrickTokens,
  matchId: string,
  ourTeamId: string,
): Promise<FanExpectation> {
  try {
    const raw = await requestChppXmlRaw("matchdetails", { matchID: matchId, version: MATCH_DETAILS_VERSION }, tokens);
    if (raw.httpStatus < 200 || raw.httpStatus >= 300) return NEUTRAL_FAN_EXPECTATION;

    const parser = new XMLParser();
    const data = parser.parse(raw.rawXml);
    const root = data?.HattrickData;
    assertNoChppError(root, "matchdetails");

    const match = (root?.Match ?? root) as Record<string, unknown>;
    const homeTeam = match.HomeTeam as Record<string, unknown> | undefined;
    const awayTeam = match.AwayTeam as Record<string, unknown> | undefined;
    const homeTeamId = String(homeTeam?.HomeTeamID ?? "");

    const homePower = computePowerIndex(parseZoneRatings(homeTeam));
    const awayPower = computePowerIndex(parseZoneRatings(awayTeam));
    if (homePower === null || awayPower === null) return NEUTRAL_FAN_EXPECTATION;

    const isHomeUs = homeTeamId === ourTeamId;
    const ourPower = isHomeUs ? homePower : awayPower;
    const oppPower = isHomeUs ? awayPower : homePower;
    return fanExpectationForDiff(ourPower - oppPower);
  } catch {
    return NEUTRAL_FAN_EXPECTATION;
  }
}
