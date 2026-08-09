import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";
import { inferPositionGroup, type HomeCountryInfo } from "./squadPlayers";
import { unknownCountry, type Country, type PositionGroup, type SquadSkills } from "@/data/squad";
import type { YouthPlayerDetailsResult } from "./youthPlayerDetails";

export interface RealYouthPlayer {
  id: number;
  name: string;
  age: number;
  nationality: Country;
  positionGroup: PositionGroup;
  // Из youthplayerlist.xml — запасной вариант, если запрос подробностей
  // конкретного игрока (ниже) не удался.
  skills: SquadSkills;
  // Подробности сверх общего списка — отдельный запрос youthplayerdetails.xml
  // НА КАЖДОГО игрока академии во время синхронизации (см. chppSync.ts,
  // src/lib/youthPlayerDetails.ts). Оттуда же более точные навыки — при
  // успехе именно они заменяют skills выше. undefined, если запрос для
  // этого конкретного игрока не удался (тогда skills — из общего списка).
  details?: YouthPlayerDetailsResult;
}

// Общий разбор <PlayerSkills> — используется и для youthplayerlist.xml
// (список), и для youthplayerdetails.xml (один игрок): CHPP переиспользует
// одну и ту же структуру YouthPlayerDetail в обоих файлах (подтверждено по
// независимому CHPP-клиенту github.com/lucianoq/hattrick).
export function parseYouthSkillsRaw(skillsRaw: Record<string, unknown> | undefined): SquadSkills {
  const s = skillsRaw ?? {};
  return {
    goalkeeping: Number(s.KeeperSkill ?? 0),
    defending: Number(s.DefenderSkill ?? 0),
    midfield: Number(s.PlaymakerSkill ?? 0),
    winger: Number(s.WingerSkill ?? 0),
    passing: Number(s.PassingSkill ?? 0),
    scoring: Number(s.ScorerSkill ?? 0),
    setPieces: Number(s.SetPiecesSkill ?? 0),
  };
}

// Разбирает XML-ответ CHPP на файл youthplayerlist.xml (v1.3) — список
// игроков юношеской академии.
//
// ИСПРАВЛЕНО (важный баг — из-за него вкладка "Юношеская команда" выглядела
// полностью пустой): схема youthplayerlist.xml подтверждена по независимому
// CHPP-клиенту github.com/lucianoq/hattrick (chpp/file_youthplayerlist.go +
// chpp/file_youthplayerdetails.go, структура YouthPlayerDetail переиспользуется
// обоими файлами) и СИЛЬНО отличается от обычного players.xml, хотя раньше
// код по ошибке читал её так, будто это тот же формат:
// 1) Список игроков лежит под <PlayerList><YouthPlayer> — БЕЗ обёртки
//    <Team> и с тегом именно YouthPlayer, а не Player. Раньше код искал
//    root.Team.PlayerList.Player / root.PlayerList.Player — оба пути
//    гарантированно давали пустой массив, поэтому HTTP-запрос вполне мог
//    успешно отвечать 200 с реальными игроками, а страница всё равно
//    показывала 0 игроков молча (без ошибки).
// 2) ID игрока — тег <YouthPlayerID>, а не <PlayerID>.
// 3) Навыки лежат ВЛОЖЕННО, в контейнере <PlayerSkills> (те же имена полей
//    KeeperSkill/DefenderSkill/PlaymakerSkill/WingerSkill/PassingSkill/
//    ScorerSkill/SetPiecesSkill, что и в players.xml, но не плоско на самом
//    игроке, а внутри <PlayerSkills>).
// 4) ИСПРАВЛЕНО ЕЩЁ РАЗ (национальность/возраст пустые на реальных данных,
//    см. чат "Кубки/Юношеская команда/Трансферы: диагностика"): прежнее
//    предположение "плоское поле <NativeCountryName>" никогда не было
//    проверено на живом ответе и, судя по всему, было неверным — во ВСЁМ
//    остальном проекте (players.xml, см. squadPlayers.ts) CHPP отдаёт
//    национальность ТОЛЬКО как числовой <CountryID> + отдельный справочник
//    ID→страна (worldCountries.ts), никогда как готовую строку. Приводим
//    youthplayerlist.xml к тому же, уже подтверждённому механизму, вместо
//    гадания нового имени поля.
export function parseYouthPlayerListXml(
  xml: string,
  homeCountry?: HomeCountryInfo | null,
  countryIdLookup?: Record<string, Country>,
): RealYouthPlayer[] {
  const parser = new XMLParser();
  const data = parser.parse(xml);

  const root = data?.HattrickData;
  assertNoChppError(root, "youthplayerlist");

  const rawPlayers = root?.PlayerList?.YouthPlayer ?? root?.Team?.PlayerList?.YouthPlayer;
  const players: Record<string, unknown>[] = Array.isArray(rawPlayers) ? rawPlayers : rawPlayers ? [rawPlayers] : [];

  return players.map((p) => {
    const skills = parseYouthSkillsRaw(p.PlayerSkills as Record<string, unknown> | undefined);

    const firstName = String(p.FirstName ?? "").trim();
    const lastName = String(p.LastName ?? "").trim();

    const countryId = String(p.CountryID ?? p.NativeCountryID ?? "");
    const isHomeMatch = homeCountry ? countryId === homeCountry.countryId : undefined;
    const nationality: Country =
      countryIdLookup?.[countryId] ?? (isHomeMatch ? homeCountry!.country : undefined) ?? unknownCountry;

    return {
      id: Number(p.YouthPlayerID ?? 0),
      name: [firstName, lastName].filter(Boolean).join(" ") || "Без имени",
      age: Number(p.Age ?? 0),
      nationality,
      positionGroup: inferPositionGroup(skills),
      skills,
    };
  });
}

// ВРЕМЕННАЯ диагностика — сырые счётчики для панели на dashboard/youth
// (см. SHOW_YOUTH_DEBUG_PANEL): сколько элементов реально нашлось по
// подтверждённому пути (root.PlayerList.YouthPlayer), чтобы при следующей
// похожей жалобе сразу было видно, действительно ли XML пуст или это снова
// проблема разбора.
export function debugYouthPlayerListRawCount(xml: string): number {
  try {
    const parser = new XMLParser();
    const data = parser.parse(xml);
    const root = data?.HattrickData;
    const rawPlayers = root?.PlayerList?.YouthPlayer ?? root?.Team?.PlayerList?.YouthPlayer;
    return Array.isArray(rawPlayers) ? rawPlayers.length : rawPlayers ? 1 : 0;
  } catch {
    return 0;
  }
}

// ВРЕМЕННАЯ диагностика — сырые поля возраста/национальности первых
// нескольких игроков академии, как они реально приходят от CHPP, без какой-
// либо обработки (тот же приём, что и debugRawPlayerCountryIds в
// squadPlayers.ts, которым уже нашли аналогичный баг у основного состава).
export interface DebugYouthPlayerRaw {
  name: string;
  ageLikeFields: string;
  countryLikeFields: string;
}

export function debugRawYouthPlayerFields(xml: string, limit = 3): DebugYouthPlayerRaw[] {
  const parser = new XMLParser();
  const data = parser.parse(xml);
  const root = data?.HattrickData;
  const rawPlayers = root?.PlayerList?.YouthPlayer ?? root?.Team?.PlayerList?.YouthPlayer;
  const players: Record<string, unknown>[] = Array.isArray(rawPlayers) ? rawPlayers : rawPlayers ? [rawPlayers] : [];

  return players.slice(0, limit).map((p) => {
    const firstName = String(p.FirstName ?? "").trim();
    const lastName = String(p.LastName ?? "").trim();
    const ageLikeKeys = Object.keys(p).filter((k) => /age/i.test(k));
    const countryLikeKeys = Object.keys(p).filter((k) => /country|nation/i.test(k));
    return {
      name: [firstName, lastName].filter(Boolean).join(" ") || "Без имени",
      ageLikeFields: ageLikeKeys.length
        ? ageLikeKeys.map((k) => `${k}=${JSON.stringify(p[k])}`).join(", ")
        : "(полей с age в имени не найдено)",
      countryLikeFields: countryLikeKeys.length
        ? countryLikeKeys.map((k) => `${k}=${JSON.stringify(p[k])}`).join(", ")
        : "(полей с country/nation в имени не найдено)",
    };
  });
}
