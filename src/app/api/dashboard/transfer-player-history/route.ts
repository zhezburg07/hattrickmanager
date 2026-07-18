import { NextRequest, NextResponse } from "next/server";
import { getStoredHattrickTokens } from "@/lib/hattrickApi";
import { resolvePlayerTransferHistory } from "@/lib/transferMarket";

// Вызывается с клиента при раскрытии строки конкретного игрока в
// результатах поиска/истории трансферов (см. TransferSearchPanel.tsx) —
// история одного игрока нужна только "по клику", не для всех подряд сразу.
export async function GET(request: NextRequest) {
  const tokens = await getStoredHattrickTokens();
  if (!tokens) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const playerId = request.nextUrl.searchParams.get("playerId");
  if (!playerId) {
    return NextResponse.json({ error: "Не указан playerId" }, { status: 400 });
  }

  const result = await resolvePlayerTransferHistory(tokens, playerId);
  return NextResponse.json(result);
}
