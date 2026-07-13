import { skillWord, leadershipWord } from "@/data/squad";
import {
  coach,
  staff,
  staffRoleLabel,
  tacticalPreferenceLabel,
  teamSpirit,
  teamSpiritWord,
  teamConfidence,
  confidenceWord,
} from "@/data/dashboard";
import type { RealClubStaff } from "@/lib/clubStaff";
import styles from "./Overview.module.css";

// club.xml реально даёт уровень (0-20) каждого специалиста — как и в демо,
// уровень 0 значит "не нанят". Тренер, командный дух и уверенность пока
// остаются демонстрационными — для них нужен отдельный файл (training.xml),
// это следующий шаг.
const realStaffLabels: { key: keyof RealClubStaff; label: string }[] = [
  { key: "assistantTrainerLevel", label: "Помощник тренера" },
  { key: "formCoachLevel", label: "Тренер по физподготовке" },
  { key: "medicLevel", label: "Медик" },
  { key: "sportPsychologistLevel", label: "Спортивный психолог" },
  { key: "financialDirectorLevel", label: "Финансовый директор" },
  { key: "tacticalAssistantLevel", label: "Тренер по тактике" },
  { key: "spokespersonLevel", label: "Пресс-секретарь" },
];

export default function StaffSection({ realStaff }: { realStaff?: RealClubStaff | null }) {
  return (
    <div className={`${styles.panel} ${styles.span2}`}>
      <div className={styles.panelTitle}>Персонал</div>

      <div className={styles.summaryRow}>
        <span>
          Командный дух <b>{teamSpiritWord(teamSpirit)}</b>
        </span>
        <span>
          Уверенность команды <b>{confidenceWord(teamConfidence)}</b>
        </span>
      </div>

      <div className={styles.rowList}>
        <div className={styles.rowListItem}>
          <span className={`${styles.rowDot} ${styles.rowDotOn}`} />
          <span className={styles.rowLabel}>
            Тренер — {coach.name} · {tacticalPreferenceLabel[coach.preference]}
          </span>
          <span className={`${styles.rowValue} ${styles.rowValueOn}`}>
            {skillWord(coach.skillLevel)} / лидерство {leadershipWord(coach.leadership)}
          </span>
        </div>

        {realStaff
          ? realStaffLabels.map(({ key, label }) => {
              const level = realStaff[key];
              const hired = level > 0;
              return (
                <div className={styles.rowListItem} key={key}>
                  <span className={`${styles.rowDot} ${hired ? styles.rowDotOn : styles.rowDotOff}`} />
                  <span className={styles.rowLabel}>{label}</span>
                  <span className={`${styles.rowValue} ${hired ? styles.rowValueOn : ""}`}>
                    {hired ? skillWord(level) : "не нанят"}
                  </span>
                </div>
              );
            })
          : staff.map((member) => (
              <div className={styles.rowListItem} key={member.role}>
                <span className={`${styles.rowDot} ${member.hired ? styles.rowDotOn : styles.rowDotOff}`} />
                <span className={styles.rowLabel}>{staffRoleLabel[member.role]}</span>
                <span className={`${styles.rowValue} ${member.hired ? styles.rowValueOn : ""}`}>
                  {member.hired && member.level !== null ? skillWord(member.level) : "не нанят"}
                </span>
              </div>
            ))}
      </div>
    </div>
  );
}
