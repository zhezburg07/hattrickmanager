import Header from "@/components/Header";
import Footer from "@/components/Footer";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import DemoModeBanner from "@/components/dashboard/DemoModeBanner";
import LeagueTable from "@/components/dashboard/LeagueTable";
import MatchesSection from "@/components/dashboard/MatchesSection";
import FinanceSummary from "@/components/dashboard/FinanceSummary";
import StaffSection from "@/components/dashboard/StaffSection";
import FansSection from "@/components/dashboard/FansSection";
import SquadSummaryPanel from "@/components/dashboard/SquadSummaryPanel";
import TsiWeeklyChanges from "@/components/dashboard/TsiWeeklyChanges";
import WeeklyHighlights from "@/components/dashboard/WeeklyHighlights";
import PowerRatingPanel from "@/components/dashboard/PowerRatingPanel";
import HofPlayersSection from "@/components/dashboard/HofPlayersSection";
import AchievementsSection from "@/components/dashboard/AchievementsSection";
import SupportersSection from "@/components/dashboard/SupportersSection";
import SetPasswordPrompt from "@/components/dashboard/SetPasswordPrompt";
import ReducedDashboard from "@/components/dashboard/ReducedDashboard";
import SyncButton from "@/components/dashboard/SyncButton";
import { redirect } from "next/navigation";
import { getStoredHattrickTokens, getStoredAccountId, getStoredHattrickUserId } from "@/lib/hattrickApi";
import { isChppAuthError } from "@/lib/chppError";
import { syncTeamData, getStoredOverviewData, getAchievementsData, getSyncStatus } from "@/lib/chppSync";
import { defaultCurrency } from "@/data/dashboard";
import { resolveWeeklyTsiHighlights } from "@/lib/playerHistoryDb";
import { resolveHofPlayers } from "@/lib/hofPlayers";
import { resolveSupporters } from "@/lib/supporters";
import { upsertConnectedUser } from "@/lib/connectedUsersDb";
import { hasEmailLogin } from "@/lib/accountsDb";
import { cookies } from "next/headers";
import styles from "@/components/dashboard/Overview.module.css";

// Временно скрыт по запросу — блок "Кого поддерживаем / кто поддерживает
// нас" убран с экрана, код и src/lib/supporters.ts не удалены. Заодно не
// делаем сам запрос к CHPP, пока флаг выключен, — незачем дважды дёргать
// supporters.xml впустую на каждой загрузке Обзора.
const SHOW_SUPPORTERS_SECTION = false;

// Временно скрыт по запросу — "Зал славы клуба" убран с экрана Обзора, код
// и src/lib/hofPlayers.ts не удалены. Запрос к CHPP тоже не делаем, пока флаг
// выключен.
const SHOW_HOF_SECTION = false;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { connectError?: string; hattrickUserId?: string };
}) {
  // Раньше здесь был getRequiredHattrickTokens() — он бы редиректил на "/"
  // любого, у кого нет команды Hattrick, включая только что
  // зарегистрированный аккаунт БЕЗ подключённой команды (это ожидаемое,
  // нормальное состояние теперь, а не ошибка — см. чат про регистрацию без
  // Hattrick). Дальше сама страница решает, что показать: полный дашборд
  // (если команда подключена) или урезанную версию с призывом "Подключить
  // команду".
  const tokens = await getStoredHattrickTokens();
  const accountId = getStoredAccountId();

  if (!tokens) {
    // src/app/dashboard/layout.tsx уже блокирует полностью анонимных
    // посетителей — этот redirect защитный, на случай прямого вызова.
    if (!accountId) redirect("/");
    return <ReducedDashboard connectError={searchParams.connectError} hattrickUserId={searchParams.hattrickUserId} />;
  }

  const hattrickUserId = await getStoredHattrickUserId();

  // Архитектура "снимок в базе вместо живого запроса при каждом визите" (см.
  // чат) — Обзор больше не бьёт по CHPP напрямую. Вместо этого:
  // 1. Если ни разу не синхронизировались (chpp_sync_status ещё нет) —
  //    синхронизируемся один раз здесь же, автоматически, без действий
  //    пользователя — именно это и есть "автоматическое обновление при
  //    первом входе" (см. чат, пункт 1 требований). Дальнейшие визиты этот
  //    блок больше не выполняют — статус уже есть.
  // 2. Если последняя синхронизация вообще ни разу не была успешной —
  //    показываем понятный экран с кнопкой "Повторить" вместо тихого сбоя
  //    или пустого дашборда (см. чат, пункт 3 требований).
  // 3. Иначе читаем уже сохранённые данные (getStoredOverviewData) — ни
  //    одного обращения к CHPP на этой загрузке страницы.
  let syncStatus = hattrickUserId ? await getSyncStatus(hattrickUserId) : null;
  if (hattrickUserId && !syncStatus) {
    await syncTeamData(hattrickUserId, tokens);
    syncStatus = await getSyncStatus(hattrickUserId);
  }

  if (syncStatus && syncStatus.status === "failed" && !syncStatus.lastSyncedAt) {
    // Ни разу не было ни одной успешной синхронизации — показывать пустой
    // дашборд бессмысленно, честно объясняем и даём кнопку "Повторить" (тот
    // же /api/dashboard/sync, что и на "Обновления"). Отдельно — если
    // причина именно протухший/отозванный токен, формулировка точнее:
    // пароль здесь не поможет, нужен именно повторный OAuth.
    const isAuthFailure = syncStatus.lastError ? isChppAuthError(new Error(syncStatus.lastError)) : false;
    return (
      <>
        <Header />
        <main className={styles.page}>
          <div className="container" style={{ paddingBottom: 48, paddingTop: 24 }}>
            <div style={{ marginBottom: 16 }}>
              <DemoModeBanner
                title={isAuthFailure ? "Нужно заново подключить команду" : "Не удалось синхронизировать данные"}
                reasons={
                  isAuthFailure
                    ? [
                        "Сохранённое разрешение от Hattrick перестало действовать — такое бывает редко, например если токен устарел или доступ был отозван на самом Hattrick.",
                        "Это не ошибка сайта и не потеря данных — после повторного подключения всё вернётся как было.",
                      ]
                    : [
                        syncStatus.lastError ?? "Неизвестная ошибка.",
                        "Попробуйте ещё раз — это не повредит уже сохранённые данные, если они были.",
                      ]
                }
                showConnectAction={isAuthFailure}
              />
            </div>
            {!isAuthFailure && <SyncButton label="Повторить синхронизацию" />}
          </div>
        </main>
        <Footer />
      </>
    );
  }

  const data = hattrickUserId
    ? await getStoredOverviewData(hattrickUserId)
    : { currencyLabel: defaultCurrency.label, errors: [] };
  const [weeklyTsi, hof, achievements, supporters] = await Promise.all([
    resolveWeeklyTsiHighlights(hattrickUserId),
    SHOW_HOF_SECTION ? resolveHofPlayers(tokens) : Promise.resolve({ players: null, error: null }),
    hattrickUserId ? getAchievementsData(hattrickUserId) : Promise.resolve({ data: null, error: null }),
    SHOW_SUPPORTERS_SECTION
      ? resolveSupporters(tokens)
      : Promise.resolve({ weSupport: null, weSupportError: null, ourSupporters: null, ourSupportersError: null }),
  ]);

  // Побочный эффект для админ-панели (/admin, см. src/lib/connectedUsersDb.ts)
  // — записывает первое подключение / обновляет "последний визит" и название
  // команды. Не должен блокировать рендер обычной страницы при сбое базы.
  if (hattrickUserId) {
    upsertConnectedUser(hattrickUserId, data.clubName ?? null).catch(() => {});
  }

  // Предложение завести email+пароль (см. чат, пункт 1) — только если его
  // ещё нет и пользователь не отклонял его раньше ("Не сейчас", cookie
  // ставится на клиенте в SetPasswordPrompt.tsx). Ошибка базы здесь не
  // должна ронять всю страницу — тогда просто не показываем предложение.
  let showPasswordPrompt = false;
  if (accountId && !cookies().get("password_prompt_dismissed")?.value) {
    try {
      showPasswordPrompt = !(await hasEmailLogin(accountId));
    } catch {
      showPasswordPrompt = false;
    }
  }

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className="container" style={{ paddingBottom: 48 }}>
          {showPasswordPrompt && (
            <div style={{ marginBottom: 16 }}>
              <SetPasswordPrompt />
            </div>
          )}
          {data.errors.length > 0 && (
            <DemoModeBanner title="Часть данных не удалось загрузить при последней синхронизации" reasons={data.errors} />
          )}
          <DashboardHeader
            clubName={data.clubName ?? "—"}
            clubShortName={data.clubShortName ?? "—"}
            badgeLabel={data.badgeLabel ?? "—"}
          />

          <div className={styles.grid}>
            {(data.leagueRows || (data.recentMatches && data.upcomingMatches)) && (
              <div className={styles.sideBySideRow}>
                {data.leagueRows && (
                  <LeagueTable
                    rows={data.leagueRows}
                    leagueName={data.leagueName}
                    matrixTeams={data.resultsMatrixTeams}
                    resultsMatrix={data.resultsMatrix}
                  />
                )}
                {data.recentMatches && data.upcomingMatches && (
                  <MatchesSection
                    ourTeamName={data.clubShortName ?? data.clubName ?? "Наша команда"}
                    recentMatches={data.recentMatches}
                    upcomingMatches={data.upcomingMatches}
                  />
                )}
              </div>
            )}
            {data.squadInjured !== undefined && data.squadAvgForm !== undefined && (
              <SquadSummaryPanel
                totalPlayers={data.squadTotal}
                injured={data.squadInjured}
                avgForm={data.squadAvgForm}
              />
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
            <WeeklyHighlights gainer={weeklyTsi.gainer} hasEnoughHistory={weeklyTsi.hasEnoughHistory} />
          </div>

          {SHOW_HOF_SECTION && (
            <div style={{ marginTop: 12 }}>
              <HofPlayersSection players={hof.players} error={hof.error} />
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <AchievementsSection data={achievements.data} error={achievements.error} />
          </div>

          {SHOW_SUPPORTERS_SECTION && (
            <div style={{ marginTop: 12 }}>
              <SupportersSection
                weSupport={supporters.weSupport}
                weSupportError={supporters.weSupportError}
                ourSupporters={supporters.ourSupporters}
                ourSupportersError={supporters.ourSupportersError}
              />
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
