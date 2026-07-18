import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";
import { requestChppXmlRaw, type StoredHattrickTokens } from "./hattrickApi";

// ИСПРАВЛЕНО: раньше здесь запрашивался файл "transfers" — такого файла
// вообще нет в официальном списке CHPP Files (тот же паттерн ошибки, что
// раньше был с "manager" вместо "managercompendium"), сама схема ответа была
// лишь предположением, ни разу не проверенным на живом ответе. Реальных
// файлов для трансферов три (подтверждено по независимому CHPP-клиенту
// github.com/lucianoq/hattrick):
//   - transfersteam (v1.2)   — история купленных/проданных игроков КОМАНДЫ
//     + агрегированные суммы. НЕТ отдельного файла для "что сейчас выставлено
//     на продажу этой командой" — CHPP отдаёт только завершённую историю.
//   - transfersearch (v1.1) — поиск по всему трансферному рынку с обязательными
//     фильтрами (возраст + один основной навык) — это и есть ближайший
//     аналог "рынка трансферов", доступный через CHPP.
//   - transfersplayer (v1.1) — история трансферов ОДНОГО игрока (используется
//     "по клику" на конкретного игрока в результатах поиска/истории).
//
// Валюта: TransferSteamXML.Stats.TotalSumOfBuys/TotalSumOfSales официально
// документированы как ВСЕГДА в шведских кронах (SEK), независимо от локальной
// валюты команды — единственное такое исключение. Цена конкретного трансфера
// (Price/AskingPrice/HighestBid) такого исключения не имеет, значит идёт в
// обычной локальной валюте команды — как и все суммы в economy.xml.
const TRANSFERS_TEAM_VERSION = "1.2";
const TRANSFERS_SEARCH_VERSION = "1.1";
const TRANSFERS_PLAYER_VERSION = "1.1";

// ПОДТВЕРЖДЁННЫЙ баг (сверено пользователем с реальными суммами на самом
// hattrick.org, см. src/lib/economy.ts): денежные поля CHPP приходят в 10
// раз меньше реальной суммы — это касается любых Money-полей независимо от
// валюты (в т.ч. сумм в шведских кронах ниже). Проверка на null/undefined/
// NaN — до умножения.
function money(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n * 10 : 0;
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : value ? [value as Record<string, unknown>] : [];
}

// ---------- Своя история трансферов (transfersteam.xml) ----------

export interface TransferHistoryEntry {
  transferId: string;
  deadline: string;
  playerId: number;
  playerName: string;
  tsi: number;
  transferType: "buy" | "sale";
  counterpartTeamName: string;
  price: number;
}

export interface TransferHistoryResult {
  teamName: string;
  totalSumOfBuysSek: number;
  totalSumOfSalesSek: number;
  numberOfBuys: number;
  numberOfSales: number;
  transfers: TransferHistoryEntry[];
  pageIndex: number;
  pages: number;
}

export function parseTransfersTeamXml(xml: string): TransferHistoryResult {
  const parser = new XMLParser();
  const data = parser.parse(xml);
  const root = data?.HattrickData;
  assertNoChppError(root, "transfersteam");

  const team = root?.Team as Record<string, unknown> | undefined;
  const stats = root?.Stats as Record<string, unknown> | undefined;
  const transfersContainer = root?.Transfers as Record<string, unknown> | undefined;
  const rawTransfers = asArray(transfersContainer?.Transfer);

  const transfers: TransferHistoryEntry[] = rawTransfers.map((t) => {
    const player = t.Player as Record<string, unknown> | undefined;
    const buyer = t.Buyer as Record<string, unknown> | undefined;
    const seller = t.Seller as Record<string, unknown> | undefined;
    const transferType: "buy" | "sale" = String(player?.TransferType ?? "") === "S" ? "sale" : "buy";
    const counterpartTeamName =
      transferType === "sale" ? String(buyer?.BuyerTeamName ?? "") : String(seller?.SellerTeamName ?? "");
    return {
      transferId: String(t.TransferID ?? ""),
      deadline: String(t.Deadline ?? ""),
      playerId: Number(player?.PlayerID ?? 0),
      playerName: String(player?.PlayerName ?? ""),
      tsi: Number(player?.TSI ?? 0),
      transferType,
      counterpartTeamName,
      price: money(t.Price),
    };
  });

  return {
    teamName: String(team?.TeamName ?? ""),
    totalSumOfBuysSek: money(stats?.TotalSumOfBuys),
    totalSumOfSalesSek: money(stats?.TotalSumOfSales),
    numberOfBuys: Number(stats?.NumberOfBuys ?? 0),
    numberOfSales: Number(stats?.NumberOfSales ?? 0),
    transfers,
    pageIndex: Number(transfersContainer?.PageIndex ?? 0),
    pages: Number(transfersContainer?.Pages ?? 0),
  };
}

export async function resolveTransferHistory(
  tokens: StoredHattrickTokens,
): Promise<{ data: TransferHistoryResult | null; error: string | null }> {
  try {
    // pageIndex=0 — по документации это НЕ буквально "страница 0", а
    // "последняя страница" (самые недавние трансферы).
    const raw = await requestChppXmlRaw("transfersteam", { pageIndex: "0", version: TRANSFERS_TEAM_VERSION }, tokens);
    if (raw.httpStatus < 200 || raw.httpStatus >= 300) {
      throw new Error(`HTTP ${raw.httpStatus}: ${raw.rawXml.slice(0, 200)}`);
    }
    return { data: parseTransfersTeamXml(raw.rawXml), error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    return { data: null, error: `История трансферов (transfersteam): ${message}` };
  }
}

// ---------- Поиск по рынку (transfersearch.xml) ----------

export interface TransferSearchFilters {
  ageMin: number;
  ageMax: number;
  skillType: number; // 1-11, см. SkillID CHPP
  skillMin: number;
  skillMax: number;
}

export interface TransferSearchResultEntry {
  playerId: number;
  name: string;
  age: number;
  tsi: number;
  askingPrice: number;
  deadline: string;
  highestBid: number;
  bidderTeamName: string;
  sellerTeamName: string;
}

export interface TransferSearchResponse {
  itemCount: number;
  pageSize: number;
  pageIndex: number;
  results: TransferSearchResultEntry[];
}

export function parseTransferSearchXml(xml: string): TransferSearchResponse {
  const parser = new XMLParser();
  const data = parser.parse(xml);
  const root = data?.HattrickData;
  assertNoChppError(root, "transfersearch");

  const container = root?.TransferSearch as Record<string, unknown> | undefined;
  const resultsContainer = container?.TransferResults as Record<string, unknown> | undefined;
  const rawResults = asArray(resultsContainer?.TransferResult);

  const results: TransferSearchResultEntry[] = rawResults.map((r) => {
    const details = r.Details as Record<string, unknown> | undefined;
    const bidderTeam = r.BidderTeam as Record<string, unknown> | undefined;
    const sellerTeam = details?.SellerTeam as Record<string, unknown> | undefined;
    const firstLast = `${r.FirstName ?? ""} ${r.LastName ?? ""}`.trim();
    const name = firstLast || String(r.NickName ?? "") || `Игрок #${r.PlayerId ?? "?"}`;
    return {
      playerId: Number(r.PlayerId ?? 0),
      name,
      age: Number(details?.Age ?? 0),
      tsi: Number(details?.TSI ?? 0),
      askingPrice: money(r.AskingPrice),
      deadline: String(r.Deadline ?? ""),
      highestBid: money(r.HighestBid),
      bidderTeamName: String(bidderTeam?.Name ?? ""),
      sellerTeamName: String(sellerTeam?.Name ?? ""),
    };
  });

  return {
    itemCount: Number(container?.ItemCount ?? 0),
    pageSize: Number(container?.PageSize ?? 0),
    pageIndex: Number(container?.PageIndex ?? 0),
    results,
  };
}

export async function resolveTransferSearch(
  tokens: StoredHattrickTokens,
  filters: TransferSearchFilters,
): Promise<{ data: TransferSearchResponse | null; error: string | null }> {
  try {
    const raw = await requestChppXmlRaw(
      "transfersearch",
      {
        ageMin: String(filters.ageMin),
        ageMax: String(filters.ageMax),
        skillType1: String(filters.skillType),
        minSkillValue1: String(filters.skillMin),
        maxSkillValue1: String(filters.skillMax),
        version: TRANSFERS_SEARCH_VERSION,
      },
      tokens,
    );
    if (raw.httpStatus < 200 || raw.httpStatus >= 300) {
      throw new Error(`HTTP ${raw.httpStatus}: ${raw.rawXml.slice(0, 200)}`);
    }
    return { data: parseTransferSearchXml(raw.rawXml), error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    return { data: null, error: `Поиск по рынку (transfersearch): ${message}` };
  }
}

// ---------- История одного игрока (transfersplayer.xml) ----------

export interface PlayerTransferHistoryEntry {
  transferId: string;
  deadline: string;
  buyerTeamName: string;
  sellerTeamName: string;
  price: number;
  tsi: number;
}

export function parseTransfersPlayerXml(xml: string): PlayerTransferHistoryEntry[] {
  const parser = new XMLParser();
  const data = parser.parse(xml);
  const root = data?.HattrickData;
  assertNoChppError(root, "transfersplayer");

  const transfersContainer = root?.Transfers as Record<string, unknown> | undefined;
  const rawTransfers = asArray(transfersContainer?.Transfer);

  return rawTransfers.map((t) => {
    const buyer = t.Buyer as Record<string, unknown> | undefined;
    const seller = t.Seller as Record<string, unknown> | undefined;
    return {
      transferId: String(t.TransferID ?? ""),
      deadline: String(t.Deadline ?? ""),
      buyerTeamName: String(buyer?.BuyerTeamName ?? ""),
      sellerTeamName: String(seller?.SellerTeamName ?? ""),
      price: money(t.Price),
      tsi: Number(t.TSI ?? 0),
    };
  });
}

export async function resolvePlayerTransferHistory(
  tokens: StoredHattrickTokens,
  playerId: string,
): Promise<{ entries: PlayerTransferHistoryEntry[] | null; error: string | null }> {
  try {
    const raw = await requestChppXmlRaw("transfersplayer", { playerID: playerId, version: TRANSFERS_PLAYER_VERSION }, tokens);
    if (raw.httpStatus < 200 || raw.httpStatus >= 300) {
      throw new Error(`HTTP ${raw.httpStatus}: ${raw.rawXml.slice(0, 200)}`);
    }
    return { entries: parseTransfersPlayerXml(raw.rawXml), error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    return { entries: null, error: `История игрока (transfersplayer): ${message}` };
  }
}
