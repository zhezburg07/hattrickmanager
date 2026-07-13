import type { SlotRole } from "./pitchBoard";

// Индивидуальные указания для полевых игроков (не для вратаря). "Обычный" —
// значение по умолчанию, не показывается на поле никакой иконкой.
export type PlayerInstruction = "normal" | "defensive" | "attacking" | "toCenter" | "toWing";

export const instructionLabel: Record<PlayerInstruction, string> = {
  normal: "Обычный",
  defensive: "Оборонительный",
  attacking: "Атакующий",
  toCenter: "Смещённый к центру",
  toWing: "Смещённый к флангу",
};

// Какие указания применимы к роли слота: смещение "к центру" имеет смысл
// только для крайних позиций, "к флангу" — только для центральных. Вратарю
// указания не назначаются вовсе (пустой список). Центральный нападающий —
// особый случай: только "Обычный"/"Оборонительный", без "Атакующего" и без
// смещений; крайний нападающий дополнительно может сместиться на фланг.
export function applicableInstructions(role: SlotRole): PlayerInstruction[] {
  switch (role) {
    case "GK":
      return [];
    case "FWD_CENTRAL":
      return ["normal", "defensive"];
    case "FWD_WIDE":
      return ["normal", "defensive", "toWing"];
    case "DEF_WIDE":
    case "MID_WIDE":
      return ["normal", "defensive", "attacking", "toCenter"];
    case "DEF_CENTRAL":
    case "MID_CENTRAL":
      return ["normal", "defensive", "attacking", "toWing"];
  }
}

// Стрелка указания — направление задаётся относительно ориентации атаки
// команды на поле, а не абсолютного верха/низа экрана. Поле в этом приложении
// расположено горизонтально (атака слева направо), поэтому "вперёд/назад"
// (атакующий/оборонительный) — это горизонтальная стрелка, а "к центру/к
// флангу" — вертикальная, в сторону, зависящую от того, на какой половине
// ширины поля (y, 0 = верхняя бровка, 100 = нижняя) стоит сам слот.
export function instructionArrow(instruction: PlayerInstruction, slotY: number): string {
  switch (instruction) {
    case "attacking":
      return "→";
    case "defensive":
      return "←";
    case "toCenter":
      return slotY > 50 ? "↑" : "↓";
    case "toWing":
      return slotY > 50 ? "↓" : "↑";
    default:
      return "";
  }
}
