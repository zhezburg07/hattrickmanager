import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";
import { unknownCountry, type Country, type PositionGroup, type SquadPlayer, type SquadSkills } from "@/data/squad";

// Домашняя страна команды (см. src/lib/worldCurrency.ts) — используется,
// чтобы узнать страну (и флаг) игроков, чей CountryID совпадает с ней.
// Передаётся параметром, а не читается из общего модуля, потому что это
// данные конкретного пользователя/запроса, а не общее состояние приложения.
export interface HomeCountryInfo {
  countryId: string;
  country: Country;
}

// Разбирает XML-ответ CHPP на файл players.xml в полный список игроков для
// таблицы "Состав" — в отличие от src/lib/players.ts (который считает только
// сводные цифры для Обзора), здесь нужен каждый игрок целиком.
//
// Важные ограничения реальных данных (проверено на живом ответе Hattrick):
// - Нет отдельного поля "амплуа" — определяем его эвристикой по самому
//   сильному навыку игрока. Если эвристика ошиблась, это можно поправить
//   вручную прямо в таблице (кнопка амплуа уже поддерживает переопределение).
// - Нет "преданности клубу" (loyalty) и числа сыгранных за клуб матчей —
//   эти поля остаются undefined (соответствующие столбцы/строки в интерфейсе
//   скрываются автоматически).
// - Нет понятия "в основе/в запасе" — статус либо "squad" (просто в составе),
//   либо "injured", если InjuryLevel > 0 (-1 в CHPP означает "не травмирован").
// - StaminaSkill приходит по шкале 0-9 (у Hattrick это отдельная, более
//   короткая шкала, чем 0-20 у остальных навыков) — переводим в проценты
//   (0-100%), чтобы не переписывать весь остальной сайт, который уже
//   рассчитан на stamina-в-процентах (карточки игрока, Расстановка,
//   подбор состава и т.д.).
// - Национальность CHPP отдаёт только как числовой CountryID, без общего
//   справочника ID→страна для ВСЕХ стран мира (полный список из
//   worlddetails.xml оказался ненадёжным — один и тот же запрос без
//   фильтра возвращал то все страны мира, то только одну). Поэтому надёжно
//   мы знаем только CountryID домашней страны команды (его даёт
//   teamdetails+worlddetails, см. src/lib/worldCurrency.ts): совпадает —
//   показываем настоящую страну и её флаг; не совпадает — честная
//   заглушка (флаг не показываем, т.к. именно эту страну не знаем), без
//   какого-либо отдельного статуса/подписи поверх неё.
export function parsePlayersDetailedXml(
  xml: string,
  homeCountry: HomeCountryInfo | null,
  countryIdLookup?: Record<string, Country>,
): SquadPlayer[] {
  const parser = new XMLParser();
  const data = parser.parse(xml);

  const root = data?.HattrickData;
  assertNoChppError(root, "players");

  const rawPlayers = root?.Team?.PlayerList?.Player;
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

    const staminaLevel = Number(p.StaminaSkill ?? 0); // 0-9
    const stamina = Math.max(0, Math.min(100, Math.round((staminaLevel / 9) * 100)));

    const firstName = String(p.FirstName ?? "").trim();
    const lastName = String(p.LastName ?? "").trim();
    const injuryLevel = Number(p.InjuryLevel ?? -1);
    const tsi = Number(p.TSI ?? 0);
    const countryId = String(p.CountryID ?? "");
    const isHomeMatch = homeCountry ? countryId === homeCountry.countryId : undefined;

    // Порядок попыток: 1) полный справочник ID→страна, если он передан и
    // содержит этот ID (пока такого надёжного источника нет, см. комментарий
    // выше — но код уже готов его использовать, если появится); 2) прямое
    // совпадение с домашней страной команды; 3) честная заглушка.
    const nationality: Country =
      countryIdLookup?.[countryId] ??
      (isHomeMatch ? homeCountry!.country : undefined) ??
      unknownCountry;

    return {
      id: Number(p.PlayerID ?? 0),
      squadNumber: Number(p.PlayerNumber ?? 0),
      name: [firstName, lastName].filter(Boolean).join(" ") || "Без имени",
      age: Number(p.Age ?? 0),
      ageDays: Number(p.AgeDays ?? 0),
      nationality,
      positionGroup: inferPositionGroup(skills),
      form: Number(p.PlayerForm ?? 0),
      stamina,
      skills,
      experience: Number(p.Experience ?? 0),
      leadership: Number(p.Leadership ?? 0),
      loyalty: undefined,
      tsi,
      // Нет истории за прошлую неделю в одном снимке players.xml — заполняется
      // на клиенте из localStorage между синхронизациями, см. usePlayerStatChanges.
      prev: undefined,
      salary: Number(p.Salary ?? 0),
      status: injuryLevel > 0 ? "injured" : "squad",
      gamesPlayed: undefined,
      goalsScored: Number(p.LeagueGoals ?? 0) + Number(p.CupGoals ?? 0) + Number(p.FriendliesGoals ?? 0),
    };
  });
}

// CHPP не даёт "естественное" амплуа напрямую — берём навык с наибольшим
// значением (полузащитные навыки усредняются) как лучшую доступную оценку.
function inferPositionGroup(skills: SquadSkills): PositionGroup {
  const midScore = (skills.midfield + skills.winger + skills.passing) / 3;
  const candidates: [PositionGroup, number][] = [
    ["GK", skills.goalkeeping],
    ["DEF", skills.defending],
    ["MID", midScore],
    ["FWD", skills.scoring],
  ];
  candidates.sort((a, b) => b[1] - a[1]);
  return candidates[0][0];
}
