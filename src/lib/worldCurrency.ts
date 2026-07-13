import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";
import { requestChppXmlRaw, type StoredHattrickTokens } from "./hattrickApi";
import { parseTeamDetailsXml } from "./teamDetails";
import { resolveCountryByEnglishName, type Country } from "@/data/squad";

// Небольшой словарь для известных, проверенных на реальных ответах Hattrick
// названий валют — CHPP отдаёт их по-английски (например, "tenge", "kr").
// Для валют, которых здесь нет, используем как есть то, что прислал CHPP,
// вместо того чтобы гадать перевод.
const knownCurrencyLabels: Record<string, string> = {
  tenge: "тенге",
  kr: "крон",
};

export interface WorldLeagueInfo {
  currencyLabel: string;
  countryId: string;
  countryEnglishName: string;
}

// Разбирает XML-ответ CHPP на файл worlddetails.xml, отфильтрованный по
// нашему LeagueID (параметр LeagueID) — без фильтра этот файл отдаёт список
// ВСЕХ лиг мира (сотни записей) и, как показала проверка на реальном
// аккаунте, делает это ненадёжно (один и тот же запрос без фильтра дважды
// вернул разные по размеру ответы) — фильтр по своей лиге обязателен и
// единственный надёжный вариант. Валюта и страна команды нигде не
// встречаются в economy.xml/teamdetails.xml — только здесь.
export function parseWorldLeagueInfoXml(xml: string): WorldLeagueInfo {
  const parser = new XMLParser();
  const data = parser.parse(xml);

  const root = data?.HattrickData;
  assertNoChppError(root, "worlddetails");

  const rawLeague = root?.LeagueList?.League;
  const league = Array.isArray(rawLeague) ? rawLeague[0] : rawLeague;
  const currencyName = league?.Country?.CurrencyName;
  const countryId = league?.Country?.CountryID;
  const countryEnglishName = league?.EnglishName;
  if (!currencyName || !countryId || !countryEnglishName) {
    throw new Error("В ответе worlddetails.xml нет данных о валюте/стране (<CurrencyName>/<CountryID>/<EnglishName>).");
  }

  const rawCurrency = String(currencyName);
  return {
    currencyLabel: knownCurrencyLabels[rawCurrency.toLowerCase()] ?? rawCurrency,
    countryId: String(countryId),
    countryEnglishName: String(countryEnglishName),
  };
}

async function fetchWorldLeagueInfo(
  tokens: StoredHattrickTokens,
): Promise<{ data: WorldLeagueInfo | null; error: string | null }> {
  try {
    const teamRaw = await requestChppXmlRaw("teamdetails", {}, tokens);
    if (teamRaw.httpStatus < 200 || teamRaw.httpStatus >= 300) {
      throw new Error(`HTTP ${teamRaw.httpStatus}: ${teamRaw.rawXml.slice(0, 200)}`);
    }
    const leagueId = parseTeamDetailsXml(teamRaw.rawXml).leagueId;

    const worldRaw = await requestChppXmlRaw("worlddetails", { LeagueID: leagueId }, tokens);
    if (worldRaw.httpStatus < 200 || worldRaw.httpStatus >= 300) {
      throw new Error(`HTTP ${worldRaw.httpStatus}: ${worldRaw.rawXml.slice(0, 200)}`);
    }
    return { data: parseWorldLeagueInfoXml(worldRaw.rawXml), error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    return { data: null, error: `Валюта/страна (teamdetails/worlddetails): ${message}` };
  }
}

// Используется на страницах "Финансы", "Стадион" и панелью финансов в "Обзоре".
export async function resolveRealCurrencyLabel(
  tokens: StoredHattrickTokens,
): Promise<{ label: string | null; error: string | null }> {
  const { data, error } = await fetchWorldLeagueInfo(tokens);
  return { label: data?.currencyLabel ?? null, error };
}

export interface HomeCountryInfo {
  countryId: string;
  country: Country;
}

// Используется на страницах "Состав" и "Расстановка", чтобы узнать флаг
// игроков, чей CountryID совпадает с домашней страной команды (см.
// src/lib/squadPlayers.ts).
export async function resolveRealHomeCountry(
  tokens: StoredHattrickTokens,
): Promise<{ homeCountry: HomeCountryInfo | null; error: string | null }> {
  const { data, error } = await fetchWorldLeagueInfo(tokens);
  if (!data) return { homeCountry: null, error };
  return {
    homeCountry: { countryId: data.countryId, country: resolveCountryByEnglishName(data.countryEnglishName) },
    error: null,
  };
}
