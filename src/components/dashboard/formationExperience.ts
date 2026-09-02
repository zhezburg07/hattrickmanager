// "Опыт построения" — насколько команда обжилась в текущей расстановке.
// РЕАЛЬНЫЕ данные CHPP (см. чат "formationExperience.ts: реализовать
// (подтверждено)") — training.xml отдаёт поля Experience442/433/451/352/
// 532/343/541/523/550/253 (chpp/file_training.go, независимый клиент
// github.com/lucianoq/hattrick, PODTVERZHDENO по исходнику), парсинг — см.
// EXPERIENCE_FORMATION_FIELDS в src/lib/training.ts. Hattrick считает опыт
// ТОЛЬКО для этих 10 именованных построений, на полной шкале навыков 0-20
// (SkillLevel — та же шкала, что у обычных навыков игрока, skillWord в
// squad.ts), а НЕ на укороченной 0-8 шкале Формы, как предполагала прежняя
// демонстрационная заглушка (formWord — ошибочное предположение, не
// проверенное против реального поля).
//
// Наше собственное поле (pitchBoard.ts, slotCounts DEF:5/MID:5/FWD:3)
// допускает и другие сочетания защитников/полузащитников/нападающих — для
// них Hattrick честно не считает опыт вообще (в training.xml просто нет
// такого поля). Для таких построений — отдельное состояние "unknown", а не
// выдуманное число: см. FormationExperience ниже.
export type FormationExperience =
  | { kind: "incomplete" } // состав ещё не укомплектован (меньше 10 полевых) — опыта не считаем
  | { kind: "unknown" } // 10 полевых заполнено, но это построение — не из 10 именованных Hattrick
  | { kind: "known"; level: number }; // реальный уровень опыта, 0-20 (skillWord)

// "«Отлично»+ уровень опыта = растерянность невозможна" (официальный текст,
// раздел "Расстановка: Опыт и растерянность") — "Отлично" на шкале 0-20
// (skillWordsDesc в squad.ts) это уровень 8, не 0-8-шкала Формы.
export const SAFE_FORMATION_EXPERIENCE_LEVEL = 8;

export function resolveFormationExperience(
  formationLabel: string,
  fieldPlayerCount: number,
  experienceByFormation: Record<string, number>,
): FormationExperience {
  if (fieldPlayerCount < 10) return { kind: "incomplete" };
  const level = experienceByFormation[formationLabel];
  return level === undefined ? { kind: "unknown" } : { kind: "known", level };
}

// Подсказка при наведении — качественная, БЕЗ выдуманных чисел/процентов
// риска: официальный текст даёт только направление ("риск растёт при более
// низком опыте, опыт игроков частично компенсирует"), а не формулу — точную
// кривую риска Hattrick не публикует, поэтому не подгоняем её численно.
export function formationExperienceHint(experience: FormationExperience): string {
  const base = "Опыт построения растёт по мере того, как команда играет в этой расстановке.";
  switch (experience.kind) {
    case "incomplete":
      return base;
    case "unknown":
      return `${base} Для этого конкретного построения Hattrick не считает опыт отдельно (только для 10 стандартных схем: 4-4-2, 4-3-3, 4-5-1, 3-5-2, 5-3-2, 3-4-3, 5-4-1, 5-2-3, 5-5-0, 2-5-3) — данных по нему нет.`;
    case "known":
      return experience.level >= SAFE_FORMATION_EXPERIENCE_LEVEL
        ? `${base} На этом уровне («Отлично» и выше) растерянность невозможна.`
        : `${base} Риск растерянности есть и растёт при более низком опыте — опыт игроков частично его компенсирует.`;
  }
}
