import type { SquadSkills } from "./squad";

export interface TrainingType {
  key: string;
  label: string;
}

// 11 типов тренировки, как в игре
export const trainingTypes: TrainingType[] = [
  { key: "goalkeeping", label: "Вратарь" },
  { key: "defending", label: "Защита" },
  { key: "scoring", label: "Нападение" },
  { key: "winger", label: "Фланг" },
  { key: "passing", label: "Пас" },
  { key: "playmaking", label: "Полузащита" },
  { key: "setPieces", label: "Стандарты" },
  { key: "scoringSetPieces", label: "Нападение и Стандарты" },
  { key: "passingDefPlay", label: "Пас (защита+полузащита)" },
  { key: "defendingDefPlay", label: "Защита (защита+полузащита)" },
  { key: "wingWideFwd", label: "Фланг (крайние полузащитники+нападающие)" },
];

export interface SkillChangeEntry {
  playerName: string;
  skillKey: keyof SquadSkills;
  oldLevel: number; // шкала 0-20, словесно через skillWord
  newLevel: number;
}

// Игроки, у которых за последнюю неделю тренировки изменился хотя бы один
// навык — старый/новый уровень по официальной шкале 0-20 (см. skillWord)
export const recentSkillChanges: SkillChangeEntry[] = [
  { playerName: "Пётр Волков", skillKey: "defending", oldLevel: 7, newLevel: 8 },
  { playerName: "Роман Соловьёв", skillKey: "midfield", oldLevel: 10, newLevel: 11 },
  { playerName: "Николай Ястребов", skillKey: "passing", oldLevel: 6, newLevel: 7 },
  { playerName: "Артём Тигров", skillKey: "scoring", oldLevel: 11, newLevel: 12 },
  { playerName: "Дмитрий Лисицын", skillKey: "defending", oldLevel: 8, newLevel: 7 },
  { playerName: "Кирилл Воронов", skillKey: "winger", oldLevel: 5, newLevel: 6 },
  { playerName: "Тимур Соболев", skillKey: "goalkeeping", oldLevel: 4, newLevel: 5 },
];
