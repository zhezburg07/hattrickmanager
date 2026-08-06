import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FinanceSection from "@/components/dashboard/FinanceSection";
import DemoModeBanner from "@/components/dashboard/DemoModeBanner";
import SyncFailedScreen from "@/components/dashboard/SyncFailedScreen";
import styles from "@/components/dashboard/Dashboard.module.css";
import { getRequiredHattrickTokens, getStoredHattrickUserId } from "@/lib/hattrickApi";
import { ensureSynced, getStoredFinanceData } from "@/lib/chppSync";

// Раньше эта страница сама запрашивала economy.xml при каждом открытии.
// Теперь читает уже сохранённый снимок (см. src/lib/chppSync.ts) — сама
// синхронизация происходит один раз автоматически при первом визите в
// кабинет или по кнопке "Обновить данные".
export default async function FinancePage() {
  const tokens = await getRequiredHattrickTokens();
  const hattrickUserId = await getStoredHattrickUserId();

  const syncStatus = hattrickUserId ? await ensureSynced(hattrickUserId, tokens) : null;
  if (syncStatus && syncStatus.status === "failed" && !syncStatus.lastSyncedAt) {
    return <SyncFailedScreen lastError={syncStatus.lastError} />;
  }

  const { data: economy, error, currencyLabel } = hattrickUserId
    ? await getStoredFinanceData(hattrickUserId)
    : { data: null, error: null, currencyLabel: undefined };

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className={`container ${styles.stack}`} style={{ paddingBottom: 72 }}>
          {error && <DemoModeBanner title="Не удалось загрузить реальные финансы" reasons={[error]} />}
          {economy && (
            <FinanceSection
              cash={economy.cash}
              expectedCash={economy.expectedCash}
              thisWeek={economy.thisWeek}
              lastWeek={economy.lastWeek}
              currencyLabel={currencyLabel ?? undefined}
            />
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
