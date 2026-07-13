import type { SquadPlayer, SquadSkills } from "@/data/squad";
import { emptyAssignments, boardSlots, type Assignments, type BoardSlot, type SlotRole } from "@/data/pitchBoard";

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

// Автоматически собирает лучший доступный состав: вратарь + 10 полевых игроков.
// Для каждого пустого слота подбирается доступный игрок с наибольшим взвешенным
// баллом по навыкам, важным для этой роли (плюс форма и выносливость), без
// конфликтов "один игрок — один слот". Итоговая формация — это просто то,
// какие 10 полевых слотов оказались заняты самыми сильными парами игрок/слот.
export function recommendLineup(allPlayers: SquadPlayer[]): Assignments {
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
    available
      .filter((p) => p.positionGroup === slot.group)
      .forEach((player) => {
        candidates.push({ slot, player, score: scoreForRole(player, slot.role) });
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
