import { countries, type Country, type CountryCode, type PositionGroup, type SquadSkills } from "./squad";

// ---- Мои трансферы (игроки своей команды, выставленные на продажу) ----
export interface MyTransferListing {
  id: number;
  playerId: number; // ссылка на squadPlayers
  startPrice: number;
  currentBid: number;
  bidCount: number;
  timeLeft: string;
  listedMinutesAgo: number; // тестовое значение — сколько минут назад выставлен лот
}

export const myTransfers: MyTransferListing[] = [
  { id: 1, playerId: 15, startPrice: 400_000, currentBid: 620_000, bidCount: 5, timeLeft: "1 день 6 часов", listedMinutesAgo: 340 },
  { id: 2, playerId: 18, startPrice: 250_000, currentBid: 250_000, bidCount: 0, timeLeft: "2 дня 22 часа", listedMinutesAgo: 4 },
  { id: 3, playerId: 22, startPrice: 550_000, currentBid: 780_000, bidCount: 9, timeLeft: "5 часов 15 минут", listedMinutesAgo: 1200 },
];

// Отменить трансфер можно только в первые 10 минут после выставления (тестовое правило)
export const CANCEL_WINDOW_MINUTES = 10;

// Стоимость размещения игрока на трансфер (тестовое значение)
export const LISTING_FEE = 100_000;

// ---- Рынок игроков (игроки других клубов, выставленные на продажу) ----
export interface MarketPlayer {
  id: number;
  name: string;
  club: string;
  nationality: Country;
  positionGroup: PositionGroup;
  age: number;
  form: number;
  stamina: number;
  skills: SquadSkills;
  tsi: number;
  currentPrice: number;
  timeLeft: string;
}

interface RawMarketPlayer extends Omit<MarketPlayer, "nationality"> {
  nationality: CountryCode;
}

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

const rawMarketPlayers: RawMarketPlayer[] = [
  {
    id: 101,
    name: "Марат Сериков",
    club: "Атлетик Норд",
    nationality: "KZ",
    positionGroup: "GK",
    age: 28,
    form: 6,
    stamina: 81,
    skills: skills(15, 2, 1, 0, 2, 0, 4),
    tsi: 11_400,
    currentPrice: 480_000,
    timeLeft: "1 день 3 часа",
  },
  {
    id: 102,
    name: "Игнат Воробьёв",
    club: "Юнион Стар",
    nationality: "RU",
    positionGroup: "DEF",
    age: 25,
    form: 5,
    stamina: 76,
    skills: skills(0, 13, 4, 3, 3, 0, 1),
    tsi: 9_800,
    currentPrice: 560_000,
    timeLeft: "8 часов 40 минут",
  },
  {
    id: 103,
    name: "Бекзат Нурланов",
    club: "Дракон Сити",
    nationality: "KZ",
    positionGroup: "DEF",
    age: 30,
    form: 7,
    stamina: 85,
    skills: skills(0, 11, 6, 8, 4, 1, 0),
    tsi: 10_200,
    currentPrice: 390_000,
    timeLeft: "2 дня 1 час",
  },
  {
    id: 104,
    name: "Диего Са́нтуш",
    club: "Ред Фалькон",
    nationality: "BR",
    positionGroup: "MID",
    age: 24,
    form: 7,
    stamina: 79,
    skills: skills(0, 4, 14, 6, 12, 5, 3),
    tsi: 21_600,
    currentPrice: 1_250_000,
    timeLeft: "3 дня 5 часов",
  },
  {
    id: 105,
    name: "Тимофей Гринёв",
    club: "Стальные Волки",
    nationality: "RU",
    positionGroup: "MID",
    age: 27,
    form: 5,
    stamina: 70,
    skills: skills(0, 5, 9, 3, 8, 2, 6),
    tsi: 13_800,
    currentPrice: 640_000,
    timeLeft: "14 часов 20 минут",
  },
  {
    id: 106,
    name: "Аскар Токтаров",
    club: "Гранит СК",
    nationality: "KZ",
    positionGroup: "MID",
    age: 19,
    form: 6,
    stamina: 88,
    skills: skills(0, 3, 8, 5, 6, 3, 1),
    tsi: 8_900,
    currentPrice: 210_000,
    timeLeft: "4 дня 12 часов",
  },
  {
    id: 107,
    name: "Милош Йованович",
    club: "Викинг СК",
    nationality: "RS",
    positionGroup: "FWD",
    age: 26,
    form: 8,
    stamina: 74,
    skills: skills(0, 1, 5, 9, 6, 15, 2),
    tsi: 24_900,
    currentPrice: 1_680_000,
    timeLeft: "22 часа 5 минут",
  },
  {
    id: 108,
    name: "Ерсин Абенов",
    club: "Феникс Юнайтед",
    nationality: "KZ",
    positionGroup: "FWD",
    age: 22,
    form: 4,
    stamina: 69,
    skills: skills(0, 0, 3, 6, 3, 10, 0),
    tsi: 12_100,
    currentPrice: 470_000,
    timeLeft: "1 день 18 часов",
  },
  {
    id: 109,
    name: "Уулжан Бекова",
    club: "Юнион Стар",
    nationality: "KG",
    positionGroup: "FWD",
    age: 29,
    form: 6,
    stamina: 77,
    skills: skills(0, 2, 6, 12, 7, 11, 1),
    tsi: 17_300,
    currentPrice: 830_000,
    timeLeft: "9 часов 50 минут",
  },
];

export const marketPlayers: MarketPlayer[] = rawMarketPlayers.map((p) => ({ ...p, nationality: countries[p.nationality] }));

// ---- Последние трансферы за сезон (завершённые сделки в лиге) ----
export interface RecentTransfer {
  id: number;
  playerName: string;
  fromClub: string;
  toClub: string;
  price: number;
  completedDate: string; // дд.мм.гггг
}

// Отсортировано от самых последних сделок к более старым
export const recentTransfers: RecentTransfer[] = [
  { id: 1, playerName: "Данияр Есенов", fromClub: "Гранит СК", toClub: "Атлетик Норд", price: 1_450_000, completedDate: "03.07.2026" },
  { id: 2, playerName: "Роман Костенко", fromClub: "Феникс Юнайтед", toClub: "Ред Фалькон", price: 620_000, completedDate: "01.07.2026" },
  { id: 3, playerName: "Асхат Жумабеков", fromClub: "Стальные Волки", toClub: "Юнион Стар", price: 980_000, completedDate: "28.06.2026" },
  { id: 4, playerName: "Вадим Прокопенко", fromClub: "Дракон Сити", toClub: "Гранит СК", price: 340_000, completedDate: "26.06.2026" },
  { id: 5, playerName: "Нурлан Абишев", fromClub: "Атлетик Норд", toClub: "Стальные Волки", price: 1_120_000, completedDate: "23.06.2026" },
  { id: 6, playerName: "Кайрат Смагулов", fromClub: "Юнион Стар", toClub: "Дракон Сити", price: 505_000, completedDate: "20.06.2026" },
  { id: 7, playerName: "Виталий Огнев", fromClub: "Ред Фалькон", toClub: "Феникс Юнайтед", price: 275_000, completedDate: "17.06.2026" },
  { id: 8, playerName: "Ержан Дуйсенов", fromClub: "Феникс Юнайтед", toClub: "Атлетик Норд", price: 2_100_000, completedDate: "14.06.2026" },
  { id: 9, playerName: "Максим Гриценко", fromClub: "Гранит СК", toClub: "Ред Фалькон", price: 410_000, completedDate: "09.06.2026" },
];
