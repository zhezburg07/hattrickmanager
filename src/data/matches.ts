// "Официальный" — реальные матчи из CHPP, где нельзя достоверно отличить
// лигу от кубка (MatchType — контекстный ID турнира, не простая категория,
// см. src/lib/matches.ts) — только "0" точно значит товарищеский матч.
export type Competition = "Лига" | "Кубок" | "Товарищеский" | "Официальный";

// 7 стандартных тактик Hattrick
export type Tactic =
  | "normal"
  | "attacking"
  | "defensive"
  | "counterAttacks"
  | "pressing"
  | "attackWings"
  | "longShots";

export const tacticOrder: Tactic[] = [
  "normal",
  "attacking",
  "defensive",
  "counterAttacks",
  "pressing",
  "attackWings",
  "longShots",
];

export const tacticLabel: Record<Tactic, string> = {
  normal: "Обычная",
  attacking: "Атакующая",
  defensive: "Оборонительная",
  counterAttacks: "Контратаки",
  pressing: "Прессинг",
  attackWings: "Атака флангами",
  longShots: "Дальние удары",
};

// Короткая подсказка (суть + главный компромисс) для каждой тактики
export const tacticHint: Record<Tactic, string> = {
  normal: "Без явных акцентов — самый безопасный выбор без сильных плюсов и минусов.",
  attacking: "Больше атакующих действий ценой обороны — выше риск пропустить встречный гол.",
  defensive: "Надёжнее в обороне, но снижает остроту собственных атак.",
  counterAttacks:
    "Ставка на быстрые контратаки при обороне — сильна против давящего соперника, но зависит от скорости и паса флангов.",
  pressing: "Агрессивный отбор мяча по всему полю — больше перехватов, но выше усталость и риск травм/карточек.",
  attackWings: "Смещает атаку на края поля — эффективна при сильных крайних игроках, бесполезна без них.",
  longShots: "Ставка на удары издалека — работает только при высоком навыке дальних ударов у команды.",
};

export type TeamTalk = "normal" | "playItCool" | "matchOfTheSeason";

export const teamTalkOrder: TeamTalk[] = ["normal", "playItCool", "matchOfTheSeason"];

export const teamTalkLabel: Record<TeamTalk, string> = {
  normal: "Обычный",
  playItCool: "Играть вполсилы",
  matchOfTheSeason: "Матч сезона",
};

export interface SeasonMatch {
  id: number;
  round: number | null; // номер тура лиги; null — для кубковых/товарищеских игр
  competition: Competition;
  date: string;
  opponent: string;
  home: boolean;
  ourScore: number | null; // null — матч ещё не сыгран
  oppScore: number | null;
}

// Полный календарь сезона: 14 туров лиги (по разу дома и в гостях с каждым
// из 7 соперников по турнирной таблице) + пара кубковых/товарищеских игр.
// Даты и результаты первых/последних туров совпадают с сокращённой версией
// на Обзоре (recentMatches/upcomingMatches в data/dashboard.ts).
export const seasonMatches: SeasonMatch[] = [
  { id: 1, round: null, competition: "Товарищеский", date: "08.03.2026", opponent: "Спарта Юг", home: true, ourScore: 5, oppScore: 0 },
  { id: 2, round: 1, competition: "Лига", date: "27.04.2026", opponent: "Феникс Юнайтед", home: true, ourScore: 4, oppScore: 0 },
  { id: 3, round: 2, competition: "Лига", date: "04.05.2026", opponent: "Гранит СК", home: false, ourScore: 2, oppScore: 1 },
  { id: 4, round: 3, competition: "Лига", date: "11.05.2026", opponent: "Атлетик Норд", home: false, ourScore: 1, oppScore: 3 },
  { id: 5, round: 4, competition: "Лига", date: "18.05.2026", opponent: "Ред Фалькон", home: true, ourScore: 2, oppScore: 0 },
  { id: 6, round: 5, competition: "Лига", date: "25.05.2026", opponent: "Дракон Сити", home: false, ourScore: 1, oppScore: 1 },
  { id: 7, round: 6, competition: "Лига", date: "01.06.2026", opponent: "Юнион Стар", home: true, ourScore: 2, oppScore: 2 },
  { id: 8, round: 7, competition: "Лига", date: "08.06.2026", opponent: "Стальные Волки", home: false, ourScore: 3, oppScore: 2 },
  { id: 9, round: 8, competition: "Лига", date: "15.06.2026", opponent: "Атлетик Норд", home: true, ourScore: 0, oppScore: 1 },
  { id: 10, round: 9, competition: "Лига", date: "22.06.2026", opponent: "Ред Фалькон", home: false, ourScore: 2, oppScore: 2 },
  { id: 11, round: 10, competition: "Лига", date: "29.06.2026", opponent: "Дракон Сити", home: true, ourScore: 3, oppScore: 1 },
  { id: 12, round: 11, competition: "Лига", date: "06.07.2026", opponent: "Юнион Стар", home: false, ourScore: null, oppScore: null },
  { id: 13, round: 12, competition: "Лига", date: "13.07.2026", opponent: "Стальные Волки", home: true, ourScore: null, oppScore: null },
  { id: 14, round: null, competition: "Кубок", date: "20.07.2026", opponent: "Викинг СК", home: false, ourScore: null, oppScore: null },
  { id: 15, round: 13, competition: "Лига", date: "27.07.2026", opponent: "Феникс Юнайтед", home: false, ourScore: null, oppScore: null },
  { id: 16, round: 14, competition: "Лига", date: "03.08.2026", opponent: "Гранит СК", home: true, ourScore: null, oppScore: null },
];
