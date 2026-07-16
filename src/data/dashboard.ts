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

export type MatchOutcome = "win" | "draw" | "loss";
export type MatchResult = "win" | "draw" | "loss";

// Разбирает дату вида "ГГГГ-ММ-ДД ЧЧ:ММ:СС" (формат Hattrick, matches.xml,
// поле MatchDate) на короткую дату "ДД.ММ" и время "ЧЧ:ММ" для компактного
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
// соответствующий уровень полной шкалы (1-12).
const chppPopularityToFullScale = [1, 2, 4, 6, 7, 8, 9, 10, 11, 12];

export function chppSupportersPopularityToFanMoodLevel(chppLevel: number): number {
  const l = Math.max(0, Math.min(9, Math.round(chppLevel)));
  return chppPopularityToFullScale[l];
}

// Стадион — 4 категории мест. Число мест по категориям приходит из
// arenadetails.xml (реальное, см. src/components/dashboard/StadiumSection.tsx),
// но доход/содержание за место CHPP не сообщает — эти ставки остаются
// ориентировочными для всех клубов.
export interface StadiumSector {
  key: string;
  label: string;
  seats: number;
  incomePerSeat: number;
  upkeepPerSeat: number;
}

export const stadiumSectors: StadiumSector[] = [
  { key: "terraces", label: "Террасы", seats: 8_000, incomePerSeat: 6, upkeepPerSeat: 1.2 },
  { key: "basic", label: "Обычные места", seats: 8_500, incomePerSeat: 10, upkeepPerSeat: 2.0 },
  { key: "roofed", label: "Под крышей", seats: 5_000, incomePerSeat: 14, upkeepPerSeat: 2.8 },
  { key: "vip", label: "VIP-ложи", seats: 500, incomePerSeat: 60, upkeepPerSeat: 9.5 },
];

// Рейтинг силы — сводный показатель силы команды, реальное значение приходит
// из teamdetails.xml (см. src/app/dashboard/page.tsx) — это только пояснение,
// которое CHPP не присылает.
export const powerRatingHint =
  "Показывает текущую силу команды на основе рейтингов линий, тактики и специализаций игроков за последние 14 официальных матчей, обновляется по понедельникам.";

// "Последнее обновление" — раньше был фиксированный тестовый текст; личный
// кабинет всегда запрашивает у Hattrick свежие данные при каждом открытии
// страницы, так что честное значение — момент самого рендера.
export function currentTimestampLabel(): string {
  return new Date().toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
