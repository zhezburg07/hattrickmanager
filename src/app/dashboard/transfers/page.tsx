import Header from "@/components/Header";
import Footer from "@/components/Footer";
import TransfersSection from "@/components/dashboard/TransfersSection";
import SyncFailedScreen from "@/components/dashboard/SyncFailedScreen";
import styles from "@/components/dashboard/Dashboard.module.css";
import { getRequiredHattrickTokens, getStoredHattrickUserId } from "@/lib/hattrickApi";
import { ensureSynced, getStoredTransferHistory } from "@/lib/chppSync";

// История трансферов (transfersteam) читает сохранённый снимок. Живой
// поиск по рынку (transfersearch) убран целиком — вкладка показывает только
// последние сделки самой команды с фильтром Все/Купленные/Проданные (см.
// TransfersSection.tsx, чат "Трансферы: убрать поиск").
export default async function TransfersPage() {
  const tokens = await getRequiredHattrickTokens();
  const hattrickUserId = await getStoredHattrickUserId();

  const syncStatus = hattrickUserId ? await ensureSynced(hattrickUserId, tokens) : null;
  if (syncStatus && syncStatus.status === "failed" && !syncStatus.lastSyncedAt) {
    return <SyncFailedScreen lastError={syncStatus.lastError} />;
  }

  const { data: history, error } = hattrickUserId
    ? await getStoredTransferHistory(hattrickUserId)
    : { data: null, error: null };

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className={`container ${styles.stack}`} style={{ paddingBottom: 72 }}>
          <TransfersSection history={history} historyError={error} />
        </div>
      </main>
      <Footer />
    </>
  );
}
