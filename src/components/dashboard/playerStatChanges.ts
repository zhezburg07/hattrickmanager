// Сравнение "было → стало" для показателей игрока между двумя
// синхронизациями. Тестовые данные уже знают "прошлое" значение (player.prev,
// см. src/data/squad.ts); для реальных данных прошлый снимок хранится в базе
// данных по Hattrick UserID (см. src/lib/playerHistoryDb.ts) и приходит с
// сервера как проп — раньше (до перехода на базу) он собирался прямо в
// браузере через localStorage, из-за чего не переживал смену устройства и
// не был привязан к конкретному аккаунту.
export type DiffDirection = "up" | "down" | "none";

export function diffDirection(curr: number, prev: number | undefined): DiffDirection {
  if (prev === undefined || prev === curr) return "none";
  return curr > prev ? "up" : "down";
}

// Текст всплывающей подсказки для изменившегося значения, например
// "Пас: 8 → 9 (+1)" или "TSI: 14 200 → 13 850 (−350)". Возвращает undefined,
// если сравнивать не с чем или значение не изменилось — тогда подсказку
// показывать не нужно.
export function diffTitle(
  label: string,
  prev: number | undefined,
  curr: number,
  format: (n: number) => string = (n) => String(n),
): string | undefined {
  if (prev === undefined || prev === curr) return undefined;
  const delta = curr - prev;
  const sign = delta > 0 ? "+" : "−";
  return `${label}: ${format(prev)} → ${format(curr)} (${sign}${format(Math.abs(delta))})`;
}
