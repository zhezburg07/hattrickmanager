import SyncButton from "./SyncButton";
import styles from "./Updates.module.css";

function formatDateTime(value: Date | string): string {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Раньше здесь была полностью выдуманная симуляция очереди обновлений (с
// таймером и прогресс-баром) — реальной фоновой системы очередей нет и не
// планируется. Затем — просто момент рендера страницы, тоже ничего не
// значивший. Теперь архитектура данных изменилась целиком (см. чат): вместо
// живого запроса к CHPP при каждом открытии вкладки, данные сохраняются в
// базу при синхронизации — один раз автоматически сразу после подключения
// команды, и дальше только по кнопке ниже. lastSyncedAt/syncStatus приходят
// из chpp_sync_status (см. src/lib/chppSyncDb.ts) — та же дата, что
// обновляется и автосинхронизацией, и кнопкой.
export default function UpdatesSection({
  lastSyncedAt,
  syncStatus,
  lastSyncError,
  lastSnapshotAt,
  lastSeenAt,
}: {
  lastSyncedAt: string | null;
  syncStatus: "ok" | "partial" | "failed" | "in_progress" | null;
  lastSyncError: string | null;
  lastSnapshotAt: Date | null;
  lastSeenAt: string | null;
}) {
  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>Обновления</div>

      {lastSyncedAt ? (
        <p className={styles.statusLine}>
          Последнее обновление: <b>{formatDateTime(lastSyncedAt)}</b>
        </p>
      ) : (
        <p className={styles.statusLine}>Данные ещё ни разу не синхронизировались.</p>
      )}
      {syncStatus === "partial" && (
        <p className={styles.statusLine} style={{ color: "var(--color-bad)" }}>
          Часть разделов не удалось обновить в последний раз.
        </p>
      )}
      {syncStatus === "failed" && lastSyncedAt && (
        <p className={styles.statusLine} style={{ color: "var(--color-bad)" }}>
          Последняя попытка обновить не удалась{lastSyncError ? `: ${lastSyncError}` : ""} — показаны данные с
          предыдущей успешной синхронизации.
        </p>
      )}

      <div style={{ margin: "10px 0" }}>
        <SyncButton />
      </div>

      {lastSnapshotAt && (
        <p className={styles.statusLine}>
          Последний сохранённый снимок навыков игроков: <b>{formatDateTime(lastSnapshotAt)}</b>
        </p>
      )}
      {!lastSnapshotAt && (
        <p className={styles.statusLine}>
          Снимок навыков игроков ещё не сохранён — зайдите на вкладку «Состав» или «Расстановка», чтобы он появился.
        </p>
      )}

      {lastSeenAt && (
        <p className={styles.statusLine}>
          Последний визит в личный кабинет: <b>{formatDateTime(lastSeenAt)}</b>
        </p>
      )}

      <p className={styles.explainText}>
        Данные Обзора теперь сохраняются в базу при синхронизации, а не запрашиваются у Hattrick заново при каждом
        открытии. Автоматическая синхронизация происходит один раз, сразу после подключения команды — дальше
        обновление только по кнопке выше. Остальные разделы личного кабинета пока обновляются вживую при каждом
        заходе — это временно, они переходят на то же хранилище постепенно. Никаких ограничений по частоте запросов
        со стороны CHPP нет — очереди или времени ожидания не существует, обновление стало осознанным действием,
        а не происходит незаметно само по себе.
      </p>
    </div>
  );
}
