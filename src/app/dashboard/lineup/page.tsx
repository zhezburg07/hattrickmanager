import Header from "@/components/Header";
import Footer from "@/components/Footer";
import LineupBoard from "@/components/dashboard/LineupBoard";
import DemoModeBanner from "@/components/dashboard/DemoModeBanner";
import SyncFailedScreen from "@/components/dashboard/SyncFailedScreen";
import styles from "@/components/dashboard/Dashboard.module.css";
import { getRequiredHattrickTokens, getStoredHattrickUserId } from "@/lib/hattrickApi";
import { ensureSynced, getStoredLineupData } from "@/lib/chppSync";
import { getPreviousWeekSnapshots, trainingWeekKey } from "@/lib/playerHistoryDb";

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

  const { players, error, opponentAnalysis } = hattrickUserId
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
      };

  const prevByPlayerId =
    players && hattrickUserId ? await getPreviousWeekSnapshots(hattrickUserId, trainingWeekKey(new Date())) : {};

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className={`container ${styles.stack}`} style={{ paddingBottom: 72 }}>
          {error && <DemoModeBanner title="Не удалось загрузить реальный состав" reasons={[error]} />}
          {players && (
            <>
              <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "0 0 12px" }}>
                CHPP не сообщает, кто сейчас стоит в основе — расставьте игроков сами или нажмите
                «Рекомендовать состав».
              </p>
              <LineupBoard players={players} prevByPlayerId={prevByPlayerId} opponentAnalysis={opponentAnalysis} />
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
