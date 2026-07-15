export type PositionGroup = "GK" | "DEF" | "MID" | "FWD";
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
import { hattrickCountries, unknownCountry, resolveCountryByEnglishName, type Country } from "./hattrickCountries";

export type { Country };
export { unknownCountry, resolveCountryByEnglishName };
export const countries = hattrickCountries;
export type CountryCode = keyof typeof hattrickCountries;

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
  form: number; // 0-8, словесно (formWord)
  stamina: number; // 0-100%
  skills: SquadSkills;
  experience: number; // 1-8, словесно (levelWord)
  leadership: number; // 0-7, словесно (leadershipWord)
  // 1-8, словесно ("преданность клубу", levelWord). CHPP не отдаёт это поле
  // в players.xml — для реальных игроков остаётся undefined.
  loyalty?: number;
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

// Выносливость хранится как % (0-100) — переиспользуем ту же 9-уровневую
// словесную шкалу, что и у Формы, поделив диапазон на равные интервалы
export function staminaWord(percent: number): string {
  const p = Math.max(0, Math.min(100, percent));
  const idx = Math.min(8, Math.floor((100 - p) / 12.5));
  return formWordsDesc[idx];
}

// Выносливость числом по официальной шкале навыков 0-20 (см. skillWord) —
// используется на "Составе" вместо процентов, см. src/components/dashboard/SquadTable.tsx.
export function staminaToLevel(percent: number): number {
  const p = Math.max(0, Math.min(100, percent));
  return Math.round((p / 100) * 20);
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

// Вспомогательная возрастающая шкала (1-8) для Опыта и Преданности клубу,
// для которых Hattrick не задаёт отдельную официальную словесную шкалу
const levelWords = [
  "катастрофично",
  "слабо",
  "недостаточно",
  "сносно",
  "хорошо",
  "отлично",
  "волшебно",
  "божественно",
];

export function levelWord(level: number): string {
  return levelWords[Math.max(1, Math.min(8, Math.round(level))) - 1];
}

// Детерминированный генератор псевдослучайных чисел (mulberry32).
// Нужен вместо Math.random(), чтобы значения совпадали при рендере
// на сервере и при повторном рендере в браузере (иначе React ругается
// на несовпадение разметки).
function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(1907);
const randInt = (min: number, max: number) => Math.floor(min + rand() * (max - min + 1));

// Отдельный, независимый поток случайных чисел для недельной динамики TSI —
// не пересекается с общим `rand`, чтобы не сдвигать уже сгенерированные
// значения формы/скиллов/зарплаты при добавлении нового поля.
const weeklyRand = mulberry32(4242);
const weeklyRandInt = (min: number, max: number) => Math.floor(min + weeklyRand() * (max - min + 1));
const clampSkillLevel = (v: number) => Math.max(0, Math.min(20, Math.round(v)));
const clampFormLevel = (v: number) => Math.max(0, Math.min(8, Math.round(v)));
const clampLeadershipLevel = (v: number) => Math.max(0, Math.min(7, Math.round(v)));
const clampGenericLevel = (v: number) => Math.max(1, Math.min(8, Math.round(v)));

// Смещения скиллов (шкала 0-20) относительно общего уровня игрока, в зависимости
// от амплуа. Порядок: [goalkeeping, defending, midfield, winger, passing, scoring, setPieces]
const skillBias: Record<PositionGroup, [number, number, number, number, number, number, number]> = {
  GK: [5, 0, -4, -4, 0, -5, -2],
  DEF: [-5, 4, -2, -2, 0, -5, 0],
  MID: [-5, -2, 4, 0, 2, -2, 0],
  FWD: [-5, -5, -2, 2, -2, 5, 0],
};

function buildSkills(group: PositionGroup, level: number): SquadSkills {
  const [gk, def, mid, wing, pass, score, sp] = skillBias[group];
  return {
    goalkeeping: clampSkillLevel(level + gk + randInt(-2, 2)),
    defending: clampSkillLevel(level + def + randInt(-2, 2)),
    midfield: clampSkillLevel(level + mid + randInt(-2, 2)),
    winger: clampSkillLevel(level + wing + randInt(-2, 2)),
    passing: clampSkillLevel(level + pass + randInt(-2, 2)),
    scoring: clampSkillLevel(level + score + randInt(-2, 2)),
    setPieces: clampSkillLevel(level + sp + randInt(-2, 2)),
  };
}

interface RawPlayer {
  name: string;
  age: number;
  nationality: CountryCode;
  positionGroup: PositionGroup;
  status: PlayerStatus;
  level: number; // условный общий уровень игрока (0-20), задаёт базу для скиллов
}

const roster: RawPlayer[] = [
  // Стартовый состав (совпадает с игроками на схеме поля)
  { name: "Иван Соколов", age: 27, nationality: "RU", positionGroup: "GK", status: "starting", level: 13 },
  { name: "Пётр Волков", age: 24, nationality: "KZ", positionGroup: "DEF", status: "starting", level: 9 },
  { name: "Сергей Орлов", age: 29, nationality: "RU", positionGroup: "DEF", status: "starting", level: 13 },
  { name: "Андрей Медведев", age: 26, nationality: "KZ", positionGroup: "DEF", status: "starting", level: 11 },
  { name: "Дмитрий Лисицын", age: 23, nationality: "KZ", positionGroup: "DEF", status: "starting", level: 7 },
  { name: "Николай Ястребов", age: 25, nationality: "KZ", positionGroup: "MID", status: "starting", level: 9 },
  { name: "Максим Гусев", age: 28, nationality: "RU", positionGroup: "MID", status: "starting", level: 11 },
  { name: "Роман Соловьёв", age: 22, nationality: "UZ", positionGroup: "MID", status: "starting", level: 15 },
  { name: "Кирилл Воронов", age: 24, nationality: "KZ", positionGroup: "MID", status: "starting", level: 7 },
  { name: "Егор Барсуков", age: 26, nationality: "BR", positionGroup: "FWD", status: "starting", level: 15 },
  { name: "Артём Тигров", age: 30, nationality: "RS", positionGroup: "FWD", status: "starting", level: 11 },

  // Запас и молодёжь
  { name: "Владимир Ершов", age: 31, nationality: "KZ", positionGroup: "GK", status: "bench", level: 7 },
  { name: "Тимур Соболев", age: 19, nationality: "KZ", positionGroup: "GK", status: "bench", level: 4 },
  { name: "Алексей Крылов", age: 22, nationality: "KZ", positionGroup: "DEF", status: "bench", level: 7 },
  { name: "Виктор Голубев", age: 33, nationality: "ENG", positionGroup: "DEF", status: "bench", level: 9 },
  { name: "Станислав Жуков", age: 20, nationality: "KZ", positionGroup: "DEF", status: "bench", level: 4 },
  { name: "Игорь Беляков", age: 25, nationality: "KZ", positionGroup: "DEF", status: "injured", level: 9 },
  { name: "Олег Комаров", age: 27, nationality: "NG", positionGroup: "MID", status: "bench", level: 7 },
  { name: "Павел Фомин", age: 21, nationality: "KZ", positionGroup: "MID", status: "bench", level: 4 },
  { name: "Денис Абрамов", age: 32, nationality: "RU", positionGroup: "MID", status: "injured", level: 11 },
  { name: "Руслан Титов", age: 18, nationality: "KZ", positionGroup: "MID", status: "bench", level: 2 },
  { name: "Владислав Морозов", age: 23, nationality: "JP", positionGroup: "FWD", status: "bench", level: 7 },
  { name: "Григорий Павлов", age: 29, nationality: "TR", positionGroup: "FWD", status: "injured", level: 9 },
  { name: "Антон Быков", age: 18, nationality: "EG", positionGroup: "FWD", status: "bench", level: 4 },
];

export const squadPlayers: SquadPlayer[] = roster.map((r, index) => {
  const form = r.status === "injured" ? clampFormLevel(randInt(0, 3)) : clampFormLevel(randInt(1, 8));
  const stamina = r.status === "injured" ? randInt(15, 45) : randInt(55, 96);
  const skills = buildSkills(r.positionGroup, r.level);

  // Опыт растёт с возрастом, лидерство и преданность клубу — более случайны,
  // чтобы состав выглядел живым, а не однородным
  const experience = clampGenericLevel(Math.round((r.age - 16) / 2.2) + randInt(-1, 1));
  const leadership = clampLeadershipLevel(randInt(0, 5) + Math.round((r.age - 20) / 10));
  const loyalty = clampGenericLevel(randInt(1, 8));

  const skillSum =
    skills.goalkeeping +
    skills.defending +
    skills.midfield +
    skills.winger +
    skills.passing +
    skills.scoring +
    skills.setPieces;
  const avgSkill = skillSum / 7;
  const ageFactor = 1 - Math.abs(r.age - 26) * 0.02;
  const tsi = Math.max(200, Math.round(avgSkill * avgSkill * 130 * ageFactor + randInt(-500, 500)));

  const salary = Math.max(9000, Math.round((r.level * 16000 + r.age * 900 + randInt(-6000, 6000)) / 1000) * 1000);

  // Недельная динамика TSI: большинство игроков колеблются несильно,
  // но разброс достаточно широкий, чтобы естественно выделялись явные
  // лидеры прогресса и регресса за неделю
  const weeklyTsiDelta = weeklyRandInt(-1200, 1700);
  const prevTsi = Math.max(150, tsi - weeklyTsiDelta);

  // Прошлые значения скиллов/опыта/формы/выносливости — в большинстве недель
  // без изменений (тренировка обычно двигает 0-1 навык за раз), изредка
  // ±1 — для наглядной, но не аляповатой подсветки роста/падения.
  const prevSkillValue = (current: number) => {
    const roll = weeklyRand();
    if (roll < 0.7) return current;
    return clampSkillLevel(roll < 0.85 ? current - 1 : current + 1);
  };
  const prevSkills: SquadSkills = {
    goalkeeping: prevSkillValue(skills.goalkeeping),
    defending: prevSkillValue(skills.defending),
    midfield: prevSkillValue(skills.midfield),
    winger: prevSkillValue(skills.winger),
    passing: prevSkillValue(skills.passing),
    scoring: prevSkillValue(skills.scoring),
    setPieces: prevSkillValue(skills.setPieces),
  };
  const prevExperience =
    weeklyRand() < 0.85 ? experience : clampGenericLevel(experience - 1); // опыт почти никогда не падает
  const prevForm = weeklyRand() < 0.6 ? form : clampFormLevel(weeklyRand() < 0.5 ? form - 1 : form + 1);
  const prevStamina = Math.max(0, Math.min(100, stamina + weeklyRandInt(-6, 6)));

  const ageDays = randInt(0, 364);

  // Игр/голов за клуб — чем старше игрок, тем больше матчей он мог сыграть;
  // доля голов на игру зависит от амплуа (вратари почти не забивают)
  const gamesPlayed = randInt(3, 20) + experience * randInt(4, 9);
  const goalRatioRange: Record<PositionGroup, [number, number]> = {
    GK: [0, 0.02],
    DEF: [0.02, 0.15],
    MID: [0.1, 0.45],
    FWD: [0.3, 0.85],
  };
  const [goalRatioMin, goalRatioMax] = goalRatioRange[r.positionGroup];
  const goalsScored = Math.round(gamesPlayed * (goalRatioMin + rand() * (goalRatioMax - goalRatioMin)));

  return {
    id: index + 1,
    squadNumber: index + 1,
    name: r.name,
    age: r.age,
    ageDays,
    nationality: countries[r.nationality],
    positionGroup: r.positionGroup,
    form,
    stamina,
    skills,
    experience,
    leadership,
    loyalty,
    tsi,
    prev: {
      skills: prevSkills,
      experience: prevExperience,
      form: prevForm,
      stamina: prevStamina,
      tsi: prevTsi,
    },
    salary,
    status: r.status,
    gamesPlayed,
    goalsScored,
  };
});

// Демо-иллюстрация "тренер команды — один из своих игроков" (см.
// src/lib/teamDetails.ts, trainerPlayerId): в тестовых данных нет отдельного
// связанного с составом тренера (coach в src/data/dashboard.ts — отдельный
// персонаж не из этого списка), поэтому для примера в SquadTable берём
// первого игрока состава.
export const demoTrainerPlayerId = squadPlayers[0]?.id;
