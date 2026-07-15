import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";

export interface RealTraining {
  typeKey: string | null; // ключ из src/data/training.ts trainingTypes, null — код не распознан
  intensity: number | null; // 0-100
  staminaShare: number | null; // 0-100
}

// Числовые коды TrainingType, которыми Hattrick отмечает базовые тренировки
// одного навыка (0-7) — общеизвестная, стабильная часть схемы CHPP.
// Комбинированные тренировки (пас+защита+полузащита и т.п.) используют
// другие, менее задокументированные коды — сюда сознательно не включены:
// если придёт незнакомый код, typeKey останется null и компонент просто
// покажет тестовое значение по умолчанию, вместо того чтобы гадать.
const trainingTypeKeyByCode: Record<number, string> = {
  1: "goalkeeping",
  2: "defending",
  3: "playmaking",
  4: "passing",
  5: "winger",
  6: "scoring",
  7: "setPieces",
};

// Разбирает XML-ответ CHPP на файл training.xml — ни разу не пробовался в
// этом проекте живьём до сих пор (в отличие от teamdetails/players, тип и
// интенсивность тренировки нигде раньше не запрашивались). Если реальный
// ответ устроен иначе или CHPP ответит ошибкой — вызывающий код
// (src/app/dashboard/training/page.tsx) поймает исключение и оставит
// тестовые значения по умолчанию, как раньше.
export function parseTrainingXml(xml: string): RealTraining {
  const parser = new XMLParser();
  const data = parser.parse(xml);

  const root = data?.HattrickData;
  assertNoChppError(root, "training");

  const team = root?.Team ?? root;
  const typeCode = team?.TrainingType !== undefined ? Number(team.TrainingType) : NaN;
  const intensity = team?.TrainingIntensity !== undefined ? Number(team.TrainingIntensity) : NaN;
  const staminaShare = team?.StaminaTrainingPart !== undefined ? Number(team.StaminaTrainingPart) : NaN;

  return {
    typeKey: Number.isNaN(typeCode) ? null : (trainingTypeKeyByCode[typeCode] ?? null),
    intensity: Number.isNaN(intensity) ? null : intensity,
    staminaShare: Number.isNaN(staminaShare) ? null : staminaShare,
  };
}
