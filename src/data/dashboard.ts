import { squadPlayers } from "./squad";

// Валюта команды — CHPP отдаёт её не в economy.xml/teamdetails.xml (там
// денежные суммы вообще без указания валюты), а в отдельном файле
// worlddetails.xml (список всех лиг мира), отфильтрованном по LeagueID
// нашей лиги — см. src/lib/worldCurrency.ts. Пока нет реальной синхронизации
// (или её не удалось выполнить), используем тенге по умолчанию — основная
// аудитория проекта из Казахстана.
export interface Currency {
  label: string; // подписывается рядом с суммами, например "2 458 900 тенге"
}

export const defaultCurrency: Currency = { label: "тенге" };

export const club = {
  name: "FC Заря",
  shortName: "ЗАР",
  rating: 5342,
  currency: defaultCurrency,
};

// Номер текущей игровой недели — подписывается рядом с блоками, которые
// сравнивают показатели с прошлой неделей
export const currentWeek = 13;

// Время последнего обновления данных из Hattrick (тестовое значение)
export const lastDataUpdate = "04.07.2026, 09:12";

export type MatchOutcome = "win" | "draw" | "loss";

export interface LeagueRow {
  position: number;
  name: string;
  played: number; // М
  wins: number; // В
  draws: number; // Н
  losses: number; // П
  goalsFor: number; // ГЗ
  goalsAgainst: number; // ГП
  points: number; // О
  last5: MatchOutcome[]; // от старой к новой игре
  isOurTeam?: boolean;
}

export const leagueTable: LeagueRow[] = [
  {
    position: 1,
    name: "Атлетик Норд",
    played: 18,
    wins: 14,
    draws: 3,
    losses: 1,
    goalsFor: 50,
    goalsAgainst: 22,
    points: 45,
    last5: ["win", "win", "draw", "win", "win"],
  },
  {
    position: 2,
    name: "Юнион Стар",
    played: 18,
    wins: 12,
    draws: 5,
    losses: 1,
    goalsFor: 44,
    goalsAgainst: 25,
    points: 41,
    last5: ["draw", "win", "win", "loss", "win"],
  },
  {
    position: 3,
    name: "FC Заря",
    played: 18,
    wins: 11,
    draws: 5,
    losses: 2,
    goalsFor: 39,
    goalsAgainst: 25,
    points: 38,
    last5: ["win", "draw", "loss", "draw", "win"],
    isOurTeam: true,
  },
  {
    position: 4,
    name: "Дракон Сити",
    played: 18,
    wins: 9,
    draws: 7,
    losses: 2,
    goalsFor: 30,
    goalsAgainst: 24,
    points: 34,
    last5: ["win", "draw", "win", "draw", "loss"],
  },
  {
    position: 5,
    name: "Ред Фалькон",
    played: 18,
    wins: 8,
    draws: 6,
    losses: 4,
    goalsFor: 28,
    goalsAgainst: 26,
    points: 30,
    last5: ["loss", "win", "draw", "loss", "draw"],
  },
  {
    position: 6,
    name: "Стальные Волки",
    played: 18,
    wins: 7,
    draws: 5,
    losses: 6,
    goalsFor: 24,
    goalsAgainst: 28,
    points: 26,
    last5: ["draw", "loss", "win", "draw", "win"],
  },
  {
    position: 7,
    name: "Гранит СК",
    played: 18,
    wins: 4,
    draws: 6,
    losses: 8,
    goalsFor: 20,
    goalsAgainst: 32,
    points: 18,
    last5: ["loss", "loss", "draw", "loss", "win"],
  },
  {
    position: 8,
    name: "Феникс Юнайтед",
    played: 18,
    wins: 2,
    draws: 6,
    losses: 10,
    goalsFor: 15,
    goalsAgainst: 38,
    points: 12,
    last5: ["loss", "loss", "loss", "draw", "loss"],
  },
];

export type MatchResult = "win" | "draw" | "loss";

// Даты хранятся в том же виде, что реально присылает Hattrick (matches.xml,
// поле MatchDate) — "ГГГГ-ММ-ДД ЧЧ:ММ:СС" — чтобы тестовые и настоящие
// данные форматировались одной и той же функцией (см. formatMatchDateTime).
// Настоящее расписание Hattrick: матчи лиги — по воскресеньям в 13:00,
// кубковые и товарищеские — по средам в 17:10.
export interface RecentMatch {
  id: number;
  date: string;
  opponent: string;
  home: boolean;
  ourScore: number;
  oppScore: number;
  result: MatchResult;
}

export const recentMatches: RecentMatch[] = [
  { id: 1, date: "2026-06-28 13:00:00", opponent: "Дракон Сити", home: true, ourScore: 3, oppScore: 1, result: "win" },
  { id: 2, date: "2026-06-21 13:00:00", opponent: "Ред Фалькон", home: false, ourScore: 2, oppScore: 2, result: "draw" },
  { id: 3, date: "2026-06-14 13:00:00", opponent: "Атлетик Норд", home: true, ourScore: 0, oppScore: 1, result: "loss" },
];

export interface UpcomingMatch {
  id: number;
  date: string;
  opponent: string;
  home: boolean;
  competition?: string;
}

export const upcomingMatches: UpcomingMatch[] = [
  { id: 1, date: "2026-07-05 13:00:00", opponent: "Юнион Стар", home: false },
  { id: 2, date: "2026-07-12 13:00:00", opponent: "Стальные Волки", home: true },
  { id: 3, date: "2026-07-15 17:10:00", opponent: "Викинг СК", home: false, competition: "Кубок" },
];

// Разбирает дату вида "ГГГГ-ММ-ДД ЧЧ:ММ:СС" (тот же формат, что и в реальных
// данных Hattrick) на короткую дату "ДД.ММ" и время "ЧЧ:ММ" для компактного
// отображения в календаре матчей.
export function formatMatchDateTime(raw: string): { shortDate: string; time: string } {
  const [datePart, timePart] = raw.split(" ");
  const [, month, day] = (datePart ?? "").split("-");
  const time = (timePart ?? "").slice(0, 5);
  return { shortDate: day && month ? `${day}.${month}` : raw, time };
}

export interface FinanceLine {
  label: string;
  amount: number;
}

export const finance = {
  balance: 2_458_900,
  income: [
    { label: "Зрители", amount: 62_000 },
    { label: "Спонсоры", amount: 45_000 },
    { label: "Проданные игроки", amount: 58_000 },
    { label: "Комиссионные", amount: 4_200 },
    { label: "Разовый", amount: 6_400 },
  ] as FinanceLine[],
  expense: [
    { label: "Зарплата", amount: 96_000 },
    { label: "Содержание стадиона", amount: 21_500 },
    { label: "Персонал", amount: 18_300 },
    { label: "Затраты на молодёжь", amount: 12_000 },
  ] as FinanceLine[],
};

// Тренер — отдельная от остального персонала карточка на Обзоре
export type TacticalPreference = "attacking" | "defensive" | "neutral";

export const tacticalPreferenceLabel: Record<TacticalPreference, string> = {
  attacking: "Атакующий",
  defensive: "Защитный",
  neutral: "Нейтральный",
};

export const coach = {
  name: "Марат Ахметов",
  skillLevel: 14, // 0-20, как обычный навык — выводится через skillWord
  leadership: 5, // 0-7 — выводится через leadershipWord
  preference: "attacking" as TacticalPreference,
};

// Официальная словесная шкала Командного духа Hattrick — 11 уровней (1-11),
// от лучшего к худшему. В начале сезона дух сбрасывается к нейтральному
// значению "Равнодушны" и дальше меняется по ходу сезона в зависимости от
// результатов и лидерства тренера.
const teamSpiritWordsDesc = [
  "Рай на земле!",
  "На седьмом небе",
  "Счастливы",
  "Радостны",
  "Довольны",
  "Спокойны",
  "Равнодушны",
  "Раздражены",
  "Разгневаны",
  "В ярости",
  "Холодная война",
];

export function teamSpiritWord(level: number): string {
  const l = Math.max(1, Math.min(11, Math.round(level)));
  return teamSpiritWordsDesc[11 - l];
}

export const teamSpirit = 8; // "Радостны"

// Официальная словесная шкала Уверенности в себе Hattrick — 10 уровней (1-10)
const confidenceWordsDesc = [
  "Чрезмерная",
  "Излишняя",
  "Слегка завышенная",
  "Превосходная",
  "Высокая",
  "Средняя",
  "Низкая",
  "Ужасная",
  "Катастрофическая",
  "Отсутствует",
];

export function confidenceWord(level: number): string {
  const l = Math.max(1, Math.min(10, Math.round(level)));
  return confidenceWordsDesc[10 - l];
}

export const teamConfidence = 6; // "Средняя"

// Остальной штаб клуба — просто нанят/не нанят и уровень (0-20), если нанят
export type StaffRole =
  | "assistantCoach"
  | "medic"
  | "psychologist"
  | "fitnessCoach"
  | "financialDirector"
  | "tacticsCoach";

export const staffRoleLabel: Record<StaffRole, string> = {
  assistantCoach: "Помощник тренера",
  medic: "Медик",
  psychologist: "Спортивный психолог",
  fitnessCoach: "Тренер по физподготовке",
  financialDirector: "Финансовый директор",
  tacticsCoach: "Тренер по тактике",
};

export interface StaffMember {
  role: StaffRole;
  hired: boolean;
  level: number | null; // 0-20, null если не нанят
}

export const staff: StaffMember[] = [
  { role: "assistantCoach", hired: true, level: 9 },
  { role: "medic", hired: true, level: 12 },
  { role: "psychologist", hired: false, level: null },
  { role: "fitnessCoach", hired: true, level: 6 },
  { role: "financialDirector", hired: false, level: null },
  { role: "tacticsCoach", hired: false, level: null },
];

// Официальная словесная шкала настроения болельщиков Hattrick — 12 уровней
// (1-12), от худшего к лучшему.
const fanMoodWordsDesc = [
  "В ярости", // 1
  "Разгневаны", // 2
  "Рассержены", // 3
  "Раздражены", // 4
  "Разочарованы", // 5
  "Спокойны", // 6
  "Довольны", // 7
  "Радостны", // 8
  "Счастливы", // 9
  "Тают от восторга", // 10
  "Танцуют на улицах", // 11
  "Слагают о вас оды", // 12
];

export function fanMoodWord(level: number): string {
  const l = Math.max(1, Math.min(12, Math.round(level)));
  return fanMoodWordsDesc[l - 1];
}

// CHPP (economy.xml, поле SupportersPopularity) отдаёт настроение болельщиков
// по своей, более короткой шкале — 10 уровней (0-9), без "Разочарованы" и
// "Рассержены" из полной 12-уровневой шкалы выше. Переводит значение CHPP в
// соответствующий уровень полной шкалы (1-12), чтобы реальные данные
// показывались тем же словарём и той же цветовой раскраской, что и тестовые.
const chppPopularityToFullScale = [1, 2, 4, 6, 7, 8, 9, 10, 11, 12];

export function chppSupportersPopularityToFanMoodLevel(chppLevel: number): number {
  const l = Math.max(0, Math.min(9, Math.round(chppLevel)));
  return chppPopularityToFullScale[l];
}

export const fans = {
  mood: 7, // "Довольны"
  clubSize: 18_420,
  expectation: "Ждут попадания в тройку лидеров и путёвки в еврокубки по итогам сезона",
};

// Стадион — 4 категории мест
export interface StadiumSector {
  key: string;
  label: string;
  seats: number;
  incomePerSeat: number; // за домашний матч, крон
  upkeepPerSeat: number; // за неделю, крон
}

export const stadiumSectors: StadiumSector[] = [
  { key: "terraces", label: "Террасы", seats: 8_000, incomePerSeat: 6, upkeepPerSeat: 1.2 },
  { key: "basic", label: "Обычные места", seats: 8_500, incomePerSeat: 10, upkeepPerSeat: 2.0 },
  { key: "roofed", label: "Под крышей", seats: 5_000, incomePerSeat: 14, upkeepPerSeat: 2.8 },
  { key: "vip", label: "VIP-ложи", seats: 500, incomePerSeat: 60, upkeepPerSeat: 9.5 },
];

// Герой и Ноль недели — сравнение с прошлой неделей (форма/TSI), тестовые данные.
// prevForm/prevTsi заданы относительно текущих значений игрока, чтобы дельта
// была правдоподобной независимо от процедурно сгенерированных чисел в squad.ts.
export interface WeeklyHighlight {
  playerId: number;
  rating: number; // условный рейтинг матча, 0-10
  note: string;
  prevForm: number;
  prevTsi: number;
}

function playerForm(id: number): number {
  return squadPlayers.find((p) => p.id === id)?.form ?? 0;
}

function playerTsi(id: number): number {
  return squadPlayers.find((p) => p.id === id)?.tsi ?? 0;
}

export const heroOfWeek: WeeklyHighlight = {
  playerId: 10, // Егор Барсуков
  rating: 8.7,
  note: "Оформил дубль в победе над Драконом Сити",
  prevForm: Math.max(0, playerForm(10) - 2),
  prevTsi: Math.max(0, playerTsi(10) - 640),
};

export const zeroOfWeek: WeeklyHighlight = {
  playerId: 2, // Пётр Волков
  rating: 3.1,
  note: "Ошибся перед пропущенным голом от Атлетик Норд",
  prevForm: Math.min(8, playerForm(2) + 2),
  prevTsi: playerTsi(2) + 210,
};

// Рейтинг силы — сводный показатель силы команды (тестовые данные, в CHPP
// не передаётся напрямую, поэтому раздел всегда демонстрационный).
export const powerRatingHint =
  "Показывает текущую силу команды на основе рейтингов линий, тактики и специализаций игроков за последние 14 официальных матчей, обновляется по понедельникам.";

export const powerRating = {
  value: 5342,
  worldRank: 1_847,
};
