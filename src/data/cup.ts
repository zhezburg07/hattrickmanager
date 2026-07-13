// === Правила кубковой системы Hattrick (контекст для тестовых данных) ===
// Команды 1-6 дивизиона играют в Национальном Кубке; команды 7+ дивизиона —
// в Кубке Лиги (та же каскадная структура вылета, но призовые ниже).
// При вылете из Национального Кубка/Кубка Лиги команда попадает в один из
// трёх Кубков Вызова, в зависимости от раунда вылета:
//   раунды 1 и 6 → Изумрудный Кубок Вызова
//   раунды 2 и 5 → Рубиновый Кубок Вызова
//   раунды 3 и 4 → Сапфировый Кубок Вызова
// Вылет в 1-м раунде Изумрудного или Рубинового Кубка Вызова → Кубок Надежды
// (у Сапфирового каскада дальше нет). Каждой команде гарантировано не менее
// 3 кубковых матчей за сезон.
//
// Наш клуб (FC Заря) играет в дивизионах 1-6, поэтому ниже — путь по
// Национальному Кубку. Тестовый каскад сезона: вылет в раунде 2 →
// Рубиновый Кубок Вызова → вылет в 1-м раунде → Кубок Надежды (сейчас в игре).

export type CupKind = "national" | "leagueCup" | "emerald" | "ruby" | "sapphire" | "hope";
export type CupOverallStatus = "champion" | "active" | "eliminated";
export type CupRoundStatus = "won" | "lost" | "current" | "upcoming";

export interface CupRound {
  round: string;
  opponent?: string;
  home?: boolean;
  date?: string;
  ourScore?: number;
  oppScore?: number;
  status: CupRoundStatus;
}

export interface CupPrizeRow {
  place: string;
  prize: number;
}

export interface CupMatchSummary {
  round: string;
  opponent: string;
  ourScore: number;
  oppScore: number;
}

export interface CupEntry {
  kind: CupKind;
  name: string;
  icon: string; // эмодзи-значок (кубок/щит)
  iconAccent?: string; // цвет узора щита — только у трёх Кубков Вызова
  status: CupOverallStatus;
  statusLabel: string; // "Чемпион" / "В игре (раунд ...)" / "Выбыли в ..."
  lastMatch: CupMatchSummary; // краткий результат последнего матча в этом кубке
  // Путь по сетке — у завершённых кубков (eliminated/champion) содержит
  // только сыгранные раунды, вплоть до раунда вылета/финала, без пустых
  // будущих раундов; у активного — сыгранные плюс ближайший/будущие раунды.
  path?: CupRound[];
  prizes?: CupPrizeRow[]; // призовые конкретно этого кубка (нет — у Кубка Надежды)
}

// Призовые Национального Кубка
export const nationalCupPrizes: CupPrizeRow[] = [
  { place: "Победитель", prize: 150_000_000 },
  { place: "Финалист", prize: 100_000_000 },
  { place: "Полуфинал (1/2)", prize: 75_000_000 },
  { place: "Четвертьфинал (1/4)", prize: 50_000_000 },
  { place: "1/8 финала", prize: 25_000_000 },
  { place: "1/16 финала", prize: 20_000_000 },
  { place: "1/32 финала", prize: 18_000_000 },
  { place: "1/64 финала", prize: 16_000_000 },
  { place: "1/128 финала", prize: 14_000_000 },
  { place: "1/256 финала", prize: 12_000_000 },
];

// Призовые Кубка Вызова (Изумрудный/Рубиновый/Сапфировый — одинаковые)
export const challengeCupPrizes: CupPrizeRow[] = [
  { place: "Победитель", prize: 30_000_000 },
  { place: "Финалист", prize: 15_000_000 },
  { place: "Полуфинал (1/2)", prize: 10_000_000 },
  { place: "Четвертьфинал (1/4)", prize: 5_000_000 },
  { place: "1/8 финала", prize: 2_500_000 },
];

// Кубок Лиги (дивизионы 7+) — та же сетка призовых, что и Кубок Вызова
export const leagueCupPrizes: CupPrizeRow[] = challengeCupPrizes;

// Список кубков, в которых клуб участвовал в этом сезоне — сверху вниз в
// порядке участия (отражает каскад: Национальный → Рубиновый Кубок Вызова
// → Кубок Надежды).
export const cupEntries: CupEntry[] = [
  {
    kind: "national",
    name: "Национальный Кубок",
    icon: "🏆",
    status: "eliminated",
    statusLabel: "Выбыли в раунде 2",
    lastMatch: { round: "Раунд 2", opponent: "Атлант Актобе", ourScore: 1, oppScore: 3 },
    path: [
      { round: "Раунд 1", opponent: "Дракон Сити", home: true, date: "01.03.2026", ourScore: 4, oppScore: 1, status: "won" },
      { round: "Раунд 2", opponent: "Атлант Актобе", home: false, date: "22.03.2026", ourScore: 1, oppScore: 3, status: "lost" },
    ],
    prizes: nationalCupPrizes,
  },
  {
    kind: "ruby",
    name: "Рубиновый Кубок Вызова",
    icon: "🛡️",
    iconAccent: "#c0405a",
    status: "eliminated",
    statusLabel: "Выбыли в 1-м раунде",
    lastMatch: { round: "Раунд 1", opponent: "Кызылорда СК", ourScore: 0, oppScore: 2 },
    path: [
      { round: "Раунд 1", opponent: "Кызылорда СК", home: false, date: "05.04.2026", ourScore: 0, oppScore: 2, status: "lost" },
    ],
    prizes: challengeCupPrizes,
  },
  {
    kind: "hope",
    name: "Кубок Надежды",
    icon: "🛡️",
    status: "active",
    statusLabel: "В игре (1/4 финала)",
    lastMatch: { round: "1/8 финала", opponent: "Жетысу", ourScore: 3, oppScore: 1 },
    // Ближайший матч (1/4, Викинг СК, 20.07.2026) совпадает с записью в
    // data/dashboard.ts (upcomingMatches), чтобы календарь оставался согласованным.
    path: [
      { round: "1/16", opponent: "Восток Иртыш", home: true, date: "15.05.2026", ourScore: 4, oppScore: 0, status: "won" },
      { round: "1/8", opponent: "Жетысу", home: false, date: "05.06.2026", ourScore: 3, oppScore: 1, status: "won" },
      { round: "1/4", opponent: "Викинг СК", home: false, date: "20.07.2026", status: "current" },
      { round: "1/2", status: "upcoming" },
      { round: "Финал", status: "upcoming" },
    ],
  },
];
