import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";

export interface RealSquadSummary {
  totalPlayers: number;
  injuredCount: number;
  averageForm: number;
}

// Разбирает XML-ответ CHPP на файл players.xml и считает только сводные
// цифры для панели "Состав" на Обзоре. Важно: у CHPP нет понятия
// "в основе / в запасе" на уровне ростера — это тактическое решение
// (кто сейчас выставлен в конкретном матче), а не свойство самого игрока,
// поэтому этот срез мы не показываем в реальном режиме, в отличие от демо.
export function parsePlayersXml(xml: string): RealSquadSummary {
  const parser = new XMLParser();
  const data = parser.parse(xml);

  const root = data?.HattrickData;
  assertNoChppError(root, "players");

  const rawPlayers = root?.Team?.PlayerList?.Player;
  const players = Array.isArray(rawPlayers) ? rawPlayers : rawPlayers ? [rawPlayers] : [];

  const totalPlayers = players.length;
  const injuredCount = players.filter((p: Record<string, unknown>) => Number(p.InjuryLevel ?? 0) > 0).length;
  const averageForm =
    totalPlayers === 0
      ? 0
      : players.reduce((sum: number, p: Record<string, unknown>) => sum + Number(p.PlayerForm ?? 0), 0) / totalPlayers;

  return { totalPlayers, injuredCount, averageForm };
}
