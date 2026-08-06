import Header from "@/components/Header";
import Footer from "@/components/Footer";
import StadiumSection from "@/components/dashboard/StadiumSection";
import DemoModeBanner from "@/components/dashboard/DemoModeBanner";
import SyncFailedScreen from "@/components/dashboard/SyncFailedScreen";
import styles from "@/components/dashboard/Dashboard.module.css";
import { getRequiredHattrickTokens, getStoredHattrickUserId } from "@/lib/hattrickApi";
import { ensureSynced, getStoredStadiumData } from "@/lib/chppSync";

export default async function StadiumPage() {
  const tokens = await getRequiredHattrickTokens();
  const hattrickUserId = await getStoredHattrickUserId();

  const syncStatus = hattrickUserId ? await ensureSynced(hattrickUserId, tokens) : null;
  if (syncStatus && syncStatus.status === "failed" && !syncStatus.lastSyncedAt) {
    return <SyncFailedScreen lastError={syncStatus.lastError} />;
  }

  const { data, error, currencyLabel } = hattrickUserId
    ? await getStoredStadiumData(hattrickUserId)
    : { data: null, error: null, currencyLabel: undefined };

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className={`container ${styles.stack}`} style={{ paddingBottom: 72 }}>
          {error && <DemoModeBanner title="Не удалось загрузить реальный стадион" reasons={[error]} />}
          {data && (
            <StadiumSection arenaName={data.arenaName} realCapacity={data} currencyLabel={currencyLabel ?? undefined} />
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
