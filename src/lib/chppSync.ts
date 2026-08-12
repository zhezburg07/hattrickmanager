import { XMLParser } from "fast-xml-parser";
import type { MatrixTeamMeta } from "@/data/leagueMatrix";
import type { LeagueTableRow } from "@/components/dashboard/LeagueTable";
import type { RecentMatchRow, UpcomingMatchRow } from "@/components/dashboard/MatchesSection";
import { defaultCurrency, chppSupportersPopularityToFanMoodLevel } from "@/data/dashboard";
import { resolveCountryByEnglishName, type SquadPlayer } from "@/data/squad";
import { requestChppXmlRaw, type ChppRawResponse, type StoredHattrickTokens } from "./hattrickApi";
import { isChppAuthError, assertNoChppError } from "./chppError";
import { parseTeamDetailsXml } from "./teamDetails";
import { parseLeagueDetailsXml, type RealLeagueStandingRow } from "./leagueDetails";
import { parseLeagueFixturesXml, debugLeagueFixturesRawStructure } from "./leagueFixtures";
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
} from "./lastMatchRating";
import {
  parseOpponentLineup,
  deriveFormation,
  computeZoneStrength,
  tacticTypeLabel,
  type OpponentAnalysisResult,
} from "./opponentAnalysis";
import { trainingWeekKey, saveCurrentWeekSnapshot, saveWeeklyTsiSnapshot } from "./playerHistoryDb";
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
  debugTournamentFixturesRawStructure,
  buildArenaTournamentSummaries,
  parseLadderListXml,
  debugLadderListRawStructure,
  debugTournamentListFullResponse,
  TOURNAMENT_LIST_VERSION,
  TOURNAMENT_FIXTURES_VERSION,
  LADDER_LIST_VERSION,
  type ArenaChallengesResult,
  type ArenaRecentMatch,
  type ArenaTournamentSummary,
  type ArenaLadderPosition,
  type ArenaSyncResult,
} from "./hattrickArena";
import {
  toSeasonMatches,
  dedupeMatches,
  filterTrainingRelevantMatches,
  debugRawMatchFields,
  debugRawCupTypeMatchFields,
  parseArchiveEchoedRange,
  CUP_MATCH_TYPE,
  LADDER_MATCH_TYPE,
} from "./matches";
import type { SeasonMatch } from "@/data/matches";
import { resolveOurCupPath, resolvePastCupPath, fetchCupMeta, type OurCupPathResult } from "./cupMatches";
import type { UpcomingCupMatch } from "@/components/dashboard/CupSection";
import {
  parseTransfersTeamXml,
  accumulateTransferHistory,
  mergeTransferHistory,
  debugTransferPartyFields,
  debugSelfCounterpartMismatches,
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

// Сколько последних сыгранных матчей Арены (лестница + все турниры вместе)
// показывать на закладке "Арена" (см. чат "Матчи Арены: слишком мало
// показывается") — единая константа для обоих мест, где применяется лимит
// (filterRecentArenaMatches для лестницы и итоговая обрезка ниже), чтобы
// они не могли разойтись между собой. Если реально доступных матчей
// меньше — показываются все доступные, лимит не досоздаёт недостающие.
const ARENA_MATCHES_SHOWN = 10;
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
    // ДИАГНОСТИКА (см. чат "Обзор: не видно переключателя Все/Домашние/
    // Гостевые") — раньше этот блок молча проглатывал ЛЮБУЮ причину пустой
    // сетки (LeagueLevelUnitID не определён → leaguefixtures вообще не
    // запрашивался; HTTP-ошибка; 0 сыгранных матчей в leaguefixtures.xml;
    // TeamID из leaguedetails.xml не совпадает с TeamID из leaguefixtures.xml
    // → 0 заполненных ячеек, хотя сыгранные матчи есть). Toggle "Все игры/
    // Домашние/Гостевые" на LeagueTable.tsx рендерится ТОЛЬКО когда
    // matrixTeams/resultsMatrix реально заполнены (см. showResultsMatrix
    // там же) — то есть пропадает вместе с сеткой при любой из этих причин,
    // никак не из-за SHOW_RESULTS_GRID (тот вообще не гейтит toggle, только
    // саму сетку под таблицей, и сейчас включён).
    if (league.standings.length > 0) {
      if (!leagueLevelUnitId) {
        sectionErrors.push(
          "Сетка результатов лиги: LeagueLevelUnitID не определён (teamdetails) — leaguefixtures.xml вообще не запрашивался, поэтому переключатель Все/Домашние/Гостевые не показывается.",
        );
      } else if (!raw.leaguefixtures) {
        sectionErrors.push(
          `Сетка результатов лиги: LeagueLevelUnitID=${leagueLevelUnitId} есть, но raw.leaguefixtures отсутствует — запрос не выполнился.`,
        );
      } else {
        try {
          assertOkStatus(raw.leaguefixtures);
          const fixtures = parseLeagueFixturesXml(raw.leaguefixtures.rawXml);
          const playedCount = fixtures.filter((f) => f.homeGoals !== null && f.awayGoals !== null).length;
          const { teams, matrix } = buildRealLeagueMatrix(league.standings, fixtures);
          const filledCells = matrix.reduce((sum, row) => sum + row.filter((c) => c !== null).length, 0);
          sectionErrors.push(
            `Сетка результатов лиги: LeagueLevelUnitID=${leagueLevelUnitId}, HTTP ${raw.leaguefixtures.httpStatus}, матчей в leaguefixtures.xml — ${fixtures.length}, из них сыгранных — ${playedCount}, заполненных ячеек сетки — ${filledCells}.`,
          );
          // ДИАГНОСТИКА (см. чат "Сетка результатов лиги: HTTP 200, но 0
          // матчей") — сырая структура ответа выводится ВСЕГДА, а не только
          // при 0 матчах, чтобы сразу подтвердить (или опровергнуть) новый
          // путь root.Match на реальном ответе, а не молча надеяться, что
          // логика анонимного встраивания верна и на этот раз.
          sectionErrors.push(
            `Сетка результатов лиги (сырая структура ответа): ${debugLeagueFixturesRawStructure(raw.leaguefixtures.rawXml)}`,
          );
          if (filledCells > 0) {
            stored.resultsMatrixTeams = teams;
            stored.resultsMatrix = matrix;
          } else if (playedCount > 0) {
            // Сыгранные матчи есть, но ни один не сопоставился с командой из
            // таблицы — похоже на несовпадение TeamID между leaguedetails.xml
            // и leaguefixtures.xml. Примеры обоих источников — увидеть
            // реальный формат/значения, а не гадать.
            const standingsIds = league.standings.slice(0, 5).map((s) => `${s.teamName}=${s.teamId}`).join(", ");
            const fixtureIds = fixtures
              .slice(0, 5)
              .map((f) => `${f.homeTeamName}=${f.homeTeamId}/${f.awayTeamName}=${f.awayTeamId}`)
              .join(", ");
            sectionErrors.push(
              `Сетка результатов лиги: 0 заполненных ячеек при ${playedCount} сыгранных матчах — похоже на несовпадение TeamID. Из таблицы (leaguedetails.xml): [${standingsIds}]. Из календаря (leaguefixtures.xml): [${fixtureIds}].`,
            );
          }
        } catch (err) {
          sectionErrors.push(`Сетка результатов лиги: ошибка — ${errorMessage(err)}`);
        }
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
  // ВРЕМЕННАЯ диагностика (см. чат "Кубки: реальные текущие матчи Kazakhstan
  // Cup не получают CupID") — сырые поля Cup*/Context* КАЖДОГО кубкового
  // матча прямо из matches.xml (текущий сезон), не только уже вычисленный
  // cupId — см. debugRawCupTypeMatchFields в matches.ts.
  let rawCupTypeMatchFieldsDump: Record<string, unknown>[] = [];
  try {
    assertOkStatus(raw.matches);
    parsedMatches = parseMatchesXml(raw.matches.rawXml, teamId);
    rawCupTypeMatchFieldsDump = debugRawCupTypeMatchFields(raw.matches.rawXml);
    await saveSnapshotSuccess(hattrickUserId, DATA_KEYS.matches, parsedMatches);
    anySucceeded = true;
  } catch (err) {
    await saveSnapshotError(hattrickUserId, DATA_KEYS.matches, `Матчи (matches): ${errorMessage(err)}`);
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
          const lastMatchRatings = perMatchRatings[0] ?? {};
          const bestOfRecentRatings: Record<number, number> = {};
          for (const ratings of perMatchRatings) {
            for (const [playerId, rating] of Object.entries(ratings)) {
              const id = Number(playerId);
              bestOfRecentRatings[id] =
                bestOfRecentRatings[id] !== undefined ? Math.max(bestOfRecentRatings[id], rating) : rating;
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
    // на Составе/Расстановке читают предыдущий снимок отдельно, при рендере
    // страницы (getPreviousWeekSnapshots) — см. squad/page.tsx, lineup/page.tsx.
    try {
      const currentWeek = trainingWeekKey(new Date());
      await saveCurrentWeekSnapshot(hattrickUserId, currentWeek, players);
      await saveWeeklyTsiSnapshot(hattrickUserId, players);
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
    // ДИАГНОСТИКА (см. чат "Юношеская команда: национальность и возраст
    // всё ещё не отображаются") — та же диагностика уже была на debug-
    // панели /dashboard/youth, дублируем в sectionErrors, чтобы она была
    // видна на "Обновления" сразу после синхронизации, без отдельного
    // захода на вкладку "Юношеская команда" — тем же способом, что уже
    // используется для Кубков.
    if (rawFieldsSample.length > 0) {
      const dump = rawFieldsSample
        .map((p) => `${p.name}: ${p.ageLikeFields}; ${p.countryLikeFields}`)
        .join(" || ");
      sectionErrors.push(`Юношеская команда (сырые поля Age*/Country*/Nation* из youthplayerlist.xml): ${dump}`);
    }
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
    const partyDebug = debugTransferPartyFields(raw.transfersteam.rawXml, 5);
    sectionErrors.push(`Трансферы (диагностика Buyer/Seller TeamID, наш TeamID=${teamId || "?"}): ${partyDebug}`);
    const selfMismatchDebug = debugSelfCounterpartMismatches(raw.transfersteam.rawXml, teamId, ourTeamName, 10);
    sectionErrors.push(
      `Трансферы (диагностика — сделки, где по ИМЕНИ мы участник, но ни один TeamID не совпал, наша команда="${ourTeamName || "?"}"): ${selfMismatchDebug}`,
    );
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
  // получены выше для секции "matches", здесь только добавляем историю через
  // 6 окон matchesarchive (см. комментарий в исходном matches/page.tsx про
  // причины именно такого разбиения) и собираем финальный список. Ошибка и
  // предупреждение хранятся ВНУТРИ объекта (как и раньше на странице), а не
  // через error-колонку — независимых частичных причин несколько.
  {
    const debugCounts: string[] = [];
    let debugRaw: Record<string, unknown>[] = [];
    let calendarError: string | null = null;
    let calendarWarning: string | null = null;
    let shownMatches: SeasonMatch[] | null = null;

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

      const ARCHIVE_WINDOW_DAYS = 45;
      const ARCHIVE_WINDOW_COUNT = 6;
      const dayMs = 24 * 60 * 60 * 1000;
      const now = new Date();
      const archiveWindows = Array.from({ length: ARCHIVE_WINDOW_COUNT }, (_, i) => {
        const last = new Date(now.getTime() - i * ARCHIVE_WINDOW_DAYS * dayMs);
        const first = new Date(last.getTime() - ARCHIVE_WINDOW_DAYS * dayMs);
        return { firstMatchDate: toHattrickTimeString(first), lastMatchDate: toHattrickTimeString(last) };
      });

      let archiveMatches: RealMatch[] = [];
      let archiveWarning: string | null = null;
      const archiveResults = await Promise.allSettled(
        archiveWindows.map((w) =>
          requestChppXmlRaw("matchesarchive", { FirstMatchDate: w.firstMatchDate, LastMatchDate: w.lastMatchDate }, tokens),
        ),
      );

      let anyArchiveSuccess = false;
      let clampedWindowCount = 0;
      archiveResults.forEach((result, i) => {
        const w = archiveWindows[i];
        const windowLabel = `окно ${i + 1}/${ARCHIVE_WINDOW_COUNT} (${w.firstMatchDate}..${w.lastMatchDate})`;
        if (result.status !== "fulfilled") {
          const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
          debugCounts.push(`matchesarchive.xml [${windowLabel}]: ошибка запроса — ${message}`);
          return;
        }
        const archiveRaw = result.value;
        if (archiveRaw.httpStatus < 200 || archiveRaw.httpStatus >= 300) {
          debugCounts.push(`matchesarchive.xml [${windowLabel}]: HTTP ${archiveRaw.httpStatus}`);
          return;
        }
        try {
          const windowMatches = parseMatchesXml(archiveRaw.rawXml, teamId, { isArchive: true });
          archiveMatches.push(...windowMatches);
          anyArchiveSuccess = true;
          const echoed = parseArchiveEchoedRange(archiveRaw.rawXml);
          const clamped = echoed.firstMatchDate !== null && echoed.firstMatchDate !== w.firstMatchDate;
          if (clamped) clampedWindowCount += 1;
          debugCounts.push(
            `matchesarchive.xml [${windowLabel}]: ${windowMatches.length} матчей` +
              (clamped ? ` ⚠ CHPP применил другой диапазон: ${echoed.firstMatchDate}..${echoed.lastMatchDate}` : ""),
          );
        } catch (err) {
          debugCounts.push(`matchesarchive.xml [${windowLabel}]: ошибка разбора — ${errorMessage(err)}`);
        }
      });

      if (!anyArchiveSuccess) {
        archiveWarning = "Полная история прошлых сезонов (matchesarchive) недоступна — показан только текущий сезон (matches).";
      } else if (clampedWindowCount > 0) {
        archiveWarning = `CHPP подрезал запрошенный диапазон дат в ${clampedWindowCount} из ${ARCHIVE_WINDOW_COUNT} запросов к matchesarchive — история может быть неполной несмотря на попытку.`;
      }
      debugCounts.push(`matchesarchive.xml — всего собрано из всех окон: ${archiveMatches.length} матчей`);

      const merged = dedupeMatches([...currentSeasonMatches, ...archiveMatches]);
      debugCounts.push(`после объединения и удаления дублей: ${merged.length}`);
      mergedSeasonMatches = merged;

      if (merged.length === 0) {
        const archiveNote = archiveMatches.length === 0 ? " и matchesarchive" : "";
        throw new Error(
          `Матчи (matches${archiveNote}): запрос выполнился (HTTP ${raw.matches.httpStatus}), но вернул пустой список матчей — либо у команды ещё нет ни одного матча в ответе CHPP, либо структура ответа отличается от ожидаемой (см. RealMatch в src/lib/matches.ts).`,
        );
      }

      let trainingRelevant = filterTrainingRelevantMatches(merged);
      debugCounts.push(`после строгого фильтра (сыграно + основная команда): ${trainingRelevant.length}`);

      if (merged.length !== trainingRelevant.length) {
        const passedIds = new Set(trainingRelevant.map((m) => m.matchId));
        const excluded = merged.filter((m) => !passedIds.has(m.matchId));
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
        trainingRelevant = merged.filter((m) => m.status === "FINISHED" && m.ourScore !== null && m.oppScore !== null);
        debugCounts.push(`после мягкого фильтра (только "сыграно"): ${trainingRelevant.length}`);
        if (trainingRelevant.length > 0) {
          filterWarning =
            "Не удалось надёжно отличить матчи основной команды от юношеских/Hattrick Arena по данным CHPP (поле SourceSystem) — показаны все сыгранные матчи без этой фильтрации.";
        }
      }

      const MAX_MATCHES_SHOWN = 25;
      shownMatches = toSeasonMatches(trainingRelevant).slice(0, MAX_MATCHES_SHOWN);
      calendarWarning = [archiveWarning, filterWarning].filter(Boolean).join(" ") || null;
      anySucceeded = true;
    } catch (err) {
      calendarError = `Матчи (matches): ${errorMessage(err)}`;
      anyFailed = true;
    }

    const stored: StoredMatchesCalendar = {
      matches: shownMatches,
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
  // MatchType === LADDER_MATCH_TYPE (62, см. matches.ts — значение из
  // независимого CHPP-клиента, НЕ проверенное на живых данных этого
  // аккаунта). Диагностика (сколько всего сыгранных матчей просканировано и
  // сколько попало под этот тип) пишется всегда, а не только при ошибке —
  // 0 совпадений может значить и "команда давно не играла через Arena", и
  // "предположение о MatchType неверное", отличить их можно только по
  // числу просканированных сыгранных матчей рядом.
  {
    const scanSource = mergedSeasonMatches ?? parsedMatches ?? [];
    const finishedMatches = scanSource.filter((m) => m.status === "FINISHED");
    const ladderResults = filterRecentArenaMatches(scanSource, ARENA_MATCHES_SHOWN);
    sectionErrors.push(
      `Hattrick Arena (диагностика — лестница): просканировано сыгранных матчей ${finishedMatches.length}, из них с MatchType=${LADDER_MATCH_TYPE} (подтверждённо ненадёжный признак — см. ниже) — ${ladderResults.length}.`,
    );
    // ДИАГНОСТИКА (см. чат "0 из 61 сыгранных матчей имеют MatchType=62 —
    // гипотеза не подтвердилась") — пользователь попросил полный список
    // реальных значений MatchType среди сыгранных матчей С ПОДСЧЁТОМ, а не
    // очередное предположение вслепую. Гистограмма по убыванию частоты —
    // сопоставить с реально известными типами (лига/кубок/обычные
    // товарищеские/возможно Arena), либо честно убедиться, что 0 — это
    // правильный результат (команда просто не играла через Arena).
    const typeCounts = new Map<string, number>();
    for (const m of finishedMatches) {
      const key = m.matchType || "(пусто)";
      typeCounts.set(key, (typeCounts.get(key) ?? 0) + 1);
    }
    const histogram = [...typeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => `MatchType=${type}: ${count}`)
      .join(", ");
    sectionErrors.push(
      `Hattrick Arena (диагностика — все реальные значения MatchType среди ${finishedMatches.length} сыгранных матчей): ${histogram || "(сыгранных матчей не найдено)"}.`,
    );

    // ДИАГНОСТИКА (см. чат "у меня десятки матчей Ладдер/Турнир на
    // hattrick.org, но их нет вообще ни под каким MatchType в выборке") —
    // полный построчный список ВСЕХ просканированных сыгранных матчей
    // (дата/тип/соперник/счёт), а не только агрегированная гистограмма —
    // чтобы можно было напрямую сверить по датам с реальными матчами Ладдер/
    // Турнир с hattrick.org и увидеть, действительно ли их там нет вообще,
    // а не просто под неожиданным MatchType.
    const fullDump = finishedMatches
      .map(
        (m) =>
          `${m.date} MatchType=${m.matchType || "?"} ${m.home ? "дома" : "гости"} vs ${m.opponent} ${m.ourScore}:${m.oppScore}`,
      )
      .join(" || ");
    sectionErrors.push(
      `Hattrick Arena (диагностика — полный список всех ${finishedMatches.length} сыгранных матчей): ${fullDump || "(нет матчей)"}.`,
    );

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

        tournamentSummaries = buildArenaTournamentSummaries(tournaments, matchesByTournamentId);
        tournamentDiagnostics.push(
          `Трофеи/текущие турниры (эвристика, не официальный флаг CHPP): ${tournamentSummaries
            .map((s) => `"${s.name}" — ${s.isOngoing ? "идёт сейчас" : s.wonTrophy ? "выигран (предположительно)" : "завершён, не выигран/не определено"}`)
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
    // — см. подробный комментарий в hattrickArena.ts). НЕ проверено на
    // живых данных — полная диагностика (HTTP-статус + сырая структура
    // ответа) пишется всегда, а не только при 0 результатах.
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
        if (eliminated) {
          sectionErrors.push(
            `Кубки: CupID ${debug.matchesCupId} отклонён как "текущий" через matchesCupId — последний матч ` +
              `под этим CupID (MatchID ${lastCandidateMatch.matchId}, ${lastCandidateMatch.date}) проигран ` +
              `${lastCandidateMatch.ourScore}:${lastCandidateMatch.oppScore}, команда уже выбыла из этого кубка.`,
          );
        } else {
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
      sectionErrors.push(
        `Кубки: teamDetailsCupId/clubCupId пусты, matchesCupId не прошёл проверку — используем последний ` +
          `надёжный CupID из прошлой синхронизации: ${previousLastReliableCupId}.`,
      );
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
      // Раунды/даты текущего кубка по cupmatches.xml — та же диагностика,
      // что и debug.pathDebug выше (скрытая панель /dashboard/cup сейчас
      // выключена, см. чат "Кубки: лишняя информация"), но нужна видимой
      // именно сейчас — сверить даты и раунды АКТИВНОГО кубка с hattrick.org.
      sectionErrors.push(`Кубки (текущий кубок CupID=${cupId}, проход по раундам cupmatches.xml): ${currentCupPath.debug.join(" | ")}`);
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

    const pastCupPaths = (
      await Promise.all(
        pastCupIds.map(async (id) => {
          const meta = await fetchCupMeta(tokens, id);
          if (currentSeason !== null && meta && meta.season !== currentSeason) {
            sectionErrors.push(
              `Кубки: CupID ${id} ("${meta.cupName}") исключён из каскада — его сезон=${meta.season}, ` +
                `а текущий сезон=${currentSeason} (данные из прошлого сезона).`,
            );
            return null;
          }
          // ИСПРАВЛЕНО (см. чат "Кубки: упрощаем и делаем надёжнее"): любая
          // карточка кубка этого сезона (текущая или уже пройденная)
          // строится ИСКЛЮЧИТЕЛЬНО обходом раундов cupmatches.xml
          // (resolvePastCupPath — тот же приём, что уже доказанно надёжно
          // работает для АКТИВНОГО кубка, resolveOurCupPath) — ищет наш
          // матч среди всех матчей раунда напрямую по TeamID, вообще не
          // завися от того, проставил ли matches.xml/matchesarchive.xml
          // CupID конкретному матчу. Сборка из уже известных матчей
          // (pastCupPathFromMatches) — тот самый способ, который путал
          // сезоны/раунды, — больше не используется вовсе, даже как
          // запасной вариант: если обход раундов не нашёл ни одного нашего
          // матча, кандидат просто не попадает в каскад (с диагностикой), а
          // не рискует подсунуть перепутанные данные.
          const walkSeason = meta?.season ?? currentSeason;
          if (walkSeason === null) {
            sectionErrors.push(`Кубки: CupID ${id} пропущен — не удалось определить сезон для обхода раундов.`);
            return null;
          }
          const walked = await resolvePastCupPath(tokens, id, teamId, walkSeason, ourTeamName);
          if (!walked.error && walked.path.length > 0) {
            sectionErrors.push(
              `Кубки: CupID ${id} ("${walked.cupName}") построен обходом раундов cupmatches.xml — ${walked.path.length} раунд(ов).`,
            );
            return walked;
          }
          sectionErrors.push(
            `Кубки: CupID ${id} — обход раундов не нашёл ни одного нашего матча (${walked.error ?? "путь пуст"}), кубок пропущен в этой синхронизации.`,
          );
          return null;
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
    sectionErrors.push(
      `Кубки (диагностика TeamID): наша команда — teamId="${teamId || "(пусто!)"}" ` +
        `teamName="${ourTeamName || "(пусто!)"}", итоговый CupID="${cupId ?? "(не найден)"}", ` +
        `кубков в каскаде=${cupPaths.length}.`,
    );
    // ДИАГНОСТИКА (см. чат "Кубки: система считает текущим Kazakhstan Cup,
    // хотя мы уже выбыли, а Sapphire Challenger пропал целиком") — раскрываем
    // ВСЕ кандидаты на "текущий CupID" по отдельности, а не только итог.
    // Порядок выбора: teamDetailsCupId, если пусто — clubCupId, если и он
    // пусто — matchesCupId (ПЕРВЫЙ ненулевой cupId среди matchesForCup В
    // ПОРЯДКЕ МАССИВА, НЕ по дате!). Если teamDetailsCupId сейчас пуст (см.
    // stillInCup ниже — CHPP теоретически мог ещё не успеть проставить новый
    // активный кубок сразу после вылета из предыдущего), matchesCupId
    // ВСЕГДА найдёт CupID уже сыгранного (то есть прошлого) кубка раньше,
    // чем ещё не сыгранного текущего — у которого пока попросту нет ни
    // одного матча с проставленным CupID. Это и есть подозреваемый механизм
    // того, как "172" (Kazakhstan Cup, уже пройден) попадает в chosenCupId
    // вместо "865" (Sapphire Challenger, играется сейчас).
    sectionErrors.push(
      `Кубки (разбивка кандидатов на "текущий" CupID): stillInCup=${stillInCup === null ? "недоступно" : stillInCup} | ` +
        `teamDetailsCupId=${cupIdFromTeamDetails ?? "(пусто)"} (${cupNameFromTeamDetails ?? "имя недоступно"}) | ` +
        `clubCupId=${parsedClub?.cupId ?? "(пусто)"} | matchesCupId=${debug.matchesCupId ?? "(пусто)"} | ` +
        `итог chosenCupId=${cupId ?? "(не найден)"}.`,
    );

    // ВРЕМЕННАЯ диагностика (см. чат "Кубки: реально другие/устаревшие
    // данные, не совпадающие с hattrick.org по датам") — проверяем гипотезу
    // "matchesarchive.xml подмешивает матчи ПРОШЛОГО сезона с тем же самым
    // CupID" (у отдельного матча нигде не сохраняется номер сезона — только
    // дата и CupID, см. RealMatch в matches.ts — поэтому раньше эту гипотезу
    // нечем было проверить). Группируем ВЕСЬ сырой пул кубковых матчей нашей
    // же команды (matches.xml+matchesarchive.xml, MatchType=3) по CupID и
    // печатаем все даты подряд — если под одним и тем же CupID окажутся
    // даты из разных сезонов (например, и декабрь/апрель, и июль/август),
    // это будет видно сразу, без сравнения с hattrick.org вручную.
    const cupTypeMatches = matchesForCup.filter((m) => Number(m.matchType) === CUP_MATCH_TYPE);
    const byCupId = new Map<string, { date: string; opponent: string }[]>();
    for (const m of cupTypeMatches) {
      const key = m.cupId ?? "(без CupID)";
      if (!byCupId.has(key)) byCupId.set(key, []);
      byCupId.get(key)!.push({ date: m.date, opponent: m.opponent });
    }
    const candidatePoolDump = [...byCupId.entries()]
      .map(([id, ms]) => {
        const sorted = [...ms].sort((a, b) => a.date.localeCompare(b.date));
        const dates = sorted.map((m) => `${m.date} (@${m.opponent})`).join("; ");
        return `CupID ${id}: ${ms.length} матч(ей) — ${dates}`;
      })
      .join(" || ");
    sectionErrors.push(
      `Кубки (сырой пул кандидатов, MatchType=3, из matches+matchesarchive нашей команды): ${candidatePoolDump || "(пусто)"}`,
    );
    const cupIdToName = [
      ...pastCupPaths.map((p) => `CupID ${p.cupId} = "${p.cupName || "(имя не определено)"}"`),
      currentCupPath ? `CupID ${currentCupPath.cupId} = "${currentCupPath.cupName || "(имя не определено)"}" (текущий)` : null,
    ].filter((x): x is string => x !== null);
    sectionErrors.push(`Кубки (соответствие CupID → название): ${cupIdToName.join("; ") || "(нет данных)"}`);

    const rawCupFieldsDump = rawCupTypeMatchFieldsDump
      .map(
        (m) =>
          `MatchID ${m.MatchID} (${m.MatchDate}, ${m.homeTeamName ?? "?"} vs ${m.awayTeamName ?? "?"}): ${m.cupLikeFields}`,
      )
      .join(" || ");
    sectionErrors.push(
      `Кубки (сырые Cup*/Context* поля каждого кубкового матча из matches.xml — не matchesarchive): ${rawCupFieldsDump || "(кубковых матчей в matches.xml не найдено)"}`,
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
  if (matches) {
    data.recentMatches = matches
      .filter((m) => m.status === "FINISHED" && m.ourScore !== null && m.oppScore !== null)
      .slice(0, 3)
      .map((m) => ({
        id: m.matchId,
        date: m.date,
        home: m.home,
        opponent: m.opponent,
        ourScore: m.ourScore!,
        oppScore: m.oppScore!,
        result: m.ourScore! > m.oppScore! ? "win" : m.ourScore! < m.oppScore! ? "loss" : "draw",
      }));
    data.upcomingMatches = matches
      .filter((m) => m.status === "UPCOMING")
      .slice(0, 3)
      .map((m) => ({
        id: m.matchId,
        date: m.date,
        home: m.home,
        opponent: m.opponent,
        competition: isFriendlyMatchType(m.matchType) ? undefined : "Официальный матч",
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
