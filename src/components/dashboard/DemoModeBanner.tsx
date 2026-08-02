import styles from "./Overview.module.css";

export default function DemoModeBanner({
  title,
  reasons,
  showConnectAction = true,
  connectHref = "/api/auth/request-token",
  connectLabel = "Подключить команду",
}: {
  title: string;
  reasons: string[];
  showConnectAction?: boolean;
  connectHref?: string;
  connectLabel?: string;
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
        <a href={connectHref} className={`btnPrimary ${styles.demoBannerAction}`}>
          {connectLabel}
        </a>
      )}
    </div>
  );
}
