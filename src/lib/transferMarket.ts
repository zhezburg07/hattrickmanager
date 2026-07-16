import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";
import { requestChppXmlRaw, type StoredHattrickTokens } from "./hattrickApi";

// Собственные трансферные листинги команды — CHPP-файл "transfers" (по
// документации отдаёт список игроков, выставленных ЭТОЙ командой на
// трансфер). Ни разу не пробовался в этом проекте живьём до сих пор —
// прошлая пометка "заблокировано (401)" в истории задач ничем не
// подтверждена (ни кода, ни сырого ответа не нашлось) — это первая реальная
// попытка. Схема полей — лучшее предположение по аналогии с players.xml/
// matches.xml (PlayerID/PlayerName, Deadline, разбивка ставки); если
// реальный ответ устроен иначе — ошибка будет честно возвращена вызывающему
// коду, который покажет простую заглушку без технических деталей.
export interface RealTransferListing {
  playerId: number;
  playerName: string;
  askingPrice: number;
  currentBid: number;
  bidCount: number;
  deadline: string;
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : value ? [value as Record<string, unknown>] : [];
}

export function parseTransfersXml(xml: string): RealTransferListing[] {
  const parser = new XMLParser();
  const data = parser.parse(xml);
  const root = data?.HattrickData;
  assertNoChppError(root, "transfers");

  const rawListings = root?.TransferListings?.TransferListing ?? root?.Team?.TransferList?.Transfer;
  const listings = asArray(rawListings);

  return listings.map((t) => ({
    playerId: Number(t.PlayerID ?? 0),
    playerName: String(t.PlayerName ?? ""),
    askingPrice: Number(t.AskingPrice ?? t.MinimumBid ?? 0),
    currentBid: Number(t.CurrentBid ?? t.HighestBid ?? 0),
    bidCount: Number(t.NumberOfBids ?? t.Bids ?? 0),
    deadline: String(t.Deadline ?? ""),
  }));
}

export interface TransferMarketResult {
  listings: RealTransferListing[] | null;
  error: string | null;
}

// Пытается получить реальные листинги команды. Не запрашивает никакой
// OAuth-scope сверх обычного — если CHPP всё же требует отдельное разрешение
// для этого файла, здесь это проявится как обычная ошибка (HTTP-статус или
// Error/ErrorCode в теле ответа), и вызывающий код честно откатится на
// заглушку "раздел скоро станет доступен", не показывая технические детали.
export async function resolveTransferListings(tokens: StoredHattrickTokens): Promise<TransferMarketResult> {
  try {
    const raw = await requestChppXmlRaw("transfers", {}, tokens);
    if (raw.httpStatus < 200 || raw.httpStatus >= 300) {
      throw new Error(`HTTP ${raw.httpStatus}: ${raw.rawXml.slice(0, 200)}`);
    }
    return { listings: parseTransfersXml(raw.rawXml), error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    return { listings: null, error: `Трансферы (transfers): ${message}` };
  }
}
