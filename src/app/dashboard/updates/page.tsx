import Header from "@/components/Header";
import Footer from "@/components/Footer";
import UpdatesSection from "@/components/dashboard/UpdatesSection";
import styles from "@/components/dashboard/Dashboard.module.css";
import { getStoredHattrickUserId } from "@/lib/hattrickApi";
import { getLatestSkillSnapshotAt } from "@/lib/playerHistoryDb";
import { getConnectedUser } from "@/lib/connectedUsersDb";
import { getSyncStatus } from "@/lib/chppSyncDb";

// ВРЕМЕННАЯ диагностика — показывает техническую диагностику последней
// синхронизации (разбивка турниров Арены, источник CupID, статус по
// разделам и т.п., см. diagnosticNotes в chppSync.ts), отдельно от
// настоящих ошибок (lastSyncError, показывается всегда — см.
// UpdatesSection.tsx). Выключено по умолчанию — обычные пользователи не
// должны видеть эту диагностику (см. чат "Согласны с разделением"). Код не
// удалён — вернуть можно одной строкой, если понадобится диагностировать.
const SHOW_SYNC_DIAGNOSTICS = false;

export default async function UpdatesPage() {
  const hattrickUserId = await getStoredHattrickUserId();

  // Ошибка базы не должна ронять страницу — тогда просто не покажем
  // соответствующий индикатор в этот раз (см. UpdatesSection.tsx, все поля
  // допускают null).
  const [lastSnapshotAt, connectedUser, syncStatus] = hattrickUserId
    ? await Promise.all([
        getLatestSkillSnapshotAt(hattrickUserId).catch(() => null),
        getConnectedUser(hattrickUserId).catch(() => null),
        getSyncStatus(hattrickUserId).catch(() => null),
      ])
    : [null, null, null];

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className={`container ${styles.stack}`} style={{ paddingBottom: 72 }}>
          <UpdatesSection
            lastSyncedAt={syncStatus?.lastSyncedAt ?? null}
            syncStatus={syncStatus?.status ?? null}
            lastSyncError={syncStatus?.lastError ?? null}
            lastDiagnosticNotes={SHOW_SYNC_DIAGNOSTICS ? (syncStatus?.lastDiagnosticNotes ?? null) : null}
            lastSnapshotAt={lastSnapshotAt}
            lastSeenAt={connectedUser?.lastSeenAt ?? null}
          />
        </div>
      </main>
      <Footer />
    </>
  );
}
