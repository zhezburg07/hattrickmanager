import styles from "./Overview.module.css";

export default function DemoModeBanner({ title, reasons }: { title: string; reasons: string[] }) {
  return (
    <div className={styles.demoBanner}>
      <span className={styles.demoBannerIcon}>ⓘ</span>
      <div className={styles.demoBannerBody}>
        <div className={styles.demoBannerTitle}>{title}</div>
        {reasons.length > 0 && (
          <ul className={styles.demoBannerList}>
            {reasons.map((reason, i) => (
              <li key={i}>{reason}</li>
            ))}
          </ul>
        )}
      </div>
      <a href="/api/auth/request-token" className={`btnPrimary ${styles.demoBannerAction}`}>
        Подключить команду
      </a>
    </div>
  );
}
