import styles from "./TopInfoBar.module.css";

// Тестовые числа — реальная аналитика посещений пока не подключена.
// Замените на реальные значения, когда появится счётчик (см. чат).
const visitStats: { label: string; value: number }[] = [
  { label: "Сегодня", value: 214 },
  { label: "За неделю", value: 1_386 },
  { label: "За месяц", value: 5_042 },
  { label: "Всего", value: 28_957 },
];

export default function TopInfoBar() {
  return (
    <div className={styles.bar}>
      <div className={`container ${styles.inner}`}>
        {/* Место под флаг/язык — сейчас сайт только на русском, поэтому
            переключатель скрыт, а не удалён: раскомментируйте, когда
            появится второй язык. */}
        <div className={styles.lang} aria-hidden="true" />

        <div className={styles.badge} title="Логотип CHPP появится здесь после подключения">
          CHPP CERTIFIED HATTRICK PRODUCT PROVIDER
        </div>

        <div className={styles.stats}>
          {visitStats.map((s) => (
            <span className={styles.stat} key={s.label}>
              <span className={styles.statLabel}>{s.label}</span>
              <span className={styles.statValue}>{s.value.toLocaleString("ru-RU")}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
