import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";

// Настоящая структура club.xml (проверено на реальном ответе Hattrick) —
// контейнер называется <Staff>, а поля дают именно УРОВЕНЬ (0-20) каждого
// специалиста, а не количество нанятых, как предполагалось раньше по
// (оказавшейся неверной) документации. Уровень 0 означает "не нанят".
export interface RealClubStaff {
  assistantTrainerLevel: number;
  financialDirectorLevel: number;
  formCoachLevel: number;
  medicLevel: number;
  spokespersonLevel: number;
  sportPsychologistLevel: number;
  tacticalAssistantLevel: number;
  // <YouthSquad> в том же club.xml — единственная реально доступная нам
  // информация о молодёжной академии (сам список игроков академии CHPP не
  // отдаёт через youthplayers.xml/youthdetails.xml — оба стабильно падают
  // с 401 у этого приложения, похоже на ограничение прав доступа).
  youthLevel: number;
}

export function parseClubXml(xml: string): RealClubStaff {
  const parser = new XMLParser();
  const data = parser.parse(xml);

  const root = data?.HattrickData;
  assertNoChppError(root, "club");

  const staff = root?.Team?.Staff ?? {};

  return {
    assistantTrainerLevel: Number(staff.AssistantTrainerLevels ?? 0),
    financialDirectorLevel: Number(staff.FinancialDirectorLevels ?? 0),
    formCoachLevel: Number(staff.FormCoachLevels ?? 0),
    medicLevel: Number(staff.MedicLevels ?? 0),
    spokespersonLevel: Number(staff.SpokespersonLevels ?? 0),
    sportPsychologistLevel: Number(staff.SportPsychologistLevels ?? 0),
    tacticalAssistantLevel: Number(staff.TacticalAssistantLevels ?? 0),
    youthLevel: Number(root?.Team?.YouthSquad?.YouthLevel ?? 0),
  };
}
