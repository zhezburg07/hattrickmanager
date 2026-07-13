import styles from "./Overview.module.css";

export default function DashboardHeader({
  clubName,
  clubShortName,
  badgeLabel,
}: {
  clubName: string;
  clubShortName: string;
  badgeLabel: string;
}) {
  return (
    <div className={styles.titleBar}>
      <span className={styles.titleBarLabel}>Обзор команды</span>
      <span className={styles.titleBarClub}>
        <span className={styles.titleBarCrest}>{clubShortName}</span>
        {clubName}
        <b>{badgeLabel}</b>
      </span>
    </div>
  );
}
