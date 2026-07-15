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
import {
  club as demoClub,
  leagueTable as demoLeagueTable,
  recentMatches as demoRecentMatches,
  upcomingMatches as demoUpcomingMatches,
  finance as demoFinance,
  fans as demoFans,
  powerRating,
  defaultCurrency,
  chppSupportersPopularityToFanMoodLevel,
} from "@/data/dashboard";
import { squadPlayers as demoSquadPlayers } from "@/data/squad";
import { getStoredHattrickTokens, requestChppXmlRaw, type ChppRawResponse, type StoredHattrickTokens } from "@/lib/hattrickApi";
import { parseTeamDetailsXml } from "@/lib/teamDetails";
import { parseLeagueDetailsXml } from "@/lib/leagueDetails";
import { parseMatchesXml } from "@/lib/matches";
import { parseEconomyXml } from "@/lib/economy";
import { parseClubXml, type RealClubStaff } from "@/lib/clubStaff";
import { parsePlayersXml } from "@/lib/players";
import { parseWorldLeagueInfoXml } from "@/lib/worldCurrency";
import styles from "@/components/dashboard/Overview.module.css";

// Таблица лиги приходит из leaguedetails.xml — но только когда группы на
// сезон уже сформированы. В межсезонье (до старта нового сезона) этот файл
// отдаёт лишь название лиги и метаданные тура, без списка команд (проверено
// на реальном ответе Hattrick) — тогда показываем демо-таблицу. Как только
// сезон начинается, появляется список <Team> с местом/очками/мячами —
// именно он и используется ниже.
const CHPP_REQUESTS: { file: string; params: Record<string, string> }[] = [
  { file: "leaguedetails", params: {} },
  { file: "matches", params: {} },
  { file: "economy", params: {} },
  { file: "club", params: {} },
  { file: "players", params: {} },
];

interface DashboardData {
  clubName: string;
  clubShortName: string;
  badgeLabel: string;
  leagueRows: LeagueTableRow[];
  leagueName?: string;
  // Сетка результатов между командами и переключатель "Все/Домашние/
  // Гостевые игры" существуют только для тестовых данных (CHPP не отдаёт
  // очные результаты всех команд лиги) — true, пока leagueRows не заменили
  // на реальную таблицу из leaguedetails.xml.
  leagueIsDemo: boolean;
  recentMatches: RecentMatchRow[];
  upcomingMatches: UpcomingMatchRow[];
  balance: number;
  totalIncome: number;
  totalExpense: number;
  realStaff: RealClubStaff | null;
  fanMood: number;
  fanClubSize: number;
  fanExpectation: string;
  squadTotal?: number;
  squadStarting?: number;
  squadBench?: number;
  squadInjured: number;
  squadAvgForm: string;
  powerRatingValue: number;
  powerRatingWorldRank: number | null;
  currencyLabel: string;
  isFullyDemo: boolean;
  errors: string[];
}

function buildDemoData(): Omit<DashboardData, "errors"> {
  const starting = demoSquadPlayers.filter((p) => p.status === "starting").length;
  const bench = demoSquadPlayers.filter((p) => p.status === "bench").length;
  const injured = demoSquadPlayers.filter((p) => p.status === "injured").length;
  const avgForm = (demoSquadPlayers.reduce((sum, p) => sum + p.form, 0) / demoSquadPlayers.length).toFixed(1);

  return {
    clubName: demoClub.name,
    clubShortName: demoClub.shortName,
    badgeLabel: demoClub.rating.toLocaleString("ru-RU"),
    leagueRows: demoLeagueTable.map((r) => ({ ...r })),
    recentMatches: demoRecentMatches.map((m) => ({ ...m, id: String(m.id) })),
    upcomingMatches: demoUpcomingMatches.map((m) => ({ ...m, id: String(m.id) })),
    balance: demoFinance.balance,
    totalIncome: demoFinance.income.reduce((sum, l) => sum + l.amount, 0),
    totalExpense: demoFinance.expense.reduce((sum, l) => sum + l.amount, 0),
    realStaff: null,
    fanMood: demoFans.mood,
    fanClubSize: demoFans.clubSize,
    fanExpectation: demoFans.expectation,
    squadStarting: starting,
    squadBench: bench,
    squadInjured: injured,
    squadAvgForm: avgForm,
    powerRatingValue: powerRating.value,
    powerRatingWorldRank: powerRating.worldRank,
    currencyLabel: defaultCurrency.label,
    isFullyDemo: true,
    leagueIsDemo: true,
  };
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
// блок остаётся демонстрационным, а причина добавляется в список ошибок
// баннера.
async function resolveDashboardData(): Promise<DashboardData> {
  const tokens = getStoredHattrickTokens();
  const demo = buildDemoData();

  if (!tokens) {
    return { ...demo, errors: ["Команда ещё не подключена к Hattrick."] };
  }

  const errors: string[] = [];
  const data: DashboardData = { ...demo, isFullyDemo: true, errors: [] };

  // Шаг 1: teamdetails — отдельно и первым, чтобы узнать TeamID (нужен для
  // определения "своей" строки в таблице лиги и в списке матчей) и LeagueID
  // (нужен для worlddetails на шаге 2, чтобы узнать валюту страны).
  let teamId = "";
  let leagueId = "";
  const teamDetailsRaw = await requestChppXmlRaw("teamdetails", {}, tokens).catch(() => null);
  try {
    if (!teamDetailsRaw) throw new Error("запрос не выполнился");
    if (teamDetailsRaw.httpStatus < 200 || teamDetailsRaw.httpStatus >= 300) {
      throw new Error(`HTTP ${teamDetailsRaw.httpStatus}: ${teamDetailsRaw.rawXml.slice(0, 200)}`);
    }
    const team = parseTeamDetailsXml(teamDetailsRaw.rawXml);
    teamId = team.teamId;
    leagueId = team.leagueId;
    data.clubName = team.teamName || data.clubName;
    data.clubShortName = team.shortTeamName || data.clubShortName;
    data.badgeLabel = team.teamRank !== null ? `#${team.teamRank}` : team.leagueName || data.badgeLabel;
    if (team.powerRatingValue !== null) data.powerRatingValue = team.powerRatingValue;
    if (team.powerRatingGlobalRank !== null) data.powerRatingWorldRank = team.powerRatingGlobalRank;
    data.isFullyDemo = false;
  } catch (err) {
    errors.push(`Название команды (teamdetails): ${errorMessage(err)}`);
  }

  // Шаг 2: остальные файлы — параллельно. worlddetails (валюта) добавляется,
  // только если удалось узнать LeagueID на шаге 1 — без фильтра по лиге этот
  // файл отдаёт список ВСЕХ лиг мира (сотни записей), не годится.
  const requests = leagueId
    ? [...CHPP_REQUESTS, { file: "worlddetails", params: { LeagueID: leagueId } }]
    : CHPP_REQUESTS;
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
    // Таблица появляется только после старта сезона (см. комментарий у
    // CHPP_REQUESTS выше) — в межсезонье standings пуст, тогда оставляем
    // демо-таблицу вместо пустого блока.
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
      data.leagueIsDemo = false;
    }
    data.isFullyDemo = false;
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
    data.isFullyDemo = false;
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
    data.isFullyDemo = false;
  } catch (err) {
    errors.push(`Финансы и болельщики (economy): ${errorMessage(err)}`);
  }

  try {
    if (!raw.club) throw new Error("запрос не выполнился");
    if (raw.club.httpStatus < 200 || raw.club.httpStatus >= 300) {
      throw new Error(`HTTP ${raw.club.httpStatus}: ${raw.club.rawXml.slice(0, 200)}`);
    }
    data.realStaff = parseClubXml(raw.club.rawXml);
    data.isFullyDemo = false;
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
    data.squadStarting = undefined;
    data.squadBench = undefined;
    data.squadInjured = summary.injuredCount;
    data.squadAvgForm = summary.averageForm.toFixed(1);
    data.isFullyDemo = false;
  } catch (err) {
    errors.push(`Состав (players): ${errorMessage(err)}`);
  }

  return { ...data, errors };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "неизвестная ошибка";
}

export default async function DashboardPage() {
  const data = await resolveDashboardData();

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className="container" style={{ paddingBottom: 48 }}>
          {data.errors.length > 0 && (
            <DemoModeBanner
              title={data.isFullyDemo ? "Демо-режим" : "Часть данных не удалось загрузить"}
              reasons={data.errors}
            />
          )}
          <DashboardHeader clubName={data.clubName} clubShortName={data.clubShortName} badgeLabel={data.badgeLabel} />

          <div className={styles.grid}>
            <LeagueTable rows={data.leagueRows} leagueName={data.leagueName} showResultsMatrix={data.leagueIsDemo} />
            <SquadSummaryPanel
              totalPlayers={data.squadTotal}
              starting={data.squadStarting}
              bench={data.squadBench}
              injured={data.squadInjured}
              avgForm={data.squadAvgForm}
            />
            <MatchesSection recentMatches={data.recentMatches} upcomingMatches={data.upcomingMatches} />
            <FinanceSummary
              balance={data.balance}
              totalIncome={data.totalIncome}
              totalExpense={data.totalExpense}
              currencyLabel={data.currencyLabel}
            />
            <StaffSection realStaff={data.realStaff} />
            <FansSection mood={data.fanMood} clubSize={data.fanClubSize} expectation={data.fanExpectation} />
            <PowerRatingPanel
              value={data.powerRatingValue}
              worldRank={data.powerRatingWorldRank ?? powerRating.worldRank}
            />
            <TsiWeeklyChanges />
          </div>

          <div style={{ marginTop: 12 }}>
            <WeeklyHighlights />
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
