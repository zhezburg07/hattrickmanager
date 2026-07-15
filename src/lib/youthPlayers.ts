import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";
import { inferPositionGroup } from "./squadPlayers";
import { resolveCountryByEnglishName, unknownCountry, type Country, type PositionGroup, type SquadSkills } from "@/data/squad";

export interface RealYouthPlayer {
  id: number;
  name: string;
  age: number;
  nationality: Country;
  positionGroup: PositionGroup;
  skills: SquadSkills;
}

// Разбирает XML-ответ CHPP на файл youthplayerlist.xml — список игроков
// юношеской академии. В отличие от youthdetails.xml (там нет самого списка
// игроков), этот файл — единственная попытка получить список именно
// игроков академии; название файла (youthplayerlist, а не youthplayers/
// youthdetails, как предполагалось раньше) не проверялось в этом проекте
// живьём до сих пор — если CHPP всё равно ответит 401/403, вызывающий код
// (src/app/dashboard/youth/page.tsx) честно откатится на демо-данные.
//
// Скиллы читаются теми же именами полей, что и в players.xml (KeeperSkill,
// DefenderSkill и т.д., см. src/lib/squadPlayers.ts) — CHPP переиспользует
// одинаковые названия навыков в разных файлах игроков. Если в реальном
// ответе их не окажется (например, скиллы юниоров доступны только через
// отдельный youthplayerdetails.xml на каждого игрока) — они останутся 0,
// т.е. останется только реальное имя/возраст, что тоже лучше, чем ничего.
export function parseYouthPlayerListXml(xml: string): RealYouthPlayer[] {
  const parser = new XMLParser();
  const data = parser.parse(xml);

  const root = data?.HattrickData;
  assertNoChppError(root, "youthplayerlist");

  const rawPlayers = root?.Team?.PlayerList?.Player ?? root?.PlayerList?.Player;
  const players: Record<string, unknown>[] = Array.isArray(rawPlayers) ? rawPlayers : rawPlayers ? [rawPlayers] : [];

  return players.map((p) => {
    const skills: SquadSkills = {
      goalkeeping: Number(p.KeeperSkill ?? 0),
      defending: Number(p.DefenderSkill ?? 0),
      midfield: Number(p.PlaymakerSkill ?? 0),
      winger: Number(p.WingerSkill ?? 0),
      passing: Number(p.PassingSkill ?? 0),
      scoring: Number(p.ScorerSkill ?? 0),
      setPieces: Number(p.SetPiecesSkill ?? 0),
    };

    const firstName = String(p.FirstName ?? "").trim();
    const lastName = String(p.LastName ?? "").trim();
    const countryName = p.Country as Record<string, unknown> | undefined;
    const nationality = countryName?.CountryName
      ? resolveCountryByEnglishName(String(countryName.CountryName))
      : unknownCountry;

    return {
      id: Number(p.PlayerID ?? 0),
      name: [firstName, lastName].filter(Boolean).join(" ") || "Без имени",
      age: Number(p.Age ?? 0),
      nationality,
      positionGroup: inferPositionGroup(skills),
      skills,
    };
  });
}
