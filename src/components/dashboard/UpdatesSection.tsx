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
  lastDiagnosticNotes,
  lastSnapshotAt,
  lastSeenAt,
}: {
  lastSyncedAt: string | null;
  syncStatus: "ok" | "partial" | "failed" | "in_progress" | null;
  lastSyncError: string | null;
  // Техническая диагностика (см. чат "Согласны с разделением") — отдельно
  // от lastSyncError: никогда не означает сбой, страница уже решает, стоит
  // ли вообще передавать сюда значение (см. SHOW_SYNC_DIAGNOSTICS в
  // dashboard/updates/page.tsx) — null здесь просто ничего не показывает.
  lastDiagnosticNotes: string | null;
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
          Последняя попытка обновить не удалась — показаны данные с предыдущей успешной синхронизации.
        </p>
      )}
      {/* lastSyncError несёт подробности по конкретным разделам (Кубки/
          Трансферы/Юношеская команда и т.п.), а не только общую фразу —
          показываем его всегда, когда есть (см. чат "Кубки/Трансферы/
          Юношеская команда: не решены после Обновить данные"). ИСПРАВЛЕНО
          (см. чат "Согласны с разделением") — раньше сюда же примешивалась
          техническая диагностика "ok"-синхронизации (например,
          "youthplayerlist ответил, но игроков 0"), теперь это поле —
          ТОЛЬКО настоящие сбои (см. sectionErrors/diagnosticNotes в
          chppSync.ts), техническая диагностика — отдельным блоком ниже,
          видна только при явном включении отладочного флага. */}
      {lastSyncError && (
        <p className={styles.statusLine} style={{ color: "var(--color-bad)", fontSize: 12.5, whiteSpace: "pre-wrap" }}>
          Не удалось обновить полностью: {lastSyncError}
        </p>
      )}
      {lastDiagnosticNotes && (
        <p className={styles.statusLine} style={{ color: "var(--color-text-muted)", fontSize: 12.5, whiteSpace: "pre-wrap" }}>
          Диагностика последней синхронизации: {lastDiagnosticNotes}
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
