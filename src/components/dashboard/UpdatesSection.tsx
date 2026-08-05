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
// планируется, а строка "Последнее обновление интерфейса" ниже показывала
// просто момент рендера страницы, что тоже ничего не значило. Теперь вместо
// этого — два настоящих факта из базы (см. dashboard/updates/page.tsx):
// когда последний раз сохранён снимок навыков игроков (player_weekly_stat_snapshots)
// и когда был последний визит в личный кабинет (connected_users.last_seen_at).
// Ни то, ни другое не связано с реальным ограничением частоты CHPP — его
// просто нет, данные читаются живьём при каждом заходе.
export default function UpdatesSection({
  lastSnapshotAt,
  lastSeenAt,
}: {
  lastSnapshotAt: Date | null;
  lastSeenAt: string | null;
}) {
  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>Обновления</div>

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
        Отдельной фоновой системы обновлений нет — HattrickManager запрашивает у Hattrick свежие данные напрямую
        каждый раз, когда вы открываете раздел личного кабинета (Обзор, Состав, Финансы и т.д.). Никаких ограничений
        по частоте запросов со стороны CHPP нет — данные обновляются автоматически при каждом заходе, никакой очереди
        или времени ожидания не существует.
      </p>
    </div>
  );
}
