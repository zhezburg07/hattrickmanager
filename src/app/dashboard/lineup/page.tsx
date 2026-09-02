import Header from "@/components/Header";
import Footer from "@/components/Footer";
import LineupBoard from "@/components/dashboard/LineupBoard";
import DemoModeBanner from "@/components/dashboard/DemoModeBanner";
import SyncFailedScreen from "@/components/dashboard/SyncFailedScreen";
import styles from "@/components/dashboard/Dashboard.module.css";
import { getRequiredHattrickTokens, getStoredHattrickUserId } from "@/lib/hattrickApi";
import { ensureSynced, getStoredLineupData } from "@/lib/chppSync";
import { getPreviousWeekSnapshots, trainingWeekKey } from "@/lib/playerHistoryDb";
import { getAllRoleCalibrations, getPlayerRoleTrends } from "@/lib/matchRolePredictionsDb";
import { RATING_FORMULA_VERSION } from "@/components/dashboard/zoneRatings";

// Раньше эта страница делала живые запросы к CHPP (players.xml,
// worlddetails.xml, matchlineup.xml, плюс "Анализ соперника" — ещё teamdetails/
// matches/matchdetails чужой команды) при каждом открытии. Теперь читает уже
// сохранённые данные (тот же ключ "players", что и Состав, плюс отдельный
// ключ "opponentAnalysis" — см. src/lib/chppSync.ts). Drag&drop сама
// расстановка не трогается — она полностью клиентское состояние в
// LineupBoard.tsx, эта миграция меняет только то, откуда берутся исходные
// данные игроков.
export default async function LineupPage() {
  const tokens = await getRequiredHattrickTokens();
  const hattrickUserId = await getStoredHattrickUserId();

  const syncStatus = hattrickUserId ? await ensureSynced(hattrickUserId, tokens) : null;
  if (syncStatus && syncStatus.status === "failed" && !syncStatus.lastSyncedAt) {
    return <SyncFailedScreen lastError={syncStatus.lastError} />;
  }

  const { players, error, opponentAnalysis, trainerPlayerId, teamMoraleValue, teamConfidenceValue, experienceByFormation } =
    hattrickUserId
      ? await getStoredLineupData(hattrickUserId)
      : {
          players: null,
          error: null,
          opponentAnalysis: {
            opponentTeamId: null,
            opponentTeamName: null,
            upcomingMatchDate: null,
            formation: null,
            lastMatch: null,
            lastMatchUnavailableReason: null,
            zoneStrength: { ratings: {}, available: false, unavailableReason: null },
            error: null,
          },
          trainerPlayerId: undefined,
          teamMoraleValue: null,
          teamConfidenceValue: null,
          experienceByFormation: {} as Record<string, number>,
        };

  const prevByPlayerId =
    players && hattrickUserId ? await getPreviousWeekSnapshots(hattrickUserId, trainingWeekKey(new Date())) : {};

  // Калибровка позиционного рейтинга по реальным звёздам Hattrick (см. чат
  // "Калибровка позиционного рейтинга по реальным звёздам Hattrick", план в
  // .claude/plans, шаг 4) — коэффициенты общие на все аккаунты (обезличенная
  // таблица, см. matchRolePredictionsDb.ts), поэтому читаются здесь
  // независимо от того, есть ли у ЭТОГО аккаунта свои сыгранные матчи.
  // getAllRoleCalibrations теперь всегда возвращает коэффициенты для каждой
  // роли (настоящую регрессию или временную предварительную заглушку, см.
  // isPreliminary/PRELIMINARY_CALIBRATION в matchRolePredictionsDb.ts) —
  // пустой объект остаётся только если сам запрос к БД упал (см. catch
  // ниже), тогда applyCalibration в zoneRatings.ts честно оставляет сырой
  // прогноз.
  let calibrations: Awaited<ReturnType<typeof getAllRoleCalibrations>> = {};
  try {
    calibrations = await getAllRoleCalibrations(RATING_FORMULA_VERSION);
  } catch {
    // Калибровка — необязательное дополнение поверх сырого рейтинга, не
    // должна ронять саму страницу "Расстановка".
  }

  // Тренд по конкретным игрокам состава (см. чат "Калибровка позиционного
  // рейтинга по реальным звёздам Hattrick", план в .claude/plans, шаг 5) —
  // тоже общая на все аккаунты таблица, поэтому запрашивается по ID игроков
  // ЭТОГО состава, а не по hattrick_user_id.
  let trends: Awaited<ReturnType<typeof getPlayerRoleTrends>> = {};
  try {
    if (players) trends = await getPlayerRoleTrends(players.map((p) => p.id));
  } catch {
    // Тренд — необязательное дополнение, не должно ронять страницу.
  }

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className={`container ${styles.stack}`} style={{ paddingBottom: 72 }}>
          {error && <DemoModeBanner title="Не удалось загрузить реальный состав" reasons={[error]} />}
          {players && (
            <LineupBoard
              players={players}
              prevByPlayerId={prevByPlayerId}
              opponentAnalysis={opponentAnalysis}
              trainerPlayerId={trainerPlayerId}
              calibrations={calibrations}
              trends={trends}
              teamMoraleValue={teamMoraleValue}
              teamConfidenceValue={teamConfidenceValue}
              experienceByFormation={experienceByFormation}
            />
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
