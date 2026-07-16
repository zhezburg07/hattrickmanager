import type { SquadPlayer, SquadSkills } from "@/data/squad";
import { emptyAssignments, boardSlots, type Assignments, type BoardSlot, type SlotRole } from "@/data/pitchBoard";
import type { ZoneKey } from "./zoneRatings";

// Уровни значимости навыка для позиции — в духе официальных приоритетов Hattrick
const MAIN = 3.0; // главный навык позиции
const STRONG = 1.5; // "значительно важен" / "также необходим"
const MODERATE = 1.0; // "важен также" / "полезно"
const ADD = 0.8; // "дополнительно учитывать" / "используется"
const LIGHT = 0.5; // "небольшой вклад" / "немного"

const FORM_WEIGHT = 1.2; // форма 0-8: чем выше, тем лучше
const STAMINA_WEIGHT = 0.08; // выносливость 0-100: сохраняет навыки к концу матча

type SkillWeights = Partial<Record<keyof SquadSkills, number>>;

// Точные приоритеты навыков по каждой роли на поле
const roleWeights: Record<SlotRole, SkillWeights> = {
  GK: { goalkeeping: MAIN, defending: ADD, setPieces: ADD },
  DEF_CENTRAL: { defending: MAIN, midfield: MODERATE, passing: ADD },
  DEF_WIDE: { defending: MAIN, winger: MODERATE, midfield: LIGHT, passing: LIGHT },
  MID_CENTRAL: { midfield: MAIN, passing: STRONG, defending: STRONG, scoring: LIGHT },
  MID_WIDE: { winger: MAIN, midfield: STRONG, passing: ADD, defending: ADD },
  FWD_CENTRAL: { scoring: MAIN, passing: MODERATE, winger: MODERATE, midfield: MODERATE },
  FWD_WIDE: { scoring: MAIN, passing: MODERATE, winger: MODERATE, midfield: MODERATE },
};

function scoreForRole(player: SquadPlayer, role: SlotRole): number {
  const weights = roleWeights[role];
  let score = player.form * FORM_WEIGHT + player.stamina * STAMINA_WEIGHT;
  (Object.keys(weights) as (keyof SquadSkills)[]).forEach((skill) => {
    score += player.skills[skill] * (weights[skill] ?? 0);
  });
  return score;
}

interface Candidate {
  slot: BoardSlot;
  player: SquadPlayer;
  score: number;
}

// Общее ядро автоподбора состава: вратарь + 10 полевых игроков. Для каждого
// пустого слота подбирается доступный игрок с наибольшим взвешенным баллом
// по навыкам, важным для этой роли (плюс форма и выносливость), без
// конфликтов "один игрок — один слот". Итоговая формация — это просто то,
// какие 10 полевых слотов оказались заняты самыми сильными парами игрок/слот.
// slotScoreMultiplier — необязательный множитель балла кандидата по слоту
// (используется recommendLineupAgainstOpponent ниже, чтобы отдавать
// приоритет флангам/зонам, где выявлена слабость соперника); по умолчанию 1
// для всех слотов — обычный, ничем не смещённый подбор.
function buildLineup(allPlayers: SquadPlayer[], slotScoreMultiplier: (slot: BoardSlot) => number): Assignments {
  const available = allPlayers.filter((p) => p.status !== "injured");
  const assignments = emptyAssignments();

  // Вратарь — единственный слот в линии, выбираем лучшего по его весам
  const gkSlot = boardSlots.find((s) => s.group === "GK");
  const gkCandidates = available.filter((p) => p.positionGroup === "GK");
  let bestGk: SquadPlayer | null = null;
  let bestGkScore = -Infinity;
  for (const p of gkCandidates) {
    const s = scoreForRole(p, "GK");
    if (s > bestGkScore) {
      bestGkScore = s;
      bestGk = p;
    }
  }
  if (gkSlot && bestGk) {
    assignments.GK[gkSlot.index] = bestGk.id;
  }
  const usedPlayerIds = new Set<number>(bestGk ? [bestGk.id] : []);

  // Все допустимые пары "слот-игрок" среди полевых линий (позиция игрока
  // должна совпадать с линией слота: ЦЗЩ/КЗЩ — защитники, и т.д.)
  const fieldSlots = boardSlots.filter((s) => s.group !== "GK");
  const candidates: Candidate[] = [];
  fieldSlots.forEach((slot) => {
    const multiplier = slotScoreMultiplier(slot);
    available
      .filter((p) => p.positionGroup === slot.group)
      .forEach((player) => {
        candidates.push({ slot, player, score: scoreForRole(player, slot.role) * multiplier });
      });
  });
  candidates.sort((a, b) => b.score - a.score);

  // Жадное распределение без конфликтов: идём по убыванию балла и занимаем
  // первый свободный слот первым ещё не расставленным игроком
  const filledSlotIds = new Set<string>();
  const matched: Candidate[] = [];
  for (const c of candidates) {
    if (filledSlotIds.has(c.slot.id) || usedPlayerIds.has(c.player.id)) continue;
    filledSlotIds.add(c.slot.id);
    usedPlayerIds.add(c.player.id);
    matched.push(c);
  }

  // Из всех занятых полевых слотов оставляем только 10 самых сильных —
  // они и определяют итоговую формацию
  matched.sort((a, b) => b.score - a.score);
  matched.slice(0, 10).forEach(({ slot, player }) => {
    assignments[slot.group][slot.index] = player.id;
  });

  return assignments;
}

export function recommendLineup(allPlayers: SquadPlayer[]): Assignments {
  return buildLineup(allPlayers, () => 1);
}

// Для каждой найденной слабой зоны соперника — какие из НАШИХ слотов на поле
// стоит усилить, чтобы её эксплуатировать. Фланги зеркальны: наша атака
// слева бьёт по правому флангу обороны соперника (и наоборот) — команды
// стоят лицом друг к другу, поэтому "правый защитник соперника" встречается
// с нашим левым нападением/полузащитой. Атакующие зоны соперника (насколько
// силён его нападение) не используются — они не подсказывают, где у НАС
// атаковать.
const exploitSlotIds: Partial<Record<ZoneKey, string[]>> = {
  defenseRight: ["MID-0", "DEF-0", "FWD-0"],
  defenseLeft: ["MID-4", "DEF-4", "FWD-2"],
  defenseCenter: ["FWD-1", "MID-1", "MID-2", "MID-3"],
  midfield: ["MID-1", "MID-2", "MID-3"],
};

const OPPONENT_WEAKNESS_BOOST = 1.35;
// Сколько худших (по рейтингу) зон соперника считать "слабыми" для усиления
const WEAK_ZONE_COUNT = 2;

// Тот же автоподбор состава, что и recommendLineup, но с приоритетом на
// слоты, которые эксплуатируют слабые зоны соперника (см. exploitSlotIds
// выше) — используется кнопкой "Рекомендовать состав против этого
// соперника" на панели "Анализ соперника" (Pro).
export function recommendLineupAgainstOpponent(
  allPlayers: SquadPlayer[],
  opponentZoneRatings: Partial<Record<ZoneKey, number>>,
): Assignments {
  const weakZones = (Object.entries(opponentZoneRatings) as [ZoneKey, number][])
    .sort((a, b) => a[1] - b[1])
    .slice(0, WEAK_ZONE_COUNT)
    .map(([zone]) => zone);

  const boostedSlotIds = new Set<string>();
  weakZones.forEach((zone) => (exploitSlotIds[zone] ?? []).forEach((id) => boostedSlotIds.add(id)));

  return buildLineup(allPlayers, (slot) => (boostedSlotIds.has(slot.id) ? OPPONENT_WEAKNESS_BOOST : 1));
}
