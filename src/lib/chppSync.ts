import { XMLParser } from "fast-xml-parser";
import type { MatrixTeamMeta } from "@/data/leagueMatrix";
import type { LeagueTableRow } from "@/components/dashboard/LeagueTable";
import type { RecentMatchRow, UpcomingMatchRow } from "@/components/dashboard/MatchesSection";
import { defaultCurrency, chppSupportersPopularityToFanMoodLevel } from "@/data/dashboard";
import { resolveCountryByEnglishName, type SquadPlayer } from "@/data/squad";
import { ROLE_ID_TO_SLOT_ROLE, KNOWN_NON_FIELD_ROLE_IDS, roleFullLabel } from "@/data/pitchBoard";
import { requestChppXmlRaw, type ChppRawResponse, type StoredHattrickTokens } from "./hattrickApi";
import { isChppAuthError, assertNoChppError } from "./chppError";
import { parseTeamDetailsXml } from "./teamDetails";
import { parseLeagueDetailsXml, type RealLeagueStandingRow } from "./leagueDetails";
import { parseLeagueFixturesXml, parseLeagueFixturesSeasonInfo } from "./leagueFixtures";
import { buildRealLeagueMatrix } from "./realLeagueMatrix";
import { parseMatchesXml, isFriendlyMatchType, type RealMatch } from "./matches";
import { parseEconomyXml, type RealEconomy } from "./economy";
import { parseClubXml, type RealClubStaff } from "./clubStaff";
import { parsePlayersXml, type RealSquadSummary } from "./players";
import { parsePlayersDetailedXml, PLAYERS_XML_VERSION } from "./squadPlayers";
import { parseWorldLeagueInfoXml, type WorldLeagueInfo, type HomeCountryInfo } from "./worldCurrency";
import { getCountryIdLookup } from "./worldCountries";
import { parseAchievementsXml, ACHIEVEMENTS_VERSION, type AchievementsResult } from "./achievements";
import {
  parseMatchLineupRatings,
  RECENT_MATCH_COUNT,
  MATCH_LINEUP_VERSION,
  buildCalibrationCandidates,
} from "./lastMatchRating";
import {
  parseOpponentLineup,
  deriveFormation,
  computeZoneStrength,
  tacticTypeLabel,
  type OpponentAnalysisResult,
} from "./opponentAnalysis";
import { trainingWeekKey, saveCurrentWeekSnapshot, getSnapshotAsOf } from "./playerHistoryDb";
import { computeSlotRatingBreakdown, RATING_FORMULA_VERSION } from "@/components/dashboard/zoneRatings";
import { saveMatchRolePrediction } from "./matchRolePredictionsDb";
import { resolveFanExpectations, NEUTRAL_FAN_EXPECTATION, type FanExpectation } from "./fanExpectation";
import { parseArenaDetailsXml, type RealArenaCapacity } from "./arena";
import { parseTrainingXml, type RealTraining } from "./training";
import {
  parseYouthPlayerListXml,
  debugYouthPlayerListRawCount,
  debugRawYouthPlayerFields,
  type RealYouthPlayer,
  type DebugYouthPlayerRaw,
} from "./youthPlayers";
import { parseYouthPlayerDetailsXml, debugYouthPlayerDetailsRawFields, YOUTH_PLAYER_DETAILS_VERSION } from "./youthPlayerDetails";
import {
  parseChallengesXml,
  filterRecentArenaMatches,
  parseTournamentListXml,
  parseTournamentFixturesXml,
  parseTournamentDetailsXml,
  debugTournamentDetailsFullResponse,
  debugTournamentFixturesRawStructure,
  debugHistoricalTournamentMatchScope,
  buildArenaTournamentSummaries,
  parseLadderListXml,
  debugLadderListRawStructure,
  debugTournamentListFullResponse,
  TOURNAMENT_LIST_VERSION,
  TOURNAMENT_FIXTURES_VERSION,
  TOURNAMENT_DETAILS_VERSION,
  LADDER_LIST_VERSION,
  type ArenaChallengesResult,
  type ArenaRecentMatch,
  type ArenaTournamentSummary,
  type ArenaLadderPosition,
  type TournamentListEntry,
  type ArenaSyncResult,
} from "./hattrickArena";
import {
  toSeasonMatches,
  dedupeMatches,
  filterTrainingRelevantMatches,
  debugRawMatchFields,
  CUP_MATCH_TYPE,
  mergeMatchHistory,
  walkMatchArchiveHistory,
  SEASON_PRE_ROUND1_BUFFER_DAYS,
  type SeasonAnchor,
} from "./matches";
import type { SeasonMatch } from "@/data/matches";
import { resolveOurCupPath, resolvePastCupPath, fetchCupMeta, type OurCupPathResult } from "./cupMatches";
import type { UpcomingCupMatch } from "@/components/dashboard/CupSection";
import {
  parseTransfersTeamXml,
  accumulateTransferHistory,
  mergeTransferHistory,
  TRANSFERS_TEAM_VERSION,
  type TransferHistoryResult,
} from "./transferMarket";

// Сколько ДОПОЛНИТЕЛЬНЫХ страниц transfersteam.xml максимум можно
// дозапросить сверх первой, чтобы собрать ВСЮ карьерную историю сделок
// команды (см. чат "Трансферы: покажи все сделки за карьеру") — обычный
// обход и так упирается в страницу 1 сам по себе (currentPage > 1 в
// accumulateTransferHistory), это чисто защитный предел на случай, если
// сервер вернёт некорректно большое число страниц или обход зациклится по
// другой причине. С запасом на рост истории команды за пределы уже
// известных 28 страниц (322+356=678 сделок на момент написания).
const MAX_EXTRA_TRANSFER_PAGE_FETCHES = 100;

// Та же архитектура "полная история один раз, дальше только довесок" — теперь
// и для Официальных матчей (см. чат "Официальные матчи: та же архитектура,
// что и у Трансферов"). Защитный предел глубины обхода matchesarchive.xml по
// 45-дневным окнам пакетами по 6 (walkMatchArchiveHistory сам остановится
// раньше, как только пакет окон подряд не даст ни одного матча — этот лимит
// нужен только на случай аномально длинной истории команды или зацикливания).
// 60 окон × 45 дней ≈ 2700 дней (~7.4 года) вглубь — заведомо больше, чем
// длится история почти любой команды Hattrick.
const MAX_ARCHIVE_WINDOWS = 60;
const ARCHIVE_WINDOW_DAYS = 45;
const ARCHIVE_BATCH_SIZE = 6;

// Сколько последних сыгранных матчей Арены (лестница + все турниры вместе)
// показывать на закладке "Арена" (см. чат "Матчи Арены: слишком мало
// показывается") — единая константа для обоих мест, где применяется лимит
// (filterRecentArenaMatches для лестницы и итоговая обрезка ниже), чтобы
// они не могли разойтись между собой. Если реально доступных матчей
// меньше — показываются все доступные, лимит не досоздаёт недостающие.
const ARENA_MATCHES_SHOWN = 10;

// Сколько сыгранных / предстоящих матчей показывать в блоке "Матчи" на
// Обзоре — ВОЗВРАЩЕНО на 3+3 (см. чат "Матчи на Обзоре: вернуть 3+3") после
// перехода на реальное поле Hattrick FanMatchExpectation (fans.xml), которое
// само физически даёт данные только на 3 сыгранных и 3 предстоящих матча —
// 4-й с любой стороны показывал бы индикатор ожиданий, который никогда не
// сможет быть реальным (честный нейтральный ⬜ навсегда, не временная
// заглушка). Единая константа и для отбора матчей на синхронизации, и для
// чтения в getStoredOverviewData, чтобы они не могли разойтись между собой.
const OVERVIEW_MATCHES_COUNT = 3;

// Сколько ИСТОРИЧЕСКИХ турниров (уже выпавших из живого tournamentlist.xml,
// см. known_tournaments) опрашивать НАПРЯМУЮ (tournamentdetails.xml +
// tournamentfixtures.xml) за один проход синхронизации — см. чат "План:
// историческая проверка трофеев по known_tournaments". Каждый стоит 2
// дополнительных запроса, поэтому лимит защищает время синхронизации от
// неограниченного роста по мере того, как у команды со временем копится всё
// больше "выпавших" турниров — если известных турниров больше лимита,
// остальные подхватятся на СЛЕДУЮЩИХ синхронизациях (см. срез .slice в
// arenaResults ниже), а не потеряются навсегда.
const MAX_HISTORICAL_TOURNAMENTS_PER_SYNC = 15;
import {
  saveSnapshotSuccess,
  saveSnapshotError,
  getAllSnapshots,
  getSnapshot,
  setSyncInProgress,
  finishSync,
  getSyncStatus,
  type ChppSyncStatus,
} from "./chppSyncDb";
import { upsertKnownTournaments, getKnownTournaments, markTournamentsChecked } from "./knownTournamentsDb";

// Ключи chpp_snapshots.data_key — по РАЗДЕЛУ ДАННЫХ, а не по странице: если
// одни и те же сырые данные (например teamdetails) нужны нескольким вкладкам
// личного кабинета, они читают один и тот же ключ, а не дублируют хранение.
// Фаза 1 покрыла Обзор, Фаза 2 добавила players (обогащён национальностью и
// рейтингами последних матчей — Обзору это не требовалось) и
// opponentAnalysis (Расстановка). Остальные ключи (arena, training,
// youthPlayers, cupPath, matchesArchive, arenaChallenges) добавятся по мере
// миграции следующих вкладок.
export const DATA_KEYS = {
  team: "team",
  league: "league",
  matches: "matches",
  economy: "economy",
  club: "club",
  players: "players",
  worldCurrency: "worldCurrency",
  achievements: "achievements",
  opponentAnalysis: "opponentAnalysis",
  // Фаза 3
  arena: "arena",
  training: "training",
  youthPlayers: "youthPlayers",
  arenaChallenges: "arenaChallenges",
  arenaResults: "arenaResults",
  matchesCalendar: "matchesCalendar",
  cupInfo: "cupInfo",
  transferHistory: "transferHistory",
  overviewFanExpectations: "overviewFanExpectations",
} as const;

export interface StoredTeamData {
  teamId: string;
  leagueId: string;
  leagueLevelUnitId: string;
  trainerPlayerId: string;
  clubName?: string;
  clubShortName?: string;
  badgeLabel?: string;
  powerRatingValue?: number;
  powerRatingWorldRank?: number;
  // Нужны только Кубкам (см. чат "Фаза 3") — не читались в Фазе 1/2, но
  // teamdetails.xml их уже отдавал, ничего нового не запрашиваем.
  stillInCup: boolean | null;
  cupId: string | null;
  cupName: string | null;
}

export interface StoredLeagueData {
  leagueName: string;
  leagueRows: LeagueTableRow[];
  resultsMatrixTeams?: MatrixTeamMeta[];
  resultsMatrix?: (string | null)[][];
  // Якорь для вычисления номера сезона по дате матча (см. чат "Матчи по
  // сезонам", SeasonAnchor/computeSeasonNumber в matches.ts) — только эти
  // два поля, не весь SeasonAnchor целиком, чтобы не тащить лишний тип сюда;
  // собираются в SeasonAnchor на месте использования (matchesCalendar ниже).
  // null — leaguefixtures.xml в эту синхронизацию не запрашивался (сезон ещё
  // не начался — league.standings пуст, см. блок "league" ниже) или не
  // вернул нужных полей; тогда season у матчей остаётся null до следующей
  // успешной синхронизации.
  currentSeason?: number | null;
  currentSeasonStartDate?: string | null;
}

export interface StoredPlayersData {
  summary: RealSquadSummary;
  players: SquadPlayer[];
}

// Составные результаты Фазы 3 хранят ошибку/предупреждение ВНУТРИ самого
// объекта (как и делали исходные resolve*-функции этих страниц), а не через
// error-колонку chpp_snapshots — там несколько независимых причастных
// частичных сбоев (например teamdetails ИЛИ matchesarchive для матчей), и
// одной строки ошибки на весь ключ недостаточно.

export interface StoredYouthPlayersData {
  players: RealYouthPlayer[] | null;
  error: string | null;
  // Диагностика youthplayerlist (см. SHOW_YOUTH_DEBUG_PANEL в
  // youth/page.tsx) — HTTP-статус и реально разобранное число игроков,
  // чтобы отличать "запрос упал" от "запрос успешен, но разбор дал пусто".
  httpStatus: number | null;
  rawPlayerCount: number;
  // Диагностика запроса youthplayerdetails.xml НА КАЖДОГО игрока (см. чат
  // "Юношеская команда: навыки всё ещё не отображаются") — по скольким
  // игрокам реально удалось получить настоящие навыки, и по какой причине
  // не удалось для остальных (HTTP-статус конкретного запроса или ошибка
  // разбора) — без этого не отличить "снимок ещё старый, до этой фичи" от
  // "запросы реально падают на живых данных".
  detailsSucceeded: number;
  detailsFailed: string[];
  // Диагностика "возраст/национальность не отображаются" (см. чат "Кубки/
  // Юношеская команда/Трансферы: диагностика") — сырые поля Age*/Country*/
  // Nation* первых нескольких игроков ИЗ youthplayerlist.xml как есть.
  rawFieldsSample: DebugYouthPlayerRaw[];
}

export interface StoredMatchesCalendar {
  matches: SeasonMatch[] | null;
  // Полная накопленная история официальных матчей (RealMatch[], без фильтра
  // "тренировочно значимых") — см. чат "Официальные матчи: та же
  // архитектура, что и у Трансферов". Хранится ОТДЕЛЬНО от matches
  // (готового к показу SeasonMatch[]) специально ради дальнейших
  // инкрементальных слияний (mergeMatchHistory) и переиспользования в
  // "cupInfo"/"arenaResults" ниже — merge обязан идти по RealMatch[], а
  // toSeasonMatches применяется только один раз, в самом конце. Отсутствие
  // этого поля у СТАРОГО (до этого изменения) снимка — единственный и
  // достаточный признак "нет ещё накопленной истории", запускающий полный
  // обход при следующей синхронизации (без отдельного явного флага, тот же
  // приём self-healing, что и у Трансферов).
  matchHistory: RealMatch[] | null;
  ourTeamName: string;
  error: string | null;
  warning: string | null;
  // Диагностика конвейера matches→matchesarchive→объединение→фильтр (см.
  // SHOW_MATCHES_DEBUG в matches/page.tsx).
  debugCounts: string[];
  debugRaw: Record<string, unknown>[];
}

export interface CupDebugInfo {
  teamId: string | null;
  stillInCup: boolean | null;
  teamDetailsCupId: string | null;
  teamDetailsCupName: string | null;
  clubCupId: string | null;
  matchesCupId: string | null;
  chosenCupId: string | null;
  matchesRawSample: Record<string, unknown>[];
  pathDebug: string[];
  nextMatchFound: string | null;
  // Другие CupID, найденные в matches.xml/matchesarchive.xml за этот сезон
  // (см. "cupInfo" ниже) — кубки, из которых команда уже выбыла, каскад
  // Национальный Кубок → Кубок Вызова → ... Пустой список — не значит
  // ошибку, просто команда в этом сезоне играла только в одном кубке (или
  // ни в одном).
  pastCupIds: string[];
}

export interface StoredCupInfo {
  // Все кубки, в которых команда участвовала в этом сезоне — от самого
  // раннего к текущему/последнему (см. "cupInfo" ниже). Раньше здесь было
  // только ОДНО поле cupPath (текущий кубок) — после миграции на
  // chpp_snapshots (Фаза 3) незаметно потерялась история кубков, из которых
  // команда уже выбыла (см. чат "Кубки: вернуть историю"), потому что
  // resolveOurCupPath в принципе умеет строить путь только по ОДНОМУ,
  // заранее известному CupID.
  cupPaths: OurCupPathResult[];
  nextMatch: UpcomingCupMatch | null;
  errors: string[];
  debug: CupDebugInfo;
  // "Прилипчивый" запасной CupID для определения ТЕКУЩЕГО кубка (см. чат
  // "Кубки: не откатываться на уже проигранный кубок, не закрепляться на
  // уже неверном значении") — обновляется ТОЛЬКО когда teamDetailsCupId
  // или clubCupId реально пришли непустыми в ЭТУ синхронизацию (то есть
  // только из надёжных источников, никогда из шаткого matchesCupId) — иначе
  // переносится из прошлого снимка как есть. Используется как последний,
  // 4-й по приоритету запасной вариант, только когда все остальные (включая
  // проверенный на "не выбыли ли" matchesCupId) не дали ответа — специально
  // НЕ через поле chosenCupId, чтобы уже один раз ошибочно определённый
  // (через matchesCupId) chosenCupId не мог сам себя закрепить как "надёжный"
  // на будущее.
  lastReliableCupId: string | null;
}

const emptyOpponentAnalysis: OpponentAnalysisResult = {
  opponentTeamId: null,
  opponentTeamName: null,
  upcomingMatchDate: null,
  formation: null,
  lastMatch: null,
  lastMatchUnavailableReason: null,
  zoneStrength: { ratings: {}, available: false, unavailableReason: null },
  error: null,
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "неизвестная ошибка";
}

async function requestAllRaw(
  requests: { key: string; file: string; params: Record<string, string> }[],
  tokens: StoredHattrickTokens,
): Promise<Record<string, ChppRawResponse | null>> {
  const settled = await Promise.allSettled(requests.map((r) => requestChppXmlRaw(r.file, r.params, tokens)));
  const result: Record<string, ChppRawResponse | null> = {};
  settled.forEach((r, i) => {
    result[requests[i].key] = r.status === "fulfilled" ? r.value : null;
  });
  return result;
}

function assertOkStatus(raw: ChppRawResponse | null, whatIfMissing = "запрос не выполнился"): asserts raw is ChppRawResponse {
  if (!raw) throw new Error(whatIfMissing);
  if (raw.httpStatus < 200 || raw.httpStatus >= 300) {
    throw new Error(`HTTP ${raw.httpStatus}: ${raw.rawXml.slice(0, 200)}`);
  }
}

export interface SyncResult {
  status: "ok" | "partial" | "failed";
  error: string | null;
}

// Один синхронный проход по всем разделам, которые сейчас читают Обзор,
// Состав и Расстановка — вызывается либо один раз автоматически (первый
// визит в личный кабинет после подключения команды, см. dashboard/page.tsx),
// либо по кнопке "Обновить данные" (см. /api/dashboard/sync). Логика
// fetch+parse+derive здесь — прямой перенос того, что раньше жило в
// dashboard/page.tsx (resolveDashboardData), squad/page.tsx и
// lineup/page.tsx, только вместо сборки объекта для рендера каждый раздел
// сразу сохраняется в chpp_snapshots.
export async function syncTeamData(hattrickUserId: string, tokens: StoredHattrickTokens): Promise<SyncResult> {
  await setSyncInProgress(hattrickUserId);

  // Шаг 1: teamdetails — отдельно и первым: из него нужны TeamID/LeagueID/
  // LeagueLevelUnitID/trainerPlayerId для остальных шагов, и по нему же
  // проверяем протухший токен — если он недействителен, все остальные
  // запросы упадут по той же причине, так что нет смысла их вообще
  // отправлять (см. isChppAuthError ниже).
  let teamId = "";
  let leagueId = "";
  let leagueLevelUnitId = "";
  let trainerPlayerId = "";
  let stillInCup: boolean | null = null;
  let cupIdFromTeamDetails: string | null = null;
  let cupNameFromTeamDetails: string | null = null;
  let ourTeamName = "";

  const teamRaw = await requestChppXmlRaw("teamdetails", {}, tokens).catch(() => null);
  try {
    assertOkStatus(teamRaw);
    const team = parseTeamDetailsXml(teamRaw.rawXml);
    teamId = team.teamId;
    leagueId = team.leagueId;
    leagueLevelUnitId = team.leagueLevelUnitId;
    trainerPlayerId = team.trainerPlayerId;
    stillInCup = team.stillInCup;
    cupIdFromTeamDetails = team.cupId;
    cupNameFromTeamDetails = team.cupName;
    ourTeamName = team.teamName;

    const stored: StoredTeamData = {
      teamId,
      leagueId,
      leagueLevelUnitId,
      trainerPlayerId,
      clubName: team.teamName || undefined,
      clubShortName: team.shortTeamName || undefined,
      badgeLabel: team.teamRank !== null ? `#${team.teamRank}` : team.leagueName || undefined,
      powerRatingValue: team.powerRatingValue ?? undefined,
      powerRatingWorldRank: team.powerRatingGlobalRank ?? undefined,
      stillInCup,
      cupId: cupIdFromTeamDetails,
      cupName: cupNameFromTeamDetails,
    };
    await saveSnapshotSuccess(hattrickUserId, DATA_KEYS.team, stored);
  } catch (err) {
    const message = `Название команды (teamdetails): ${errorMessage(err)}`;
    await saveSnapshotError(hattrickUserId, DATA_KEYS.team, message);
    if (isChppAuthError(err)) {
      // Токен недействителен/отозван — вся синхронизация проваливается сразу
      // (см. чат, пункт 3 — понятная ошибка вместо тихого сбоя, страница
      // покажет предложение переподключиться).
      await finishSync(hattrickUserId, "failed", message);
      return { status: "failed", error: message };
    }
    // Не auth-ошибка — например, разовый сетевой сбой именно на этом запросе.
    // Продолжаем с остальными разделами (teamId и т.д. останутся ""), они не
    // все зависят от teamdetails.
  }

  // Шаг 2: остальные файлы — параллельно, плюс справочник стран (у него своя
  // 24-часовая кеш-логика внутри getCountryIdLookup, поэтому он не идёт через
  // requestAllRaw/rawByKey). worlddetails (валюта) и leaguefixtures (сетка
  // результатов лиги) добавляются, только если удалось узнать LeagueID /
  // LeagueLevelUnitID на шаге 1.
  const requests: { key: string; file: string; params: Record<string, string> }[] = [
    { key: "leaguedetails", file: "leaguedetails", params: {} },
    { key: "matches", file: "matches", params: {} },
    { key: "economy", file: "economy", params: {} },
    { key: "club", file: "club", params: {} },
    { key: "players", file: "players", params: { version: PLAYERS_XML_VERSION } },
    { key: "achievements", file: "achievements", params: { version: ACHIEVEMENTS_VERSION } },
    // Фаза 3 — независимые запросы (без параметров, полученных из
    // teamdetails), поэтому идут в том же параллельном шаге.
    { key: "arenadetails", file: "arenadetails", params: {} },
    { key: "training", file: "training", params: {} },
    { key: "youthplayerlist", file: "youthplayerlist", params: { version: "1.3" } },
    { key: "challenges", file: "challenges", params: {} },
    { key: "transfersteam", file: "transfersteam", params: { pageIndex: "0", version: TRANSFERS_TEAM_VERSION } },
    ...(leagueId ? [{ key: "worlddetails", file: "worlddetails", params: { LeagueID: leagueId } }] : []),
    ...(leagueLevelUnitId
      ? [{ key: "leaguefixtures", file: "leaguefixtures", params: { LeagueLevelUnitID: leagueLevelUnitId } }]
      : []),
  ];
  const [raw, countryIdLookupResult] = await Promise.all([requestAllRaw(requests, tokens), getCountryIdLookup(tokens)]);

  let anySucceeded = false;
  let anyFailed = false;
  // Собираем РЕАЛЬНЫЕ причины сбоев конкретных разделов (не все разделы —
  // только те, что чаще всего спрашивают "почему не обновилось", см. чат
  // "Кубки/Трансферы/Юношеская команда: не решены после Обновить данные") —
  // раньше summaryError ниже был одной общей фразой без подробностей, из-за
  // чего "часть разделов не удалось обновить" ничего не говорило о том, что
  // именно и почему. cupInfo/youthPlayers НАРОЧНО всегда вызывают
  // saveSnapshotSuccess (см. ниже) даже при внутренних ошибках — их error
  // живёт внутри самого JSON, не в колонке chpp_snapshots.error, поэтому
  // общий проход по снимкам это не поймал бы.
  const sectionErrors: string[] = [];

  // -- worldCurrency (валюта + домашняя страна для флагов игроков) --
  // второстепенная деталь оформления — неудача здесь не считается серьёзным
  // сбоем синхронизации, как и раньше.
  let currencyLabel = defaultCurrency.label;
  let homeCountry: HomeCountryInfo | null = null;
  try {
    if (raw.worlddetails) {
      assertOkStatus(raw.worlddetails);
      const info: WorldLeagueInfo = parseWorldLeagueInfoXml(raw.worlddetails.rawXml);
      currencyLabel = info.currencyLabel;
      homeCountry = { countryId: info.countryId, country: resolveCountryByEnglishName(info.countryEnglishName) };
      await saveSnapshotSuccess(hattrickUserId, DATA_KEYS.worldCurrency, info);
    }
  } catch (err) {
    await saveSnapshotError(hattrickUserId, DATA_KEYS.worldCurrency, errorMessage(err));
  }

  // Якорь для вычисления номера сезона по дате матча (см. чат "Матчи по
  // сезонам") — заполняется ниже в блоке "league", если leaguefixtures.xml
  // запрашивался и вернул и Season, и хотя бы одну дату матча. Используется
  // позже в блоке "matchesCalendar" — держим в этой более широкой области
  // видимости по той же причине, что и mergedSeasonMatches выше.
  let currentSeasonAnchor: SeasonAnchor | null = null;

  // -- league (leaguedetails +, если сезон начался, leaguefixtures/матрица) --
  try {
    assertOkStatus(raw.leaguedetails);
    const league = parseLeagueDetailsXml(raw.leaguedetails.rawXml, teamId);
    const stored: StoredLeagueData = {
      leagueName: league.leagueName,
      leagueRows: league.standings.map((r: RealLeagueStandingRow) => ({
        position: r.position,
        name: r.teamName,
        played: r.played,
        wins: r.wins,
        draws: r.draws,
        losses: r.losses,
        goalsFor: r.goalsFor,
        goalsAgainst: r.goalsAgainst,
        points: r.points,
        isOurTeam: r.isOurTeam,
      })),
    };

    // Таблица появляется только после старта сезона — в межсезонье standings
    // пуст, тогда сетку результатов тоже не считаем (нечего сопоставлять).
    // Сетка подтверждена рабочей (см. чат "Уборка диагностики") —
    // подробная диагностика убрана, осталась только сама функциональная
    // логика заполнения stored.resultsMatrixTeams/resultsMatrix.
    if (league.standings.length > 0 && leagueLevelUnitId && raw.leaguefixtures) {
      try {
        assertOkStatus(raw.leaguefixtures);
        const fixtures = parseLeagueFixturesXml(raw.leaguefixtures.rawXml);
        const { teams, matrix } = buildRealLeagueMatrix(league.standings, fixtures);
        const filledCells = matrix.reduce((sum, row) => sum + row.filter((c) => c !== null).length, 0);
        if (filledCells > 0) {
          stored.resultsMatrixTeams = teams;
          stored.resultsMatrix = matrix;
        }

        const seasonInfo = parseLeagueFixturesSeasonInfo(raw.leaguefixtures.rawXml);
        if (seasonInfo.season !== null && seasonInfo.earliestMatchDate !== null) {
          stored.currentSeason = seasonInfo.season;
          stored.currentSeasonStartDate = seasonInfo.earliestMatchDate;
          currentSeasonAnchor = { season: seasonInfo.season, seasonStartDate: seasonInfo.earliestMatchDate };
        }
      } catch {
        // Сетка результатов/якорь сезона — необязательное дополнение к
        // таблице лиги, не должно ронять остальную синхронизацию.
      }
    }

    // Якорь сезона не получен в ЭТУ синхронизацию (межсезонье — standings
    // пуст, или leaguefixtures.xml не вернул нужных полей) — переносим
    // предыдущий уже сохранённый якорь вперёд, а не теряем его до следующей
    // синхронизации, где сезон снова успешно начался. Снимок читается ДО
    // того, как его перезапишет saveSnapshotSuccess ниже (тот же приём, что
    // и у lastReliableCupId/transferHistory/matchesCalendar в этом файле).
    if (stored.currentSeason == null || stored.currentSeasonStartDate == null) {
      const previousLeague = await getSnapshot<StoredLeagueData>(hattrickUserId, DATA_KEYS.league);
      const prevSeason = previousLeague?.data?.currentSeason ?? null;
      const prevStart = previousLeague?.data?.currentSeasonStartDate ?? null;
      if (prevSeason !== null && prevStart !== null) {
        stored.currentSeason = prevSeason;
        stored.currentSeasonStartDate = prevStart;
        currentSeasonAnchor = { season: prevSeason, seasonStartDate: prevStart };
      }
    }

    await saveSnapshotSuccess(hattrickUserId, DATA_KEYS.league, stored);
    anySucceeded = true;
  } catch (err) {
    await saveSnapshotError(hattrickUserId, DATA_KEYS.league, `Лига и таблица (leaguedetails): ${errorMessage(err)}`);
    anyFailed = true;
  }

  // -- matches (полный разобранный список — переиспользуется ниже для
  // рейтингов последних матчей и анализа соперника, а не запрашивается
  // заново, как делали resolveLastMatchRatings/resolveOpponentAnalysis при
  // живом запросе; Обзор сам отфильтрует недавние/ближайшие при чтении) --
  let parsedMatches: RealMatch[] | null = null;
  // Текущий сезон + matchesarchive, объединённые и без дублей — заполняется
  // в секции "matchesCalendar" ниже, но нужен ещё и "cupInfo" (полная
  // история кубков сезона, включая уже завершённые/проигранные — matches.xml
  // один даёт только ~50 последних матчей, чего мало, если команда успела
  // сыграть кубок+лигу+товарищеские). Держим в этой более широкой области
  // видимости, а не только внутри блока "matchesCalendar", специально ради
  // этого переиспользования.
  let mergedSeasonMatches: RealMatch[] | null = null;
  try {
    assertOkStatus(raw.matches);
    parsedMatches = parseMatchesXml(raw.matches.rawXml, teamId);
    await saveSnapshotSuccess(hattrickUserId, DATA_KEYS.matches, parsedMatches);
    anySucceeded = true;
  } catch (err) {
    await saveSnapshotError(hattrickUserId, DATA_KEYS.matches, `Матчи (matches): ${errorMessage(err)}`);
    anyFailed = true;
  }

  // -- overviewFanExpectations (см. чат "Заменить расчётный индикатор
  // ожиданий на реальные данные CHPP, если найдутся") — РЕАЛЬНОЕ поле
  // Hattrick (fans.xml → FanMatchExpectation), не наша прежняя эвристика
  // (разница "Индекса силы" по matchdetails.xml, см. git-историю) — один
  // запрос сразу даёт ожидания и для сыгранных, и для предстоящих матчей
  // (см. src/lib/fanExpectation.ts). НЕ проверено на живых данных этого
  // аккаунта — полная диагностика сырого ответа пишется всегда, а не
  // только при ошибке. OVERVIEW_MATCHES_COUNT=3 намеренно совпадает с
  // тройкой, которую реально даёт fans.xml (см. чат "Матчи на Обзоре:
  // вернуть 3+3") — матч, не попавший в эту тройку, честно без записи,
  // getStoredOverviewData подставит NEUTRAL_FAN_EXPECTATION сам.
  try {
    const { byMatchId, error: fansError } = await resolveFanExpectations(tokens);
    if (fansError) throw new Error(fansError);
    // Та же сортировка, что и в getStoredOverviewData ниже (см. чат "Матчи
    // на Обзоре: устаревший последний сыгранный матч") — без неё эта
    // диагностика считала бы совпадения не для тех матчей, что реально
    // показываются на Обзоре после исправления.
    const displayedRecentIds = new Set(
      (parsedMatches ?? [])
        .filter((m) => m.status === "FINISHED" && m.ourScore !== null && m.oppScore !== null && m.matchId)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, OVERVIEW_MATCHES_COUNT)
        .map((m) => m.matchId),
    );
    const displayedUpcomingIds = new Set(
      (parsedMatches ?? [])
        .filter((m) => m.status === "UPCOMING" && m.matchId)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, OVERVIEW_MATCHES_COUNT)
        .map((m) => m.matchId),
    );
    const matchedRecent = [...displayedRecentIds].filter((id) => byMatchId[id]).length;
    const matchedUpcoming = [...displayedUpcomingIds].filter((id) => byMatchId[id]).length;
    sectionErrors.push(
      `Ожидания болельщиков (диагностика — fans.xml): всего записей — ${Object.keys(byMatchId).length}. ` +
        `Из показанных на Обзоре матчей нашлось: сыгранных ${matchedRecent}/${displayedRecentIds.size}, предстоящих ${matchedUpcoming}/${displayedUpcomingIds.size}.`,
    );
    await saveSnapshotSuccess(hattrickUserId, DATA_KEYS.overviewFanExpectations, byMatchId);
    anySucceeded = true;
  } catch (err) {
    await saveSnapshotError(
      hattrickUserId,
      DATA_KEYS.overviewFanExpectations,
      `Ожидания болельщиков (fans): ${errorMessage(err)}`,
    );
    anyFailed = true;
  }

  // -- economy (полный разобранный объект — Обзор берёт часть полей, позже
  // страница "Финансы" переиспользует тот же ключ полностью) --
  try {
    assertOkStatus(raw.economy);
    const economy: RealEconomy = parseEconomyXml(raw.economy.rawXml);
    await saveSnapshotSuccess(hattrickUserId, DATA_KEYS.economy, economy);
    anySucceeded = true;
  } catch (err) {
    await saveSnapshotError(hattrickUserId, DATA_KEYS.economy, `Финансы и болельщики (economy): ${errorMessage(err)}`);
    anyFailed = true;
  }

  // -- club (состав тренерского штаба + youthLevel/cupId — переиспользуются
  // ниже Юношеской командой и Кубками, отдельно club.xml для них не
  // запрашивается) --
  let parsedClub: RealClubStaff | null = null;
  try {
    assertOkStatus(raw.club);
    parsedClub = parseClubXml(raw.club.rawXml);
    await saveSnapshotSuccess(hattrickUserId, DATA_KEYS.club, parsedClub);
    anySucceeded = true;
  } catch (err) {
    await saveSnapshotError(hattrickUserId, DATA_KEYS.club, `Персонал (club): ${errorMessage(err)}`);
    anyFailed = true;
  }

  // -- players (сводка + полный ростер, с национальностью и рейтингами
  // последних матчей — нужны Составу/Расстановке, см. чат "Фаза 2") --
  try {
    assertOkStatus(raw.players);
    const summary: RealSquadSummary = parsePlayersXml(raw.players.rawXml);
    let players: SquadPlayer[] = parsePlayersDetailedXml(
      raw.players.rawXml,
      homeCountry,
      countryIdLookupResult.lookup ?? undefined,
    );

    // Рейтинги последних матчей (звёзды) — до 3 сыгранных матчей, каждый
    // требует своего matchlineup.xml. Список сыгранных матчей уже есть
    // (parsedMatches выше) — второй раз matches.xml не запрашиваем.
    if (parsedMatches) {
      try {
        const recentFinished = parsedMatches
          .filter((m) => m.status === "FINISHED" && m.matchId)
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, RECENT_MATCH_COUNT);

        if (recentFinished.length > 0) {
          const lineupRaws = await Promise.all(
            recentFinished.map((m) =>
              requestChppXmlRaw(
                "matchlineup",
                { matchID: m.matchId, version: MATCH_LINEUP_VERSION, sourceSystem: "hattrick" },
                tokens,
              ),
            ),
          );
          const perMatchRatings = lineupRaws.map((r) => {
            if (r.httpStatus < 200 || r.httpStatus >= 300) return {};
            try {
              return parseMatchLineupRatings(r.rawXml);
            } catch {
              return {};
            }
          });

          // ВРЕМЕННАЯ диагностика (см. чат "Калибровка позиционного рейтинга
          // по реальным звёздам Hattrick", план в .claude/plans, шаг 0) —
          // ROLE_ID_TO_SLOT_ROLE теперь подтверждено ДВУМЯ независимыми
          // источниками (геометрия FIELD_POSITIONS + официальные имена
          // констант chpp/type_match_role.go, см. комментарий в
          // pitchBoard.ts), но живая сверка с реальным отчётом матча на
          // hattrick.org для 2-3 матчей всё ещё не помешает как третье
          // подтверждение. Дамп теперь явно различает: позицию на поле
          // (сопоставлена), уже ПОНЯТЫЙ код скамейки/спецроли (см.
          // KNOWN_NON_FIELD_ROLE_IDS — ожидаемо, не требует внимания) и
          // ДЕЙСТВИТЕЛЬНО неизвестный код (единственное, что стоит
          // проверять дальше). После сверки — убрать построчный дамп,
          // оставить только саму таблицу сопоставления.
          {
            const nameById = new Map(players.map((p) => [p.id, p.name]));
            const roleLines: string[] = [];
            recentFinished.forEach((m, i) => {
              const ratings = perMatchRatings[i] ?? {};
              for (const [playerId, entry] of Object.entries(ratings)) {
                if (entry.roleId === null) continue;
                const slotRole = ROLE_ID_TO_SLOT_ROLE[entry.roleId];
                const known = KNOWN_NON_FIELD_ROLE_IDS[entry.roleId];
                const label = slotRole
                  ? roleFullLabel[slotRole]
                  : known
                    ? `${known} (не позиция на поле — ожидаемо)`
                    : "НЕ СОПОСТАВЛЕНО — требует проверки";
                const name = nameById.get(Number(playerId)) ?? `#${playerId}`;
                roleLines.push(`матч ${m.matchId}: ${name} — RoleID ${entry.roleId} → ${label}`);
              }
            });
            if (roleLines.length > 0) {
              sectionErrors.push(`RoleID→SlotRole (диагностика, план калибровки шаг 0): ${roleLines.join(" | ")}`);
            }
          }

          // Датасет калибровки позиционного рейтинга (см. чат "Калибровка
          // позиционного рейтинга по реальным звёздам Hattrick", план в
          // .claude/plans, шаг 3) — отбор кандидатов (только стартовый
          // состав, RoleID 100-113) вынесен в чистую buildCalibrationCandidates
          // (lastMatchRating.ts, юнит-тестируется без реальной БД). Для
          // каждого кандидата берём снимок навыков НА ДАТУ МАТЧА
          // (getSnapshotAsOf, не сегодняшний — иначе прогноз "подсматривал"
          // бы будущий рост навыков), считаем прогноз той же формулой, что
          // и на "Расстановке" (computeSlotRatingBreakdown), сохраняем пару
          // прогноз/реальность в обезличенную matchRolePredictionsDb.ts.
          // Пропускаем кандидата, если снимка на эту дату ещё нет — честно,
          // не подставляем текущие навыки вместо исторических. Один
          // провалившийся игрок/матч не должен ронять остальной цикл —
          // ошибки гасятся индивидуально.
          const calibrationCandidates = buildCalibrationCandidates(recentFinished, perMatchRatings);
          await Promise.all(
            calibrationCandidates.map((c) =>
              (async () => {
                const snapshot = await getSnapshotAsOf(hattrickUserId, c.playerId, c.matchWeek);
                if (!snapshot) return;
                const predictedRaw = computeSlotRatingBreakdown(snapshot, c.slotRole).rating;
                await saveMatchRolePrediction({
                  matchId: c.matchId,
                  playerId: c.playerId,
                  matchDate: c.matchDate,
                  roleId: c.roleId,
                  slotRole: c.slotRole,
                  skills: snapshot.skills,
                  experience: snapshot.experience,
                  form: snapshot.form,
                  stamina: snapshot.stamina,
                  loyalty: snapshot.loyalty ?? null,
                  isClubProduct: snapshot.isClubProduct ?? null,
                  formulaVersion: RATING_FORMULA_VERSION,
                  predictedRaw,
                  actualRatingStars: c.actualRatingStars,
                });
              })().catch(() => {
                // Один игрок/матч — не должен ронять остальной цикл калибровки.
              }),
            ),
          );

          const lastMatchRatings: Record<number, number> = {};
          for (const [playerId, entry] of Object.entries(perMatchRatings[0] ?? {})) {
            lastMatchRatings[Number(playerId)] = entry.rating;
          }
          const bestOfRecentRatings: Record<number, number> = {};
          for (const ratings of perMatchRatings) {
            for (const [playerId, entry] of Object.entries(ratings)) {
              const id = Number(playerId);
              bestOfRecentRatings[id] =
                bestOfRecentRatings[id] !== undefined ? Math.max(bestOfRecentRatings[id], entry.rating) : entry.rating;
            }
          }
          players = players.map((p) => ({
            ...p,
            lastMatchRating: lastMatchRatings[p.id],
            recentBestRating: bestOfRecentRatings[p.id],
          }));
        }
      } catch {
        // Рейтинги последних матчей — необязательное дополнение поверх
        // основного состава, не блокирует сохранение самого состава.
      }
    }

    await saveSnapshotSuccess(hattrickUserId, DATA_KEYS.players, { summary, players });
    anySucceeded = true;

    // Побочный эффект: сохраняем недельный снимок навыков/TSI — раньше это
    // делалось при КАЖДОМ визите на Состав/Расстановку (см. историю
    // playerHistoryDb.ts, resolvePlayerHistory), теперь один раз здесь,
    // поскольку именно сейчас у нас свежие данные CHPP. Стрелки роста/падения
    // на Составе/Расстановке И "Изменения TSI" на Обзоре читают этот же
    // снимок отдельно, при рендере страницы (getPreviousWeekSnapshots) — см.
    // squad/page.tsx, lineup/page.tsx, dashboard/page.tsx. Раньше здесь была
    // ещё и saveWeeklyTsiSnapshot (отдельная, более строгая параллельная
    // таблица только для Обзора) — убрана вместе с переписанным
    // resolveWeeklyTsiHighlights (см. чат "Изменения TSI на Обзоре находят
    // гораздо меньше реальных изменений, чем есть на самом деле").
    try {
      const currentWeek = trainingWeekKey(new Date());
      await saveCurrentWeekSnapshot(hattrickUserId, currentWeek, players);
    } catch {
      // История навыков — не должна ронять саму синхронизацию.
    }
  } catch (err) {
    await saveSnapshotError(hattrickUserId, DATA_KEYS.players, `Состав (players): ${errorMessage(err)}`);
    anyFailed = true;
  }

  // -- achievements --
  try {
    assertOkStatus(raw.achievements);
    const achievements: AchievementsResult = parseAchievementsXml(raw.achievements.rawXml);
    // Полный дамп достижений (искали скрытый сигнал о трофеях турниров,
    // не нашли — вопрос закрыт, см. чат "Уборка диагностики") убран.
    await saveSnapshotSuccess(hattrickUserId, DATA_KEYS.achievements, achievements);
    anySucceeded = true;
  } catch (err) {
    await saveSnapshotError(hattrickUserId, DATA_KEYS.achievements, `Достижения (achievements): ${errorMessage(err)}`);
    anyFailed = true;
  }

  // -- arena (Стадион) --
  try {
    assertOkStatus(raw.arenadetails);
    const arena: RealArenaCapacity = parseArenaDetailsXml(raw.arenadetails.rawXml);
    await saveSnapshotSuccess(hattrickUserId, DATA_KEYS.arena, arena);
    anySucceeded = true;
  } catch (err) {
    await saveSnapshotError(hattrickUserId, DATA_KEYS.arena, `Стадион (arenadetails): ${errorMessage(err)}`);
    anyFailed = true;
  }

  // -- training (Тренировка) — второстепенная деталь: training.xml ни разу
  // не пробовался живьём до появления этого проекта (см. src/lib/training.ts)
  // — неудача не считается сбоем синхронизации, как и раньше молча
  // оставляла тестовые значения по умолчанию.
  try {
    if (raw.training) {
      assertOkStatus(raw.training);
      const training: RealTraining = parseTrainingXml(raw.training.rawXml);
      await saveSnapshotSuccess(hattrickUserId, DATA_KEYS.training, training);
    }
  } catch (err) {
    await saveSnapshotError(hattrickUserId, DATA_KEYS.training, errorMessage(err));
  }

  // -- youthPlayers (Юношеская команда) — youthLevel уже есть в "club" выше,
  // здесь только сам список игроков академии. Ошибка и диагностика (HTTP-
  // статус, реально разобранное число игроков) хранятся ВНУТРИ объекта, как
  // и в исходном resolveYouthPlayers, а не отдельной колонкой — страница
  // показывает их и на "серых" ошибках (SHOW_YOUTH_DEBUG_PANEL).
  //
  // Настоящие навыки — отдельным запросом youthplayerdetails.xml НА КАЖДОГО
  // игрока академии (см. чат "Юношеская команда: подключить реальные
  // навыки"), а не только базовые из youthplayerlist.xml выше: тот же ответ
  // заодно даёт карьерную статистику/слова скаута/последний матч —
  // используем по максимуму, раз уже запрашиваем этот файл на каждого
  // игрока, вместо отдельного live-запроса по клику (см. раньше
  // /api/dashboard/youth-player-details — теперь не нужен, страница читает
  // details прямо из снимка). Один игрок не отвечает — просто остаётся без
  // details, с навыками из youthplayerlist.xml как есть.
  {
    let youthPlayers: RealYouthPlayer[] | null = null;
    let youthError: string | null = null;
    let youthHttpStatus: number | null = null;
    let youthRawCount = 0;
    let detailsSucceeded = 0;
    const detailsFailed: string[] = [];
    let rawFieldsSample: DebugYouthPlayerRaw[] = [];
    const detailsRawFieldsSample: string[] = [];
    try {
      youthHttpStatus = raw.youthplayerlist?.httpStatus ?? null;
      youthRawCount = raw.youthplayerlist ? debugYouthPlayerListRawCount(raw.youthplayerlist.rawXml) : 0;
      rawFieldsSample = raw.youthplayerlist ? debugRawYouthPlayerFields(raw.youthplayerlist.rawXml) : [];
      assertOkStatus(raw.youthplayerlist);
      youthPlayers = parseYouthPlayerListXml(raw.youthplayerlist.rawXml, homeCountry, countryIdLookupResult.lookup ?? undefined);
      anySucceeded = true;

      if (youthPlayers.length > 0) {
        const detailResults = await Promise.allSettled(
          youthPlayers.map((p) =>
            requestChppXmlRaw(
              "youthplayerdetails",
              { youthPlayerId: String(p.id), showScoutCall: "true", showLastMatch: "true", version: YOUTH_PLAYER_DETAILS_VERSION },
              tokens,
            ),
          ),
        );
        // ДИАГНОСТИКА (см. чат "Юношеская команда: проверь альтернативные
        // источники, как делали с кубками") — раз youthplayerlist.xml не
        // присылает Age*/Country*/Nation* вовсе, проверяем те же поля в
        // youthplayerdetails.xml — БЕЗ лишних запросов, используя тот же
        // detailResults, что уже запрашивается для навыков. Первые 5 игроков.
        detailResults.slice(0, 5).forEach((r, i) => {
          const p = youthPlayers![i];
          if (r.status === "fulfilled" && r.value.httpStatus >= 200 && r.value.httpStatus < 300) {
            detailsRawFieldsSample.push(`${p.name}: ${debugYouthPlayerDetailsRawFields(r.value.rawXml)}`);
          } else {
            detailsRawFieldsSample.push(`${p.name}: (запрос не выполнился/не 200 — см. detailsFailed)`);
          }
        });
        youthPlayers = youthPlayers.map((p, i) => {
          const r = detailResults[i];
          if (r.status !== "fulfilled") {
            detailsFailed.push(`#${p.id} ${p.name}: запрос не выполнился — ${errorMessage(r.reason)}`);
            return p;
          }
          if (r.value.httpStatus < 200 || r.value.httpStatus >= 300) {
            detailsFailed.push(`#${p.id} ${p.name}: HTTP ${r.value.httpStatus} — ${r.value.rawXml.slice(0, 150)}`);
            return p;
          }
          try {
            const details = parseYouthPlayerDetailsXml(r.value.rawXml);
            detailsSucceeded += 1;
            // ПОДКЛЮЧЕНО (см. чат "Юношеская команда: реальный Age/
            // NativeCountryID подтверждённо появились в
            // youthplayerdetails.xml") — раньше details.age/nativeCountryId
            // парсились только для диагностики (debugYouthPlayerDetailsRawFields
            // выше), в финальный объект игрока не попадали, поэтому таблица
            // всё ещё показывала "—"/домашнюю страну по умолчанию, даже
            // когда реальные данные уже пришли. Реальные данные — В
            // ПРИОРИТЕТЕ, допущение по умолчанию (см. parseYouthPlayerListXml
            // в youthPlayers.ts) остаётся запасным вариантом на случай,
            // если конкретно у этого игрока запрос не удался или поле
            // снова пропадёт.
            const age = details.age ?? p.age;
            const nationality = details.nativeCountryId
              ? (countryIdLookupResult.lookup?.[details.nativeCountryId] ?? p.nationality)
              : p.nationality;
            return { ...p, age, nationality, skills: details.skills, details };
          } catch (err) {
            detailsFailed.push(`#${p.id} ${p.name}: ошибка разбора youthplayerdetails — ${errorMessage(err)}`);
            return p;
          }
        });
      }
    } catch (err) {
      youthError = `Список академии (youthplayerlist): ${errorMessage(err)}`;
      anyFailed = true;
    }
    if (youthError) sectionErrors.push(youthError);
    else if (youthRawCount === 0) sectionErrors.push(`Юношеская команда: youthplayerlist.xml успешно ответил, но игроков академии в нём 0.`);
    // Старая диагностика по youthplayerlist.xml убрана (см. чат "Уборка
    // диагностики") — рабочий источник youthplayerdetails.xml уже
    // подтверждён и используется, дамп ниже оставлен только для него.
    // rawFieldsSample по-прежнему собирается и хранится в StoredYouthPlayersData
    // — используется отдельной debug-панелью /dashboard/youth, не здесь.
    if (detailsRawFieldsSample.length > 0) {
      sectionErrors.push(
        `Юношеская команда (те же поля из youthplayerdetails.xml — альтернативный источник): ${detailsRawFieldsSample.join(" || ")}`,
      );
    }
    const stored: StoredYouthPlayersData = {
      players: youthPlayers,
      error: youthError,
      httpStatus: youthHttpStatus,
      rawPlayerCount: youthRawCount,
      detailsSucceeded,
      detailsFailed,
      rawFieldsSample,
    };
    await saveSnapshotSuccess(hattrickUserId, DATA_KEYS.youthPlayers, stored);
  }

  // -- arenaChallenges (заявки на товарищеские матчи, см. "Матчи") --
  try {
    assertOkStatus(raw.challenges);
    const { sentByUs, offersFromOthers } = parseChallengesXml(raw.challenges.rawXml);
    const result: ArenaChallengesResult = { sentByUs, offersFromOthers, error: null };
    await saveSnapshotSuccess(hattrickUserId, DATA_KEYS.arenaChallenges, result);
    anySucceeded = true;
  } catch (err) {
    await saveSnapshotError(
      hattrickUserId,
      DATA_KEYS.arenaChallenges,
      `Заявки на товарищеские матчи (challenges): ${errorMessage(err)}`,
    );
    anyFailed = true;
  }

  // -- transferHistory (Трансферы — история сделок команды; живой поиск по
  // рынку убран целиком, см. чат "Трансферы: убрать поиск") --
  // ИСПРАВЛЕНО (см. чат "Трансферы: пагинация не накапливается") —
  // подтверждено диагностикой на реальных данных: pageIndex=0 отдаёт
  // ПОСЛЕДНЮЮ страницу истории (сервер сам возвращает её настоящий номер —
  // у пользователя это оказалась страница 28 из 28), а не все страницы
  // сразу. NumberOfBuys/NumberOfSales в <Stats> — это ВСЕГО за карьеру,
  // отдельно от постраничного <Transfers> (подтверждено: 322+356=678 при
  // 28 страницах).
  // ОПТИМИЗАЦИЯ (см. чат "Трансферы: полная история только один раз") —
  // полный обход всех страниц (accumulateTransferHistory) нужен только
  // ОДИН раз, пока для этого аккаунта ещё нет ни одной сохранённой сделки.
  // На каждой следующей синхронизации запрашивается только последняя
  // страница, а новые записи добавляются к уже сохранённой истории
  // (mergeTransferHistory, дедупликация по TransferID) — вместо того чтобы
  // каждый раз заново обходить всю историю. Снимок читается ДО того, как
  // его перезапишет текущая синхронизация (тот же приём, что и для
  // lastReliableCupId в разделе "cupInfo" выше).
  try {
    const httpStatus = raw.transfersteam?.httpStatus ?? null;
    assertOkStatus(raw.transfersteam);
    const latestPage: TransferHistoryResult = parseTransfersTeamXml(raw.transfersteam.rawXml, teamId, ourTeamName);

    const previousSnapshot = await getSnapshot<TransferHistoryResult>(hattrickUserId, DATA_KEYS.transferHistory);
    const hasPriorHistory = (previousSnapshot?.data?.transfers.length ?? 0) > 0;
    // САМОВОССТАНОВЛЕНИЕ (см. чат "Трансферы: фильтр 'Проданные' всё ещё
    // пуст на реальных данных" и "...логическая нестыковка — 'Куплен у
    // Zhezburg'") — уже сохранённая история могла целиком накопиться ДО
    // исправления определения покупка/продажа (полный обход всех страниц
    // происходит только один раз, а инкрементальные обновления трогают
    // только последнюю страницу — старые записи иначе НИКОГДА не
    // пересчитаются). Два независимых признака устаревших/испорченных
    // данных: (1) по статистике продажи точно есть, а среди сохранённых
    // сделок ни одной "sale"; (2) среди сохранённых сделок есть хотя бы
    // одна, где контрагентом указана НАША ЖЕ команда (та самая находка
    // пользователя — "Куплен у Zhezburg", логически невозможная сделка).
    // В любом из этих случаев форсируем ещё один полный обход (один раз),
    // чтобы пересчитать ВСЮ историю новой логикой (TeamID + имя команды,
    // см. parseTransfersTeamXml) — дальше снова переходим на инкрементальный
    // режим.
    const noSalesDespiteStats =
      hasPriorHistory &&
      previousSnapshot!.data!.numberOfSales > 0 &&
      !previousSnapshot!.data!.transfers.some((t) => t.transferType === "sale");
    const hasSelfAsCounterpart =
      hasPriorHistory &&
      !!ourTeamName &&
      previousSnapshot!.data!.transfers.some((t) => t.counterpartTeamName === ourTeamName);
    const priorLooksCorrupted = noSalesDespiteStats || hasSelfAsCounterpart;

    let transferHistory: TransferHistoryResult;
    let pageLog: string[];
    if (hasPriorHistory && !priorLooksCorrupted) {
      transferHistory = mergeTransferHistory(previousSnapshot!.data, latestPage);
      pageLog = [
        `инкрементально (уже была история из ${previousSnapshot!.data!.transfers.length} сделок): стр.${latestPage.pageIndex}/${latestPage.pages} → ${latestPage.transfers.length} сделок на странице, после слияния/дедупликации всего ${transferHistory.transfers.length}`,
      ];
    } else {
      const accumulated = await accumulateTransferHistory(
        latestPage,
        (pageIndex) =>
          requestChppXmlRaw("transfersteam", { pageIndex: String(pageIndex), version: TRANSFERS_TEAM_VERSION }, tokens),
        { maxExtraFetches: MAX_EXTRA_TRANSFER_PAGE_FETCHES },
        teamId,
        ourTeamName,
      );
      transferHistory = accumulated.result;
      const reason = hasSelfAsCounterpart
        ? "сохранённая история выглядела испорченной: среди сделок был контрагент = наша же команда"
        : noSalesDespiteStats
          ? `сохранённая история выглядела устаревшей: 0 продаж среди сохранённых при numberOfSales=${previousSnapshot!.data!.numberOfSales}`
          : null;
      pageLog = [
        reason
          ? `полный обход (пересчёт — ${reason}): ${accumulated.pageLog.join("; ")}`
          : `полный обход (первая синхронизация): ${accumulated.pageLog.join("; ")}`,
      ];
    }

    await saveSnapshotSuccess(hattrickUserId, DATA_KEYS.transferHistory, transferHistory);
    anySucceeded = true;
    // Построчный дамп Buyer/Seller TeamID и дамп сделок-по-имени убраны
    // (см. чат "Уборка диагностики") — механизм подтверждён рабочим, оставлена
    // только краткая сводка.
    sectionErrors.push(
      `Трансферы (диагностика): HTTP ${httpStatus}, команда "${transferHistory.teamName || "?"}", всего за карьеру куплено ${transferHistory.numberOfBuys}/продано ${transferHistory.numberOfSales}, в снимке ${transferHistory.transfers.length} сделок (продаж среди них: ${transferHistory.transfers.filter((t) => t.transferType === "sale").length}) (${pageLog.join("; ")}) — снимок сохранён.`,
    );
  } catch (err) {
    const message = `История трансферов (transfersteam): ${errorMessage(err)}`;
    await saveSnapshotError(hattrickUserId, DATA_KEYS.transferHistory, message);
    sectionErrors.push(message);
    anyFailed = true;
  }

  // -- opponentAnalysis (Расстановка: разбор соперника в ближайшем матче) --
  // Три последовательных шага (ближайший соперник → его последний сыгранный
  // матч → состав того матча) — принципиально зависят друг от друга, как и
  // при живом запросе (resolveOpponentAnalysis), поэтому распараллелить
  // нечего; берём то, что уже есть, где возможно (teamId, parsedMatches).
  try {
    if (!teamId) throw new Error("Не определена наша команда (teamdetails).");
    if (!parsedMatches) throw new Error("Не удалось получить список матчей (matches).");

    const next = parsedMatches
      .filter((m) => m.status !== "FINISHED" && m.matchId)
      .sort((a, b) => a.date.localeCompare(b.date))[0];

    if (!next || !next.opponentTeamId) {
      throw new Error("Не найден ближайший предстоящий матч с известным соперником.");
    }

    const result: OpponentAnalysisResult = {
      opponentTeamId: next.opponentTeamId,
      opponentTeamName: next.opponent,
      upcomingMatchDate: next.date,
      formation: null,
      lastMatch: null,
      lastMatchUnavailableReason: null,
      zoneStrength: { ratings: {}, available: false, unavailableReason: null },
      error: null,
    };

    const oppMatchesRaw = await requestChppXmlRaw("matches", { teamID: next.opponentTeamId }, tokens);
    assertOkStatus(oppMatchesRaw);
    const oppMatches = parseMatchesXml(oppMatchesRaw.rawXml, next.opponentTeamId);
    const last = oppMatches
      .filter((m) => m.status === "FINISHED" && m.matchId && m.ourScore !== null && m.oppScore !== null)
      .sort((a, b) => b.date.localeCompare(a.date))[0];

    if (!last) {
      result.lastMatchUnavailableReason = "У соперника пока нет сыгранных матчей в ответе CHPP.";
    } else {
      const detailsRaw = await requestChppXmlRaw("matchdetails", { matchID: last.matchId }, tokens);
      assertOkStatus(detailsRaw);
      const parser = new XMLParser();
      const parsedDetails = parser.parse(detailsRaw.rawXml);
      const root = parsedDetails?.HattrickData;
      assertNoChppError(root, "matchdetails");
      const match = (root?.Match ?? root) as Record<string, unknown> | undefined;
      const homeTeam = match?.HomeTeam as Record<string, unknown> | undefined;
      const awayTeam = match?.AwayTeam as Record<string, unknown> | undefined;
      const isHomeSide = String(homeTeam?.HomeTeamID ?? "") === next.opponentTeamId;
      const opponentTeam = isHomeSide ? homeTeam : awayTeam;

      const { ratings, anyRoleCodeFound } = parseOpponentLineup(opponentTeam);
      const tacticCodeRaw =
        opponentTeam?.TacticType ?? (opponentTeam?.Tactics as Record<string, unknown> | undefined)?.TacticType;
      const tacticCode = tacticCodeRaw !== undefined ? Number(tacticCodeRaw) : NaN;
      const tacticLabel = !Number.isNaN(tacticCode) ? (tacticTypeLabel[tacticCode] ?? null) : null;

      result.formation = deriveFormation(ratings);
      result.zoneStrength = computeZoneStrength(ratings, anyRoleCodeFound);
      result.lastMatch = {
        matchId: last.matchId,
        date: last.date,
        isHome: last.home,
        goalsFor: last.ourScore!,
        goalsAgainst: last.oppScore!,
        ratings,
        tacticLabel,
      };
    }

    await saveSnapshotSuccess(hattrickUserId, DATA_KEYS.opponentAnalysis, result);
    anySucceeded = true;
  } catch (err) {
    await saveSnapshotError(hattrickUserId, DATA_KEYS.opponentAnalysis, `Анализ соперника: ${errorMessage(err)}`);
    anyFailed = true;
  }

  // -- matchesCalendar (Матчи: список + история прошлых сезонов через
  // matchesarchive) — teamId и текущий сезон (parsedMatches/raw.matches) уже
  // получены выше для секции "matches". Ошибка и предупреждение хранятся
  // ВНУТРИ объекта (как и раньше на странице), а не через error-колонку —
  // независимых частичных причин несколько.
  // ОПТИМИЗАЦИЯ (см. чат "Официальные матчи: та же архитектура, что и у
  // Трансферов") — полный обход всей истории через matchesarchive
  // (walkMatchArchiveHistory) нужен только ОДИН раз, пока для этого аккаунта
  // ещё нет накопленной matchHistory. На каждой следующей синхронизации
  // запрашивается только текущий сезон (matches.xml, и так уже получен для
  // других секций) плюс одно САМОЕ СВЕЖЕЕ окно matchesarchive (на случай
  // матчей, только что перешедших в архив на границе сезона) — новые записи
  // сливаются с уже сохранённой полной историей (mergeMatchHistory,
  // дедупликация по matchId, свежее побеждает). Снимок читается ДО того, как
  // его перезапишет текущая синхронизация (тот же приём, что и у
  // transferHistory выше).
  {
    const debugCounts: string[] = [];
    let debugRaw: Record<string, unknown>[] = [];
    let calendarError: string | null = null;
    let calendarWarning: string | null = null;
    let shownMatches: SeasonMatch[] | null = null;
    let storedMatchHistory: RealMatch[] | null = null;

    try {
      if (!teamId) throw new Error("Не определена наша команда (teamdetails).");
      if (!raw.matches || !parsedMatches) throw new Error("Не удалось получить список матчей (matches).");

      const currentSeasonMatches = parsedMatches;
      debugCounts.push(`matches.xml: ${currentSeasonMatches.length} матчей (HTTP ${raw.matches.httpStatus})`);
      debugRaw = debugRawMatchFields(raw.matches.rawXml);

      const toHattrickTimeString = (d: Date) => {
        const parts = new Intl.DateTimeFormat("en-GB", {
          timeZone: "Europe/Stockholm",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hourCycle: "h23",
        }).formatToParts(d);
        const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
        return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
      };

      const previousCalendarSnapshot = await getSnapshot<StoredMatchesCalendar>(hattrickUserId, DATA_KEYS.matchesCalendar);
      const priorMatchHistory = previousCalendarSnapshot?.data?.matchHistory ?? null;
      const hasPriorHistory = !!priorMatchHistory && priorMatchHistory.length > 0;

      let matchHistory: RealMatch[];
      let archiveWarning: string | null = null;

      if (hasPriorHistory) {
        const dayMs = 24 * 60 * 60 * 1000;
        const now = new Date();
        const first = toHattrickTimeString(new Date(now.getTime() - ARCHIVE_WINDOW_DAYS * dayMs));
        const last = toHattrickTimeString(now);
        let latestArchiveMatches: RealMatch[] = [];
        try {
          const archiveRaw = await requestChppXmlRaw("matchesarchive", { FirstMatchDate: first, LastMatchDate: last }, tokens);
          if (archiveRaw.httpStatus >= 200 && archiveRaw.httpStatus < 300) {
            latestArchiveMatches = parseMatchesXml(archiveRaw.rawXml, teamId, { isArchive: true });
            debugCounts.push(`matchesarchive.xml [самое свежее окно, ${first}..${last}]: ${latestArchiveMatches.length} матчей`);
          } else {
            debugCounts.push(`matchesarchive.xml [самое свежее окно]: HTTP ${archiveRaw.httpStatus}`);
          }
        } catch (err) {
          debugCounts.push(`matchesarchive.xml [самое свежее окно]: ошибка запроса — ${errorMessage(err)}`);
        }

        const freshMatches = dedupeMatches([...currentSeasonMatches, ...latestArchiveMatches]);
        matchHistory = mergeMatchHistory(priorMatchHistory!, freshMatches);
        debugCounts.push(
          `инкрементально (уже была история из ${priorMatchHistory!.length} матчей): + ${freshMatches.length} свежих → после слияния/дедупликации всего ${matchHistory.length}`,
        );
      } else {
        const walkResult = await walkMatchArchiveHistory(
          teamId,
          (firstMatchDate, lastMatchDate) => requestChppXmlRaw("matchesarchive", { FirstMatchDate: firstMatchDate, LastMatchDate: lastMatchDate }, tokens),
          toHattrickTimeString,
          { windowDays: ARCHIVE_WINDOW_DAYS, batchSize: ARCHIVE_BATCH_SIZE, maxWindows: MAX_ARCHIVE_WINDOWS },
        );
        debugCounts.push(...walkResult.windowLog);
        debugCounts.push(`matchesarchive.xml — всего собрано из всех окон: ${walkResult.matches.length} матчей`);
        // Диагностика глубины обхода (см. чат "Насколько глубоко реально уходит
        // полный обход") — показывает честно, упёрлись ли мы в защитный лимит
        // MAX_ARCHIVE_WINDOWS (реальная глубина истории команды ЕЩЁ НЕ
        // подтверждена как исчерпанная, лимит можно поднимать) или остановились
        // раньше сами, потому что CHPP перестал отдавать матчи (это и есть
        // реальный предел данных официального API, дальше запрашивать нечего).
        debugCounts.push(
          `глубина полного обхода: запрошено окон ${walkResult.windowsFetched}/${MAX_ARCHIVE_WINDOWS}, ` +
            `остановка — ${walkResult.stoppedReason === "max-windows-reached" ? "упёрлись в лимит MAX_ARCHIVE_WINDOWS (глубина истории ЕЩЁ НЕ подтверждена как исчерпанная)" : "сам CHPP перестал отдавать матчи (пакет окон подряд вернул 0 — это и есть реальный предел данных API)"}, ` +
            `самая ранняя дата матча из реально полученных: ${walkResult.earliestMatchDate ?? "нет ни одного полученного матча"}`,
        );

        const anyArchiveSuccess = walkResult.windowLog.some((l) => /: \d+ матчей(\s|$)/.test(l));
        if (!anyArchiveSuccess) {
          archiveWarning = "Полная история прошлых сезонов (matchesarchive) недоступна — показан только текущий сезон (matches).";
        }

        matchHistory = dedupeMatches([...currentSeasonMatches, ...walkResult.matches]);
        debugCounts.push(`после объединения и удаления дублей (первая синхронизация, полный обход): ${matchHistory.length}`);
      }

      mergedSeasonMatches = matchHistory;
      storedMatchHistory = matchHistory;

      if (matchHistory.length === 0) {
        throw new Error(
          `Матчи (matches и matchesarchive): запрос выполнился (HTTP ${raw.matches.httpStatus}), но вернул пустой список матчей — либо у команды ещё нет ни одного матча в ответе CHPP, либо структура ответа отличается от ожидаемой (см. RealMatch в src/lib/matches.ts).`,
        );
      }

      let trainingRelevant = filterTrainingRelevantMatches(matchHistory);
      debugCounts.push(`после строгого фильтра (сыграно + основная команда): ${trainingRelevant.length}`);

      if (matchHistory.length !== trainingRelevant.length) {
        const passedIds = new Set(trainingRelevant.map((m) => m.matchId));
        const excluded = matchHistory.filter((m) => !passedIds.has(m.matchId));
        let notFinished = 0;
        let missingScore = 0;
        let youth = 0;
        for (const m of excluded) {
          if (m.status !== "FINISHED") notFinished += 1;
          else if (m.ourScore === null || m.oppScore === null) missingScore += 1;
          else if (m.sourceSystem === "youth") youth += 1;
        }
        debugCounts.push(
          `отсеяно ${excluded.length}: не "FINISHED" — ${notFinished}, нет счёта — ${missingScore}, sourceSystem="youth" — ${youth}`,
        );
        debugCounts.push(
          `сырые поля первых отсеянных: ${excluded
            .slice(0, 8)
            .map((m) => `#${m.matchId} ${m.date} status=${m.status} score=${m.ourScore}:${m.oppScore} src=${m.sourceSystem} type=${m.matchType}`)
            .join(" | ")}`,
        );
      }
      let filterWarning: string | null = null;
      if (trainingRelevant.length === 0) {
        trainingRelevant = matchHistory.filter((m) => m.status === "FINISHED" && m.ourScore !== null && m.oppScore !== null);
        debugCounts.push(`после мягкого фильтра (только "сыграно"): ${trainingRelevant.length}`);
        if (trainingRelevant.length > 0) {
          filterWarning =
            "Не удалось надёжно отличить матчи основной команды от юношеских/Hattrick Arena по данным CHPP (поле SourceSystem) — показаны все сыгранные матчи без этой фильтрации.";
        }
      }

      // Кэп MAX_MATCHES_SHOWN убран (см. чат "Официальные матчи: та же
      // архитектура, что и у Трансферов") — полный список хранится в
      // снимке, разбивка на страницы теперь на фронтенде (MatchesCalendar.tsx).
      // Номер сезона (см. чат "Матчи по сезонам") — currentSeasonAnchor
      // заполняется в блоке "league" выше в этой же синхронизации; если он
      // null (якорь ни разу не был получен для этого аккаунта), season у
      // всех матчей честно null, а не выдуманное число.
      shownMatches = toSeasonMatches(trainingRelevant, currentSeasonAnchor);
      if (!currentSeasonAnchor) {
        debugCounts.push(
          "номер сезона: якорь (Season + дата 1-го тура из leaguefixtures.xml) ещё не получен ни разу для этого аккаунта — у всех матчей season=null.",
        );
      } else {
        // Диагностика (см. чат "Граница между сезонами: первый матч
        // текущего сезона в предыдущем") — сам якорь раньше нигде не
        // выводился, что мешало проверить, действительно ли граница сдвинута
        // правильно на живых данных. Показывает и якорь, и получившуюся
        // границу с учётом недельного буфера (см. SEASON_PRE_ROUND1_BUFFER_DAYS
        // в matches.ts) — если жалоба на смещение границы повторится, здесь
        // сразу видно фактическую дату отсечки, а не только вычисленный номер.
        const dayMs = 24 * 60 * 60 * 1000;
        const anchorMs = Date.parse(currentSeasonAnchor.seasonStartDate.replace(" ", "T") + "Z");
        const boundaryStr = Number.isNaN(anchorMs)
          ? "?"
          : new Date(anchorMs - SEASON_PRE_ROUND1_BUFFER_DAYS * dayMs).toISOString().slice(0, 19).replace("T", " ");
        debugCounts.push(
          `номер сезона: якорь — сезон ${currentSeasonAnchor.season}, round 1 лиги ${currentSeasonAnchor.seasonStartDate} ` +
            `→ граница сезона (с недельным буфером под кубковые матчи перед round 1) — ${boundaryStr}.`,
        );
      }
      calendarWarning = [archiveWarning, filterWarning].filter(Boolean).join(" ") || null;
      anySucceeded = true;
    } catch (err) {
      calendarError = `Матчи (matches): ${errorMessage(err)}`;
      anyFailed = true;
    }

    const stored: StoredMatchesCalendar = {
      matches: shownMatches,
      matchHistory: storedMatchHistory,
      ourTeamName,
      error: calendarError,
      warning: calendarWarning,
      debugCounts,
      debugRaw,
    };
    await saveSnapshotSuccess(hattrickUserId, DATA_KEYS.matchesCalendar, stored);
  }

  // -- arenaResults (Hattrick Arena: последние сыгранные матчи через
  // лестницу — см. чат "Hattrick Arena: синхронизация последних сыгранных
  // матчей"). Отдельного CHPP-файла для результатов Arena нет — выделяем
  // такие матчи из уже собранного mergedSeasonMatches (matches.xml +
  // matchesarchive.xml, см. секцию "matchesCalendar" выше) по
  // MatchType === LADDER_MATCH_TYPE (62, см. matches.ts). Полный список
  // сыгранных матчей и разбивка по MatchType (искали матчи лестницы —
  // подтверждённо не связаны с этим MatchType, вопрос закрыт) убраны — см.
  // чат "Уборка диагностики".
  {
    const scanSource = mergedSeasonMatches ?? parsedMatches ?? [];
    const ladderResults = filterRecentArenaMatches(scanSource, ARENA_MATCHES_SHOWN);

    // ПОДТВЕРЖДЁННЫЙ РАБОЧИЙ ИСТОЧНИК (см. чат "Отличная новость по
    // Турнирам") — tournamentlist.xml реально отдаёт турниры именно нашей
    // команды (докстрока независимого клиента подтвердилась на живых
    // данных), а tournamentfixtures.xml по каждому TournamentId — реальные
    // матчи с счётом. Парам запроса tournamentfixtures ("tournamentID") НЕ
    // подтверждён официальной документацией (недоступна из песочницы) — по
    // аналогии с cupID/matchID/youthPlayerId в этом проекте; если CHPP
    // ответит ошибкой, это будет явно видно в диагностике ниже, а не молча
    // проглочено.
    let tournamentResults: ArenaRecentMatch[] = [];
    let tournamentSummaries: ArenaTournamentSummary[] = [];
    const tournamentDiagnostics: string[] = [];
    try {
      const listRaw = await requestChppXmlRaw("tournamentlist", { version: TOURNAMENT_LIST_VERSION }, tokens);
      if (listRaw.httpStatus < 200 || listRaw.httpStatus >= 300) {
        tournamentDiagnostics.push(`tournamentlist.xml: HTTP ${listRaw.httpStatus} — ${listRaw.rawXml.slice(0, 300)}`);
      } else {
        const tournaments = parseTournamentListXml(listRaw.rawXml);
        tournamentDiagnostics.push(
          `tournamentlist.xml: найдено турниров нашей команды — ${tournaments.length}${
            tournaments.length > 0
              ? ` (${tournaments.map((t) => `"${t.name}" #${t.tournamentId} isOngoing=${t.isOngoing}`).join(", ")})`
              : ""
          }.`,
        );

        // Запоминаем каждый турнир из живого tournamentlist.xml НАВСЕГДА (см.
        // src/lib/knownTournamentsDb.ts) — пока он ещё виден здесь, чтобы
        // после того, как выпадет из этого списка (подтверждённое поведение
        // CHPP — см. чат "Titans of 2007 Trophy"), у нас остался его
        // tournamentId для прямого запроса tournamentdetails.xml/
        // tournamentfixtures.xml. Сбой сохранения не должен ронять
        // остальную синхронизацию — только диагностика.
        try {
          await upsertKnownTournaments(hattrickUserId, tournaments);
          // Разовая ручная "посадка" уже подтверждённого живым запросом
          // старого турнира (см. чат "Titans of 2007 Trophy") — сам этот
          // ID никогда не попадёт сюда через обычный путь (он не участвует
          // в tournamentlist.xml прямо сейчас, весь смысл открытия был
          // именно в том, что он оттуда выпал), поэтому без этой посадки
          // находка так и осталась бы отдельной диагностикой, а не частью
          // реальной проверки трофеев ниже. upsert идемпотентен — безопасно
          // вызывать каждую синхронизацию.
          await upsertKnownTournaments(hattrickUserId, [{ tournamentId: "3116059", name: "Titans of 2007 Trophy" }]);
          const known = await getKnownTournaments(hattrickUserId);
          tournamentDiagnostics.push(
            `Локальная память турниров (known_tournaments): всего когда-либо виденных — ${known.length}${
              known.length > 0 ? ` (${known.map((k) => `"${k.name}" #${k.tournamentId}`).join(", ")})` : ""
            }.`,
          );
        } catch (err) {
          tournamentDiagnostics.push(`Локальная память турниров (known_tournaments): ошибка сохранения — ${errorMessage(err)}`);
        }
        // ДИАГНОСТИКА (см. чат "tournamentlist.xml возвращает только 2
        // турнира, а на сайте их явно больше") — полный сырой дамп ответа
        // (все поля, не только уже используемые TournamentId/Name/
        // IsMatchesOngoing) — проверить пагинацию (PageIndex/Pages/
        // TotalCount вне или внутри <Tournaments>) и увидеть остальные поля
        // турнира (Type/TrophyType/Creator и т.п.), которые могли бы
        // подсказать, почему часть турниров не попадает в этот список.
        tournamentDiagnostics.push(`tournamentlist.xml (полный сырой дамп): ${debugTournamentListFullResponse(listRaw.rawXml)}`);

        const fixturesResults = await Promise.allSettled(
          tournaments.map((t) =>
            requestChppXmlRaw("tournamentfixtures", { tournamentID: t.tournamentId, version: TOURNAMENT_FIXTURES_VERSION }, tokens),
          ),
        );

        const matchesByTournamentId = new Map<string, ArenaRecentMatch[]>();
        fixturesResults.forEach((result, i) => {
          const t = tournaments[i];
          if (result.status !== "fulfilled") {
            tournamentDiagnostics.push(`tournamentfixtures.xml [${t.name}]: запрос не выполнился — ${errorMessage(result.reason)}`);
            return;
          }
          const raw = result.value;
          // ДИАГНОСТИКА (см. чат "tournamentfixtures.xml реально содержит 28
          // <Match>, но наш разбор находит 0") — подтверждено на сыром теле:
          // матчи ЕСТЬ (HomeTeamId=793810 виден прямо в тексте), но
          // root.Matches.Match (документированный путь) находит 0 — значит,
          // расхождение в РЕАЛЬНОЙ вложенности контейнера, не в имени поля.
          // debugTournamentFixturesRawStructure пробует несколько вероятных
          // путей и дампит ПОЛНЫЙ первый найденный сырой матч (все поля как
          // есть) — чтобы одним взглядом увидеть реальную структуру, а не
          // гадать по одному полю за раз.
          const rawMatchTagCount = (raw.rawXml.match(/<Match>/g) ?? []).length;
          const structureDump = debugTournamentFixturesRawStructure(raw.rawXml);
          tournamentDiagnostics.push(
            `tournamentfixtures.xml [${t.name}] сырая структура: HTTP ${raw.httpStatus}, тегов <Match> в тексте — ${rawMatchTagCount}. ${structureDump}`,
          );
          // ДИАГНОСТИКА (см. чат "Подтверди, что для активных турниров
          // tournamentfixtures.xml отдаёт все раунды с начала") — у
          // исторического турнира на 3064 команды гистограмма MatchRound
          // показала только финальные раунды 9-14 (63 матча), не полную
          // историю с раунда 1 — проверяем ту же гистограмму здесь, для
          // ЭТИХ (умеренных по размеру, 8-32 команды) активных турниров,
          // чтобы подтвердить или опровергнуть гипотезу "ограничение
          // масштабируется с размером турнира", а не считать её доказанной
          // без проверки на контрольной группе.
          tournamentDiagnostics.push(
            `tournamentfixtures.xml [${t.name}] охват раундов: ${debugHistoricalTournamentMatchScope(raw.rawXml, teamId, ourTeamName)}`,
          );
          if (raw.httpStatus < 200 || raw.httpStatus >= 300) {
            return;
          }
          try {
            const matches = parseTournamentFixturesXml(raw.rawXml, teamId, t.tournamentId, t.name);
            tournamentDiagnostics.push(`tournamentfixtures.xml [${t.name}]: наших сыгранных матчей — ${matches.length}.`);
            tournamentResults.push(...matches);
            matchesByTournamentId.set(t.tournamentId, matches);
          } catch (err) {
            tournamentDiagnostics.push(`tournamentfixtures.xml [${t.name}]: ошибка разбора — ${errorMessage(err)}`);
          }
        });

        // ИСТОРИЧЕСКИЕ ТУРНИРЫ (см. чат "План: историческая проверка
        // трофеев по known_tournaments") — ПОДТВЕРЖДЕНО живым запросом
        // (см. чат "Titans of 2007 Trophy"): tournamentdetails.xml И
        // tournamentfixtures.xml оба реально отвечают по tournamentId
        // турнира, давно выпавшего из tournamentlist.xml (63 реальных
        // матча для турнира из 2007 года), вопреки докстроке "только
        // текущий сезон". Значит та же эвристика "последний матч плей-офф
        // = победа/поражение" (buildArenaTournamentSummaries) применима и к
        // истории, а не только к активным турнирам — берём из
        // known_tournaments турниры, которых больше НЕТ в tournaments
        // (текущем живом списке выше), и опрашиваем каждый напрямую.
        // Ограничено MAX_HISTORICAL_TOURNAMENTS_PER_SYNC (2 запроса на
        // турнир) — при большом накопленном числе исторических турниров
        // обходим их порциями, по кругу (см. markTournamentsChecked и
        // сортировку "непроверенные сначала" в getKnownTournaments), а не
        // раздуваем время каждой синхронизации без ограничений.
        const historicalEntries: TournamentListEntry[] = [];
        const historicalMatchesByTournamentId = new Map<string, ArenaRecentMatch[]>();
        try {
          const activeIds = new Set(tournaments.map((t) => t.tournamentId));
          const known = await getKnownTournaments(hattrickUserId);
          const allStale = known.filter((k) => !activeIds.has(k.tournamentId));
          const stale = allStale.slice(0, MAX_HISTORICAL_TOURNAMENTS_PER_SYNC);
          tournamentDiagnostics.push(
            `Исторические турниры: известно всего — ${known.length}, выпавших из живого списка — ${allStale.length}, обрабатываем за эту синхронизацию — ${stale.length}${
              stale.length > 0 ? ` (${stale.map((s) => `"${s.name}" #${s.tournamentId}`).join(", ")})` : ""
            }.`,
          );

          const historicalResults = await Promise.allSettled(
            stale.map(async (k) => {
              const [detailsRaw, fixturesRaw] = await Promise.all([
                requestChppXmlRaw("tournamentdetails", { tournamentID: k.tournamentId, version: TOURNAMENT_DETAILS_VERSION }, tokens),
                requestChppXmlRaw("tournamentfixtures", { tournamentID: k.tournamentId, version: TOURNAMENT_FIXTURES_VERSION }, tokens),
              ]);
              return { known: k, detailsRaw, fixturesRaw };
            }),
          );

          historicalResults.forEach((result, i) => {
            const k = stale[i];
            if (result.status !== "fulfilled") {
              tournamentDiagnostics.push(`Исторический турнир "${k.name}" #${k.tournamentId}: запрос не выполнился — ${errorMessage(result.reason)}`);
              return;
            }
            const { detailsRaw, fixturesRaw } = result.value;

            // ИСПРАВЛЕНО (см. чат "Противоречие в статусе 'идёт сейчас'") —
            // раньше isOngoing для исторических турниров брался из
            // parseTournamentDetailsXml (hasUpcomingMatchRound по
            // NextMatchRoundDate) и на практике дал isOngoing=true для
            // турнира 2007 года при сыром IsMatchesOngoing=0 — эта проверка
            // была подтверждена только на 2 ЖИВЫХ турнирах с реальными
            // будущими датами, ни разу на заведомо завершённом историческом,
            // и оказалась там ненадёжной (формат/значение NextMatchRoundDate
            // у настолько старых турниров не распознаётся текущими
            // заглушками "0000-00-00"/"0001-01-01"). Вместо повторного
            // гадания — используем уже имеющийся АВТОРИТЕТНЫЙ сигнал: сам
            // факт, что турнир обрабатывается в этой ветке, означает, что
            // его больше нет в живом tournamentlist.xml — то есть команда
            // ТОЧНО не участвует в нём "прямо сейчас", какие бы поля
            // tournamentdetails.xml ни возвращал. isOngoing здесь ВСЕГДА
            // false — честно и без зависимости от непроверенной эвристики.
            let entry: TournamentListEntry | null = null;
            if (detailsRaw.httpStatus >= 200 && detailsRaw.httpStatus < 300) {
              try {
                const parsed = parseTournamentDetailsXml(detailsRaw.rawXml);
                entry = parsed ? { ...parsed, isOngoing: false } : null;
                tournamentDiagnostics.push(
                  `Исторический турнир "${k.name}" #${k.tournamentId}: tournamentdetails.xml — isOngoing принудительно false (турнир вне живого tournamentlist.xml); ` +
                    `для справки, НЕ используется: hasUpcomingMatchRound(NextMatchRoundDate)=${parsed?.isOngoing}. ${debugTournamentDetailsFullResponse(detailsRaw.rawXml)}`,
                );
              } catch (err) {
                tournamentDiagnostics.push(`Исторический турнир "${k.name}" #${k.tournamentId}: ошибка разбора tournamentdetails — ${errorMessage(err)}`);
              }
            } else {
              tournamentDiagnostics.push(`Исторический турнир "${k.name}" #${k.tournamentId}: tournamentdetails.xml — HTTP ${detailsRaw.httpStatus}.`);
            }
            // tournamentdetails не ответил/не разобрался — используем уже
            // известное имя из known_tournaments, isOngoing=false (тот же
            // авторитетный сигнал — турнир вне живого списка).
            if (!entry) entry = { tournamentId: k.tournamentId, name: k.name, isOngoing: false };
            historicalEntries.push(entry);

            if (fixturesRaw.httpStatus < 200 || fixturesRaw.httpStatus >= 300) {
              tournamentDiagnostics.push(`Исторический турнир "${entry.name}" #${k.tournamentId}: tournamentfixtures.xml — HTTP ${fixturesRaw.httpStatus}.`);
              return;
            }
            // ДИАГНОСТИКА — та же связка, что уже применяется для АКТИВНЫХ
            // турниров чуть выше в этой функции: сырой счётчик <Match> в
            // тексте ответа (напрямую сравнимо с "63 матча", которые видели
            // при разовой проверке этого же ID раньше — та проверка считала
            // ИМЕННО эти сырые теги, а не матчи именно нашей команды) +
            // debugTournamentFixturesRawStructure, который дампит ПОЛНОЕ
            // первое найденное сырое совпадение (все поля, включая
            // HomeTeamId/AwayTeamId) — чтобы увидеть, встречается ли наш
            // TeamID вообще среди присланных матчей, или же tournamentfixtures.xml
            // без явного параметра раунда/страницы возвращает какой-то один
            // срез (например, только последний раунд многотысячной сетки),
            // в котором нашей команды заведомо уже нет.
            const rawMatchTagCount = (fixturesRaw.rawXml.match(/<Match>/g) ?? []).length;
            tournamentDiagnostics.push(
              `Исторический турнир "${entry.name}" #${k.tournamentId}: сырых тегов <Match> в тексте — ${rawMatchTagCount}. ${debugTournamentFixturesRawStructure(fixturesRaw.rawXml)}`,
            );
            // ДИАГНОСТИКА (см. чат "Наша команда не найдена среди 63
            // матчей") — проверяет и "TeamID мог измениться" (поиск по
            // названию команды среди присланных матчей), и "ответ ограничен
            // одним раундом/срезом турнирной сетки" (гистограмма MatchRound),
            // без дополнительных запросов.
            tournamentDiagnostics.push(
              `Исторический турнир "${entry.name}" #${k.tournamentId}: ${debugHistoricalTournamentMatchScope(fixturesRaw.rawXml, teamId, ourTeamName)}`,
            );
            try {
              const matches = parseTournamentFixturesXml(fixturesRaw.rawXml, teamId, k.tournamentId, entry.name);
              historicalMatchesByTournamentId.set(k.tournamentId, matches);
              tournamentDiagnostics.push(`Исторический турнир "${entry.name}" #${k.tournamentId}: наших сыгранных матчей — ${matches.length} (наш teamId=${teamId}).`);
            } catch (err) {
              tournamentDiagnostics.push(`Исторический турнир "${entry.name}" #${k.tournamentId}: ошибка разбора tournamentfixtures — ${errorMessage(err)}`);
            }
          });

          // Сдвигаем обработанные в конец очереди независимо от успеха —
          // иначе постоянно недоступный ID навсегда застрял бы первым.
          await markTournamentsChecked(hattrickUserId, stale.map((s) => s.tournamentId));
        } catch (err) {
          tournamentDiagnostics.push(`Исторические турниры: ошибка — ${errorMessage(err)}`);
        }

        // Активные (tournamentlist.xml) + исторические (known_tournaments,
        // выпавшие из живого списка) — ОДИН общий проход эвристики "победа =
        // последний матч плей-офф выигран", без дублирования логики между
        // активными и историческими турнирами.
        const combinedTournamentEntries = [...tournaments, ...historicalEntries];
        const combinedMatchesByTournamentId = new Map([...matchesByTournamentId, ...historicalMatchesByTournamentId]);
        tournamentSummaries = buildArenaTournamentSummaries(combinedTournamentEntries, combinedMatchesByTournamentId);
        tournamentDiagnostics.push(
          `Трофеи/текущие турниры (эвристика, не официальный флаг CHPP; включая исторические): ${tournamentSummaries
            .map(
              (s) =>
                `"${s.name}" — ${
                  s.isOngoing
                    ? "идёт сейчас"
                    : s.wonTrophy
                      ? "выигран (предположительно)"
                      : s.resultUnknown
                        ? "результат не определён (0 матчей — вероятно, слишком крупный турнир, см. tournamentfixtures.xml)"
                        : "завершён, не выигран"
                }`,
            )
            .join("; ") || "(турниров нет)"}.`,
        );
      }
    } catch (err) {
      tournamentDiagnostics.push(`tournamentlist.xml: ошибка запроса — ${errorMessage(err)}`);
    }
    sectionErrors.push(`Hattrick Arena (диагностика — турниры): ${tournamentDiagnostics.join(" ")}`);

    // ПЕРЕСМОТРЕНО (см. чат "Ещё одна честная попытка найти данные по
    // лестницам") — свежая проверка докстроки независимого клиента
    // (chpp/file_ladderlist.go) опровергла прежний вывод: "the list of
    // ladders that a TEAM currently takes part in", а не общий список всех
    // лестниц игры (тот же класс сюрприза, что уже был с tournamentlist.xml
    // — см. подробный комментарий в hattrickArena.ts). Полная диагностика
    // (HTTP-статус + сырая структура ответа) пишется всегда, а не только
    // при 0 результатах.
    //
    // ladderdetails.xml по КАЖДОМУ найденному LadderId был отдельно
    // проверен живым запросом (см. чат "Ещё одна честная проверка
    // ladderdetails.xml") — ПОДТВЕРЖДЕНО ОКОНЧАТЕЛЬНО, расследование
    // закрыто: для всех 3 лестниц пользователя (Kazakhstan/Все/Ulytau)
    // ladderdetails.xml отдаёт только таблицу позиций команд (TeamId/
    // TeamName/Position/Wins/Lost), Matches.Match везде пустой (0
    // элементов) — список отдельных сыгранных матчей лестницы (соперник/
    // счёт/дата) через CHPP действительно недоступен ни в каком виде.
    // Запрос ladderdetails.xml больше не делается на каждой синхронизации
    // (3 лишних запроса без какой-либо пользы для уже закрытого вопроса) —
    // см. src/components/dashboard/HattrickArenaSection.tsx для честной
    // формулировки в интерфейсе.
    let ladders: ArenaLadderPosition[] = [];
    try {
      const ladderRaw = await requestChppXmlRaw("ladderlist", { version: LADDER_LIST_VERSION }, tokens);
      const structureDump = debugLadderListRawStructure(ladderRaw.rawXml);
      sectionErrors.push(
        `Hattrick Arena (диагностика — ladderlist.xml): HTTP ${ladderRaw.httpStatus}. ${structureDump}`,
      );
      if (ladderRaw.httpStatus >= 200 && ladderRaw.httpStatus < 300) {
        ladders = parseLadderListXml(ladderRaw.rawXml);
        sectionErrors.push(
          `Hattrick Arena (ladderlist.xml — место в лестнице): найдено записей — ${ladders.length}${
            ladders.length > 0
              ? ` (${ladders.map((l) => `"${l.name}": место ${l.position}, ${l.wins}W/${l.lost}L`).join("; ")})`
              : ""
          }.`,
        );
      }
    } catch (err) {
      sectionErrors.push(`Hattrick Arena (диагностика — ladderlist.xml): ошибка — ${errorMessage(err)}`);
    }

    // ДИАГНОСТИКА (см. чат "Матчи Арены: слишком мало показывается") —
    // явный подсчёт ДО и ПОСЛЕ обрезки лимитом, чтобы видеть на "Обновления"
    // честно, сколько реально доступно матчей Арены во всех источниках
    // вместе (лестница + все турниры), и что лимит (см. ARENA_MATCHES_SHOWN
    // ниже) действительно не режет данные раньше времени — если доступно
    // меньше лимита, показываются все доступные, без искусственного урезания.
    const allArenaMatches = [...ladderResults, ...tournamentResults].sort((a, b) => b.date.localeCompare(a.date));
    const arenaMatches = allArenaMatches.slice(0, ARENA_MATCHES_SHOWN);
    sectionErrors.push(
      `Hattrick Arena (диагностика — итоговый список матчей): всего доступно (лестница + турниры) — ${allArenaMatches.length}, лимит показа — ${ARENA_MATCHES_SHOWN}, сохранено в снимок — ${arenaMatches.length}${
        allArenaMatches.length > ARENA_MATCHES_SHOWN ? " (обрезано лимитом)" : " (лимит не сработал — показаны все доступные)"
      }.`,
    );
    const arenaResults: ArenaSyncResult = { matches: arenaMatches, tournaments: tournamentSummaries, ladders };
    await saveSnapshotSuccess(hattrickUserId, DATA_KEYS.arenaResults, arenaResults);
  }

  // -- cupInfo (Кубки: полная история сезона — путь по раундам ТЕКУЩЕГО
  // кубка плюс путь по каждому кубку, из которого команда уже выбыла в этом
  // сезоне, плюс ближайший предстоящий кубковый матч). teamId/stillInCup/
  // cupId/cupName из teamdetails, club (parsedClub) уже получены выше для
  // своих секций. matchesForCup берём из ОБЪЕДИНЁННОГО списка сезона
  // (mergedSeasonMatches — matches.xml + matchesarchive.xml, см. секцию
  // "matchesCalendar" выше), а не только matches.xml — там всего ~50
  // последних матчей, и более ранние кубковые матчи (уже выбывший кубок)
  // вполне могли из него выпасть. Единственный по-настоящему новый запрос
  // здесь — resolveOurCupPath ДЛЯ ТЕКУЩЕГО кубка (его пагинация по раундам
  // неизбежно последовательна); для уже пройденных кубков раунды строятся
  // напрямую из уже известных матчей (pastCupPathFromMatches), плюс по
  // одному лёгкому запросу fetchCupMeta на кубок за названием турнира. --
  {
    const debug: CupDebugInfo = {
      teamId: teamId || null,
      stillInCup,
      teamDetailsCupId: cupIdFromTeamDetails,
      teamDetailsCupName: cupNameFromTeamDetails,
      clubCupId: parsedClub?.cupId ?? null,
      matchesCupId: null,
      chosenCupId: null,
      matchesRawSample: [],
      pathDebug: [],
      nextMatchFound: null,
      pastCupIds: [],
    };
    const errors: string[] = [];

    // 4-уровневая схема определения ТЕКУЩЕГО CupID (см. чат "Кубки: не
    // откатываться на уже проигранный кубок, не закрепляться на уже
    // неверном значении"):
    //   1) teamDetailsCupId — самый надёжный источник (Team.Cup в
    //      teamdetails.xml, CHPP всегда держит его равным ровно одному
    //      активному кубку команды).
    //   2) clubCupId — тот же смысл, из club.xml, если teamDetails пуст.
    //   3) matchesCupId — первый попавшийся CupID среди matchesForCup, НО
    //      только если по нашим же данным команда из этого кубка ещё НЕ
    //      выбыла (последний матч под этим CupID — не проигрыш). Раньше
    //      этой проверки не было: как только Hattrick проставлял CupID уже
    //      сыгранным матчам прошлого (проигранного) кубка раньше, чем ещё
    //      не сыгранным матчам нового текущего, matchesCupId гарантированно
    //      находил именно прошлый, уже пройденный кубок.
    //   4) lastReliableCupId — CupID из ПРЕДЫДУЩЕЙ синхронизации, но только
    //      тот, что там был получен через уровень 1 или 2 (никогда через
    //      matchesCupId) — на случай, если teamDetailsCupId/clubCupId сейчас
    //      временно пусты (задержка на стороне Hattrick, см. managercompendium)
    //      и уровень 3 не дал уверенного кандидата.
    const matchesForCup = mergedSeasonMatches ?? parsedMatches ?? [];
    let cupId: string | null = null;
    let cupIdSource = "";

    if (teamId) {
      debug.matchesCupId = matchesForCup.find((m) => m.cupId !== null)?.cupId ?? null;
      debug.matchesRawSample = raw.matches ? debugRawMatchFields(raw.matches.rawXml, 10) : [];

      if (cupIdFromTeamDetails) {
        cupId = cupIdFromTeamDetails;
        cupIdSource = "teamDetailsCupId";
      } else if (debug.clubCupId) {
        cupId = debug.clubCupId;
        cupIdSource = "clubCupId";
      } else if (debug.matchesCupId) {
        const candidateMatches = matchesForCup
          .filter((m) => m.cupId === debug.matchesCupId)
          .sort((a, b) => b.date.localeCompare(a.date));
        const lastCandidateMatch = candidateMatches[0];
        const eliminated =
          !!lastCandidateMatch &&
          lastCandidateMatch.status === "FINISHED" &&
          lastCandidateMatch.ourScore !== null &&
          lastCandidateMatch.oppScore !== null &&
          lastCandidateMatch.ourScore < lastCandidateMatch.oppScore;
        if (!eliminated) {
          cupId = debug.matchesCupId;
          cupIdSource = "matchesCupId (проверен — не выбыли)";
        }
      }
    } else {
      errors.push("Кубки (teamdetails): не удалось определить нашу команду.");
    }

    // Уровень 4 — читаем ПРОШЛЫЙ снимок ДО того, как этот же цикл его
    // перезапишет ниже (saveSnapshotSuccess). lastReliableCupId в прошлом
    // снимке уже гарантированно НЕ из matchesCupId (см. комментарий у поля
    // в StoredCupInfo) — не рискуем закрепить уже ошибочное значение.
    const previousCupSnapshot = await getSnapshot<Record<string, unknown>>(hattrickUserId, DATA_KEYS.cupInfo);
    const previousLastReliableCupId = (previousCupSnapshot?.data?.lastReliableCupId as string | null | undefined) ?? null;

    if (!cupId && previousLastReliableCupId) {
      cupId = previousLastReliableCupId;
      cupIdSource = "lastReliableCupId (запасной из прошлой синхронизации)";
    }

    // Новый lastReliableCupId — только из уровня 1/2 этой синхронизации;
    // если оба пусты сейчас, переносим прошлое значение без изменений (а
    // НЕ то, что выбрал уровень 3/4 сейчас) — иначе поле само себя
    // "заразило" бы шатким источником.
    const lastReliableCupId = cupIdFromTeamDetails || debug.clubCupId || previousLastReliableCupId;

    debug.chosenCupId = cupId;
    sectionErrors.push(`Кубки (источник chosenCupId): ${cupIdSource || "(не найден ни один уровень)"}.`);

    let currentCupPath: OurCupPathResult | null = null;
    if (cupId && teamId) {
      currentCupPath = await resolveOurCupPath(tokens, cupId, teamId, ourTeamName);
      debug.pathDebug = currentCupPath.debug;
      if (currentCupPath.error) errors.push(currentCupPath.error);
    }

    // Другие CupID среди сыгранных кубковых матчей сезона — кубки, из
    // которых команда уже выбыла (каскад Национальный → Кубок Вызова → ...).
    // Сортировка по дате первого своего матча в кубке — от самого раннего к
    // самому позднему, текущий кубок (если есть) добавляется последним, как
    // самый актуальный этап каскада.
    const pastCupIds = [
      ...new Set(
        matchesForCup
          .filter((m) => Number(m.matchType) === CUP_MATCH_TYPE && m.status === "FINISHED" && m.cupId !== null && m.cupId !== cupId)
          .map((m) => m.cupId as string),
      ),
    ].sort((a, b) => {
      const dateOf = (id: string) =>
        matchesForCup.filter((m) => m.cupId === id).sort((x, y) => x.date.localeCompare(y.date))[0]?.date ?? "";
      return dateOf(a).localeCompare(dateOf(b));
    });
    debug.pastCupIds = pastCupIds;

    // ИСПРАВЛЕНО (подтверждённый баг — см. чат "Кубки: разобрались, откуда
    // лишние кубки"): matchesarchive.xml документированно может вернуть
    // матчи вплоть до 2 сезонов назад (см. комментарий у dedupeMatches в
    // matches.ts), а RealMatch нигде не хранит номер сезона — только дату и
    // CupID. Раньше pastCupIds включал ЛЮБОЙ CupID, когда-либо встретившийся
    // среди кубковых матчей команды, вне зависимости от сезона — так в
    // каскад попадали кубки прошлых сезонов (например, Ruby Challenger Cup/
    // Consolation Cup сезона 70), даже когда команда в ТЕКУЩЕМ сезоне играла
    // только Kazakhstan Cup → Sapphire Challenger Cup. Текущий сезон надёжно
    // известен из уже отдельно подтверждённого currentCupPath.season (прямой
    // ответ cupmatches.xml по АКТИВНОМУ кубку) — отбрасываем кандидата, если
    // последняя известная активность по его CupID (fetchCupMeta) относится к
    // другому сезону.
    const currentSeason = currentCupPath?.season ?? null;

    // Построение карточки каждого прошлого кубка — исключительно обходом
    // раундов cupmatches.xml (resolvePastCupPath, тот же надёжный приём,
    // что и для активного кубка выше) — подтверждено рабочим, построчная
    // диагностика убрана (см. чат "Уборка диагностики").
    const pastCupPaths = (
      await Promise.all(
        pastCupIds.map(async (id) => {
          const meta = await fetchCupMeta(tokens, id);
          if (currentSeason !== null && meta && meta.season !== currentSeason) return null;
          const walkSeason = meta?.season ?? currentSeason;
          if (walkSeason === null) return null;
          const walked = await resolvePastCupPath(tokens, id, teamId, walkSeason, ourTeamName);
          return !walked.error && walked.path.length > 0 ? walked : null;
        }),
      )
    ).filter((p): p is OurCupPathResult => p !== null);

    const cupPaths: OurCupPathResult[] = [...pastCupPaths, ...(currentCupPath ? [currentCupPath] : [])];

    const rawNextMatch = matchesForCup
      .filter((m) => Number(m.matchType) === CUP_MATCH_TYPE && m.status === "UPCOMING")
      .filter((m) => cupId === null || m.cupId === null || m.cupId === cupId)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
    const alreadyInPath = currentCupPath?.path.some((m) => m.matchId === rawNextMatch?.matchId) ?? false;
    debug.nextMatchFound = rawNextMatch
      ? `MatchID ${rawNextMatch.matchId} (${rawNextMatch.date}, соперник «${rawNextMatch.opponent}»)${alreadyInPath ? " — уже показан в пути по раундам, отдельно не дублируем" : ""}`
      : "не найден среди матчей matches.xml (MatchType=3, статус UPCOMING)";
    const nextMatch: UpcomingCupMatch | null =
      rawNextMatch && !alreadyInPath
        ? { matchId: rawNextMatch.matchId, date: rawNextMatch.date, home: rawNextMatch.home, opponent: rawNextMatch.opponent }
        : null;

    const stored: StoredCupInfo = { cupPaths, nextMatch, errors, debug, lastReliableCupId };
    await saveSnapshotSuccess(hattrickUserId, DATA_KEYS.cupInfo, stored);
    if (errors.length === 0) anySucceeded = true;
    else anyFailed = true;
    if (errors.length > 0) sectionErrors.push(...errors.map((e) => `Кубки: ${e}`));
    // Подробный "сырой пул кандидатов" и разбивка по каждому источнику CupID
    // убраны (см. чат "Уборка диагностики") — система работает надёжно,
    // оставлена только итоговая сводка.
    sectionErrors.push(
      `Кубки (диагностика TeamID): наша команда — teamId="${teamId || "(пусто!)"}" ` +
        `teamName="${ourTeamName || "(пусто!)"}", итоговый CupID="${cupId ?? "(не найден)"}", ` +
        `кубков в каскаде=${cupPaths.length}.`,
    );
  }

  const finalStatus: SyncResult["status"] = anyFailed && !anySucceeded ? "failed" : anyFailed ? "partial" : "ok";
  const summaryError = anyFailed
    ? sectionErrors.length > 0
      ? sectionErrors.join(" | ")
      : "Не все разделы удалось обновить — подробности у конкретных вкладок."
    : sectionErrors.length > 0
      ? sectionErrors.join(" | ") // "ok", но есть что показать (например, пустая академия/CupID диагностика)
      : null;
  await finishSync(hattrickUserId, finalStatus, summaryError);
  return { status: finalStatus, error: summaryError };
}

// --- Чтение сохранённых данных для Обзора --------------------------------

export interface OverviewData {
  clubName?: string;
  clubShortName?: string;
  badgeLabel?: string;
  leagueRows?: LeagueTableRow[];
  leagueName?: string;
  resultsMatrixTeams?: MatrixTeamMeta[];
  resultsMatrix?: (string | null)[][];
  recentMatches?: RecentMatchRow[];
  upcomingMatches?: UpcomingMatchRow[];
  balance?: number;
  totalIncome?: number;
  totalExpense?: number;
  realStaff?: RealClubStaff | null;
  coachName?: string;
  coachLeadership?: number;
  fanMood?: number;
  fanClubSize?: number;
  squadTotal?: number;
  squadInjured?: number;
  squadAvgForm?: string;
  powerRatingValue?: number;
  powerRatingWorldRank?: number;
  currencyLabel: string;
  errors: string[];
}

// Собирает те же данные, что раньше отдавала resolveDashboardData (прямой
// live-запрос к CHPP), но из уже сохранённых снимков — вызывающая страница
// (dashboard/page.tsx) сама решает, нужна ли синхронизация вообще (см.
// chpp_sync_status), эта функция только читает и раскладывает то, что уже
// есть в базе.
export async function getStoredOverviewData(hattrickUserId: string): Promise<OverviewData> {
  const snapshots = await getAllSnapshots(hattrickUserId);
  const errors: string[] = [];
  const data: OverviewData = { currencyLabel: defaultCurrency.label, errors: [] };

  const team = snapshots[DATA_KEYS.team]?.data as StoredTeamData | null;
  if (team) {
    data.clubName = team.clubName;
    data.clubShortName = team.clubShortName;
    data.badgeLabel = team.badgeLabel;
    data.powerRatingValue = team.powerRatingValue;
    data.powerRatingWorldRank = team.powerRatingWorldRank;
  }
  if (snapshots[DATA_KEYS.team]?.error) errors.push(snapshots[DATA_KEYS.team]!.error!);

  const worldCurrency = snapshots[DATA_KEYS.worldCurrency]?.data as WorldLeagueInfo | null;
  if (worldCurrency) data.currencyLabel = worldCurrency.currencyLabel;
  // Валюта — второстепенная деталь, её отдельная ошибка не выводится в
  // общий список (как и раньше в resolveDashboardData) — молча остаёмся на
  // тенге по умолчанию.

  const league = snapshots[DATA_KEYS.league]?.data as StoredLeagueData | null;
  if (league) {
    data.leagueName = league.leagueName;
    if (league.leagueRows.length > 0) data.leagueRows = league.leagueRows;
    data.resultsMatrixTeams = league.resultsMatrixTeams;
    data.resultsMatrix = league.resultsMatrix;
  }
  if (snapshots[DATA_KEYS.league]?.error) errors.push(snapshots[DATA_KEYS.league]!.error!);

  const matches = snapshots[DATA_KEYS.matches]?.data as RealMatch[] | null;
  const fanExpectations = (snapshots[DATA_KEYS.overviewFanExpectations]?.data as Record<string, FanExpectation> | null) ?? {};
  if (matches) {
    // ИСПРАВЛЕНО (см. чат "Матчи на Обзоре: устаревший последний сыгранный
    // матч") — raw matches.xml не гарантирует хронологический порядок
    // элементов (тот же порядок "как есть", что и во всех остальных местах
    // проекта, где это уже было явно замечено — см. сортировку в
    // toSeasonMatches, matches.ts), а .slice(0, N) без сортировки брал
    // первые N элементов В ЭТОМ порядке, а не N реально самых свежих/
    // ближайших матчей. Та же сортировка по дате, что уже применяется в
    // toSeasonMatches — по убыванию для сыгранных (самый свежий первым), по
    // возрастанию для предстоящих (ближайший первым) — теперь и здесь,
    // перед обрезкой лимитом.
    data.recentMatches = matches
      .filter((m) => m.status === "FINISHED" && m.ourScore !== null && m.oppScore !== null)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, OVERVIEW_MATCHES_COUNT)
      .map((m) => ({
        id: m.matchId,
        date: m.date,
        home: m.home,
        opponent: m.opponent,
        ourScore: m.ourScore!,
        oppScore: m.oppScore!,
        result: m.ourScore! > m.oppScore! ? "win" : m.ourScore! < m.oppScore! ? "loss" : "draw",
        // Уже посчитано на синхронизации (см. секцию overviewFanExpectations
        // выше) — тот же matchId, честный нейтральный индикатор, если запись
        // не нашлась (например снимок ещё старой формы, до этого изменения).
        fanExpectation: fanExpectations[m.matchId] ?? NEUTRAL_FAN_EXPECTATION,
      }));
    data.upcomingMatches = matches
      .filter((m) => m.status === "UPCOMING")
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, OVERVIEW_MATCHES_COUNT)
      .map((m) => ({
        id: m.matchId,
        date: m.date,
        home: m.home,
        opponent: m.opponent,
        // ИСПРАВЛЕНО (см. чат "Предстоящие матчи: все три показывают ⬜") —
        // раньше здесь стоял захардкоженный NEUTRAL_FAN_EXPECTATION,
        // оставшийся от прежней эвристики по зональным рейтингам (для
        // которой это было правдой — их у ещё не сыгранного матча
        // действительно не существует). fans.xml даёт реальный прогноз и
        // для предстоящих матчей тоже (см. fanExpectation.ts) — тот же
        // поиск по matchId, что и у recentMatches выше.
        fanExpectation: fanExpectations[m.matchId] ?? NEUTRAL_FAN_EXPECTATION,
        // Эмодзи-кубок вместо текстовой подписи "Официальный матч" — по запросу.
        competition: isFriendlyMatchType(m.matchType) ? undefined : "🏆",
      }));
  }
  if (snapshots[DATA_KEYS.matches]?.error) errors.push(snapshots[DATA_KEYS.matches]!.error!);

  const economy = snapshots[DATA_KEYS.economy]?.data as RealEconomy | null;
  if (economy) {
    data.balance = economy.cash;
    data.totalIncome = economy.thisWeek.incomeSum;
    data.totalExpense = economy.thisWeek.expenseSum;
    data.fanMood = chppSupportersPopularityToFanMoodLevel(economy.supportersPopularity);
    data.fanClubSize = economy.fanClubSize;
  }
  if (snapshots[DATA_KEYS.economy]?.error) errors.push(snapshots[DATA_KEYS.economy]!.error!);

  const club = snapshots[DATA_KEYS.club]?.data as RealClubStaff | null;
  if (club) data.realStaff = club;
  if (snapshots[DATA_KEYS.club]?.error) errors.push(snapshots[DATA_KEYS.club]!.error!);

  const playersData = snapshots[DATA_KEYS.players]?.data as StoredPlayersData | null;
  if (playersData) {
    data.squadTotal = playersData.summary.totalPlayers;
    data.squadInjured = playersData.summary.injuredCount;
    data.squadAvgForm = playersData.summary.averageForm.toFixed(1);
    if (team?.trainerPlayerId) {
      const trainer = playersData.players.find((p) => String(p.id) === team.trainerPlayerId);
      if (trainer) {
        data.coachName = trainer.name;
        data.coachLeadership = trainer.leadership;
      }
    }
  }
  if (snapshots[DATA_KEYS.players]?.error) errors.push(snapshots[DATA_KEYS.players]!.error!);

  return { ...data, errors };
}

export async function getAchievementsData(
  hattrickUserId: string,
): Promise<{ data: AchievementsResult | null; error: string | null }> {
  const snapshots = await getAllSnapshots(hattrickUserId);
  const entry = snapshots[DATA_KEYS.achievements];
  return { data: (entry?.data as AchievementsResult | null) ?? null, error: entry?.error ?? null };
}

// --- Чтение сохранённых данных для Состава/Расстановки (Фаза 2) ----------

export interface SquadPageData {
  players: SquadPlayer[] | null;
  error: string | null;
  trainerPlayerId: number | undefined;
}

// Тот же вид, что squad/page.tsx ожидал от resolveTrainerPlayerId() при
// живом запросе — 0/NaN тоже считаются "нет тренера в составе".
export async function getStoredSquadData(hattrickUserId: string): Promise<SquadPageData> {
  const snapshots = await getAllSnapshots(hattrickUserId);
  const playersEntry = snapshots[DATA_KEYS.players];
  const playersData = playersEntry?.data as StoredPlayersData | null;
  const team = snapshots[DATA_KEYS.team]?.data as StoredTeamData | null;

  let trainerPlayerId: number | undefined;
  if (team?.trainerPlayerId) {
    const id = Number(team.trainerPlayerId);
    trainerPlayerId = Number.isNaN(id) || id === 0 ? undefined : id;
  }

  return {
    players: playersData?.players ?? null,
    error: playersEntry?.error ?? null,
    trainerPlayerId,
  };
}

export interface LineupPageData {
  players: SquadPlayer[] | null;
  error: string | null;
  opponentAnalysis: OpponentAnalysisResult;
  trainerPlayerId: number | undefined;
}

export async function getStoredLineupData(hattrickUserId: string): Promise<LineupPageData> {
  const snapshots = await getAllSnapshots(hattrickUserId);
  const playersEntry = snapshots[DATA_KEYS.players];
  const playersData = playersEntry?.data as StoredPlayersData | null;
  const opponentEntry = snapshots[DATA_KEYS.opponentAnalysis];
  const opponentAnalysis: OpponentAnalysisResult = (opponentEntry?.data as OpponentAnalysisResult | null) ?? {
    ...emptyOpponentAnalysis,
    error: opponentEntry?.error ?? null,
  };
  const team = snapshots[DATA_KEYS.team]?.data as StoredTeamData | null;

  let trainerPlayerId: number | undefined;
  if (team?.trainerPlayerId) {
    const id = Number(team.trainerPlayerId);
    trainerPlayerId = Number.isNaN(id) || id === 0 ? undefined : id;
  }

  return {
    players: playersData?.players ?? null,
    error: playersEntry?.error ?? null,
    opponentAnalysis,
    trainerPlayerId,
  };
}

// --- Чтение сохранённых данных для остальных разделов (Фаза 3) -----------

export interface FinancePageData {
  data: RealEconomy | null;
  error: string | null;
  currencyLabel: string | undefined;
}

export async function getStoredFinanceData(hattrickUserId: string): Promise<FinancePageData> {
  const snapshots = await getAllSnapshots(hattrickUserId);
  const economyEntry = snapshots[DATA_KEYS.economy];
  const worldCurrency = snapshots[DATA_KEYS.worldCurrency]?.data as WorldLeagueInfo | null;
  return {
    data: (economyEntry?.data as RealEconomy | null) ?? null,
    error: economyEntry?.error ?? null,
    currencyLabel: worldCurrency?.currencyLabel,
  };
}

export interface StadiumPageData {
  data: RealArenaCapacity | null;
  error: string | null;
  currencyLabel: string | undefined;
}

export async function getStoredStadiumData(hattrickUserId: string): Promise<StadiumPageData> {
  const snapshots = await getAllSnapshots(hattrickUserId);
  const arenaEntry = snapshots[DATA_KEYS.arena];
  const worldCurrency = snapshots[DATA_KEYS.worldCurrency]?.data as WorldLeagueInfo | null;
  return {
    data: (arenaEntry?.data as RealArenaCapacity | null) ?? null,
    error: arenaEntry?.error ?? null,
    currencyLabel: worldCurrency?.currencyLabel,
  };
}

export interface TrainingPageData {
  coachName: string | undefined;
  coachLeadership: number | undefined;
  coachError: string | null;
  training: RealTraining | null;
}

// Тренер ищется среди уже сохранённого ростера ("players" — тот же ключ,
// что читают Состав/Расстановка), отдельный запрос players.xml здесь не
// нужен. training.xml — второстепенная деталь (см. комментарий у секции
// "training" в syncTeamData) — при отсутствии молча остаёмся без реальных
// значений, без отдельной ошибки.
export async function getStoredTrainingData(hattrickUserId: string): Promise<TrainingPageData> {
  const snapshots = await getAllSnapshots(hattrickUserId);
  const team = snapshots[DATA_KEYS.team]?.data as StoredTeamData | null;
  const playersEntry = snapshots[DATA_KEYS.players];
  const playersData = playersEntry?.data as StoredPlayersData | null;
  const training = (snapshots[DATA_KEYS.training]?.data as RealTraining | null) ?? null;

  let coachName: string | undefined;
  let coachLeadership: number | undefined;
  let coachError: string | null = null;
  if (team?.trainerPlayerId && playersData) {
    const trainer = playersData.players.find((p) => String(p.id) === team.trainerPlayerId);
    if (trainer) {
      coachName = trainer.name;
      coachLeadership = trainer.leadership;
    } else {
      coachError = "Тренер не найден среди игроков ростера (players.xml)";
    }
  } else {
    coachError = snapshots[DATA_KEYS.team]?.error ?? playersEntry?.error ?? "Тренер (teamdetails/players): нет данных.";
  }

  return { coachName, coachLeadership, coachError, training };
}

export interface YouthPageData {
  youthLevel: number | null;
  levelError: string | null;
  players: RealYouthPlayer[] | null;
  playersError: string | null;
  playersHttpStatus: number | null;
  rawPlayerCount: number;
  detailsSucceeded: number;
  detailsFailed: string[];
  rawFieldsSample: DebugYouthPlayerRaw[];
}

export async function getStoredYouthData(hattrickUserId: string): Promise<YouthPageData> {
  const snapshots = await getAllSnapshots(hattrickUserId);
  const clubEntry = snapshots[DATA_KEYS.club];
  const club = clubEntry?.data as RealClubStaff | null;
  const youthEntry = snapshots[DATA_KEYS.youthPlayers];
  const youth = youthEntry?.data as StoredYouthPlayersData | null;

  return {
    youthLevel: club?.youthLevel ?? null,
    levelError: clubEntry?.error ?? null,
    players: youth?.players ?? null,
    playersError: youth?.error ?? null,
    playersHttpStatus: youth?.httpStatus ?? null,
    rawPlayerCount: youth?.rawPlayerCount ?? 0,
    // ?? [] здесь же защищает от старого снимка (сохранённого до этой
    // диагностики) — те же undefined-поля, что и раньше приходилось
    // нормализовать для "Кубков" (см. normalizeStoredCupInfo), просто здесь
    // хватает обычного fallback: новые поля добавились, а не заменили старые.
    detailsSucceeded: youth?.detailsSucceeded ?? 0,
    detailsFailed: youth?.detailsFailed ?? [],
    rawFieldsSample: youth?.rawFieldsSample ?? [],
  };
}

export interface MatchesPageData {
  matches: SeasonMatch[] | null;
  ourTeamName: string;
  error: string | null;
  warning: string | null;
  debugCounts: string[];
  debugRaw: Record<string, unknown>[];
  challenges: ArenaChallengesResult;
  arenaMatches: ArenaRecentMatch[];
  arenaTournaments: ArenaTournamentSummary[];
  arenaLadders: ArenaLadderPosition[];
}

const emptyArenaChallenges: ArenaChallengesResult = { sentByUs: [], offersFromOthers: [], error: null };
const emptyArenaResult: ArenaSyncResult = { matches: [], tournaments: [], ladders: [] };

// ИСПРАВЛЕНО (см. чат "Матчи: серверная ошибка после закладок Официальные/
// Арена") — форма снимка DATA_KEYS.arenaResults поменялась с плоского
// массива (ArenaRecentMatch[]) на объект {matches, tournaments} в этом же
// коммите. У аккаунтов, синхронизировавшихся ДО этого деплоя, в базе всё
// ещё лежит СТАРЫЙ снимок-массив — слепой `as ArenaSyncResult` ничего не
// проверяет в рантайме, поэтому arenaResult.matches/tournaments оказывались
// undefined у старых снимков, и HattrickArenaSection падал на
// arenaTournaments.filter(...) на сервере (TypeError, digest 21536431).
// Явная проверка формы вместо слепого каста — до следующей синхронизации
// показываем честные пустые списки, а не роняем страницу. Проверяем только
// matches/tournaments (поле ladders добавилось позже — снимки между этими
// двумя коммитами валидны, просто ещё без лестниц, читаем их дефолтом ниже).
function isArenaSyncResult(value: unknown): value is Omit<ArenaSyncResult, "ladders"> {
  return (
    !!value &&
    typeof value === "object" &&
    Array.isArray((value as ArenaSyncResult).matches) &&
    Array.isArray((value as ArenaSyncResult).tournaments)
  );
}

export async function getStoredMatchesCalendar(hattrickUserId: string): Promise<MatchesPageData> {
  const snapshots = await getAllSnapshots(hattrickUserId);
  const calendarEntry = snapshots[DATA_KEYS.matchesCalendar];
  const calendar = calendarEntry?.data as StoredMatchesCalendar | null;
  const challengesEntry = snapshots[DATA_KEYS.arenaChallenges];
  const challenges = (challengesEntry?.data as ArenaChallengesResult | null) ?? {
    ...emptyArenaChallenges,
    error: challengesEntry?.error ?? null,
  };
  const arenaResultRaw = snapshots[DATA_KEYS.arenaResults]?.data;
  const arenaResult = isArenaSyncResult(arenaResultRaw) ? arenaResultRaw : emptyArenaResult;
  const arenaLadders = Array.isArray((arenaResultRaw as ArenaSyncResult | undefined)?.ladders)
    ? (arenaResultRaw as ArenaSyncResult).ladders
    : [];

  return {
    matches: calendar?.matches ?? null,
    ourTeamName: calendar?.ourTeamName ?? "",
    error: calendar?.error ?? calendarEntry?.error ?? null,
    warning: calendar?.warning ?? null,
    debugCounts: calendar?.debugCounts ?? [],
    debugRaw: calendar?.debugRaw ?? [],
    challenges,
    arenaMatches: arenaResult.matches,
    arenaTournaments: arenaResult.tournaments,
    arenaLadders,
  };
}

const emptyCupDebug: CupDebugInfo = {
  teamId: null,
  stillInCup: null,
  teamDetailsCupId: null,
  teamDetailsCupName: null,
  clubCupId: null,
  matchesCupId: null,
  chosenCupId: null,
  matchesRawSample: [],
  pathDebug: [],
  nextMatchFound: null,
  pastCupIds: [],
};

// Нормализует то, что реально лежит в chpp_snapshots, под текущую форму
// StoredCupInfo — НЕ доверяя слепо "as StoredCupInfo" (это только
// подсказка компилятору, а не проверка в рантайме). До коммита "Кубки:
// вернуть каскад кубков сезона" здесь был один cupPath (объект или null)
// вместо массива cupPaths, а debug не знал про pastCupIds — у пользователей,
// синхронизировавшихся ДО этого коммита, в базе всё ещё лежит именно такая
// старая запись (следующая синхронизация перезапишет её как надо, но до
// этого страница дальше читала бы cupPaths/debug.pastCupIds как undefined
// и падала — см. TypeError "Cannot read properties of undefined (reading
// 'length')" на dashboard/cup). Читаем defensively вместо того, чтобы
// заставлять всех вручную жать "Обновить данные".
export function normalizeStoredCupInfo(raw: Record<string, unknown> | undefined, fallbackError: string | null): StoredCupInfo {
  if (!raw) {
    return {
      cupPaths: [],
      nextMatch: null,
      errors: fallbackError ? [fallbackError] : [],
      debug: emptyCupDebug,
      lastReliableCupId: null,
    };
  }

  const cupPaths: OurCupPathResult[] = Array.isArray(raw.cupPaths)
    ? (raw.cupPaths as OurCupPathResult[])
    : raw.cupPath
      ? [raw.cupPath as OurCupPathResult]
      : [];

  const rawDebug = (raw.debug as Partial<CupDebugInfo> | undefined) ?? {};
  const debug: CupDebugInfo = {
    ...emptyCupDebug,
    ...rawDebug,
    pastCupIds: Array.isArray(rawDebug.pastCupIds) ? rawDebug.pastCupIds : [],
  };

  return {
    cupPaths,
    nextMatch: (raw.nextMatch as UpcomingCupMatch | null | undefined) ?? null,
    errors: Array.isArray(raw.errors) ? (raw.errors as string[]) : [],
    debug,
    lastReliableCupId: (raw.lastReliableCupId as string | null | undefined) ?? null,
  };
}

export async function getStoredCupData(hattrickUserId: string): Promise<StoredCupInfo> {
  const snapshots = await getAllSnapshots(hattrickUserId);
  const entry = snapshots[DATA_KEYS.cupInfo];
  return normalizeStoredCupInfo(entry?.data as Record<string, unknown> | undefined, entry?.error ?? null);
}

export async function getStoredTransferHistory(
  hattrickUserId: string,
): Promise<{ data: TransferHistoryResult | null; error: string | null; currencyLabel: string | undefined }> {
  const snapshots = await getAllSnapshots(hattrickUserId);
  const entry = snapshots[DATA_KEYS.transferHistory];
  const worldCurrency = snapshots[DATA_KEYS.worldCurrency]?.data as WorldLeagueInfo | null;
  return {
    data: (entry?.data as TransferHistoryResult | null) ?? null,
    error: entry?.error ?? null,
    currencyLabel: worldCurrency?.currencyLabel,
  };
}

// Общая точка входа для любой мигрированной страницы (Обзор, Состав,
// Расстановка, ...): если синхронизация ни разу не запускалась для этого
// аккаунта — запускает её один раз (это и есть "автоматическая
// синхронизация при первом визите", см. чат), иначе просто возвращает уже
// известный статус. Не запускает синхронизацию повторно только потому, что
// последняя попытка провалилась — за это отвечает кнопка "Обновить
// данные"/SyncFailedScreen.tsx, не автоматика.
export async function ensureSynced(hattrickUserId: string, tokens: StoredHattrickTokens): Promise<ChppSyncStatus | null> {
  let status = await getSyncStatus(hattrickUserId);
  if (!status) {
    await syncTeamData(hattrickUserId, tokens);
    status = await getSyncStatus(hattrickUserId);
  }
  return status;
}

export type { ChppSyncStatus };
export { getSyncStatus };
