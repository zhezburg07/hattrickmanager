import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";
import { requestChppXmlRaw, type StoredHattrickTokens } from "./hattrickApi";

export type RealCupMatchStatus = "FINISHED" | "ONGOING" | "UPCOMING";

export interface RealCupMatch {
  matchId: string;
  date: string;
  home: boolean;
  opponent: string;
  // TeamID соперника — ВРЕМЕННО добавлено вместе с ourTeamId/ourTeamName в
  // OurCupPathResult ниже как диагностика "показывает чужие матчи" (см. чат
  // "Кубки: по-прежнему показывают чужие матчи") — позволяет прямо в
  // карточке кубка увидеть TeamID обеих команд конкретного матча, а не
  // только имя, и явно сверить их с TeamID нашей же команды.
  opponentTeamId: string;
  status: RealCupMatchStatus;
  ourScore: number | null;
  oppScore: number | null;
  round: number;
}

export interface OurCupPathResult {
  cupId: string;
  cupName: string;
  season: number;
  currentRound: number;
  // Наши матчи, по одному на раунд, отсортированы от раунда 1 до текущего.
  // Раунд может отсутствовать в списке (мы могли войти в этот кубок позже,
  // например, после вылета из другого — тогда честно пропускаем, не
  // выдумывая матч).
  path: RealCupMatch[];
  debug: string[];
  error: string | null;
  // ВРЕМЕННО — см. opponentTeamId выше: TeamID/имя команды, ДЛЯ КОТОРОЙ
  // реально строился этот путь (тот же ourTeamId, что передан в
  // resolveOurCupPath/resolvePastCupPath) — чтобы в самой карточке кубка
  // явно было видно, чей это путь, а не только по умолчанию считать, что
  // это "наша" команда.
  ourTeamId: string;
  ourTeamName: string;
}

// ИСПРАВЛЕНО (важный баг): cupmatches.xml по данному CupID отдаёт МАТЧИ ЦЕЛОГО
// РАУНДА ВСЕГО турнира (сотни пар команд, не только нашей — подтверждено
// исходным кодом независимого CHPP-клиента github.com/lucianoq/hattrick,
// api/cupmatches.go: ответ пагинирован по 256 записей, GetCupMatchesLast
// возвращает "последний раунд", GetCupMatches(cup, season, round) — любой
// конкретный прошедший раунд по явным Season+CupRound). Раньше здесь ВСЕ
// матчи раунда ошибочно превращались в "наш" матч (home/opponent
// считались так, будто мы всегда участвуем) — на деле нужно сначала найти
// СРЕДИ этих матчей тот единственный, где мы реально участвуем (домашняя
// или гостевая команда), а остальные ~99% отбросить.
const CUP_MATCHES_VERSION = "1.4";
const CUP_PAGE_SIZE = 256;
const MAX_PAGES_PER_ROUND = 8; // до ~2048 матчей на раунд — защита от лишних запросов, если наш матч не находится

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : value ? [value as Record<string, unknown>] : [];
}

function teamIdOf(team: Record<string, unknown> | undefined): string {
  return String(team?.TeamId ?? team?.TeamID ?? "");
}

function toRealCupMatch(m: Record<string, unknown>, ourTeamId: string, round: number): RealCupMatch {
  const homeTeam = m.HomeTeam as Record<string, unknown> | undefined;
  const awayTeam = m.AwayTeam as Record<string, unknown> | undefined;
  const homeTeamId = teamIdOf(homeTeam);
  const awayTeamId = teamIdOf(awayTeam);
  const isHome = homeTeamId === ourTeamId;
  const opponent = isHome ? String(awayTeam?.TeamName ?? "") : String(homeTeam?.TeamName ?? "");
  const opponentTeamId = isHome ? awayTeamId : homeTeamId;

  const result = m.MatchResult as Record<string, unknown> | undefined;
  const homeGoalsRaw = result?.HomeGoals;
  const awayGoalsRaw = result?.AwayGoals;
  const homeGoals = homeGoalsRaw !== undefined ? Number(homeGoalsRaw) : NaN;
  const awayGoals = awayGoalsRaw !== undefined ? Number(awayGoalsRaw) : NaN;
  const availableRaw = result?.["@_Available"];
  const isPlayed =
    availableRaw !== undefined ? String(availableRaw) === "True" : !Number.isNaN(homeGoals) && !Number.isNaN(awayGoals);

  return {
    matchId: String(m.MatchID ?? ""),
    date: String(m.MatchDate ?? ""),
    home: isHome,
    opponent,
    opponentTeamId,
    status: isPlayed ? "FINISHED" : "UPCOMING",
    ourScore: isPlayed && !Number.isNaN(homeGoals) && !Number.isNaN(awayGoals) ? (isHome ? homeGoals : awayGoals) : null,
    oppScore: isPlayed && !Number.isNaN(homeGoals) && !Number.isNaN(awayGoals) ? (isHome ? awayGoals : homeGoals) : null,
    round,
  };
}

interface FetchedRound {
  cupName: string;
  season: number;
  round: number;
  ourMatch: RealCupMatch | null;
  rawMatchCount: number;
  // Диагностика "раунд 0" (см. чат "Кубки: странность с раунд 0") — CupName
  // подтверждённо приходит верно, а CupRound почему-то читается как 0 на
  // реальных данных; чтобы не гадать дальше вслепую про точное название
  // поля, сохраняем ВСЕ поля <Cup> как есть (кроме MatchList — там сотни
  // матчей раунда) прямо в debug, видно на самой странице "Кубки".
  rawMetaKeys: Record<string, unknown>;
}

// Запрашивает ОДИН раунд кубка (без seasonRound — CHPP сам отдаёт ПОСЛЕДНИЙ/
// текущий раунд; с seasonRound — конкретный прошедший). Пагинирует
// (StartAfterMatchID), пока не найдёт наш матч среди сотен чужих или не
// исчерпает страницы/лимит.
async function fetchCupRound(
  tokens: StoredHattrickTokens,
  cupId: string,
  ourTeamId: string,
  seasonRound?: { season: number; round: number },
): Promise<{ result: FetchedRound | null; error: string | null }> {
  let startAfterMatchId: string | undefined;
  let cupMeta: Record<string, unknown> | undefined;
  let ourMatchRaw: Record<string, unknown> | undefined;
  let totalSeen = 0;

  try {
    for (let page = 0; page < MAX_PAGES_PER_ROUND; page++) {
      const params: Record<string, string> = { CupID: cupId, version: CUP_MATCHES_VERSION };
      if (seasonRound) {
        params.Season = String(seasonRound.season);
        params.CupRound = String(seasonRound.round);
      }
      if (startAfterMatchId) params.StartAfterMatchID = startAfterMatchId;

      const raw = await requestChppXmlRaw("cupmatches", params, tokens);
      if (raw.httpStatus < 200 || raw.httpStatus >= 300) {
        throw new Error(`HTTP ${raw.httpStatus}: ${raw.rawXml.slice(0, 200)}`);
      }

      const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
      const data = parser.parse(raw.rawXml);
      const root = data?.HattrickData;
      assertNoChppError(root, "cupmatches");

      const cup = root?.Cup as Record<string, unknown> | undefined;
      if (!cup) break;
      if (!cupMeta) cupMeta = cup;

      const matchList = cup.MatchList as Record<string, unknown> | undefined;
      const matches = asArray(matchList?.Match);
      totalSeen += matches.length;

      const found = matches.find((m) => {
        const homeTeam = m.HomeTeam as Record<string, unknown> | undefined;
        const awayTeam = m.AwayTeam as Record<string, unknown> | undefined;
        return teamIdOf(homeTeam) === ourTeamId || teamIdOf(awayTeam) === ourTeamId;
      });
      if (found) {
        ourMatchRaw = found;
        break;
      }

      if (matches.length < CUP_PAGE_SIZE) break; // последняя страница этого раунда
      const lastMatch = matches[matches.length - 1];
      const lastMatchId = String(lastMatch.MatchID ?? "");
      if (!lastMatchId) break;
      startAfterMatchId = lastMatchId;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    return { result: null, error: message };
  }

  if (!cupMeta) return { result: null, error: "Пустой ответ cupmatches (нет контейнера Cup)." };

  const round = Number(cupMeta.CupRound ?? 0);
  const season = Number(cupMeta.CupSeason ?? 0);
  const cupName = String(cupMeta.CupName ?? "");
  const ourMatch = ourMatchRaw ? toRealCupMatch(ourMatchRaw, ourTeamId, round) : null;
  const { MatchList: _matchList, ...rawMetaKeys } = cupMeta;

  return { result: { cupName, season, round, ourMatch, rawMatchCount: totalSeen, rawMetaKeys }, error: null };
}

// Строит РЕАЛЬНЫЙ путь нашей команды по раундам конкретного кубка: сначала
// текущий/последний раунд (без явного Season/CupRound), затем каждый
// предыдущий раунд (1..текущий-1) отдельным запросом с явными Season+
// CupRound — то же самое, что делает официальный сайт Hattrick при показе
// истории кубка команды, только через отдельные вызовы CHPP вместо одной
// "сетки" (такого готового файла-сетки CHPP не предоставляет). Будущие
// раунды (после текущего) не запрашиваются — соперник в них ещё не определён
// самим Hattrick, пока не сыгран текущий этап, так что там честно нечего
// показывать.
// ДОБАВЛЕНО (см. чат "Аудит проекта: производительность" — кэш пути по
// кубку) — cachedPath: путь ТОГО ЖЕ CupID из предыдущей синхронизации (см.
// вызывающий код в chppSync.ts, previousCupPathById). Раунды, где наш матч
// уже был найден ЗАВЕРШЁННЫМ (status === "FINISHED"), больше никогда не
// меняются на стороне Hattrick — их не нужно перезапрашивать на каждой
// синхронизации, как раньше. Текущий/последний раунд турнирной сетки
// (current.round) всегда запрашивается заново без исключений — именно там
// может смениться статус (UPCOMING → FINISHED) или наступить новый раунд.
export async function resolveOurCupPath(
  tokens: StoredHattrickTokens,
  cupId: string,
  ourTeamId: string,
  ourTeamName = "",
  cachedPath: RealCupMatch[] = [],
): Promise<OurCupPathResult> {
  const cachedByRound = new Map<number, RealCupMatch>();
  for (const m of cachedPath) {
    if (m.status === "FINISHED") cachedByRound.set(m.round, m);
  }
  const debug: string[] = [];
  const { result: current, error } = await fetchCupRound(tokens, cupId, ourTeamId);
  if (error || !current) {
    return {
      cupId,
      cupName: "",
      season: 0,
      currentRound: 0,
      path: [],
      debug,
      error: error ?? "Не удалось получить текущий раунд кубка.",
      ourTeamId,
      ourTeamName,
    };
  }
  debug.push(
    `Текущий/последний раунд "${current.cupName}": раунд ${current.round}, сезон ${current.season}, ` +
      `матчей в раунде=${current.rawMatchCount}, наш матч ${current.ourMatch ? `найден (дата ${current.ourMatch.date}, соперник «${current.ourMatch.opponent}»)` : "НЕ найден"}.`,
  );
  debug.push(`Сырые поля <Cup> из cupmatches.xml (диагностика "раунд 0"): ${JSON.stringify(current.rawMetaKeys)}`);

  const path: RealCupMatch[] = [];
  if (current.ourMatch) path.push(current.ourMatch);

  for (let round = current.round - 1; round >= 1; round--) {
    const cached = cachedByRound.get(round);
    if (cached) {
      path.unshift(cached);
      debug.push(
        `Раунд ${round}: взят из кэша предыдущей синхронизации, без нового запроса (дата ${cached.date}, соперник «${cached.opponent}»).`,
      );
      continue;
    }
    const { result: past, error: pastError } = await fetchCupRound(tokens, cupId, ourTeamId, {
      season: current.season,
      round,
    });
    if (pastError) {
      debug.push(`Раунд ${round}: ошибка запроса — ${pastError}`);
      continue;
    }
    if (past?.ourMatch) {
      path.unshift(past.ourMatch);
      debug.push(
        `Раунд ${round}: наш матч найден (дата ${past.ourMatch.date}, соперник «${past.ourMatch.opponent}», матчей в раунде=${past.rawMatchCount}).`,
      );
    } else {
      debug.push(
        `Раунд ${round}: нашего матча нет среди ${past?.rawMatchCount ?? "—"} матчей этого раунда — либо мы ещё не участвовали в этом кубке на этом этапе, либо не найден за ${MAX_PAGES_PER_ROUND} страниц.`,
      );
    }
  }

  return {
    cupId,
    cupName: current.cupName,
    season: current.season,
    currentRound: current.round,
    path,
    debug,
    error: null,
    ourTeamId,
    ourTeamName,
  };
}

// Максимум раундов, которые проходит вперёд resolvePastCupPath — реальные
// кубки Hattrick не длиннее 8 раундов (см. официальные правила: National/
// Divisional cup — 8 раундов), запас на всякий случай.
const MAX_PAST_CUP_ROUNDS = 10;

// Строит путь по КУБКУ, ИЗ КОТОРОГО КОМАНДА УЖЕ ВЫБЫЛА, — тем же самым
// обходом раундов cupmatches.xml, что уже доказанно надёжно работает для
// текущего активного кубка (resolveOurCupPath выше). Единственный способ —
// сборка из уже известных matches.xml/matchesarchive.xml (раньше
// pastCupPathFromMatches в chppSync.ts) убрана целиком (см. чат "Кубки:
// упрощаем и делаем надёжнее"): matches.xml/matchesarchive.xml
// подтверждённо НЕ ВСЕГДА проставляют CupID реальным сыгранным матчам (та
// же задержка на стороне Hattrick, что уже видели в нескольких местах) —
// из-за этого сборка по CupID либо вообще не находила такие матчи, либо,
// что хуже, находила ТОЛЬКО старые архивные матчи под тем же CupID из
// другого периода и строила карточку из них. Обход раундов cupmatches.xml
// НЕ зависит от CupID на отдельном матче вообще — ищет наш матч среди ВСЕХ
// матчей раунда напрямую по TeamID, тем же способом, что и для текущего
// кубка, поэтому матчи больше не "теряются".
//
// В отличие от resolveOurCupPath (который сначала узнаёт "последний раунд
// ВСЕЙ турнирной сетки" и идёт от него назад — оправдано для активного
// кубка, где неизвестно заранее, на каком раунде мы сейчас), здесь сезон
// уже известен заранее (тот же currentSeason, что подтвердил фильтр по
// сезону в chppSync.ts) — поэтому идём ВПЕРЁД от раунда 1, пока не
// перестанем находить свой матч (это и есть раунд вылета). Для кубка, из
// которого мы уже выбыли, "последний раунд всей сетки" мог давно уйти
// далеко вперёд для других команд — идти от него назад было бы намного
// дороже (лишние запросы за раунды, где нас уже нет), чем от раунда 1.
export async function resolvePastCupPath(
  tokens: StoredHattrickTokens,
  cupId: string,
  ourTeamId: string,
  season: number,
  ourTeamName = "",
): Promise<OurCupPathResult> {
  const debug: string[] = [
    `Путь построен обходом раундов cupmatches.xml вперёд от раунда 1 (сезон ${season}), а не из matches/matchesarchive.`,
  ];
  const path: RealCupMatch[] = [];
  let cupName = "";

  for (let round = 1; round <= MAX_PAST_CUP_ROUNDS; round++) {
    const { result, error } = await fetchCupRound(tokens, cupId, ourTeamId, { season, round });
    if (error) {
      debug.push(`Раунд ${round}: ошибка запроса — ${error}`);
      break;
    }
    if (!result) break;
    if (result.cupName) cupName = result.cupName;
    if (result.ourMatch) {
      path.push(result.ourMatch);
      debug.push(`Раунд ${round}: наш матч найден (дата ${result.ourMatch.date}, соперник «${result.ourMatch.opponent}»).`);
    } else {
      debug.push(`Раунд ${round}: нашего матча нет — считаем это концом участия команды в этом кубке.`);
      break;
    }
  }

  return {
    cupId,
    cupName,
    season,
    currentRound: path.length,
    path,
    debug,
    error: path.length === 0 ? "Обход раундов не нашёл ни одного нашего матча в этом кубке." : null,
    ourTeamId,
    ourTeamName,
  };
}

// Только название и сезон турнира по CupID, без прохода по раундам — для
// кубков, из которых команда уже выбыла в этом сезоне (см. чат "Кубки:
// вернуть историю"). Полный resolveOurCupPath здесь не подходит: его первый
// запрос (без Season/CupRound) возвращает ПОСЛЕДНИЙ раунд ВСЕГО турнира на
// сегодняшний день, а не последний раунд, где реально играла наша уже
// выбывшая команда — проход назад от чужого "текущего" раунда был бы и
// неверной точкой отсчёта, и лишними запросами. Путь по такому кубку вместо
// этого строится напрямую из уже известных матчей (matches.xml/
// matchesarchive.xml — они уже помечены своим CupID, см. chppSync.ts),
// здесь нужно только имя и сезон самого турнира одним лёгким запросом.
export async function fetchCupMeta(
  tokens: StoredHattrickTokens,
  cupId: string,
): Promise<{ cupName: string; season: number } | null> {
  try {
    const raw = await requestChppXmlRaw("cupmatches", { CupID: cupId, version: CUP_MATCHES_VERSION }, tokens);
    if (raw.httpStatus < 200 || raw.httpStatus >= 300) return null;
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
    const data = parser.parse(raw.rawXml);
    const root = data?.HattrickData;
    assertNoChppError(root, "cupmatches");
    const cup = root?.Cup as Record<string, unknown> | undefined;
    if (!cup) return null;
    return { cupName: String(cup.CupName ?? ""), season: Number(cup.CupSeason ?? 0) };
  } catch {
    return null;
  }
}
