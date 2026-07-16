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
