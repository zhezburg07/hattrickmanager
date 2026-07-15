import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";
import { requestChppXmlRaw, type StoredHattrickTokens } from "./hattrickApi";
import { resolveCountryByEnglishName, type Country } from "@/data/squad";

export interface WorldCountryEntry {
  countryId: string;
  englishName: string; // как CHPP называет страну в <League><EnglishName> — то же поле, что уже использует src/lib/worldCurrency.ts для одной страны
}

// Разбирает worlddetails.xml, запрошенный БЕЗ фильтра LeagueID — тогда CHPP
// отдаёт список ВСЕХ лиг мира, а у каждой лиги есть <Country><CountryID>.
// В Hattrick одна "домашняя" лига на страну, так что это и есть полный
// список CountryID → название страны (~156 записей).
export function parseWorldCountriesXml(xml: string): WorldCountryEntry[] {
  const parser = new XMLParser();
  const data = parser.parse(xml);

  const root = data?.HattrickData;
  assertNoChppError(root, "worlddetails");

  const rawLeagues = root?.LeagueList?.League;
  const leagues: Record<string, unknown>[] = Array.isArray(rawLeagues) ? rawLeagues : rawLeagues ? [rawLeagues] : [];

  return leagues
    .map((league) => {
      const country = league.Country as Record<string, unknown> | undefined;
      return {
        countryId: country?.CountryID !== undefined ? String(country.CountryID) : "",
        englishName: league.EnglishName !== undefined ? String(league.EnglishName) : "",
      };
    })
    .filter((c) => c.countryId !== "" && c.englishName !== "");
}

// В Hattrick примерно 156 стран (см. src/data/hattrickCountries.ts). Запрос
// worlddetails.xml БЕЗ фильтра по LeagueID уже проверялся раньше на живых
// данных и оказался ненадёжным — один и тот же запрос без фильтра дважды
// вернул разные по размеру списки (иногда обрезанные до одной страны). Раз
// так, доверять такому ответу можно только если стран получилось разумно
// много — иначе, скорее всего, пришёл урезанный ответ, и лучше не строить
// из него таблицу (не показывать неверные флаги вместо честной заглушки).
const MIN_PLAUSIBLE_COUNTRIES = 100;

export function isWorldCountriesListPlausible(entries: WorldCountryEntry[]): boolean {
  return entries.length >= MIN_PLAUSIBLE_COUNTRIES;
}

export function buildCountryIdLookup(entries: WorldCountryEntry[]): Record<string, Country> {
  const lookup: Record<string, Country> = {};
  for (const entry of entries) {
    lookup[entry.countryId] = resolveCountryByEnglishName(entry.englishName);
  }
  return lookup;
}

// Список стран практически никогда не меняется — кешируем в памяти процесса
// на сутки, чтобы не делать этот (потенциально ненадёжный) запрос заново на
// каждой загрузке "Состава"/"Расстановки". Кеш не переживает холодный старт
// serverless-функции на Vercel — это ок, тогда просто запросится заново.
let cachedLookup: { lookup: Record<string, Country>; countriesFound: number; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface CountryIdLookupResult {
  lookup: Record<string, Country> | null;
  countriesFound: number;
  error: string | null;
}

export async function getCountryIdLookup(tokens: StoredHattrickTokens): Promise<CountryIdLookupResult> {
  if (cachedLookup && Date.now() - cachedLookup.fetchedAt < CACHE_TTL_MS) {
    return { lookup: cachedLookup.lookup, countriesFound: cachedLookup.countriesFound, error: null };
  }

  try {
    const raw = await requestChppXmlRaw("worlddetails", {}, tokens);
    if (raw.httpStatus < 200 || raw.httpStatus >= 300) {
      throw new Error(`HTTP ${raw.httpStatus}: ${raw.rawXml.slice(0, 200)}`);
    }
    const entries = parseWorldCountriesXml(raw.rawXml);
    if (!isWorldCountriesListPlausible(entries)) {
      throw new Error(
        `Получено только ${entries.length} стран (ожидалось ~156) — похоже на урезанный ответ, как уже бывало без фильтра LeagueID, не используем.`,
      );
    }

    const lookup = buildCountryIdLookup(entries);
    cachedLookup = { lookup, countriesFound: entries.length, fetchedAt: Date.now() };
    return { lookup, countriesFound: entries.length, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    return { lookup: null, countriesFound: 0, error: message };
  }
}
