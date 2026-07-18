import Header from "@/components/Header";
import Footer from "@/components/Footer";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import DemoModeBanner from "@/components/dashboard/DemoModeBanner";
import LeagueTable, { type LeagueTableRow } from "@/components/dashboard/LeagueTable";
import MatchesSection, { type RecentMatchRow, type UpcomingMatchRow } from "@/components/dashboard/MatchesSection";
import FinanceSummary from "@/components/dashboard/FinanceSummary";
import StaffSection from "@/components/dashboard/StaffSection";
import FansSection from "@/components/dashboard/FansSection";
import SquadSummaryPanel from "@/components/dashboard/SquadSummaryPanel";
import TsiWeeklyChanges from "@/components/dashboard/TsiWeeklyChanges";
import WeeklyHighlights from "@/components/dashboard/WeeklyHighlights";
import PowerRatingPanel from "@/components/dashboard/PowerRatingPanel";
import HofPlayersSection from "@/components/dashboard/HofPlayersSection";
import { defaultCurrency, chppSupportersPopularityToFanMoodLevel } from "@/data/dashboard";
import type { MatrixTeamMeta } from "@/data/leagueMatrix";
import {
  getRequiredHattrickTokens,
  getStoredHattrickUserId,
  requestChppXmlRaw,
  type ChppRawResponse,
  type StoredHattrickTokens,
} from "@/lib/hattrickApi";
import { parseTeamDetailsXml } from "@/lib/teamDetails";
import { parseLeagueDetailsXml } from "@/lib/leagueDetails";
import { parseLeagueFixturesXml } from "@/lib/leagueFixtures";
import { buildRealLeagueMatrix } from "@/lib/realLeagueMatrix";
import { parseMatchesXml } from "@/lib/matches";
import { parseEconomyXml } from "@/lib/economy";
import { parseClubXml, type RealClubStaff } from "@/lib/clubStaff";
import { parsePlayersXml } from "@/lib/players";
import { parsePlayersDetailedXml } from "@/lib/squadPlayers";
import { parseWorldLeagueInfoXml } from "@/lib/worldCurrency";
import { resolveWeeklyTsiHighlights } from "@/lib/playerHistoryDb";
import { resolveHofPlayers } from "@/lib/hofPlayers";
import { upsertConnectedUser } from "@/lib/connectedUsersDb";
import styles from "@/components/dashboard/Overview.module.css";

// Таблица лиги приходит из leaguedetails.xml — но только когда группы на
// сезон уже сформированы. В межсезонье (до старта нового сезона) этот файл
// отдаёт лишь название лиги и метаданные тура, без списка команд (проверено
// на реальном ответе Hattrick) — тогда таблица просто не показывается.
const CHPP_REQUESTS: { file: string; params: Record<string, string> }[] = [
  { file: "leaguedetails", params: {} },
  { file: "matches", params: {} },
  { file: "economy", params: {} },
  { file: "club", params: {} },
  { file: "players", params: {} },
];

interface DashboardData {
  clubName?: string;
  clubShortName?: string;
  badgeLabel?: string;
  leagueRows?: LeagueTableRow[];
  leagueName?: string;
  // Сетка результатов между командами и переключатель "Все/Домашние/
  // Гостевые игры" — только если удалось получить и разобрать
  // leaguefixtures.xml (см. src/lib/realLeagueMatrix.ts). Если нет — LeagueTable
  // просто не показывает ни переключатель, ни сетку.
  resultsMatrixTeams?: MatrixTeamMeta[];
  resultsMatrix?: (string | null)[][];
  // ВРЕМЕННАЯ диагностика — почему сетка результатов не строится на реальных
  // данных (см. чат: таблица лиги неожиданно обнулилась после подключения
  // leaguefixtures). Уберите вместе с рендером блока в DashboardPage, когда
  // причина найдена.
  debugLeague?: {
    leagueLevelUnitId: string;
    leagueDetailsHttpStatus: number | null;
    leagueDetailsSnippet: string;
    standingsCount: number;
    firstStandingRaw: string;
    leagueFixturesRequested: boolean;
    leagueFixturesHttpStatus: number | null;
    leagueFixturesSnippet: string;
    fixturesParsedCount: number | null;
    matrixFilledCells: number | null;
    fixturesError: string | null;
  };
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

async function requestAllRaw(
  requests: { file: string; params: Record<string, string> }[],
  tokens: StoredHattrickTokens,
): Promise<Record<string, ChppRawResponse | null>> {
  const settled = await Promise.allSettled(requests.map((r) => requestChppXmlRaw(r.file, r.params, tokens)));

  const result: Record<string, ChppRawResponse | null> = {};
  settled.forEach((r, i) => {
    result[requests[i].file] = r.status === "fulfilled" ? r.value : null;
  });
  return result;
}

// Пытается получить реальные данные по всем разделам Обзора. teamdetails
// запрашивается первым и отдельно (из него нужен LeagueLevelUnitID для
// seriescup), остальные — параллельно. Сырые ответы сразу сохраняются для
// отладочной панели, а затем каждый по отдельности разбирается в данные для
// конкретного блока страницы. Если разбор для какого-то файла не удался —
// соответствующий блок страницы просто не рендерится, а причина
// добавляется в список ошибок баннера — никакого демонстрационного
// значения вместо него больше не подставляется.
async function resolveDashboardData(tokens: StoredHattrickTokens): Promise<DashboardData> {
  const errors: string[] = [];
  const data: DashboardData = { currencyLabel: defaultCurrency.label, errors: [] };

  // Шаг 1: teamdetails — отдельно и первым, чтобы узнать TeamID (нужен для
  // определения "своей" строки в таблице лиги и в списке матчей), LeagueID
  // (нужен для worlddetails на шаге 2, чтобы узнать валюту страны),
  // LeagueLevelUnitID (нужен для leaguefixtures) и PlayerID тренера.
  let teamId = "";
  let leagueId = "";
  let leagueLevelUnitId = "";
  let trainerPlayerId = "";
  const teamDetailsRaw = await requestChppXmlRaw("teamdetails", {}, tokens).catch(() => null);
  try {
    if (!teamDetailsRaw) throw new Error("запрос не выполнился");
    if (teamDetailsRaw.httpStatus < 200 || teamDetailsRaw.httpStatus >= 300) {
      throw new Error(`HTTP ${teamDetailsRaw.httpStatus}: ${teamDetailsRaw.rawXml.slice(0, 200)}`);
    }
    const team = parseTeamDetailsXml(teamDetailsRaw.rawXml);
    teamId = team.teamId;
    leagueId = team.leagueId;
    leagueLevelUnitId = team.leagueLevelUnitId;
    trainerPlayerId = team.trainerPlayerId;
    data.clubName = team.teamName || undefined;
    data.clubShortName = team.shortTeamName || undefined;
    data.badgeLabel = team.teamRank !== null ? `#${team.teamRank}` : team.leagueName || undefined;
    if (team.powerRatingValue !== null) data.powerRatingValue = team.powerRatingValue;
    if (team.powerRatingGlobalRank !== null) data.powerRatingWorldRank = team.powerRatingGlobalRank;
  } catch (err) {
    errors.push(`Название команды (teamdetails): ${errorMessage(err)}`);
  }

  // Шаг 2: остальные файлы — параллельно. worlddetails (валюта) и
  // leaguefixtures (сетка результатов лиги) добавляются, только если
  // удалось узнать LeagueID / LeagueLevelUnitID на шаге 1.
  const requests = [
    ...CHPP_REQUESTS,
    ...(leagueId ? [{ file: "worlddetails", params: { LeagueID: leagueId } }] : []),
    ...(leagueLevelUnitId ? [{ file: "leaguefixtures", params: { LeagueLevelUnitID: leagueLevelUnitId } }] : []),
  ];
  const raw = await requestAllRaw(requests, tokens);

  if (raw.worlddetails) {
    try {
      if (raw.worlddetails.httpStatus < 200 || raw.worlddetails.httpStatus >= 300) {
        throw new Error(`HTTP ${raw.worlddetails.httpStatus}: ${raw.worlddetails.rawXml.slice(0, 200)}`);
      }
      data.currencyLabel = parseWorldLeagueInfoXml(raw.worlddetails.rawXml).currencyLabel;
    } catch {
      // Валюта — второстепенная деталь оформления, не блокируем страницу
      // отдельной ошибкой в баннере, если её не удалось узнать — молча
      // остаёмся на тенге по умолчанию.
    }
  }

  try {
    if (!raw.leaguedetails) throw new Error("запрос не выполнился");
    if (raw.leaguedetails.httpStatus < 200 || raw.leaguedetails.httpStatus >= 300) {
      throw new Error(`HTTP ${raw.leaguedetails.httpStatus}: ${raw.leaguedetails.rawXml.slice(0, 200)}`);
    }
    const league = parseLeagueDetailsXml(raw.leaguedetails.rawXml, teamId);
    data.leagueName = league.leagueName;

    data.debugLeague = {
      leagueLevelUnitId,
      leagueDetailsHttpStatus: raw.leaguedetails.httpStatus,
      leagueDetailsSnippet: raw.leaguedetails.rawXml.slice(0, 1500),
      standingsCount: league.standings.length,
      firstStandingRaw: league.standings[0] ? JSON.stringify(league.standings[0]) : "(пусто)",
      leagueFixturesRequested: !!leagueLevelUnitId,
      leagueFixturesHttpStatus: raw.leaguefixtures?.httpStatus ?? null,
      leagueFixturesSnippet: raw.leaguefixtures?.rawXml.slice(0, 1500) ?? "(запрос не отправлялся)",
      fixturesParsedCount: null,
      matrixFilledCells: null,
      fixturesError: null,
    };

    // Таблица появляется только после старта сезона (см. комментарий у
    // CHPP_REQUESTS выше) — в межсезонье standings пуст, тогда таблица лиги
    // просто не рендерится на странице.
    if (league.standings.length > 0) {
      data.leagueRows = league.standings.map((r) => ({
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
      }));

      try {
        if (!raw.leaguefixtures) throw new Error("запрос не выполнился (LeagueLevelUnitID не определён?)");
        if (raw.leaguefixtures.httpStatus < 200 || raw.leaguefixtures.httpStatus >= 300) {
          throw new Error(`HTTP ${raw.leaguefixtures.httpStatus}: ${raw.leaguefixtures.rawXml.slice(0, 200)}`);
        }
        const fixtures = parseLeagueFixturesXml(raw.leaguefixtures.rawXml);
        data.debugLeague.fixturesParsedCount = fixtures.length;
        const { teams, matrix } = buildRealLeagueMatrix(league.standings, fixtures);
        const filledCells = matrix.reduce((sum, row) => sum + row.filter((c) => c !== null).length, 0);
        data.debugLeague.matrixFilledCells = filledCells;
        if (filledCells > 0) {
          data.resultsMatrixTeams = teams;
          data.resultsMatrix = matrix;
        }
      } catch (fixturesErr) {
        // Сетка результатов — дополнительная деталь, не первостепенная
        // таблица лиги: если leaguefixtures недоступен или не разобрался,
        // молча остаёмся без переключателя/сетки, не блокируем баннером
        // остальную страницу. Причину всё же сохраняем в debugLeague.
        data.debugLeague.fixturesError = errorMessage(fixturesErr);
      }
    }
  } catch (err) {
    errors.push(`Лига и таблица (leaguedetails): ${errorMessage(err)}`);
  }

  try {
    if (!raw.matches) throw new Error("запрос не выполнился");
    if (raw.matches.httpStatus < 200 || raw.matches.httpStatus >= 300) {
      throw new Error(`HTTP ${raw.matches.httpStatus}: ${raw.matches.rawXml.slice(0, 200)}`);
    }
    const matches = parseMatchesXml(raw.matches.rawXml, teamId);
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
        // MatchType в CHPP — это не простая категория (лига/кубок/товарищеский),
        // а контекстный ID конкретного турнира (LeagueLevelUnitID, CupID и
        // т.п.). "0" достоверно значит товарищеский/квалификационный матч;
        // расшифровать остальные значения в читаемое название турнира без
        // отдельного справочника нельзя, поэтому просто помечаем такие матчи
        // как официальные, не показывая сам (ничего не значащий на вид) номер.
        competition: m.matchType !== "0" ? "Официальный матч" : undefined,
      }));
  } catch (err) {
    errors.push(`Матчи (matches): ${errorMessage(err)}`);
  }

  try {
    if (!raw.economy) throw new Error("запрос не выполнился");
    if (raw.economy.httpStatus < 200 || raw.economy.httpStatus >= 300) {
      throw new Error(`HTTP ${raw.economy.httpStatus}: ${raw.economy.rawXml.slice(0, 200)}`);
    }
    const economy = parseEconomyXml(raw.economy.rawXml);
    data.balance = economy.cash;
    data.totalIncome = economy.lastWeekIncome;
    data.totalExpense = economy.lastWeekExpense;
    data.fanMood = chppSupportersPopularityToFanMoodLevel(economy.supportersPopularity);
    data.fanClubSize = economy.fanClubSize;
  } catch (err) {
    errors.push(`Финансы и болельщики (economy): ${errorMessage(err)}`);
  }

  try {
    if (!raw.club) throw new Error("запрос не выполнился");
    if (raw.club.httpStatus < 200 || raw.club.httpStatus >= 300) {
      throw new Error(`HTTP ${raw.club.httpStatus}: ${raw.club.rawXml.slice(0, 200)}`);
    }
    data.realStaff = parseClubXml(raw.club.rawXml);
  } catch (err) {
    errors.push(`Персонал (club): ${errorMessage(err)}`);
  }

  try {
    if (!raw.players) throw new Error("запрос не выполнился");
    if (raw.players.httpStatus < 200 || raw.players.httpStatus >= 300) {
      throw new Error(`HTTP ${raw.players.httpStatus}: ${raw.players.rawXml.slice(0, 200)}`);
    }
    const summary = parsePlayersXml(raw.players.rawXml);
    data.squadTotal = summary.totalPlayers;
    data.squadInjured = summary.injuredCount;
    data.squadAvgForm = summary.averageForm.toFixed(1);

    // Тренер — один из собственных игроков (см. src/lib/teamDetails.ts,
    // trainerPlayerId), та же схема, что на "Тренировке". Домашняя страна не
    // нужна здесь (национальность на Обзоре не показывается), поэтому не
    // тратим отдельный запрос на worlddetails ради неё.
    if (trainerPlayerId) {
      const trainer = parsePlayersDetailedXml(raw.players.rawXml, null).find(
        (p) => String(p.id) === trainerPlayerId,
      );
      if (trainer) {
        data.coachName = trainer.name;
        data.coachLeadership = trainer.leadership;
      }
    }
  } catch (err) {
    errors.push(`Состав (players): ${errorMessage(err)}`);
  }

  return { ...data, errors };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "неизвестная ошибка";
}

// Временно скрыто от обычных пользователей — пугающий предупреждающий вид
// не нужен на публичном экране. Код и сбор данных (data.debugLeague) не
// трогаем — верните true, когда начнётся сезон лиги и понадобится ещё раз
// проверить leaguefixtures на реальных сыгранных матчах (см. чат).
const SHOW_LEAGUE_DEBUG_PANEL = false;

export default async function DashboardPage() {
  const tokens = await getRequiredHattrickTokens();
  const hattrickUserId = getStoredHattrickUserId();
  const [data, weeklyTsi, hof] = await Promise.all([
    resolveDashboardData(tokens),
    resolveWeeklyTsiHighlights(hattrickUserId),
    resolveHofPlayers(tokens),
  ]);

  // Побочный эффект для админ-панели (/admin, см. src/lib/connectedUsersDb.ts)
  // — записывает первое подключение / обновляет "последний визит" и название
  // команды. Не должен блокировать рендер обычной страницы при сбое базы.
  if (hattrickUserId) {
    upsertConnectedUser(hattrickUserId, data.clubName ?? null).catch(() => {});
  }

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className="container" style={{ paddingBottom: 48 }}>
          {SHOW_LEAGUE_DEBUG_PANEL && data.debugLeague && (
            <div
              style={{
                border: "2px dashed #c0503f",
                borderRadius: 8,
                padding: "12px 14px",
                marginBottom: 12,
                background: "rgba(192, 80, 63, 0.06)",
                fontSize: 12,
                color: "#f2ede1",
              }}
            >
              <div style={{ fontWeight: 800, color: "#c0503f", marginBottom: 6 }}>
                ⚠ Временная диагностика сетки результатов лиги (убрать после отладки)
              </div>
              <div>LeagueLevelUnitID: {data.debugLeague.leagueLevelUnitId || "(пусто)"}</div>
              <div>
                leaguedetails: HTTP {data.debugLeague.leagueDetailsHttpStatus} · команд в standings:{" "}
                {data.debugLeague.standingsCount}
              </div>
              <div>Первая команда (как разобрана): {data.debugLeague.firstStandingRaw}</div>
              <div>leaguefixtures запрошен: {data.debugLeague.leagueFixturesRequested ? "да" : "нет"}</div>
              <div>leaguefixtures: HTTP {data.debugLeague.leagueFixturesHttpStatus ?? "—"}</div>
              <div>Матчей разобрано из leaguefixtures: {data.debugLeague.fixturesParsedCount ?? "—"}</div>
              <div>Заполненных ячеек сетки: {data.debugLeague.matrixFilledCells ?? "—"}</div>
              {data.debugLeague.fixturesError && (
                <div style={{ color: "#c0503f" }}>Ошибка на шаге leaguefixtures: {data.debugLeague.fixturesError}</div>
              )}
              <details style={{ marginTop: 6 }}>
                <summary style={{ cursor: "pointer" }}>Сырой XML leaguedetails (начало)</summary>
                <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", fontSize: 10.5, maxHeight: 200, overflow: "auto" }}>
                  {data.debugLeague.leagueDetailsSnippet}
                </pre>
              </details>
              <details style={{ marginTop: 6 }}>
                <summary style={{ cursor: "pointer" }}>Сырой XML leaguefixtures (начало)</summary>
                <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", fontSize: 10.5, maxHeight: 200, overflow: "auto" }}>
                  {data.debugLeague.leagueFixturesSnippet}
                </pre>
              </details>
            </div>
          )}
          {data.errors.length > 0 && (
            <DemoModeBanner title="Часть данных не удалось загрузить" reasons={data.errors} />
          )}
          <DashboardHeader
            clubName={data.clubName ?? "—"}
            clubShortName={data.clubShortName ?? "—"}
            badgeLabel={data.badgeLabel ?? "—"}
          />

          <div className={styles.grid}>
            {data.leagueRows && (
              <LeagueTable
                rows={data.leagueRows}
                leagueName={data.leagueName}
                matrixTeams={data.resultsMatrixTeams}
                resultsMatrix={data.resultsMatrix}
              />
            )}
            {data.squadInjured !== undefined && data.squadAvgForm !== undefined && (
              <SquadSummaryPanel
                totalPlayers={data.squadTotal}
                injured={data.squadInjured}
                avgForm={data.squadAvgForm}
              />
            )}
            {data.recentMatches && data.upcomingMatches && (
              <MatchesSection recentMatches={data.recentMatches} upcomingMatches={data.upcomingMatches} />
            )}
            {data.balance !== undefined && data.totalIncome !== undefined && data.totalExpense !== undefined && (
              <FinanceSummary
                balance={data.balance}
                totalIncome={data.totalIncome}
                totalExpense={data.totalExpense}
                currencyLabel={data.currencyLabel}
              />
            )}
            {(data.realStaff || data.coachName) && (
              <StaffSection realStaff={data.realStaff} coachName={data.coachName} coachLeadership={data.coachLeadership} />
            )}
            {data.fanMood !== undefined && data.fanClubSize !== undefined && (
              <FansSection mood={data.fanMood} clubSize={data.fanClubSize} />
            )}
            {data.powerRatingValue !== undefined && (
              <PowerRatingPanel value={data.powerRatingValue} worldRank={data.powerRatingWorldRank} />
            )}
            <TsiWeeklyChanges
              topGainers={weeklyTsi.topGainers}
              topLosers={weeklyTsi.topLosers}
              hasEnoughHistory={weeklyTsi.hasEnoughHistory}
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <WeeklyHighlights
              gainer={weeklyTsi.gainer}
              loser={weeklyTsi.loser}
              hasEnoughHistory={weeklyTsi.hasEnoughHistory}
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <HofPlayersSection players={hof.players} error={hof.error} />
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
