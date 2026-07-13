import type { Assignments } from "@/data/pitchBoard";
import type { PositionGroup, SquadPlayer, SquadSkills } from "@/data/squad";

export type ZoneKey =
  | "midfield"
  | "attackLeft"
  | "attackCenter"
  | "attackRight"
  | "defenseLeft"
  | "defenseCenter"
  | "defenseRight";

export const zoneLabel: Record<ZoneKey, string> = {
  midfield: "Полузащита",
  attackLeft: "Атака слева",
  attackCenter: "Атака по центру",
  attackRight: "Атака справа",
  defenseLeft: "Защита слева",
  defenseCenter: "Защита по центру",
  defenseRight: "Защита справа",
};

function skill(player: SquadPlayer | null, key: keyof SquadSkills): number {
  return player?.skills[key] ?? 0;
}

function avgSkill(players: (SquadPlayer | null)[], key: keyof SquadSkills): number {
  return players.reduce((sum, p) => sum + skill(p, key), 0) / players.length;
}

function filledCount(players: (SquadPlayer | null)[]): number {
  return players.filter((p) => p !== null).length;
}

// Штраф за перегрузку центральной позиции: 2-3 игрока на одном и том же
// центральном амплуа (ЦЗЩ/ЦПЗ/ЦНАП) не складывают навыки линейно — их
// суммарный вклад в соответствующий зональный рейтинг растёт заметно
// медленнее. Множитель применяется к вкладу КАЖДОГО игрока в группе.
// ЦПЗ штрафуется сильнее всего, ЦНАП умеренно, ЦЗЩ — меньше всего.
type CentralRole = "DEF_CENTRAL" | "MID_CENTRAL" | "FWD_CENTRAL";

const congestionFactors: Record<CentralRole, Record<number, number>> = {
  MID_CENTRAL: { 1: 1, 2: 0.72, 3: 0.52 },
  FWD_CENTRAL: { 1: 1, 2: 0.82, 3: 0.62 },
  DEF_CENTRAL: { 1: 1, 2: 0.88, 3: 0.72 },
};

const congestionZoneLabel: Record<CentralRole, string> = {
  DEF_CENTRAL: "Защита по центру",
  MID_CENTRAL: "Полузащита",
  FWD_CENTRAL: "Атака по центру",
};

function congestionFactor(role: CentralRole, count: number): number {
  return congestionFactors[role][count] ?? 1;
}

export interface ZoneRatingsResult {
  ratings: Record<ZoneKey, number>;
  // Заполнено, только если штраф за перегрузку центра реально сработал где-то —
  // готовый текст для подсказки рядом с панелью
  congestionNote: string | null;
}

// Взвешенное среднее по парам [значение, вес]. Незанятый слот даёт значению 0,
// поэтому дыра в составе (например, нет крайнего защитника) ощутимо тянет
// рейтинг соответствующей зоны вниз — как и в реальном Hattrick.
function weighted(terms: Array<[number, number]>): number {
  const totalWeight = terms.reduce((sum, [, w]) => sum + w, 0);
  const total = terms.reduce((sum, [value, w]) => sum + value * w, 0);
  return totalWeight > 0 ? total / totalWeight : 0;
}

// Приблизительный, демонстрационный расчёт 7 секторов расстановки (как в
// реальном Hattrick): не точная формула игры, а взвешенная оценка по тем же
// навыкам и в том же порядке значимости, что использует Hattrick.
export function computeZoneRatings(
  assignments: Assignments,
  playersById: Map<number, SquadPlayer>,
): ZoneRatingsResult {
  const getPlayer = (group: PositionGroup, index: number): SquadPlayer | null => {
    const id = assignments[group][index];
    return id !== null ? (playersById.get(id) ?? null) : null;
  };

  const gk = getPlayer("GK", 0);
  const defLeft = getPlayer("DEF", 0); // DEF-0: крайний защитник слева
  const defCenterNearLeft = getPlayer("DEF", 1);
  const defCenter = [getPlayer("DEF", 1), getPlayer("DEF", 2), getPlayer("DEF", 3)];
  const defCenterNearRight = getPlayer("DEF", 3);
  const defRight = getPlayer("DEF", 4); // DEF-4: крайний защитник справа

  const midLeft = getPlayer("MID", 0); // MID-0: крайний полузащитник слева
  const midCenter = [getPlayer("MID", 1), getPlayer("MID", 2), getPlayer("MID", 3)];
  const midRight = getPlayer("MID", 4); // MID-4: крайний полузащитник справа

  const forwards = [getPlayer("FWD", 0), getPlayer("FWD", 1), getPlayer("FWD", 2)];

  const defCenterFactor = congestionFactor("DEF_CENTRAL", filledCount(defCenter));
  const midCenterFactor = congestionFactor("MID_CENTRAL", filledCount(midCenter));
  const fwdCenterFactor = congestionFactor("FWD_CENTRAL", filledCount(forwards));

  const congestedZones = (
    [
      ["DEF_CENTRAL", defCenterFactor],
      ["MID_CENTRAL", midCenterFactor],
      ["FWD_CENTRAL", fwdCenterFactor],
    ] as const
  )
    .filter(([, factor]) => factor < 1)
    .map(([role]) => congestionZoneLabel[role]);

  const congestionNote =
    congestedZones.length > 0
      ? `Несколько игроков на одной позиции снижают эффективность: ${congestedZones.join(", ")}`
      : null;

  const midfield = weighted([
    [avgSkill(midCenter, "midfield") * midCenterFactor, 3],
    [(skill(midLeft, "midfield") + skill(midRight, "midfield")) / 2, 1.5],
    [avgSkill(defCenter, "midfield"), 1],
    [avgSkill(forwards, "midfield"), 0.8],
    [(skill(defLeft, "midfield") + skill(defRight, "midfield")) / 2, 0.5],
  ]);

  function attackSide(wideMid: SquadPlayer | null, wideDef: SquadPlayer | null): number {
    return weighted([
      [skill(wideMid, "winger"), 3],
      [skill(wideDef, "winger"), 2],
      [avgSkill(forwards, "scoring"), 1.5],
      [(avgSkill(midCenter, "passing") + skill(wideMid, "passing")) / 2, 1],
      [(avgSkill(forwards, "winger") + avgSkill(forwards, "passing")) / 2, 0.5],
    ]);
  }

  const attackLeft = attackSide(midLeft, defLeft);
  const attackRight = attackSide(midRight, defRight);

  const attackCenter = weighted([
    [avgSkill(forwards, "scoring") * fwdCenterFactor, 3],
    [avgSkill(forwards, "passing") * fwdCenterFactor, 1.5],
    [avgSkill(midCenter, "passing"), 1],
    [avgSkill(midCenter, "scoring"), 0.8],
  ]);

  function defenseSide(wideDef: SquadPlayer | null, nearCentralDef: SquadPlayer | null, wideMid: SquadPlayer | null): number {
    return weighted([
      [skill(wideDef, "defending"), 3],
      [skill(gk, "goalkeeping"), 1.5],
      [skill(nearCentralDef, "defending"), 1],
      [(skill(wideMid, "defending") + avgSkill(midCenter, "defending")) / 2, 0.6],
    ]);
  }

  const defenseLeft = defenseSide(defLeft, defCenterNearLeft, midLeft);
  const defenseRight = defenseSide(defRight, defCenterNearRight, midRight);

  const defenseCenter = weighted([
    [avgSkill(defCenter, "defending") * defCenterFactor, 3],
    [skill(gk, "goalkeeping"), 1.5],
    [avgSkill(midCenter, "defending"), 1],
    [(avgSkill([defLeft, defRight], "defending") + avgSkill([midLeft, midRight], "defending")) / 2, 0.5],
  ]);

  return {
    ratings: {
      midfield,
      attackLeft,
      attackCenter,
      attackRight,
      defenseLeft,
      defenseCenter,
      defenseRight,
    },
    congestionNote,
  };
}
