import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CupSection from "@/components/dashboard/CupSection";
import DemoModeBanner from "@/components/dashboard/DemoModeBanner";
import SyncFailedScreen from "@/components/dashboard/SyncFailedScreen";
import styles from "@/components/dashboard/Dashboard.module.css";
import { getRequiredHattrickTokens, getStoredHattrickUserId } from "@/lib/hattrickApi";
import { ensureSynced, getStoredCupData, type StoredCupInfo } from "@/lib/chppSync";

// ВРЕМЕННАЯ диагностика — показывает, откуда (если откуда-то) реально
// нашёлся CupID (teamdetails/club/matches) и что вернул проход по раундам
// cupmatches, снятые во время синхронизации. Уберите, когда поведение
// стабильно подтвердится на реальных данных.
const SHOW_CUP_DEBUG_PANEL = true;

export default async function CupPage() {
  const tokens = await getRequiredHattrickTokens();
  const hattrickUserId = await getStoredHattrickUserId();

  const syncStatus = hattrickUserId ? await ensureSynced(hattrickUserId, tokens) : null;
  if (syncStatus && syncStatus.status === "failed" && !syncStatus.lastSyncedAt) {
    return <SyncFailedScreen lastError={syncStatus.lastError} />;
  }

  const { cupPaths, nextMatch, errors, debug } = hattrickUserId
    ? await getStoredCupData(hattrickUserId)
    : {
        cupPaths: [] as StoredCupInfo["cupPaths"],
        nextMatch: null,
        errors: [] as string[],
        debug: {
          teamId: null,
          stillInCup: null,
          teamDetailsCupId: null,
          teamDetailsCupName: null,
          clubCupId: null,
          matchesCupId: null,
          chosenCupId: null,
          matchesRawSample: [] as Record<string, unknown>[],
          pathDebug: [] as string[],
          nextMatchFound: null,
          pastCupIds: [] as string[],
        },
      };

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className={`container ${styles.stack}`} style={{ paddingBottom: 72 }}>
          {errors.length > 0 && (
            <DemoModeBanner title="Не удалось загрузить часть данных о кубках" reasons={errors} />
          )}

          {SHOW_CUP_DEBUG_PANEL && (
            <div className={styles.card}>
              <div className={styles.balanceLabel}>Диагностика: поиск CupID и проход по раундам cupmatches</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 8, fontSize: 12.5 }}>
                <div>TeamID: {debug.teamId ?? "—"}</div>
                <div>StillInCup (teamdetails): {debug.stillInCup === null ? "поле недоступно" : debug.stillInCup ? "да" : "нет"}</div>
                <div>
                  CupID из teamdetails (Team.Cup.CupID): {debug.teamDetailsCupId ?? "не найден"}
                  {debug.teamDetailsCupName && ` — название по данным Hattrick: «${debug.teamDetailsCupName}»`}
                </div>
                <div>CupID из club.xml (Team.Cup.CupID): {debug.clubCupId ?? "не найден / не запрашивался"}</div>
                <div>
                  CupID из matches.xml (MatchContextId у матча с MatchType=3): {debug.matchesCupId ?? "не найден / не запрашивался"}
                </div>
                <div style={{ fontWeight: 700, marginTop: 4 }}>Итоговый CupID: {debug.chosenCupId ?? "не найден — cupmatches не запрашивался"}</div>
                <div>
                  Другие кубки этого сезона (уже выбыли):{" "}
                  {debug.pastCupIds.length > 0 ? debug.pastCupIds.join(", ") : "не найдены"}
                </div>
              </div>

              {debug.matchesRawSample.length > 0 && (
                <>
                  <div className={styles.balanceLabel} style={{ marginTop: 16 }}>
                    Диагностика: сырые MatchType/MatchContextId последних матчей из matches.xml
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8, fontSize: 12.5 }}>
                    {debug.matchesRawSample.map((m, i) => (
                      <div key={i}>{JSON.stringify(m)}</div>
                    ))}
                  </div>
                </>
              )}

              <div className={styles.balanceLabel} style={{ marginTop: 16 }}>
                Диагностика: проход по раундам (resolveOurCupPath)
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 8, fontSize: 12.5 }}>
                {debug.pathDebug.length === 0 && <div>Проход по раундам не выполнялся (CupID/TeamID не найдены).</div>}
                {debug.pathDebug.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>

              <div className={styles.balanceLabel} style={{ marginTop: 16 }}>
                Диагностика: ближайший предстоящий кубковый матч (matches.xml)
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 8, fontSize: 12.5 }}>
                <div>{debug.nextMatchFound ?? "—"}</div>
              </div>
            </div>
          )}

          <CupSection cupPaths={cupPaths} nextMatch={nextMatch} />
        </div>
      </main>
      <Footer />
    </>
  );
}
