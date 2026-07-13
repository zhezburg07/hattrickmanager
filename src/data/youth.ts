import { countries, type Country, type CountryCode, type PositionGroup, type SquadSkills } from "./squad";

export interface YouthPlayer {
  id: number;
  name: string;
  age: number; // младше 17 лет
  nationality: Country;
  positionGroup: PositionGroup;
  skills: SquadSkills;
}

interface RawYouthPlayer {
  id: number;
  name: string;
  age: number;
  nationality: CountryCode;
  positionGroup: PositionGroup;
  skills: SquadSkills;
}

// Общий уровень академии (0-20, словесно через skillWord) — "хорошо"
export const academyLevel = 7;

function skills(
  goalkeeping: number,
  defending: number,
  midfield: number,
  winger: number,
  passing: number,
  scoring: number,
  setPieces: number,
): SquadSkills {
  return { goalkeeping, defending, midfield, winger, passing, scoring, setPieces };
}

const rawYouthPlayers: RawYouthPlayer[] = [
  { id: 1, name: "Данил Ковалёв", age: 16, nationality: "KZ", positionGroup: "GK", skills: skills(7, 1, 0, 0, 1, 0, 1) },
  { id: 2, name: "Ерлан Сатыбалдин", age: 15, nationality: "KZ", positionGroup: "GK", skills: skills(4, 0, 0, 0, 0, 0, 0) },
  { id: 3, name: "Марк Дубинин", age: 16, nationality: "RU", positionGroup: "DEF", skills: skills(0, 8, 2, 1, 1, 0, 0) },
  { id: 4, name: "Тимофей Гвоздев", age: 15, nationality: "KZ", positionGroup: "DEF", skills: skills(0, 5, 1, 2, 0, 0, 0) },
  { id: 5, name: "Ринат Абенов", age: 16, nationality: "KZ", positionGroup: "DEF", skills: skills(0, 6, 3, 1, 2, 0, 0) },
  { id: 6, name: "Аскар Нурланов", age: 14, nationality: "KZ", positionGroup: "DEF", skills: skills(0, 3, 1, 1, 0, 0, 0) },
  { id: 7, name: "Богдан Сорокин", age: 16, nationality: "UZ", positionGroup: "MID", skills: skills(0, 2, 8, 2, 4, 1, 1) },
  { id: 8, name: "Марат Ибраев", age: 15, nationality: "KZ", positionGroup: "MID", skills: skills(0, 1, 5, 3, 3, 1, 0) },
  { id: 9, name: "Женис Токтаров", age: 16, nationality: "KZ", positionGroup: "MID", skills: skills(0, 2, 4, 6, 2, 2, 0) },
  { id: 10, name: "Игорь Плетнёв", age: 15, nationality: "KZ", positionGroup: "MID", skills: skills(0, 1, 3, 2, 2, 0, 0) },
  { id: 11, name: "Данияр Есимов", age: 16, nationality: "KZ", positionGroup: "FWD", skills: skills(0, 0, 2, 3, 2, 8, 0) },
  { id: 12, name: "Роман Титаренко", age: 15, nationality: "RU", positionGroup: "FWD", skills: skills(0, 0, 1, 2, 1, 5, 0) },
];

export const youthPlayers: YouthPlayer[] = rawYouthPlayers.map((p) => ({ ...p, nationality: countries[p.nationality] }));
