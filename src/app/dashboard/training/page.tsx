import Header from "@/components/Header";
import Footer from "@/components/Footer";
import TrainingSection from "@/components/dashboard/TrainingSection";
import DemoModeBanner from "@/components/dashboard/DemoModeBanner";
import SyncFailedScreen from "@/components/dashboard/SyncFailedScreen";
import styles from "@/components/dashboard/Dashboard.module.css";
import { getRequiredHattrickTokens, getStoredHattrickUserId } from "@/lib/hattrickApi";
import { ensureSynced, getStoredTrainingData } from "@/lib/chppSync";

export default async function TrainingPage() {
  const tokens = await getRequiredHattrickTokens();
  const hattrickUserId = await getStoredHattrickUserId();

  const syncStatus = hattrickUserId ? await ensureSynced(hattrickUserId, tokens) : null;
  if (syncStatus && syncStatus.status === "failed" && !syncStatus.lastSyncedAt) {
    return <SyncFailedScreen lastError={syncStatus.lastError} />;
  }

  const { coachName, coachLeadership, coachError, training } = hattrickUserId
    ? await getStoredTrainingData(hattrickUserId)
    : { coachName: undefined, coachLeadership: undefined, coachError: null, training: null };

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className={`container ${styles.stack}`} style={{ paddingBottom: 72 }}>
          {coachError && <DemoModeBanner title="Не удалось определить реального тренера" reasons={[coachError]} />}
          <TrainingSection
            coachName={coachName}
            coachLeadership={coachLeadership}
            realTypeKey={training?.typeKey ?? undefined}
            realIntensity={training?.intensity ?? undefined}
            realStaminaShare={training?.staminaShare ?? undefined}
          />
        </div>
      </main>
      <Footer />
    </>
  );
}
