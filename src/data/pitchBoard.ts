import type { PositionGroup } from "./squad";

export type SlotRole = "GK" | "DEF_WIDE" | "DEF_CENTRAL" | "MID_WIDE" | "MID_CENTRAL" | "FWD_CENTRAL" | "FWD_WIDE";

export interface BoardSlot {
  id: string; // например "DEF-0"
  group: PositionGroup; // связывает слот с данными расстановки (assignments)
  index: number; // позиция внутри линии (группы)
  role: SlotRole;
  roleLabel: string; // короткая подпись в кружке: ВР / КЗЩ / ЦЗЩ / КПЗ / ЦПЗ / НАП
  x: number; // % по глубине поля: 0 = свои ворота (слева), 100 = ворота соперника (справа)
  y: number; // % по ширине поля: 0 = верхняя бровка, 100 = нижняя бровка
}

export const roleShortLabel: Record<SlotRole, string> = {
  GK: "ВР",
  DEF_WIDE: "КЗЩ",
  DEF_CENTRAL: "ЦЗЩ",
  MID_WIDE: "КПЗ",
  MID_CENTRAL: "ЦПЗ",
  FWD_CENTRAL: "НАП",
  FWD_WIDE: "НАП",
};

export const roleFullLabel: Record<SlotRole, string> = {
  GK: "Вратарь",
  DEF_WIDE: "Крайний защитник",
  DEF_CENTRAL: "Центральный защитник",
  MID_WIDE: "Крайний полузащитник",
  MID_CENTRAL: "Центральный полузащитник",
  FWD_CENTRAL: "Нападающий",
  FWD_WIDE: "Нападающий",
};

export const groupOrder: PositionGroup[] = ["GK", "DEF", "MID", "FWD"];

// Цветовая кодировка карточек по типу позиции — акцент (полоска + подпись
// роли), а не основной фон карточки: вратарь зелёный, вся защита (центральный
// и крайний защитник) оранжевая, центральный полузащитник жёлтый, крайний
// полузащитник зелёный (совпадает с вратарём — на поле одновременно только
// один вратарь, путаницы не возникает), нападение красное.
export type RoleAccent = "gk" | "defense" | "midCentral" | "midWide" | "fwd";

export const roleAccent: Record<SlotRole, RoleAccent> = {
  GK: "gk",
  DEF_CENTRAL: "defense",
  DEF_WIDE: "defense",
  MID_WIDE: "midWide",
  MID_CENTRAL: "midCentral",
  FWD_CENTRAL: "fwd",
  FWD_WIDE: "fwd",
};

// Сколько слотов у каждой линии в фиксированной сетке (1 + 5 + 5 + 3 = 14)
export const slotCounts: Record<PositionGroup, number> = { GK: 1, DEF: 5, MID: 5, FWD: 3 };

// Колонки раздвинуты так, чтобы широкие (~3x) карточки игроков не сталкивались
// друг с другом по горизонтали, а крайние линии (GK/FWD) не обрезались рамкой
// поля — с запасом рассчитано на самую узкую из адаптивных ширин карточки.
// Вратарь стоит с небольшим отступом от линии ворот (не впритык). Защита и
// полузащита раздвинуты так, чтобы расстояние между линией защиты и линией
// полузащиты равнялось расстоянию между полузащитой и нападением — линии
// на равномерном, симметричном удалении друг от друга по всей глубине поля.
// Нападение — на прежнем месте, ближе к воротам соперника, без изменений.
const groupX: Record<PositionGroup, number> = {
  GK: 9,
  DEF: 36,
  MID: 62,
  FWD: 88,
};

// Фиксированная гибкая сетка слотов на поле. Формация больше не переключается —
// менеджер сам решает, какие из 14 слотов заполнить игроками (обычно 11).
export const boardSlots: BoardSlot[] = [
  { id: "GK-0", group: "GK", index: 0, role: "GK", roleLabel: roleShortLabel.GK, x: groupX.GK, y: 50 },

  { id: "DEF-0", group: "DEF", index: 0, role: "DEF_WIDE", roleLabel: roleShortLabel.DEF_WIDE, x: groupX.DEF, y: 12 },
  { id: "DEF-1", group: "DEF", index: 1, role: "DEF_CENTRAL", roleLabel: roleShortLabel.DEF_CENTRAL, x: groupX.DEF, y: 32 },
  { id: "DEF-2", group: "DEF", index: 2, role: "DEF_CENTRAL", roleLabel: roleShortLabel.DEF_CENTRAL, x: groupX.DEF, y: 50 },
  { id: "DEF-3", group: "DEF", index: 3, role: "DEF_CENTRAL", roleLabel: roleShortLabel.DEF_CENTRAL, x: groupX.DEF, y: 68 },
  { id: "DEF-4", group: "DEF", index: 4, role: "DEF_WIDE", roleLabel: roleShortLabel.DEF_WIDE, x: groupX.DEF, y: 88 },

  { id: "MID-0", group: "MID", index: 0, role: "MID_WIDE", roleLabel: roleShortLabel.MID_WIDE, x: groupX.MID, y: 12 },
  { id: "MID-1", group: "MID", index: 1, role: "MID_CENTRAL", roleLabel: roleShortLabel.MID_CENTRAL, x: groupX.MID, y: 32 },
  { id: "MID-2", group: "MID", index: 2, role: "MID_CENTRAL", roleLabel: roleShortLabel.MID_CENTRAL, x: groupX.MID, y: 50 },
  { id: "MID-3", group: "MID", index: 3, role: "MID_CENTRAL", roleLabel: roleShortLabel.MID_CENTRAL, x: groupX.MID, y: 68 },
  { id: "MID-4", group: "MID", index: 4, role: "MID_WIDE", roleLabel: roleShortLabel.MID_WIDE, x: groupX.MID, y: 88 },

  { id: "FWD-0", group: "FWD", index: 0, role: "FWD_WIDE", roleLabel: roleShortLabel.FWD_WIDE, x: groupX.FWD, y: 20 },
  { id: "FWD-1", group: "FWD", index: 1, role: "FWD_CENTRAL", roleLabel: roleShortLabel.FWD_CENTRAL, x: groupX.FWD, y: 50 },
  { id: "FWD-2", group: "FWD", index: 2, role: "FWD_WIDE", roleLabel: roleShortLabel.FWD_WIDE, x: groupX.FWD, y: 80 },
];

// Индексы слотов по под-роли — используются при автоподборе состава,
// чтобы знать, какие конкретно слоты (крайние/центральные) заполнять
export const slotIndices = {
  GK: boardSlots.filter((s) => s.group === "GK").map((s) => s.index),
  DEF_WIDE: boardSlots.filter((s) => s.role === "DEF_WIDE").map((s) => s.index),
  DEF_CENTRAL: boardSlots.filter((s) => s.role === "DEF_CENTRAL").map((s) => s.index),
  MID_WIDE: boardSlots.filter((s) => s.role === "MID_WIDE").map((s) => s.index),
  MID_CENTRAL: boardSlots.filter((s) => s.role === "MID_CENTRAL").map((s) => s.index),
  FWD: boardSlots.filter((s) => s.group === "FWD").map((s) => s.index),
};

export type Assignments = Record<PositionGroup, (number | null)[]>;

export function emptyAssignments(): Assignments {
  return {
    GK: Array.from({ length: slotCounts.GK }, () => null),
    DEF: Array.from({ length: slotCounts.DEF }, () => null),
    MID: Array.from({ length: slotCounts.MID }, () => null),
    FWD: Array.from({ length: slotCounts.FWD }, () => null),
  };
}

// Определяет схему по факту заполненных слотов в каждой линии, например "4-4-2".
// Вратарь в название не входит (как в стандартной футбольной нотации).
export function detectFormationLabel(assignments: Assignments): string {
  const def = assignments.DEF.filter((id) => id !== null).length;
  const mid = assignments.MID.filter((id) => id !== null).length;
  const fwd = assignments.FWD.filter((id) => id !== null).length;
  if (def === 0 && mid === 0 && fwd === 0) return "—";
  return `${def}-${mid}-${fwd}`;
}

// Сколько игроков сейчас в полевых линиях (без вратаря) — лимит 10
export function fieldPlayerCount(assignments: Assignments): number {
  return (
    assignments.DEF.filter((id) => id !== null).length +
    assignments.MID.filter((id) => id !== null).length +
    assignments.FWD.filter((id) => id !== null).length
  );
}

// Запасные — 5 слотов. Подпись роли — просто визуальная подсказка/ярлык:
// в отличие от слотов на самом поле, слот запасного не ограничивает, игрока
// какой позиции на него можно поставить. Пока запасной не вышел на поле, он
// не входит в assignments и не учитывается в зональных рейтингах команды.
export interface SubCategory {
  key: string;
  label: string;
  shortLabel: string;
}

export const subCategories: SubCategory[] = [
  { key: "GK", label: "Вратарь", shortLabel: "ВР" },
  { key: "DEF", label: "Защита", shortLabel: "ЗАЩ" },
  { key: "MID", label: "Полузащита", shortLabel: "ПЗ" },
  { key: "WING", label: "Фланг", shortLabel: "ФЛ" },
  { key: "FWD", label: "Нападение", shortLabel: "НАП" },
];

export const SUB_SLOTS = subCategories.length;
