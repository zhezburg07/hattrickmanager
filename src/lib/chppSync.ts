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

  const teamRaw = await requestChppXmlRaw("teamdetails", {}, tokens).catch(() => null);
  try {
    assertOkStatus(teamRaw);
    const team = parseTeamDetailsXml(teamRaw.rawXml);
    teamId = team.teamId;
    leagueId = team.leagueId;
    leagueLevelUnitId = team.leagueLevelUnitId;
    trainerPlayerId = team.trainerPlayerId;

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

  // -- club (состав тренерского штаба) --
  try {
    assertOkStatus(raw.club);
    const club: RealClubStaff = parseClubXml(raw.club.rawXml);
    await saveSnapshotSuccess(hattrickUserId, DATA_KEYS.club, club);
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

  return {
    players: playersData?.players ?? null,
    error: playersEntry?.error ?? null,
    opponentAnalysis,
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
