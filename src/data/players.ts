export type PlayerPosition = "GK" | "LB" | "CB" | "RB" | "LM" | "CM" | "RM" | "ST";

export interface Player {
  id: number;
  name: string;
  position: PlayerPosition;
  positionLabel: string;
  form: number; // 1-8, как рейтинг формы в Hattrick
  stamina: number; // 0-100%
  x: number; // позиция на поле по горизонтали, в процентах
  y: number; // позиция на поле по вертикали, в процентах (0 = ворота соперника, 100 = свои ворота)
}

// Состав в формации 4-4-2: 1 вратарь, 4 защитника, 4 полузащитника, 2 нападающих
export const squad: Player[] = [
  { id: 1, name: "Иван Соколов", position: "GK", positionLabel: "Вратарь", form: 6, stamina: 87, x: 50, y: 92 },

  { id: 2, name: "Пётр Волков", position: "LB", positionLabel: "Левый защитник", form: 5, stamina: 78, x: 15, y: 72 },
  { id: 3, name: "Сергей Орлов", position: "CB", positionLabel: "Центральный защитник", form: 7, stamina: 82, x: 38, y: 76 },
  { id: 4, name: "Андрей Медведев", position: "CB", positionLabel: "Центральный защитник", form: 6, stamina: 80, x: 62, y: 76 },
  { id: 5, name: "Дмитрий Лисицын", position: "RB", positionLabel: "Правый защитник", form: 5, stamina: 75, x: 85, y: 72 },

  { id: 6, name: "Николай Ястребов", position: "LM", positionLabel: "Левый полузащитник", form: 6, stamina: 70, x: 15, y: 48 },
  { id: 7, name: "Максим Гусев", position: "CM", positionLabel: "Центральный полузащитник", form: 7, stamina: 74, x: 38, y: 52 },
  { id: 8, name: "Роман Соловьёв", position: "CM", positionLabel: "Центральный полузащитник", form: 8, stamina: 68, x: 62, y: 52 },
  { id: 9, name: "Кирилл Воронов", position: "RM", positionLabel: "Правый полузащитник", form: 5, stamina: 73, x: 85, y: 48 },

  { id: 10, name: "Егор Барсуков", position: "ST", positionLabel: "Нападающий", form: 8, stamina: 65, x: 38, y: 22 },
  { id: 11, name: "Артём Тигров", position: "ST", positionLabel: "Нападающий", form: 7, stamina: 60, x: 62, y: 22 },
];
