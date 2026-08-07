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
import { parseLeagueFixturesXml } from "./leagueFixtures";
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
import { parseYouthPlayerListXml, debugYouthPlayerListRawCount, type RealYouthPlayer } from "./youthPlayers";
import { parseChallengesXml, type ArenaChallengesResult } from "./hattrickArena";
import {
  toSeasonMatches,
  dedupeMatches,
  filterTrainingRelevantMatches,
  debugRawMatchFields,
  parseArchiveEchoedRange,
  CUP_MATCH_TYPE,
} from "./matches";
import type { SeasonMatch } from "@/data/matches";
import { resolveOurCupPath, type OurCupPathResult } from "./cupMatches";
import type { UpcomingCupMatch } from "@/components/dashboard/CupSection";
import { parseTransfersTeamXml, TRANSFERS_TEAM_VERSION, type TransferHistoryResult } from "./transferMarket";
import {
  saveSnapshotSuccess,
  saveSnapshotError,
  getAllSnapshots,
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
}

export interface StoredCupInfo {
  cupPath: OurCupPathResult | null;
  nextMatch: UpcomingCupMatch | null;
  errors: string[];
  debug: CupDebugInfo;
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
    if (league.standings.length > 0 && raw.leaguefixtures) {
      try {
        assertOkStatus(raw.leaguefixtures);
        const fixtures = parseLeagueFixturesXml(raw.leaguefixtures.rawXml);
        const { teams, matrix } = buildRealLeagueMatrix(league.standings, fixtures);
        const filledCells = matrix.reduce((sum, row) => sum + row.filter((c) => c !== null).length, 0);
        if (filledCells > 0) {
          stored.resultsMatrixTeams = teams;
          stored.resultsMatrix = matrix;
        }
      } catch {
        // Сетка результатов — дополнительная деталь, не блокирует сохранение
        // самой таблицы лиги, если leaguefixtures не удался/не разобрался.
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
  try {
    assertOkStatus(raw.matches);
    parsedMatches = parseMatchesXml(raw.matches.rawXml, teamId);
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
  {
    let youthPlayers: RealYouthPlayer[] | null = null;
    let youthError: string | null = null;
    let youthHttpStatus: number | null = null;
    let youthRawCount = 0;
    try {
      youthHttpStatus = raw.youthplayerlist?.httpStatus ?? null;
      youthRawCount = raw.youthplayerlist ? debugYouthPlayerListRawCount(raw.youthplayerlist.rawXml) : 0;
      assertOkStatus(raw.youthplayerlist);
      youthPlayers = parseYouthPlayerListXml(raw.youthplayerlist.rawXml);
      anySucceeded = true;
    } catch (err) {
      youthError = `Список академии (youthplayerlist): ${errorMessage(err)}`;
      anyFailed = true;
    }
    const stored: StoredYouthPlayersData = {
      players: youthPlayers,
      error: youthError,
      httpStatus: youthHttpStatus,
      rawPlayerCount: youthRawCount,
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

  // -- transferHistory (Трансферы — только историческая часть; живой поиск
  // остаётся on-demand, см. /api/dashboard/transfer-search) --
  try {
    assertOkStatus(raw.transfersteam);
    const transferHistory: TransferHistoryResult = parseTransfersTeamXml(raw.transfersteam.rawXml);
    await saveSnapshotSuccess(hattrickUserId, DATA_KEYS.transferHistory, transferHistory);
    anySucceeded = true;
  } catch (err) {
    await saveSnapshotError(
      hattrickUserId,
      DATA_KEYS.transferHistory,
      `История трансферов (transfersteam): ${errorMessage(err)}`,
    );
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

  // -- cupInfo (Кубки: путь по раундам текущего кубка + ближайший
  // предстоящий кубковый матч) — teamId/stillInCup/cupId/cupName из
  // teamdetails, club (parsedClub) и matches (parsedMatches) уже получены
  // выше для своих секций, здесь только запасной поиск CupID и сам проход
  // по раундам cupmatches (resolveOurCupPath — единственный по-настоящему
  // новый запрос в этой секции, его пагинация неизбежно последовательна). --
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
    };
    const errors: string[] = [];

    let cupId = cupIdFromTeamDetails;
    const matchesForCup = parsedMatches ?? [];
    if (teamId) {
      debug.matchesCupId = matchesForCup.find((m) => m.cupId !== null)?.cupId ?? null;
      debug.matchesRawSample = raw.matches ? debugRawMatchFields(raw.matches.rawXml, 10) : [];
      if (!cupId) cupId = debug.clubCupId ?? debug.matchesCupId;
    } else {
      errors.push("Кубки (teamdetails): не удалось определить нашу команду.");
    }
    debug.chosenCupId = cupId;

    let cupPath: OurCupPathResult | null = null;
    if (cupId && teamId) {
      cupPath = await resolveOurCupPath(tokens, cupId, teamId);
      debug.pathDebug = cupPath.debug;
      if (cupPath.error) errors.push(cupPath.error);
    }

    const rawNextMatch = matchesForCup
      .filter((m) => Number(m.matchType) === CUP_MATCH_TYPE && m.status === "UPCOMING")
      .filter((m) => cupId === null || m.cupId === null || m.cupId === cupId)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
    const alreadyInPath = cupPath?.path.some((m) => m.matchId === rawNextMatch?.matchId) ?? false;
    debug.nextMatchFound = rawNextMatch
      ? `MatchID ${rawNextMatch.matchId} (${rawNextMatch.date}, соперник «${rawNextMatch.opponent}»)${alreadyInPath ? " — уже показан в пути по раундам, отдельно не дублируем" : ""}`
      : "не найден среди матчей matches.xml (MatchType=3, статус UPCOMING)";
    const nextMatch: UpcomingCupMatch | null =
      rawNextMatch && !alreadyInPath
        ? { matchId: rawNextMatch.matchId, date: rawNextMatch.date, home: rawNextMatch.home, opponent: rawNextMatch.opponent }
        : null;

    const stored: StoredCupInfo = { cupPath, nextMatch, errors, debug };
    await saveSnapshotSuccess(hattrickUserId, DATA_KEYS.cupInfo, stored);
    if (errors.length === 0) anySucceeded = true;
    else anyFailed = true;
  }

  const finalStatus: SyncResult["status"] = anyFailed && !anySucceeded ? "failed" : anyFailed ? "partial" : "ok";
  const summaryError = anyFailed ? "Не все разделы удалось обновить — подробности у конкретных вкладок." : null;
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
}

const emptyArenaChallenges: ArenaChallengesResult = { sentByUs: [], offersFromOthers: [], error: null };

export async function getStoredMatchesCalendar(hattrickUserId: string): Promise<MatchesPageData> {
  const snapshots = await getAllSnapshots(hattrickUserId);
  const calendarEntry = snapshots[DATA_KEYS.matchesCalendar];
  const calendar = calendarEntry?.data as StoredMatchesCalendar | null;
  const challengesEntry = snapshots[DATA_KEYS.arenaChallenges];
  const challenges = (challengesEntry?.data as ArenaChallengesResult | null) ?? {
    ...emptyArenaChallenges,
    error: challengesEntry?.error ?? null,
  };

  return {
    matches: calendar?.matches ?? null,
    ourTeamName: calendar?.ourTeamName ?? "",
    error: calendar?.error ?? calendarEntry?.error ?? null,
    warning: calendar?.warning ?? null,
    debugCounts: calendar?.debugCounts ?? [],
    debugRaw: calendar?.debugRaw ?? [],
    challenges,
  };
}

export async function getStoredCupData(hattrickUserId: string): Promise<StoredCupInfo> {
  const snapshots = await getAllSnapshots(hattrickUserId);
  const entry = snapshots[DATA_KEYS.cupInfo];
  const stored = entry?.data as StoredCupInfo | null;
  return (
    stored ?? {
      cupPath: null,
      nextMatch: null,
      errors: entry?.error ? [entry.error] : [],
      debug: {
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
      },
    }
  );
}

export async function getStoredTransferHistory(
  hattrickUserId: string,
): Promise<{ data: TransferHistoryResult | null; error: string | null }> {
  const snapshots = await getAllSnapshots(hattrickUserId);
  const entry = snapshots[DATA_KEYS.transferHistory];
  return { data: (entry?.data as TransferHistoryResult | null) ?? null, error: entry?.error ?? null };
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
