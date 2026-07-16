import { fanMoodWord } from "@/data/dashboard";
import styles from "./Overview.module.css";

// Тир цвета по положению на 12-уровневой (1-12) шкале настроения
// болельщиков: верхняя треть — хорошо, средняя — нейтрально, нижняя — плохо.
function moodClass(level: number): string {
  if (level >= 9) return styles.moodGood;
  if (level >= 5) return styles.moodWarn;
  return styles.moodBad;
}

export default function FansSection({ mood, clubSize }: { mood: number; clubSize: number }) {
  return (
    <div className={styles.panel}>
      <div className={styles.panelTitle}>Болельщики</div>
      <div className={styles.fansLines}>
        <div>
          Настроение: <span className={moodClass(mood)}>{fanMoodWord(mood)}</span>
        </div>
        <div>
          Фан-клуб: <b>{clubSize.toLocaleString("ru-RU")}</b>
        </div>
      </div>
    </div>
  );
}
