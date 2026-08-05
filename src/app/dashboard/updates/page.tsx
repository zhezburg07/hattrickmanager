import Header from "@/components/Header";
import Footer from "@/components/Footer";
import UpdatesSection from "@/components/dashboard/UpdatesSection";
import styles from "@/components/dashboard/Dashboard.module.css";
import { getStoredHattrickUserId } from "@/lib/hattrickApi";
import { getLatestSkillSnapshotAt } from "@/lib/playerHistoryDb";
import { getConnectedUser } from "@/lib/connectedUsersDb";

export default async function UpdatesPage() {
  const hattrickUserId = await getStoredHattrickUserId();

  // Ошибка базы не должна ронять страницу — тогда просто не покажем
  // соответствующий индикатор в этот раз (см. UpdatesSection.tsx, оба поля
  // допускают null).
  const [lastSnapshotAt, connectedUser] = hattrickUserId
    ? await Promise.all([
        getLatestSkillSnapshotAt(hattrickUserId).catch(() => null),
        getConnectedUser(hattrickUserId).catch(() => null),
      ])
    : [null, null];

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className={`container ${styles.stack}`} style={{ paddingBottom: 72 }}>
          <UpdatesSection lastSnapshotAt={lastSnapshotAt} lastSeenAt={connectedUser?.lastSeenAt ?? null} />
        </div>
      </main>
      <Footer />
    </>
  );
}
