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
import SyncFailedScreen from "@/components/dashboard/SyncFailedScreen";
import { redirect } from "next/navigation";
import { getStoredHattrickTokens, getStoredAccountId, getStoredHattrickUserId } from "@/lib/hattrickApi";
import { ensureSynced, getStoredOverviewData, getAchievementsData, getStoredSquadData } from "@/lib/chppSync";
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

// Временно скрыт по запросу — "Герой недели" убран с экрана Обзора (см. чат
// "Переработать раскладку блоков на Обзоре"), код не удалён. Данные
// (resolveWeeklyTsiHighlights) всё равно нужны для "Изменения TSI" рядом,
// поэтому сам запрос не гасим флагом — только рендер этого конкретного блока.
const SHOW_WEEKLY_HIGHLIGHTS_SECTION = false;

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
  // чат) — Обзор больше не бьёт по CHPP напрямую. ensureSynced() запускает
  // синхронизацию автоматически при самом первом визите (без действий
  // пользователя) и просто возвращает статус на всех последующих визитах.
  // Если синхронизация ни разу не была успешной — SyncFailedScreen вместо
  // тихого сбоя или пустого дашборда (см. чат, пункт 3 требований); та же
  // проверка теперь общая для любой мигрированной страницы, не только Обзора.
  const syncStatus = hattrickUserId ? await ensureSynced(hattrickUserId, tokens) : null;

  if (syncStatus && syncStatus.status === "failed" && !syncStatus.lastSyncedAt) {
    return <SyncFailedScreen lastError={syncStatus.lastError} />;
  }

  const data = hattrickUserId
    ? await getStoredOverviewData(hattrickUserId)
    : { currencyLabel: defaultCurrency.label, errors: [] };
  // "Изменения TSI" сравнивает текущий состав с сохранённым недельным
  // снимком (см. чат "Изменения TSI на Обзоре находят гораздо меньше
  // реальных изменений, чем есть на самом деле") — тот же getStoredSquadData,
  // что и у "Состав"/"Расстановка", а не отдельный, более узкий источник.
  const squadData = hattrickUserId
    ? await getStoredSquadData(hattrickUserId)
    : { players: null, error: null, trainerPlayerId: undefined };
  const [weeklyTsi, hof, achievements, supporters] = await Promise.all([
    resolveWeeklyTsiHighlights(hattrickUserId, squadData.players),
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
                    matrixTeams={data.resultsMatrixTeams}
                    resultsMatrix={data.resultsMatrix}
                  />
                )}
              </div>
            )}
            {/* Первый ряд: Состав / Рейтинг силы / Достижения (см. чат
                "Переработать раскладку блоков на Обзоре") — все три обычные
                панели 1/3 ширины сетки (Достижения раньше стояли отдельным
                блоком во всю ширину контейнера — здесь втрое уже). */}
            {data.squadInjured !== undefined && data.squadAvgForm !== undefined && (
              <SquadSummaryPanel
                totalPlayers={data.squadTotal}
                injured={data.squadInjured}
                avgForm={data.squadAvgForm}
              />
            )}
            {data.powerRatingValue !== undefined && (
              <PowerRatingPanel value={data.powerRatingValue} worldRank={data.powerRatingWorldRank} />
            )}
            <AchievementsSection data={achievements.data} error={achievements.error} />

            {/* Второй ряд: Финансы / Болельщики / Персонал — Персонал раньше
                занимал 2/3 ширины (styles.span2 в StaffSection.tsx), теперь
                обычная панель 1/3, как и остальные две в этом ряду. */}
            {data.balance !== undefined && data.totalIncome !== undefined && data.totalExpense !== undefined && (
              <FinanceSummary
                balance={data.balance}
                totalIncome={data.totalIncome}
                totalExpense={data.totalExpense}
                currencyLabel={data.currencyLabel}
              />
            )}
            {data.fanMood !== undefined && data.fanClubSize !== undefined && (
              <FansSection mood={data.fanMood} clubSize={data.fanClubSize} />
            )}
            {(data.realStaff || data.coachName) && (
              <StaffSection realStaff={data.realStaff} coachName={data.coachName} coachLeadership={data.coachLeadership} />
            )}

            {/* Третий ряд: Изменения TSI, во всю ширину (styles.span3, как и
                раньше) — топ-8 с каждой стороны вместо топ-3. */}
            <TsiWeeklyChanges
              topGainers={weeklyTsi.topGainers}
              topLosers={weeklyTsi.topLosers}
              hasEnoughHistory={weeklyTsi.hasEnoughHistory}
            />
          </div>

          {SHOW_WEEKLY_HIGHLIGHTS_SECTION && (
            <div style={{ marginTop: 12 }}>
              <WeeklyHighlights gainer={weeklyTsi.gainer} hasEnoughHistory={weeklyTsi.hasEnoughHistory} />
            </div>
          )}

          {SHOW_HOF_SECTION && (
            <div style={{ marginTop: 12 }}>
              <HofPlayersSection players={hof.players} error={hof.error} />
            </div>
          )}

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
