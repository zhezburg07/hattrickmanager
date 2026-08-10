import Header from "@/components/Header";
import Footer from "@/components/Footer";
import MatchesCalendar from "@/components/dashboard/MatchesCalendar";
import HattrickArenaSection from "@/components/dashboard/HattrickArenaSection";
import DemoModeBanner from "@/components/dashboard/DemoModeBanner";
import SyncFailedScreen from "@/components/dashboard/SyncFailedScreen";
import styles from "@/components/dashboard/Dashboard.module.css";
import { getRequiredHattrickTokens, getStoredHattrickUserId } from "@/lib/hattrickApi";
import { ensureSynced, getStoredMatchesCalendar } from "@/lib/chppSync";

// ВРЕМЕННАЯ диагностика — показывает количество матчей на каждом шаге
// конвейера (matches.xml → matchesarchive.xml → объединение → строгий
// фильтр → мягкий фильтр), снятое во время синхронизации. Поставьте false,
// когда список стабильно показывает реальные матчи.
const SHOW_MATCHES_DEBUG = true;

export default async function MatchesPage() {
  const tokens = await getRequiredHattrickTokens();
  const hattrickUserId = await getStoredHattrickUserId();

  const syncStatus = hattrickUserId ? await ensureSynced(hattrickUserId, tokens) : null;
  if (syncStatus && syncStatus.status === "failed" && !syncStatus.lastSyncedAt) {
    return <SyncFailedScreen lastError={syncStatus.lastError} />;
  }

  const { matches, ourTeamName, error, warning, debugCounts, debugRaw, challenges, arenaResults } = hattrickUserId
    ? await getStoredMatchesCalendar(hattrickUserId)
    : {
        matches: null,
        ourTeamName: "",
        error: null,
        warning: null,
        debugCounts: [] as string[],
        debugRaw: [] as Record<string, unknown>[],
        challenges: { sentByUs: [], offersFromOthers: [], error: null },
        arenaResults: [],
      };

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className={`container ${styles.stack}`} style={{ paddingBottom: 72 }}>
          {error && <DemoModeBanner title="Не удалось загрузить реальные матчи" reasons={[error]} />}
          {warning && <DemoModeBanner title="Показана не вся история" reasons={[warning]} showConnectAction={false} />}
          {SHOW_MATCHES_DEBUG && (debugCounts.length > 0 || debugRaw.length > 0) && (
            <div className={styles.card}>
              <div className={styles.balanceLabel}>Диагностика: количество матчей на каждом шаге</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 8, fontSize: 12.5 }}>
                {debugCounts.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
              {debugRaw.length > 0 && (
                <>
                  <div className={styles.balanceLabel} style={{ marginTop: 16 }}>
                    Диагностика: сырые поля первых матчей из matches.xml
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8, fontSize: 12.5 }}>
                    {debugRaw.map((m, i) => (
                      <div key={i}>{JSON.stringify(m)}</div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          {matches && <MatchesCalendar matches={matches} ourTeamName={ourTeamName} />}
          <HattrickArenaSection challenges={challenges} arenaResults={arenaResults} />
        </div>
      </main>
      <Footer />
    </>
  );
}
