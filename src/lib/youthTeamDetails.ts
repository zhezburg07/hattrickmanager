import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";

export interface RealYouthTeamDetails {
  youthTeamId: string;
  youthTeamName: string;
  youthLeagueId: string;
}

// Разбирает XML-ответ CHPP на файл youthteamdetails.xml — нужен только ради
// YouthTeamID: единственный способ узнать ID СВОЕЙ юношеской команды, чтобы
// потом отличить её от остальных команд в таблице youthleaguedetails.xml/
// youthleaguefixtures.xml (там TeamID — чужой, никак не совпадает с обычным
// TeamID основной команды из teamdetails.xml). Прямой аналог того, зачем
// нужен teamdetails.xml для основной команды (см. syncTeamData в chppSync.ts,
// шаг 1) — только здесь дополнительный шаг, а не часть уже читаемого файла.
//
// ПРОВЕРЕНО (структура, не поведение "без параметра") по реальному
// захваченному ответу CHPP — независимый Python-клиент github.com/PiGo86/
// pychpp, tests/test_resources/file=youthteamdetails&version=1.2&
// youthTeamID=2745926.xml: корень <HattrickData><YouthTeam>, вложенные
// YouthTeamID/YouthTeamName и YouthLeague>YouthLeagueID. Параметр
// youthTeamID в самом pychpp типизирован как Optional — как и везде в CHPP
// (teamdetails/leaguedetails/youthleaguedetails), отсутствие параметра
// должно означать "своя команда по токену", но это НЕ проверено на живом
// ответе именно без параметра — см. временную диагностику в chppSync.ts,
// которая подтвердит или опровергнет это при первой реальной синхронизации.
export function parseYouthTeamDetailsXml(xml: string): RealYouthTeamDetails {
  const parser = new XMLParser();
  const data = parser.parse(xml);

  const root = data?.HattrickData;
  assertNoChppError(root, "youthteamdetails");

  const team = root?.YouthTeam;
  if (!team) {
    throw new Error("В ответе youthteamdetails.xml нет данных о команде (<YouthTeam>).");
  }

  return {
    youthTeamId: String(team.YouthTeamID ?? ""),
    youthTeamName: String(team.YouthTeamName ?? ""),
    youthLeagueId: String(team.YouthLeague?.YouthLeagueID ?? ""),
  };
}
