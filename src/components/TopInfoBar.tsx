import { resolveVisitStats } from "@/lib/vercelAnalytics";
import styles from "./TopInfoBar.module.css";

function formatValue(value: number | null): string {
  return value === null ? "—" : value.toLocaleString("ru-RU");
}

export default async function TopInfoBar() {
  const { stats: visitStats, error } = await resolveVisitStats();
  // Причина показывается только в серверных логах — на публичной странице
  // не стоит светить детали настройки токенов перед посетителями сайта.
  if (error) console.error("Счётчик посещений (Vercel Web Analytics):", error);

  return (
    <div className={styles.bar}>
      <div className={`container ${styles.inner}`}>
        {/* Место под флаг/язык — сейчас сайт только на русском, поэтому
            переключатель скрыт, а не удалён: раскомментируйте, когда
            появится второй язык. */}
        <div className={styles.lang} aria-hidden="true" />

        <div className={styles.badge}>
          {/* eslint-disable-next-line @next/next/no-img-element -- маленький статичный логотип в 34px полосе, next/image избыточен */}
          <img
            src="/chpp-badge.png"
            alt="CHPP Certified Hattrick Product Provider"
            width={87}
            height={50}
            className={styles.badgeImg}
          />
        </div>

        <div className={styles.stats}>
          {visitStats.map((s) => (
            <span className={styles.stat} key={s.label}>
              <span className={styles.statLabel}>{s.label}</span>
              <span className={styles.statValue}>{formatValue(s.value)}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
