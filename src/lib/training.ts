import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";

export interface RealTraining {
  typeKey: string | null; // ключ из src/data/training.ts trainingTypes, null — код не распознан
  intensity: number | null; // 0-100
  staminaShare: number | null; // 0-100
  // Командный дух (TeamSpiritID, 0-10, 5="Спокойствие"/Calm — нейтраль) и
  // уверенность (SelfConfidence, 0-9, 4/5="Прилично"/"Хорошо" — нейтраль) —
  // см. computeTeamSpiritMultiplier/computeTeamConfidenceMultiplier в
  // zoneRatings.ts (чат "Командный дух/уверенность в формуле позиционного
  // рейтинга"). Оба поля подтверждены независимым CHPP-клиентом
  // github.com/lucianoq/hattrick, chpp/file_training.go — но, как и весь
  // остальной парсинг training.xml в этом файле, ни разу не пробовались
  // живьём для ЭТОГО проекта. null — либо поле не пришло, либо Available
  // ="false" (синхронизация пришлась на момент, когда команда играет матч —
  // тогда контейнер пуст по документации клиента).
  moraleValue: number | null;
  confidenceValue: number | null;
  // Опыт построения по каждой из 10 именованных формаций, которые Hattrick
  // вообще отслеживает (см. чат "formationExperience.ts: реализовать
  // (подтверждено)") — ключи вида "4-4-2" (тот же формат, что и
  // detectFormationLabel в pitchBoard.ts), значения 0-20 (SkillLevel, та
  // же шкала, что у обычных навыков). Построения вне этих 10 просто
  // отсутствуют как ключ — см. resolveFormationExperience в
  // components/dashboard/formationExperience.ts, там это честно "нет
  // данных", а не 0.
  experienceByFormation: Record<string, number>;
}

// Поля training.xml с опытом построения — ПОДТВЕРЖДЕНО по независимому
// CHPP-клиенту github.com/lucianoq/hattrick, chpp/file_training.go:
// Hattrick считает опыт только для этих 10 конкретных формаций (сумма
// DEF+MID+FWD всегда 10 полевых игроков), не для произвольного сочетания,
// которое допускает наше поле (pitchBoard.ts, slotCounts DEF:5/MID:5/FWD:3).
// Ключи — тот же формат "D-M-F", что и detectFormationLabel в
// pitchBoard.ts, для прямого сопоставления без отдельной таблицы соответствий.
const EXPERIENCE_FORMATION_FIELDS: Record<string, string> = {
  "4-4-2": "Experience442",
  "4-3-3": "Experience433",
  "4-5-1": "Experience451",
  "3-5-2": "Experience352",
  "5-3-2": "Experience532",
  "3-4-3": "Experience343",
  "5-4-1": "Experience541",
  "5-2-3": "Experience523",
  "5-5-0": "Experience550",
  "2-5-3": "Experience253",
};

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

// Контейнер с атрибутом Available (Morale/SelfConfidence, см.
// chpp/file_training.go) — Available="false" во время матча команды, тогда
// значение (пустой текст) честно превращается в null, а не гадаем/не
// подставляем прошлое число. ignoreAttributes:false ниже не меняет разбор
// остальных полей этого файла — атрибуты добавляются только к элементам, у
// которых они реально есть (TrainingType/TrainingIntensity/
// StaminaTrainingPart своих атрибутов не имеют, остаются простыми числами).
function parseAvailableValue(container: unknown): number | null {
  if (container === undefined || container === null) return null;
  if (typeof container === "object") {
    const obj = container as Record<string, unknown>;
    if (obj["@_Available"] === "false" || obj["@_Available"] === false) return null;
    const n = Number(obj["#text"]);
    return Number.isNaN(n) ? null : n;
  }
  const n = Number(container);
  return Number.isNaN(n) ? null : n;
}

// Разбирает XML-ответ CHPP на файл training.xml — ни разу не пробовался в
// этом проекте живьём до сих пор (в отличие от teamdetails/players, тип и
// интенсивность тренировки нигде раньше не запрашивались). Если реальный
// ответ устроен иначе или CHPP ответит ошибкой — вызывающий код
// (src/app/dashboard/training/page.tsx) поймает исключение и оставит
// тестовые значения по умолчанию, как раньше.
export function parseTrainingXml(xml: string): RealTraining {
  const parser = new XMLParser({ ignoreAttributes: false });
  const data = parser.parse(xml);

  const root = data?.HattrickData;
  assertNoChppError(root, "training");

  const team = root?.Team ?? root;
  const typeCode = team?.TrainingType !== undefined ? Number(team.TrainingType) : NaN;
  const intensity = team?.TrainingIntensity !== undefined ? Number(team.TrainingIntensity) : NaN;
  const staminaShare = team?.StaminaTrainingPart !== undefined ? Number(team.StaminaTrainingPart) : NaN;

  const experienceByFormation: Record<string, number> = {};
  for (const [label, field] of Object.entries(EXPERIENCE_FORMATION_FIELDS)) {
    const raw = team?.[field];
    if (raw === undefined) continue;
    const n = Number(raw);
    if (!Number.isNaN(n)) experienceByFormation[label] = n;
  }

  return {
    typeKey: Number.isNaN(typeCode) ? null : (trainingTypeKeyByCode[typeCode] ?? null),
    intensity: Number.isNaN(intensity) ? null : intensity,
    staminaShare: Number.isNaN(staminaShare) ? null : staminaShare,
    moraleValue: parseAvailableValue(team?.Morale),
    confidenceValue: parseAvailableValue(team?.SelfConfidence),
    experienceByFormation,
  };
}
