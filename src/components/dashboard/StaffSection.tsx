import { skillWord, leadershipWord } from "@/data/squad";
import type { RealClubStaff } from "@/lib/clubStaff";
import styles from "./Overview.module.css";

// club.xml реально даёт уровень (0-20) каждого специалиста — уровень 0
// значит "не нанят".
//
// Явно перечисленные числовые ключи (а не весь keyof RealClubStaff) — там
// есть и cupId (string | null, не уровень специалиста), который сюда
// попадать не должен.
type StaffLevelKey = Extract<
  keyof RealClubStaff,
  | "assistantTrainerLevel"
  | "formCoachLevel"
  | "medicLevel"
  | "sportPsychologistLevel"
  | "financialDirectorLevel"
  | "tacticalAssistantLevel"
  | "spokespersonLevel"
>;

const realStaffLabels: { key: StaffLevelKey; label: string }[] = [
  { key: "assistantTrainerLevel", label: "Помощник тренера" },
  { key: "formCoachLevel", label: "Тренер по физподготовке" },
  { key: "medicLevel", label: "Медик" },
  { key: "sportPsychologistLevel", label: "Спортивный психолог" },
  { key: "financialDirectorLevel", label: "Финансовый директор" },
  { key: "tacticalAssistantLevel", label: "Тренер по тактике" },
  { key: "spokespersonLevel", label: "Пресс-секретарь" },
];

// Тренер — один из собственных игроков (см. src/lib/teamDetails.ts,
// trainerPlayerId), имя/лидерство ищутся в players.xml тем же способом, что
// и на "Тренировке" (src/app/dashboard/training/page.tsx). "Дух команды" и
// "Уверенность команды" убраны — реального источника этих показателей в
// CHPP не нашли, показывать выдуманные числа на Обзоре не стали.
export default function StaffSection({
  realStaff,
  coachName,
  coachLeadership,
}: {
  realStaff?: RealClubStaff | null;
  coachName?: string;
  coachLeadership?: number;
}) {
  // По запросу показываем только реально нанятых специалистов — строки
  // "не нанят" для пустых категорий убраны.
  const hiredStaff = realStaff ? realStaffLabels.filter(({ key }) => realStaff[key] > 0) : [];

  return (
    <div className={`${styles.panel} ${styles.span2}`}>
      <div className={styles.panelTitle}>Персонал</div>

      <div className={styles.rowList}>
        {coachName && (
          <div className={styles.rowListItem}>
            <span className={`${styles.rowDot} ${styles.rowDotOn}`} />
            <span className={styles.rowLabel}>Тренер — {coachName}</span>
            <span className={`${styles.rowValue} ${styles.rowValueOn}`}>
              {coachLeadership !== undefined ? `лидерство ${leadershipWord(coachLeadership)}` : ""}
            </span>
          </div>
        )}

        {hiredStaff.map(({ key, label }) => (
          <div className={styles.rowListItem} key={key}>
            <span className={`${styles.rowDot} ${styles.rowDotOn}`} />
            <span className={styles.rowLabel}>{label}</span>
            <span className={`${styles.rowValue} ${styles.rowValueOn}`}>{skillWord(realStaff![key])}</span>
          </div>
        ))}

        {!coachName && hiredStaff.length === 0 && (
          <p className={styles.panelHint} style={{ margin: 0 }}>
            Специалисты пока не наняты.
          </p>
        )}
      </div>
    </div>
  );
}
