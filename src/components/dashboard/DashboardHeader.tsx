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
  // CHPP часто отдаёт ShortTeamName таким же, как TeamName (короткого
  // отдельного обозначения у команды может не быть) — тогда бейдж-"герб" и
  // полное название дублировали бы один и тот же текст подряд.
  const showCrest = clubShortName.trim() !== "" && clubShortName.trim().toLowerCase() !== clubName.trim().toLowerCase();

  return (
    <div className={styles.titleBar}>
      <span className={styles.titleBarLabel}>Обзор команды</span>
      <span className={styles.titleBarClub}>
        {showCrest && <span className={styles.titleBarCrest}>{clubShortName}</span>}
        {clubName}
        <b>{badgeLabel}</b>
      </span>
    </div>
  );
}
