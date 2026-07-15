import { powerRatingHint } from "@/data/dashboard";
import styles from "./Overview.module.css";

export default function PowerRatingPanel({
  value,
  worldRank,
}: {
  value: number;
  worldRank: number;
}) {
  return (
    <div className={styles.panel}>
      <div className={styles.panelTitle}>
        Рейтинг силы
        <span className={styles.infoHint} title={powerRatingHint}>
          ⓘ
        </span>
      </div>
      <div className={styles.powerRatingValue}>{value.toLocaleString("ru-RU")}</div>
      <div className={styles.powerRatingRank}>{worldRank.toLocaleString("ru-RU")}-е место</div>
    </div>
  );
}
