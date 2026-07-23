import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";
import { formatMatchDateTime } from "@/data/dashboard";
import type { SeasonMatch, Competition } from "@/data/matches";

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
  // ID кубка — заполнено только у кубковых матчей (MatchType === 3, см.
  // MATCH_TYPE_LABEL ниже). ИСПРАВЛЕНО по реальной схеме (подтверждено через
  // исходный код независимого CHPP-клиента github.com/lucianoq/hattrick,
  // chpp/file_matches.go): поле <CupID>/<CupId> на самом матче отправляется
  // ТОЛЬКО файлом matchesarchive.xml — обычный matches.xml (который здесь и
  // запрашивается) его никогда не присылает, поэтому прежняя попытка читать
  // m.CupID отсюда была гарантированно пустой (не вопрос "сезон/кубок ещё не
  // начался", а неверное поле). Настоящий источник для matches.xml —
  // <MatchContextId>: для кубкового матча (MatchType === 3) это и есть сам
  // CupID (для лиги там LeagueLevelUnitId, для остального — 0 или другой ID).
  // Старое поле <CupID>/<CupId> оставлено как запасной вариант (matchesarchive
  // всё же может его прислать) — не проверено на живом ответе этого аккаунта.
  cupId: string | null;
  // Какая игровая система сгенерировала матч — по независимому CHPP-клиенту
  // (github.com/lucianoq/hattrick), поле <SourceSystem> принимает одно из
  // трёх строковых значений: "hattrick" (основная команда), "youth"
  // (юношеская команда), или "htointegrated" (внешние интегрированные
  // турниры — по документации того клиента сюда должны попадать Hattrick
  // Arena/Masters/лестницы). НА ЖИВОМ ОТВЕТЕ ЭТОГО ПРОЕКТА ПОДТВЕРДИЛОСЬ
  // ТОЛЬКО "youth" — попытка также исключать "htointegrated" ошибочно
  // вырезала обычный сыгранный товарищеский матч (см. git-историю и
  // filterTrainingRelevantMatches), так что для Arena/Masters/лестниц
  // сейчас нет надёжного сигнала вообще — такие матчи (если попадутся) не
  // отфильтровываются, пока не найдётся более точное поле.
  sourceSystem: string | null;
  // MatchRuleId — как называется поле и что означают его значения, ни разу
  // не подтверждено на живом ответе; сейчас нигде не используется для
  // фильтрации (см. историю — раньше пытались исключать "12" как "матч
  // сборной", отменено вместе с чисткой ненадёжных сигналов).
  matchRuleId: string | null;
}

// Официальные, полностью подтверждённые значения MatchType (см. независимый
// CHPP-клиент github.com/lucianoq/hattrick, chpp/type_match_type.go) —
// заменяет прежнюю грубую эвристику (диапазон 5-12 → "товарищеский",
// подобранную только под 2 значения, подтверждённых на практике). Значения
// 1 и 8 из этой таблицы совпадают с уже подтверждёнными на живых данных
// этого проекта (лига и международный товарищеский соответственно), что
// даёт уверенность и в остальных строках, хотя сама таблица целиком на
// ЭТОМ аккаунте не проверялась. MatchType === 3 — единственное значение
// "настоящего" кубкового матча (используется также для поиска CupID через
// MatchContextId, см. cupId в RealMatch выше).
export const CUP_MATCH_TYPE = 3;
const LEAGUE_MATCH_TYPE = 1;

// "Товарищеский" в широком смысле — любой вид товарищеского матча (обычный,
// международный, по кубковым правилам, сборной, молодёжный, предсезонный) —
// используется и для значка "Официальный матч" на Обзоре (см.
// dashboard/page.tsx), и для подписи "Товарищеский" в toSeasonMatches ниже.
const FRIENDLY_MATCH_TYPES = new Set([4, 5, 8, 9, 12, 61, 80, 101, 103, 105, 106]);

export function isFriendlyMatchType(matchType: string): boolean {
  const n = Number(matchType);
  return Number.isNaN(n) || FRIENDLY_MATCH_TYPES.has(n);
}

// Сворачивает подтверждённые значения MatchType к 4 категориям витрины
// (см. Competition в src/data/matches.ts) — квалификация/Hattrick Masters/
// матчи сборной/турниры/лестница/молодёжная лига не входят ни в "Лига", ни
// в "Кубок", ни в "Товарищеский", поэтому получают общую пометку
// "Официальный" (официальный матч не по обычным правилам лиги/кубка).
function competitionOf(matchType: string, cupId: string | null): Competition {
  const n = Number(matchType);
  if (n === CUP_MATCH_TYPE || cupId !== null) return "Кубок";
  if (n === LEAGUE_MATCH_TYPE) return "Лига";
  if (isFriendlyMatchType(matchType)) return "Товарищеский";
  return "Официальный";
}

// Разбирает XML-ответ CHPP на файл matches.xml (или matchesarchive.xml —
// более длинная история сезонов; Hattrick переиспользует ту же структуру
// <Match>, см. аналогичный приём в src/lib/cupMatches.ts) — последние и
// ближайшие матчи команды. Hattrick сам решает, что считать "нашей" и
// "чужой" стороной по HomeTeamID/AwayTeamID — здесь просто сравниваем с
// ourTeamId.
//
// isArchive — ИСПРАВЛЕНО по живой диагностике: matchesarchive.xml вообще не
// присылает поле <Status> для своих записей (архив по определению содержит
// только уже сыгранные матчи, так что Hattrick, похоже, не считает нужным
// повторять статус) — раньше отсутствие поля трактовалось как "UPCOMING"
// (дефолт, рассчитанный на matches.xml, где это верно для будущих матчей),
// из-за чего ВСЕ матчи из matchesarchive (с реальными датами в прошлом и
// реальным счётом) ошибочно отбрасывались фильтром "сыграно" — 57 из 57
// архивных матчей отсеивались именно так. Для matchesarchive отсутствие
// Status теперь считается "FINISHED" (архивная запись = сыгранный матч по
// определению) — а не наоборот вслепую: если счёта тоже нет, матч всё равно
// отсеется отдельной проверкой на пустой счёт в filterTrainingRelevantMatches,
// так что тут нет риска показать "сыгранный" матч без реального счёта.
export function parseMatchesXml(xml: string, ourTeamId: string, options?: { isArchive?: boolean }): RealMatch[] {
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

    const matchTypeNum = Number(m.MatchType);
    const matchContextIdRaw = m.MatchContextId ?? m.MatchContextID;
    const cupIdFromContext =
      matchTypeNum === CUP_MATCH_TYPE && matchContextIdRaw !== undefined && String(matchContextIdRaw) !== "0"
        ? String(matchContextIdRaw)
        : null;
    const cupIdRaw = m.CupID ?? m.CupId;
    const legacyCupId = cupIdRaw !== undefined && String(cupIdRaw) !== "" && String(cupIdRaw) !== "0" ? String(cupIdRaw) : null;
    const cupId = cupIdFromContext ?? legacyCupId;

    const sourceSystemRaw = m.SourceSystem;
    const sourceSystem = sourceSystemRaw !== undefined ? String(sourceSystemRaw).toLowerCase() : null;

    const matchRuleRaw = m.MatchRuleId ?? m.MatchRuleID;
    const matchRuleId = matchRuleRaw !== undefined ? String(matchRuleRaw) : null;

    const defaultStatus = options?.isArchive ? "FINISHED" : "UPCOMING";

    return {
      matchId: String(m.MatchID ?? ""),
      date: String(m.MatchDate ?? ""),
      home: isHome,
      opponent,
      opponentTeamId,
      status: (String(m.Status ?? defaultStatus).toUpperCase() as RealMatchStatus) || defaultStatus,
      ourScore: homeGoals === null || awayGoals === null ? null : isHome ? homeGoals : awayGoals,
      oppScore: homeGoals === null || awayGoals === null ? null : isHome ? awayGoals : homeGoals,
      matchType: String(m.MatchType ?? ""),
      cupId,
      sourceSystem,
      matchRuleId,
    };
  });
}

// ВРЕМЕННАЯ диагностика (см. SHOW_MATCHES_DEBUG в matches/page.tsx) —
// возвращает сырые (ещё не разобранные в RealMatch) поля первых нескольких
// матчей прямо из XML, чтобы увидеть настоящие значения Status/HomeGoals/
// AwayGoals/SourceSystem/MatchType, если разбор снова даст пустой список —
// по одним только счётчикам совпадений не всегда понятно, какое именно
// поле называется не так, как предположено.
// ВРЕМЕННАЯ диагностика — matchesarchive.xml эхом возвращает диапазон дат,
// который реально применил CHPP (Team/FirstMatchDate, Team/LastMatchDate).
// Если запрошенный нами диапазон шире допустимого ("не более 2 сезонов
// назад" по документации), CHPP молча подменяет его дефолтным (последние
// 3 месяца) — сравнение запрошенного и эхом-возвращённого диапазона в
// debugCounts (см. matches/page.tsx) сразу покажет, произошла ли такая
// подмена, вместо повторного угадывания.
export function parseArchiveEchoedRange(xml: string): { firstMatchDate: string | null; lastMatchDate: string | null } {
  const parser = new XMLParser();
  const data = parser.parse(xml);
  const root = data?.HattrickData;
  const team = root?.Team;
  return {
    firstMatchDate: team?.FirstMatchDate !== undefined ? String(team.FirstMatchDate) : null,
    lastMatchDate: team?.LastMatchDate !== undefined ? String(team.LastMatchDate) : null,
  };
}

export function debugRawMatchFields(xml: string, count = 3): Record<string, unknown>[] {
  const parser = new XMLParser();
  const data = parser.parse(xml);
  const root = data?.HattrickData;
  const rawMatches = root?.Team?.MatchList?.Match ?? root?.MatchList?.Match;
  const matches: Record<string, unknown>[] = Array.isArray(rawMatches) ? rawMatches : rawMatches ? [rawMatches] : [];
  return matches.slice(0, count).map((m) => ({
    MatchID: m.MatchID,
    MatchDate: m.MatchDate,
    Status: m.Status,
    HomeGoals: m.HomeGoals,
    AwayGoals: m.AwayGoals,
    MatchType: m.MatchType,
    SourceSystem: m.SourceSystem,
    MatchRuleId: m.MatchRuleId ?? m.MatchRuleID,
    CupID: m.CupID ?? m.CupId,
  }));
}

// Оставляет только сыгранные матчи основной команды. Подход — "белый
// список по исключению", а не по перечислению "хороших" значений
// MatchType: MatchType в CHPP не документирован как простой номер (см.
// комментарий у toSeasonMatches ниже) и разные виды официальных/
// товарищеских матчей могут иметь любые его значения — поэтому здесь НЕ
// проверяется MatchType вообще. Исключается только то, что можно
// определить уверенно и на живых данных этого проекта: юношеская команда
// (SourceSystem === "youth"). Всё сыгранное основной командой — лига,
// кубок, товарищеские любых видов (включая международные/по кубковым
// правилам) — остаётся. Hattrick Arena/Masters/лестницы сейчас не
// отфильтровываются отдельно: единственный опробованный сигнал для них
// (SourceSystem === "htointegrated") на практике ошибочно вырезал обычный
// товарищеский матч, так что лучше показать лишний матч, чем скрыть
// настоящий, пока не найдётся более точное поле.
export function filterTrainingRelevantMatches(matches: RealMatch[]): RealMatch[] {
  return matches.filter((m) => {
    if (m.status !== "FINISHED" || m.ourScore === null || m.oppScore === null) return false;
    if (m.sourceSystem === "youth") return false;
    return true;
  });
}

// Убирает дубликаты при объединении matches.xml (текущий сезон) и
// matchesarchive.xml (более длинная история) — оба файла могут вернуть один
// и тот же матч текущего сезона. ВАЖНО: побеждает ПЕРВОЕ вхождение, не
// последнее — вызывающий код (matches/page.tsx) должен передавать
// currentSeasonMatches (matches.xml, разбор которого подтверждён на живых
// данных) первым аргументом, а archiveMatches вторым. Раньше было наоборот
// (последнее вхождение побеждало) — из-за этого, если matchesarchive.xml
// отвечал успешно, но его структура (ни разу не проверенная на живом
// ответе) разбиралась чуть иначе, его версия того же MatchID тихо
// перезаписывала уже правильно разобранную запись из matches.xml, портя
// status/счёт у реально сыгранных матчей и превращая их в пустой список
// после фильтрации.
export function dedupeMatches(matches: RealMatch[]): RealMatch[] {
  const seen = new Map<string, RealMatch>();
  for (const m of matches) {
    if (m.matchId && !seen.has(m.matchId)) seen.set(m.matchId, m);
  }
  return [...seen.values()];
}

// Приводит реальные матчи к тому же виду, что и полный календарь сезона
// (SeasonMatch) — для страницы "Матчи". Сортировка — от новых/ближайших к
// старым (сверху вниз), а не наоборот. CHPP не даёт номер тура лиги —
// round всегда null.
//
// Соревнование (только подпись/значок, на список матчей не влияет — см.
// filterTrainingRelevantMatches, там MatchType вообще не проверяется, и
// competitionOf/isFriendlyMatchType/CUP_MATCH_TYPE у начала файла).
export function toSeasonMatches(matches: RealMatch[]): SeasonMatch[] {
  const sorted = [...matches].sort((a, b) => b.date.localeCompare(a.date));
  return sorted.map((m, i) => {
    // По запросу — только дата, без точного времени начала матча.
    const { shortDate } = formatMatchDateTime(m.date);
    const competition = competitionOf(m.matchType, m.cupId);
    return {
      id: Number(m.matchId) || i + 1,
      round: null,
      competition,
      date: shortDate,
      opponent: m.opponent,
      home: m.home,
      ourScore: m.status === "FINISHED" ? m.ourScore : null,
      oppScore: m.status === "FINISHED" ? m.oppScore : null,
    };
  });
}
