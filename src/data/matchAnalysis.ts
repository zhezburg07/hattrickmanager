import { squadPlayers } from "./squad";
import { stadiumSectors } from "./dashboard";

// Любой сыгранный матч календаря сезона (data/matches.ts, SeasonMatch с уже
// известным счётом) можно передать сюда для полного разбора — отдельного
// куратора списка прошедших игр больше не требуется.
export interface AnalyzableMatch {
  id: number;
  date: string;
  opponent: string;
  home: boolean;
  ourScore: number;
  oppScore: number;
}

// ---- Детерминированный псевдослучайный хэш (без стейта) — чтобы одни и те же
// тестовые данные матча не "прыгали" между рендерами сервера и клиента ----
function seed(matchId: number, salt: number): number {
  let h = (matchId * 2654435761 + salt * 40503) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 2246822519);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

function seedInt(matchId: number, salt: number, min: number, max: number): number {
  return Math.floor(min + seed(matchId, salt) * (max - min + 1));
}

export interface RatedPlayer {
  id: string;
  name: string;
  positionLabel: string;
  x: number;
  y: number;
  rating: number;
}

// Наш стартовый состав в формации 4-4-2 — те же 11 игроков и позиции, что и
// расстановка по умолчанию на вкладке "Расстановка"
const ownFormation: { playerId: number; positionLabel: string; x: number; y: number }[] = [
  { playerId: 1, positionLabel: "ВР", x: 8, y: 50 },
  { playerId: 2, positionLabel: "ЛЗ", x: 20, y: 15 },
  { playerId: 3, positionLabel: "ЦЗ", x: 20, y: 38 },
  { playerId: 4, positionLabel: "ЦЗ", x: 20, y: 62 },
  { playerId: 5, positionLabel: "ПЗ", x: 20, y: 85 },
  { playerId: 6, positionLabel: "ЛП", x: 35, y: 15 },
  { playerId: 7, positionLabel: "ЦП", x: 35, y: 38 },
  { playerId: 8, positionLabel: "ЦП", x: 35, y: 62 },
  { playerId: 9, positionLabel: "ПП", x: 35, y: 85 },
  { playerId: 10, positionLabel: "Н", x: 46, y: 35 },
  { playerId: 11, positionLabel: "Н", x: 46, y: 65 },
];

const opponentPositionLabels = ["ВР", "ЛЗ", "ЦЗ", "ЦЗ", "ПЗ", "ЛП", "ЦП", "ЦП", "ПП", "Н", "Н"];

const firstNames = ["Марат", "Ержан", "Данияр", "Асхат", "Бекзат", "Нурлан", "Тимур", "Аскар", "Санжар", "Руслан", "Дамир"];
const lastInitials = ["А.", "Б.", "Ж.", "К.", "О.", "Т.", "Д.", "С.", "Н.", "У.", "Е."];

const playersById = new Map(squadPlayers.map((p) => [p.id, p]));

function resultFactor(our: number, opp: number): number {
  if (our > opp) return 1.2;
  if (our === opp) return 0.1;
  return -0.9;
}

function makeRating(matchId: number, salt: number, factor: number): number {
  const r = 5.3 + factor + (seed(matchId, salt) - 0.5) * 4.4;
  return Math.max(2, Math.min(9.9, Math.round(r * 10) / 10));
}

function buildOwnRatings(match: AnalyzableMatch): RatedPlayer[] {
  const factor = resultFactor(match.ourScore, match.oppScore);
  return ownFormation.map((slot, i) => {
    const player = playersById.get(slot.playerId);
    return {
      id: `own-${slot.playerId}`,
      name: player ? player.name : `Игрок ${i + 1}`,
      positionLabel: slot.positionLabel,
      x: slot.x,
      y: slot.y,
      rating: makeRating(match.id, 10 + i, factor),
    };
  });
}

function buildOppRatings(match: AnalyzableMatch): RatedPlayer[] {
  const factor = resultFactor(match.oppScore, match.ourScore);
  return ownFormation.map((slot, i) => {
    const first = firstNames[seedInt(match.id, 200 + i, 0, firstNames.length - 1)];
    const last = lastInitials[seedInt(match.id, 300 + i, 0, lastInitials.length - 1)];
    return {
      id: `opp-${i}`,
      name: `${first} ${last}`,
      positionLabel: opponentPositionLabels[i],
      x: 100 - slot.x,
      y: slot.y,
      rating: makeRating(match.id, 40 + i, factor),
    };
  });
}

export interface ZoneComparison {
  key: string;
  label: string;
  ownShare: number;
  oppShare: number;
  ownLevel: number;
  oppLevel: number;
}

const zoneDefs = [
  { key: "midfield", label: "Полузащита" },
  { key: "attackLeft", label: "Атака слева" },
  { key: "attackCenter", label: "Атака по центру" },
  { key: "attackRight", label: "Атака справа" },
  { key: "defenseLeft", label: "Защита слева" },
  { key: "defenseCenter", label: "Защита по центру" },
  { key: "defenseRight", label: "Защита справа" },
];

function buildZones(match: AnalyzableMatch): ZoneComparison[] {
  const factor = resultFactor(match.ourScore, match.oppScore);
  return zoneDefs.map((z, i) => {
    const jitter = (seed(match.id, 500 + i) - 0.5) * 24;
    const ownShare = Math.max(22, Math.min(78, Math.round(50 + factor * 9 + jitter)));
    const oppShare = 100 - ownShare;
    return {
      key: z.key,
      label: z.label,
      ownShare,
      oppShare,
      ownLevel: Math.round((ownShare / 100) * 20),
      oppLevel: Math.round((oppShare / 100) * 20),
    };
  });
}

export type TimelineEventType = "goalOwn" | "goalOpp" | "chance" | "yellowOwn" | "yellowOpp";

export interface TimelineEvent {
  minute: number;
  type: TimelineEventType;
  label: string;
}

export const eventIcon: Record<TimelineEventType, string> = {
  goalOwn: "⚽",
  goalOpp: "⚽",
  chance: "⚠",
  yellowOwn: "🟨",
  yellowOpp: "🟨",
};

function buildTimeline(match: AnalyzableMatch): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const usedMinutes = new Set<number>();

  function pickMinute(salt: number): number {
    let m = seedInt(match.id, salt, 3, 88);
    let attempt = 0;
    while (usedMinutes.has(m) && attempt < 10) {
      m = (m + 7) % 86 + 3;
      attempt += 1;
    }
    usedMinutes.add(m);
    return m;
  }

  const ownScorers = squadPlayers.filter((p) => p.positionGroup === "FWD" || p.positionGroup === "MID");

  for (let i = 0; i < match.ourScore; i += 1) {
    const scorer = ownScorers[seedInt(match.id, 600 + i, 0, ownScorers.length - 1)];
    events.push({ minute: pickMinute(600 + i * 3), type: "goalOwn", label: `Гол — ${scorer.name}` });
  }
  for (let i = 0; i < match.oppScore; i += 1) {
    const first = firstNames[seedInt(match.id, 650 + i, 0, firstNames.length - 1)];
    const last = lastInitials[seedInt(match.id, 660 + i, 0, lastInitials.length - 1)];
    events.push({ minute: pickMinute(650 + i * 3), type: "goalOpp", label: `Гол — ${first} ${last} (${match.opponent})` });
  }

  const chanceCount = seedInt(match.id, 700, 1, 2);
  for (let i = 0; i < chanceCount; i += 1) {
    events.push({ minute: pickMinute(700 + i * 5), type: "chance", label: "Опасный момент" });
  }

  const yellowCount = seedInt(match.id, 720, 0, 2);
  for (let i = 0; i < yellowCount; i += 1) {
    const own = seed(match.id, 730 + i) > 0.5;
    events.push({
      minute: pickMinute(730 + i * 5),
      type: own ? "yellowOwn" : "yellowOpp",
      label: own ? "Жёлтая карточка — наш игрок" : `Жёлтая карточка — ${match.opponent}`,
    });
  }

  return events.sort((a, b) => a.minute - b.minute);
}

export interface AttendanceRow {
  key: string;
  label: string;
  seats: number;
  ticketsSold: number;
  revenue: number;
}

function buildAttendance(match: AnalyzableMatch): { rows: AttendanceRow[]; total: number } {
  const rows = stadiumSectors.map((sector, i) => {
    const rate = 0.5 + seed(match.id, 800 + i) * 0.45;
    const ticketsSold = Math.round(sector.seats * rate);
    const revenue = Math.round(ticketsSold * sector.incomePerSeat);
    return { key: sector.key, label: sector.label, seats: sector.seats, ticketsSold, revenue };
  });
  const total = rows.reduce((sum, r) => sum + r.revenue, 0);
  return { rows, total };
}

export interface MatchAnalysis {
  match: AnalyzableMatch;
  ownRatings: RatedPlayer[];
  oppRatings: RatedPlayer[];
  zones: ZoneComparison[];
  timeline: TimelineEvent[];
  attendance: AttendanceRow[];
  totalAttendanceRevenue: number;
}

export function getMatchAnalysis(match: AnalyzableMatch): MatchAnalysis {
  const { rows, total } = buildAttendance(match);
  return {
    match,
    ownRatings: buildOwnRatings(match),
    oppRatings: buildOppRatings(match),
    zones: buildZones(match),
    timeline: buildTimeline(match),
    attendance: rows,
    totalAttendanceRevenue: total,
  };
}
