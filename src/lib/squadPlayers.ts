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
// - Нет числа сыгранных за клуб матчей — поле остаётся undefined
//   (соответствующая строка в интерфейсе скрывается автоматически).
//   "Преданность клубу" (loyalty) и признак воспитанника (isClubProduct)
//   пробуем прочитать по предположительным именам полей — не проверено на
//   живом ответе, см. комментарий у соответствующего блока ниже.
// - Нет понятия "в основе/в запасе" — статус либо "squad" (просто в составе),
//   либо "injured", если InjuryLevel > 0 (-1 в CHPP означает "не травмирован").
// - StaminaSkill приходит по шкале 0-9 (у Hattrick это отдельная, более
//   короткая шкала, чем 0-20 у остальных навыков) — переводим в проценты
//   (0-100%), чтобы не переписывать весь остальной сайт, который уже
//   рассчитан на stamina-в-процентах (карточки игрока, Расстановка,
//   подбор состава и т.д.).
// - Национальность CHPP отдаёт только как числовой CountryID. Полный
//   справочник ID→страна строится динамически из worlddetails.xml БЕЗ
//   фильтра LeagueID (см. src/lib/worldCountries.ts, countryIdLookup) —
//   этот же запрос раньше проверялся ненадёжным (иногда возвращал не все
//   страны), поэтому результат используется, только если стран пришло
//   разумно много (~156), иначе честно не используется вовсе. Порядок
//   попыток ниже: 1) полный справочник, 2) прямое совпадение с домашней
//   страной команды (teamdetails+worlddetails с фильтром, см.
//   src/lib/worldCurrency.ts), 3) честная заглушка (флаг не показываем,
//   раз страну не знаем), без какого-либо отдельного статуса/подписи
//   поверх неё.
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

    // Преданность клубу и статус "воспитанника" (сердце) — имена полей CHPP
    // не проверялись на живом ответе Hattrick. Loyalty — предположительно
    // числовое поле на той же шкале 0-20, что и скиллы; "сердце" ищем среди
    // нескольких правдоподобных названий булевого поля. Если Hattrick
    // называет их иначе — оба просто останутся undefined и не покажутся,
    // ничего не сломав (см. чат).
    const loyaltyRaw = p.Loyalty;
    const loyalty = loyaltyRaw !== undefined && loyaltyRaw !== "" ? Number(loyaltyRaw) : undefined;
    const clubProductRaw = p.MotherClubBonus ?? p.OwnerClub ?? p.HomeGrownPlayer;
    const isClubProduct =
      clubProductRaw === undefined
        ? undefined
        : clubProductRaw === true || clubProductRaw === "true" || clubProductRaw === "Yes" || Number(clubProductRaw) > 0;

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
      loyalty,
      isClubProduct,
      // CHPP не отдаёт рейтинг за конкретный матч в players.xml — заполняется
      // отдельно на клиенте/сервере из matchdetails.xml последнего сыгранного
      // матча (см. src/lib/lastMatchRating.ts, squad/page.tsx).
      lastMatchRating: undefined,
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

// ВРЕМЕННАЯ диагностика — показывает сырое значение поля национальности
// (CountryID и всё, что рядом с ним похоже на страну) для первых нескольких
// игроков, как оно реально приходит от CHPP, без какой-либо обработки.
// Используется только на время отладки (см. src/app/dashboard/squad/page.tsx,
// SHOW_NATIONALITY_DEBUG) — удалить вместе с этим флагом, когда причина
// найдена.
export interface DebugPlayerCountryRaw {
  name: string;
  countryId: string;
  rawCountryFields: string;
}

export function debugRawPlayerCountryIds(xml: string, limit = 3): DebugPlayerCountryRaw[] {
  const parser = new XMLParser();
  const data = parser.parse(xml);
  const root = data?.HattrickData;
  const rawPlayers = root?.Team?.PlayerList?.Player;
  const players: Record<string, unknown>[] = Array.isArray(rawPlayers) ? rawPlayers : rawPlayers ? [rawPlayers] : [];

  return players.slice(0, limit).map((p) => {
    const firstName = String(p.FirstName ?? "").trim();
    const lastName = String(p.LastName ?? "").trim();
    // Собираем вообще любые поля с "country"/"nation" в названии — вдруг
    // реальное имя поля отличается от того, что мы предполагаем (CountryID).
    const countryLikeFields = Object.keys(p).filter((k) => /country|nation/i.test(k));
    const rawCountryFields = countryLikeFields.length
      ? countryLikeFields.map((k) => `${k}=${JSON.stringify(p[k])}`).join(", ")
      : "(полей с country/nation в имени не найдено)";

    return {
      name: [firstName, lastName].filter(Boolean).join(" ") || "Без имени",
      countryId: String(p.CountryID ?? "(нет поля CountryID)"),
      rawCountryFields,
    };
  });
}

// CHPP не даёт "естественное" амплуа напрямую — берём навык с наибольшим
// значением (полузащитные навыки усредняются) как лучшую доступную оценку.
// Экспортирована, чтобы той же эвристикой пользовался парсер юношеских
// игроков (см. src/lib/youthPlayers.ts).
export function inferPositionGroup(skills: SquadSkills): PositionGroup {
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
