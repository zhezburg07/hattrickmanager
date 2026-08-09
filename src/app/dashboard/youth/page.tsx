import Header from "@/components/Header";
import Footer from "@/components/Footer";
import YouthTable from "@/components/dashboard/YouthTable";
import DemoModeBanner from "@/components/dashboard/DemoModeBanner";
import SyncFailedScreen from "@/components/dashboard/SyncFailedScreen";
import styles from "@/components/dashboard/Dashboard.module.css";
import { getRequiredHattrickTokens, getStoredHattrickUserId } from "@/lib/hattrickApi";
import { ensureSynced, getStoredYouthData } from "@/lib/chppSync";

// ВРЕМЕННАЯ диагностика — показывает реальный HTTP-статус и количество
// игроков, найденных в ответе youthplayerlist (снятый во время синхронизации),
// чтобы сразу отличать "запрос упал" от "запрос успешен, но разбор XML
// вернул пусто". Поставьте false, когда список стабильно показывает
// реальных игроков академии.
const SHOW_YOUTH_DEBUG_PANEL = true;

export default async function YouthPage() {
  const tokens = await getRequiredHattrickTokens();
  const hattrickUserId = await getStoredHattrickUserId();

  const syncStatus = hattrickUserId ? await ensureSynced(hattrickUserId, tokens) : null;
  if (syncStatus && syncStatus.status === "failed" && !syncStatus.lastSyncedAt) {
    return <SyncFailedScreen lastError={syncStatus.lastError} />;
  }

  const {
    youthLevel,
    levelError,
    players,
    playersError,
    playersHttpStatus,
    rawPlayerCount,
    detailsSucceeded,
    detailsFailed,
    rawFieldsSample,
  } = hattrickUserId
    ? await getStoredYouthData(hattrickUserId)
    : {
        youthLevel: null,
        levelError: null,
        players: null,
        playersError: null,
        playersHttpStatus: null,
        rawPlayerCount: 0,
        detailsSucceeded: 0,
        detailsFailed: [] as string[],
        rawFieldsSample: [] as { name: string; ageLikeFields: string; countryLikeFields: string }[],
      };
  const errors = [levelError, playersError].filter((e): e is string => e !== null);

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className={`container ${styles.stack}`} style={{ paddingBottom: 72 }}>
          {errors.length > 0 && (
            <DemoModeBanner title="Не удалось загрузить часть данных академии" reasons={errors} />
          )}

          {SHOW_YOUTH_DEBUG_PANEL && (
            <div className={styles.card}>
              <div className={styles.balanceLabel}>Диагностика: youthplayerlist</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 8, fontSize: 12.5 }}>
                <div>HTTP-статус: {playersHttpStatus ?? "запрос не выполнен (см. ошибку ниже)"}</div>
                <div>Игроков в ответе (реально разобрано из &lt;PlayerList&gt;&lt;YouthPlayer&gt;): {rawPlayerCount}</div>
                {playersError && <div style={{ color: "#c0503f" }}>Ошибка: {playersError}</div>}
                <div style={{ marginTop: 6 }}>
                  Реальные навыки получены (youthplayerdetails): {detailsSucceeded} из {rawPlayerCount}
                </div>
                {detailsFailed.length > 0 && (
                  <div style={{ color: "#c0503f" }}>
                    Не удалось получить навыки для {detailsFailed.length} игрок(ов):
                    <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                      {detailsFailed.map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {rawFieldsSample.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    Сырые поля возраста/национальности (диагностика "не отображаются"):
                    <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                      {rawFieldsSample.map((p, i) => (
                        <li key={i}>
                          {p.name}: {p.ageLikeFields}; {p.countryLikeFields}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          <YouthTable youthLevel={youthLevel ?? undefined} players={players ?? undefined} />
        </div>
      </main>
      <Footer />
    </>
  );
}
