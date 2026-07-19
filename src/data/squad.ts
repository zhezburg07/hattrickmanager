export type PositionGroup = "GK" | "DEF" | "MID" | "FWD";

// Официальные специализации игроков Hattrick (поле Specialty в players.xml,
// целое число 0-8 — 0 значит "нет специализации", 7 в нумерации Hattrick не
// используется). Не проверено на живом ответе — если поле называется иначе,
// специализация останется undefined и значок просто не покажется.
export type PlayerSpecialty = "technical" | "quick" | "powerful" | "unpredictable" | "head" | "resilient" | "support";

export const specialtyLabel: Record<PlayerSpecialty, string> = {
  technical: "Техничный",
  quick: "Быстрый",
  powerful: "Мощный",
  unpredictable: "Непредсказуемый",
  head: "Игра головой",
  resilient: "Крепкое здоровье",
  support: "Командный игрок",
};
// "squad" — игрок реально в составе, но CHPP не даёт понятия "в основе/в
// запасе" на уровне ростера (это тактическое решение по конкретному матчу,
// см. src/lib/players.ts) — используется для реальных данных вместо
// starting/bench, когда мы не можем их различить.
export type PlayerStatus = "starting" | "bench" | "injured" | "squad";

// Национальности игроков — полный справочник всех 156 стран Hattrick вынесен
// в отдельный файл (src/data/hattrickCountries.ts), здесь только реэкспорт
// под привычными именами. Национальность хранится в SquadPlayer как готовый
// объект {name, isoCode}, а не как код для последующего поиска в словаре —
// это важно для реальных данных: "домашняя" страна команды узнаётся во время
// запроса к CHPP (см. src/lib/squadPlayers.ts) и не может жить в общем
// модуле как глобальное состояние (на сервере с несколькими пользователями
// это привело бы к тому, что один пользователь видел бы страну другого).
import { unknownCountry, resolveCountryByEnglishName, type Country } from "./hattrickCountries";

export type { Country };
export { unknownCountry, resolveCountryByEnglishName };

// 7 базовых скиллов игрока, как в Hattrick. Хранятся числом 0-20 (официальная
// шкала Hattrick), а отображаются словесной шкалой (skillWord).
export interface SquadSkills {
  goalkeeping: number; // Вратарь
  defending: number; // Защита
  midfield: number; // Полузащита
  winger: number; // Фланг
  passing: number; // Пас
  scoring: number; // Нападение
  setPieces: number; // Стандарты
}

// Снимок показателей игрока, которые могут меняться от тренировки к
// тренировке — используется для сравнения "было → стало" между двумя
// синхронизациями (см. usePlayerStatChanges в SquadTable.tsx).
export interface PlayerStatSnapshot {
  skills: SquadSkills;
  experience: number;
  form: number;
  stamina: number;
  tsi: number;
}

export interface SquadPlayer {
  id: number;
  squadNumber: number; // игровой номер, 1-24
  name: string;
  age: number;
  ageDays: number; // 0-364 — дни сверх полных лет, для формата "27 лет и 79 дней"
  nationality: Country;
  positionGroup: PositionGroup;
  form: number; // 0-8, официальная короткая шкала Формы (formWord)
  stamina: number; // 0-100%, отображается числом 0-8 той же шкалы, что Форма (staminaToLevel)
  skills: SquadSkills;
  experience: number; // 0-20, официальная шкала навыков (skillWord)
  leadership: number; // 0-7, словесно (leadershipWord)
  // 0-20, официальная шкала навыков (skillWord). CHPP отдаёт это поле не во
  // всех ответах — для части реальных игроков может остаться undefined.
  loyalty?: number;
  // Воспитанник родного клуба ("сердце" в интерфейсе Hattrick) — не путать с
  // loyalty (числом): это отдельный булевый признак. Точное имя поля в
  // реальном players.xml не проверялось на живом ответе — если Hattrick
  // называет его иначе, признак просто останется undefined и сердце не
  // покажется (см. src/lib/squadPlayers.ts).
  isClubProduct?: boolean;
  // Рейтинг за последний сыгранный матч (0-10, звёзды) — для реальных данных
  // берётся из matchdetails.xml последнего сыгранного матча (см.
  // src/lib/lastMatchRating.ts); undefined, если игрок не выходил на поле в
  // этом матче или запрос не удался.
  lastMatchRating?: number;
  // Лучший рейтинг (0-10) среди последних 3 сыгранных матчей игрока — см.
  // src/lib/lastMatchRating.ts. undefined, если игрок не выходил на поле ни
  // в одном из этих матчей или данные не удалось получить.
  recentBestRating?: number;
  // Специализация (см. PlayerSpecialty) — undefined, если её нет или поле
  // не удалось прочитать.
  specialty?: PlayerSpecialty;
  // Сколько недель осталось до выздоровления — то же число, что задаёт
  // status: "injured" (InjuryLevel > 0 в players.xml), только сохранено
  // отдельно, чтобы показать значок нужной серьёзности (см.
  // src/lib/squadPlayers.ts). undefined, если игрок не травмирован.
  injuryWeeksRemaining?: number;
  // Жёлтые карточки (предупреждения) в текущем сезоне — имя поля CHPP не
  // проверено на живом ответе, см. src/lib/squadPlayers.ts.
  yellowCards?: number;
  // Дисквалификация/красная карточка — то же самое, имя поля не проверено.
  isSuspended?: boolean;
  tsi: number; // Team Skill Index
  // Значения скиллов/опыта/формы/выносливости/TSI на момент прошлой
  // синхронизации — для подсветки роста/падения. В тестовых данных считается
  // сразу (детерминированная случайная динамика); для реальных данных
  // заполняется на клиенте из localStorage при первом рендере (см.
  // usePlayerStatChanges), потому что у сервера нет истории между запросами.
  prev?: PlayerStatSnapshot;
  salary: number; // тенге / неделю
  status: PlayerStatus;
  // CHPP не отдаёт число сыгранных за клуб матчей в players.xml — для
  // реальных игроков остаётся undefined (голы за клуб при этом доступны).
  gamesPlayed?: number;
  goalsScored: number; // голов за клуб
}

export const positionGroupLabel: Record<PositionGroup, string> = {
  GK: "Вратарь",
  DEF: "Защита",
  MID: "Полузащита",
  FWD: "Нападение",
};

export const statusLabel: Record<PlayerStatus, string> = {
  starting: "В основе",
  bench: "В запасе",
  injured: "Травмирован",
  squad: "В составе",
};

export const positionGroupShort: Record<PositionGroup, string> = {
  GK: "ВРТ",
  DEF: "ЗАЩ",
  MID: "ПОЛ",
  FWD: "НАП",
};

// Акцентный цвет амплуа — общий для "Состава" и "Расстановки": вратарь
// зелёный, защита оранжевая, полузащита жёлтая, нападение красное (тот же
// принцип, что и цветовая кодировка карточек на поле, только на 4 укрупнённые
// группы вместо разбивки по флангу/центру).
export const positionGroupAccentColor: Record<PositionGroup, string> = {
  GK: "#4caf6f",
  DEF: "#e0913f",
  MID: "#e6c94a",
  FWD: "#d9564a",
};

// Обозначения амплуа для "Состава" (по запросу — латинские сокращения
// вместо русских слов, цвет остаётся тем же 4-значным positionGroupAccentColor
// выше, никакой новой группы/цвета не вводится). Для "MID" отдельно решаем
// между "CM" (центральный полузащитник) и "W" (фланговый) по тому, какой из
// навыков у ИМЕННО ЭТОГО игрока выше — тот же сигнал, что уже используется в
// inferPositionGroup (src/lib/squadPlayers.ts) при отнесении игрока в группу
// "MID" (усреднение midfield+winger+passing) — здесь используем его же,
// чтобы просто уточнить подпись внутри уже посчитанной группы, не меняя саму
// группу/цвет/сортировку по 4 амплуа.
export function positionAbbrev(group: PositionGroup, skills: SquadSkills): string {
  if (group === "GK") return "GK";
  if (group === "DEF") return "CD";
  if (group === "FWD") return "ST";
  const centralScore = (skills.midfield + skills.passing) / 2;
  return skills.winger > centralScore ? "W" : "CM";
}

// Короткий код игрока для компактного маркера (на поле и в перетаскивании)
export function playerBadgeCode(player: Pick<SquadPlayer, "name" | "positionGroup">): string {
  const short = player.name.split(" ")[1]?.slice(0, 3).toUpperCase();
  return short || positionGroupShort[player.positionGroup];
}

export const skillLabel: Record<keyof SquadSkills, string> = {
  goalkeeping: "Вратарь",
  defending: "Защита",
  midfield: "Полузащита",
  winger: "Фланг",
  passing: "Пас",
  scoring: "Нападение",
  setPieces: "Стандарты",
};

// Официальная словесная шкала навыков Hattrick, 21 уровень (0-20), от лучшего к худшему
const skillWordsDesc = [
  "божественно",
  "легендарно",
  "волшебно",
  "сказочно",
  "запредельно",
  "колоссально",
  "сверхъестественно",
  "мирового класса",
  "потрясающе",
  "блестяще",
  "восхитительно",
  "превосходно",
  "отлично",
  "хорошо",
  "сносно",
  "недостаточно",
  "слабо",
  "плохо",
  "ужасно",
  "катастрофично",
  "отсутствует",
];

export function skillWord(level: number): string {
  const l = Math.max(0, Math.min(20, Math.round(level)));
  return skillWordsDesc[20 - l];
}

// То же самое, но с числовым эквивалентом в скобках, например "хорошо (7)" —
// используется там, где полезно сразу видеть условную шкалу Hattrick 0-20
export function skillWordWithLevel(level: number): string {
  const l = Math.max(0, Math.min(20, Math.round(level)));
  return `${skillWordsDesc[20 - l]} (${l})`;
}

// Шкала Формы, 9 уровней (0-8), от лучшего к худшему
const formWordsDesc = [
  "отлично",
  "хорошо",
  "сносно",
  "недостаточно",
  "слабо",
  "плохо",
  "ужасно",
  "катастрофично",
  "отсутствует",
];

export function formWord(level: number): string {
  const l = Math.max(0, Math.min(8, Math.round(level)));
  return formWordsDesc[8 - l];
}

// Выносливость числом по той же короткой шкале (0-8), что и Форма (см.
// formWord) — используется вместо процентов в таблицах "Состав" и
// "Расстановка".
export function staminaToLevel(percent: number): number {
  const p = Math.max(0, Math.min(100, percent));
  return Math.round((p / 100) * 8);
}

// Шкала Лидерства, 8 уровней (0-7), от лучшего к худшему
const leadershipWordsDesc = [
  "хорошо",
  "сносно",
  "недостаточно",
  "слабо",
  "плохо",
  "ужасно",
  "катастрофично",
  "отсутствует",
];

export function leadershipWord(level: number): string {
  const l = Math.max(0, Math.min(7, Math.round(level)));
  return leadershipWordsDesc[7 - l];
}

// Главный навык амплуа — тот, что сильнее всего определяет рейтинг игрока
// на его естественной позиции (та же логика, что и раньше использовалась
// в PlayerDetailModal для иллюстративного рейтинга).
const mainSkillByGroup: Record<PositionGroup, keyof SquadSkills> = {
  GK: "goalkeeping",
  DEF: "defending",
  MID: "midfield",
  FWD: "scoring",
};

// "Потенциал" — сколько звёзд (0-10, та же шкала, что у Рейтинга последнего
// матча) игрок способен набрать в матче при текущем состоянии навыков и
// формы, если сыграет на своей естественной позиции в свою силу. Hattrick
// не отдаёт такое значение напрямую ни в одном файле CHPP (в игре это
// вообще скрытая величина, доступная только через отчёты скаута) — это наша
// собственная формула, посчитанная из уже реальных данных игрока (навыки и
// форма приходят из players.xml), а не выдуманное число: главный навык
// амплуа задаёт основу (0-8.5), текущая форма добавляет до 1.5 звезды
// сверху при отличной форме.
export function estimatePotentialRating(player: Pick<SquadPlayer, "skills" | "form" | "positionGroup">): number {
  const mainSkill = player.skills[mainSkillByGroup[player.positionGroup]];
  const base = (mainSkill / 20) * 8.5;
  const formBonus = (player.form / 8) * 1.5;
  return Math.max(0, Math.min(10, base + formBonus));
}
