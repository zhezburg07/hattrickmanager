import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";
import { requestChppXmlRaw, type StoredHattrickTokens } from "./hattrickApi";

// "Ожидания болельщиков" — РЕАЛЬНОЕ официальное поле Hattrick (fans.xml,
// FanMatchExpectation), не наша собственная эвристика. См. чат "Заменить
// расчётный индикатор ожиданий на реальные данные CHPP, если найдутся":
// раньше здесь стояла своя эвристика (разница "Индекса силы" — суммы
// зональных рейтингов matchdetails.xml, см. git-историю), реализованная БЕЗ
// проверки, есть ли у Hattrick официальное поле для того же самого — при
// честной проверке независимого CHPP-клиента (github.com/lucianoq/hattrick,
// chpp/file_fans.go + chpp/type_fan_match_expectation.go) выяснилось, что
// поле ЕСТЬ: перечисление из 9 значений (0-8, от самого пессимистичного до
// самого оптимистичного), присутствует И у уже сыгранных матчей ("ожидание
// ДО того, как матч был сыгран" — честный исторический прогноз, не наша
// ретроспективная оценка по факту), И у предстоящих (тот же смысл, что
// показывает сам hattrick.org перед матчем). НЕ проверено на живых данных
// этого аккаунта — полная диагностика сырого ответа пишется в chppSync.ts.
export const FANS_VERSION = "1.3";

export type FanExpectationLevel =
  | "better-not-show-up"
  | "we-are-outclassed"
  | "we-will-lose"
  | "they-are-favourites"
  | "they-have-the-edge"
  | "close-affair"
  | "we-have-the-edge"
  | "we-are-favourites"
  | "we-will-win"
  | "unknown";

export interface FanExpectation {
  level: FanExpectationLevel;
  label: string;
  symbol: string;
}

// Индекс в массиве = официальное числовое значение FanMatchExpectation
// (0-8, см. chpp/type_fan_match_expectation.go) — от самого пессимистичного
// к самому оптимистичному. Асимметрия эмодзи-шкалы (5 ступеней "против нас",
// 1 нейтральная, 3 ступени "за нас") — не наша выдумка, а прямое отражение
// самой официальной шкалы Hattrick (5 значений хуже CloseAffair, 3 лучше).
const LEVELS: FanExpectation[] = [
  { level: "better-not-show-up", label: "Лучше не позориться", symbol: "🟥🟥🟥🟥🟥" },
  { level: "we-are-outclassed", label: "Мы слабее классом", symbol: "🟥🟥🟥🟥" },
  { level: "we-will-lose", label: "Наверняка проиграем", symbol: "🟥🟥🟥" },
  { level: "they-are-favourites", label: "Фаворит — соперник", symbol: "🟥🟥" },
  { level: "they-have-the-edge", label: "Небольшое преимущество у соперника", symbol: "🟥" },
  { level: "close-affair", label: "Соперники равны", symbol: "🟩🟥" },
  { level: "we-have-the-edge", label: "Небольшое преимущество у нас", symbol: "🟩" },
  { level: "we-are-favourites", label: "Мы фавориты", symbol: "🟩🟩" },
  { level: "we-will-win", label: "Мы победим", symbol: "🟩🟩🟩" },
];

export const NEUTRAL_FAN_EXPECTATION: FanExpectation = {
  level: "unknown",
  label: "Официальные ожидания болельщиков для этого матча недоступны",
  symbol: "⬜",
};

function fanExpectationFromCode(raw: unknown): FanExpectation {
  const n = Number(raw);
  if (Number.isNaN(n) || n < 0 || n >= LEVELS.length) return NEUTRAL_FAN_EXPECTATION;
  return LEVELS[n];
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : value ? [value as Record<string, unknown>] : [];
}

// ДИАГНОСТИКА — полный сырой дамп fans.xml (все ключи Team + количество и
// первая запись каждого из PlayedMatches/UpcomingMatches), тот же приём, что
// уже применялся для других файлов, впервые подключаемых в этом проекте.
export function debugFansFullResponse(xml: string): string {
  const parser = new XMLParser();
  const data = parser.parse(xml);
  const root = data?.HattrickData as Record<string, unknown> | undefined;
  if (!root) return "root (HattrickData) не найден — либо другой корневой тег, либо XML не разобрался";

  const team = root.Team as Record<string, unknown> | undefined;
  if (!team) return `Ключи HattrickData: [${Object.keys(root).join(", ")}]. <Team> не найден.`;

  const played = asArray((team.PlayedMatches as Record<string, unknown> | undefined)?.Match);
  const upcoming = asArray((team.UpcomingMatches as Record<string, unknown> | undefined)?.Match);

  return (
    `Ключи <Team>: [${Object.keys(team).join(", ")}]. FanMood=${JSON.stringify(team.FanMood)}, FanSeasonExpectation=${JSON.stringify(team.FanSeasonExpectation)}. ` +
    `PlayedMatches: ${played.length} эл.${played.length > 0 ? ` первый=${JSON.stringify(played[0])}` : ""}. ` +
    `UpcomingMatches: ${upcoming.length} эл.${upcoming.length > 0 ? ` первый=${JSON.stringify(upcoming[0])}` : ""}.`
  );
}

// Чистый разбор fans.xml (вынесен отдельно от запроса — тот же приём, что и
// у остальных parseXxxXml в проекте, для проверки на тестовом XML без
// живого запроса) — FanMatchExpectation И для уже сыгранных, И для
// предстоящих матчей (по докстроке независимого клиента — "3 последних
// сыгранных и 3 ближайших"), сведённые в один Record<matchId, FanExpectation>.
// Если матч не попал в эту тройку с каждой стороны (например 4-й показанный
// на Обзоре матч, см. OVERVIEW_MATCHES_COUNT в chppSync.ts) — для него
// честно нет записи, читающий код должен подставить NEUTRAL_FAN_EXPECTATION сам.
export function parseFansXml(xml: string): Record<string, FanExpectation> {
  const parser = new XMLParser();
  const data = parser.parse(xml);
  const root = data?.HattrickData;
  assertNoChppError(root, "fans");

  const team = root?.Team as Record<string, unknown> | undefined;
  const played = asArray((team?.PlayedMatches as Record<string, unknown> | undefined)?.Match);
  const upcoming = asArray((team?.UpcomingMatches as Record<string, unknown> | undefined)?.Match);

  const byMatchId: Record<string, FanExpectation> = {};
  for (const m of [...played, ...upcoming]) {
    const matchId = String(m.MatchID ?? m.MatchId ?? "");
    if (!matchId) continue;
    byMatchId[matchId] = fanExpectationFromCode(m.FanMatchExpectation);
  }
  return byMatchId;
}

// Запрашивает fans.xml (своя команда, без параметров кроме версии) — ОДИН
// запрос вместо прежних отдельных matchdetails.xml на каждый матч.
export async function resolveFanExpectations(
  tokens: StoredHattrickTokens,
): Promise<{ byMatchId: Record<string, FanExpectation>; rawDump: string; error: string | null }> {
  try {
    const raw = await requestChppXmlRaw("fans", { version: FANS_VERSION }, tokens);
    if (raw.httpStatus < 200 || raw.httpStatus >= 300) {
      throw new Error(`HTTP ${raw.httpStatus}: ${raw.rawXml.slice(0, 200)}`);
    }
    const rawDump = debugFansFullResponse(raw.rawXml);
    const byMatchId = parseFansXml(raw.rawXml);
    return { byMatchId, rawDump, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    return { byMatchId: {}, rawDump: "", error: `Ожидания болельщиков (fans): ${message}` };
  }
}
