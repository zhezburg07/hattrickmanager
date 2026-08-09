import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";
import { requestChppXmlRaw, type StoredHattrickTokens } from "./hattrickApi";

// ИСПРАВЛЕНО: раньше здесь запрашивался файл "transfers" — такого файла
// вообще нет в официальном списке CHPP Files (тот же паттерн ошибки, что
// раньше был с "manager" вместо "managercompendium"), сама схема ответа была
// лишь предположением, ни разу не проверенным на живом ответе. Реальный файл
// для трансферов — transfersteam (v1.2): история купленных/проданных игроков
// КОМАНДЫ + агрегированные суммы. НЕТ отдельного файла для "что сейчас
// выставлено на продажу этой командой" — CHPP отдаёт только завершённую
// историю. Живой поиск по рынку (transfersearch) и история одного игрока
// (transfersplayer) убраны — вкладка "Трансферы" показывает только
// последние сделки самой команды (см. чат "Трансферы: убрать поиск").
//
// Валюта: TransferSteamXML.Stats.TotalSumOfBuys/TotalSumOfSales официально
// документированы как ВСЕГДА в шведских кронах (SEK), независимо от локальной
// валюты команды — единственное такое исключение. Цена конкретного трансфера
// (Price/AskingPrice/HighestBid) такого исключения не имеет, значит идёт в
// обычной локальной валюте команды — как и все суммы в economy.xml.
export const TRANSFERS_TEAM_VERSION = "1.2";

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

// ---------- История трансферов команды (transfersteam.xml) ----------

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

// Дозапрашивает ВСЕ более старые страницы transfersteam.xml (номер меньше),
// пока не дойдёт до страницы 1 (вся карьерная история собрана) или не
// упрётся в защитный лимит options.maxExtraFetches — см. чат "Трансферы:
// покажи все сделки за карьеру" (раньше здесь была ранняя остановка после
// первых ~25 набранных сделок, теперь по явному запросу пользователя — вся
// история). pageIndex=0 отдаёт только ПОСЛЕДНЮЮ страницу истории (самую
// новую), которая может оказаться частичной на границе карьеры команды —
// отсюда и нужен обход остальных страниц. Итоговый список явно
// сортируется по Deadline (по убыванию — новые сверху), а не полагается на
// порядок страниц/записей внутри страницы, который CHPP нигде не
// документирует. Принимает fetchPage как параметр (а не сам делает
// HTTP-запрос) специально для тестируемости — вызывающая сторона
// (chppSync.ts) передаёт настоящий requestChppXmlRaw, а проверка на mock-
// данных передаёт свою функцию.
export interface TransferPageFetchResult {
  httpStatus: number;
  rawXml: string;
}

export async function accumulateTransferHistory(
  firstPage: TransferHistoryResult,
  fetchPage: (pageIndex: number) => Promise<TransferPageFetchResult>,
  options: { maxExtraFetches: number },
): Promise<{ result: TransferHistoryResult; pageLog: string[] }> {
  let result = firstPage;
  const pageLog: string[] = [`стр.${result.pageIndex}/${result.pages}: ${result.transfers.length} сделок`];
  let currentPage = result.pageIndex;
  let extraFetches = 0;

  while (currentPage > 1 && extraFetches < options.maxExtraFetches) {
    currentPage -= 1;
    extraFetches += 1;
    const pageRaw = await fetchPage(currentPage);
    if (pageRaw.httpStatus < 200 || pageRaw.httpStatus >= 300) {
      pageLog.push(`стр.${currentPage}: HTTP ${pageRaw.httpStatus}`);
      break;
    }
    try {
      const page = parseTransfersTeamXml(pageRaw.rawXml);
      pageLog.push(`стр.${page.pageIndex}/${page.pages}: ${page.transfers.length} сделок`);
      result = { ...result, transfers: [...result.transfers, ...page.transfers] };
    } catch (err) {
      const message = err instanceof Error ? err.message : "неизвестная ошибка";
      pageLog.push(`стр.${currentPage}: ошибка разбора — ${message}`);
      break;
    }
  }

  result = { ...result, transfers: [...result.transfers].sort((a, b) => b.deadline.localeCompare(a.deadline)) };
  return { result, pageLog };
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
