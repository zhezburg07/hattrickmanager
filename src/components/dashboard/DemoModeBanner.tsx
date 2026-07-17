import styles from "./Overview.module.css";

export default function DemoModeBanner({
  title,
  reasons,
  showConnectAction = true,
}: {
  title: string;
  reasons: string[];
  showConnectAction?: boolean;
}) {
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
      {showConnectAction && (
        <a href="/api/auth/request-token" className={`btnPrimary ${styles.demoBannerAction}`}>
          Подключить команду
        </a>
      )}
    </div>
  );
}
