import { NextRequest, NextResponse } from "next/server";
import { getStoredHattrickTokens } from "@/lib/hattrickApi";
import { resolvePlayerEvents } from "@/lib/playerEvents";

// Вызывается с клиента при раскрытии блока "История карьеры" в карточке
// игрока (см. PlayerDetailModal.tsx) — по конкретному PlayerID, "по
// требованию", а не заранее для всего состава сразу.
export async function GET(request: NextRequest) {
  const tokens = await getStoredHattrickTokens();
  if (!tokens) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const playerId = request.nextUrl.searchParams.get("playerId");
  if (!playerId) {
    return NextResponse.json({ error: "Не указан playerId" }, { status: 400 });
  }

  const result = await resolvePlayerEvents(tokens, playerId);
  return NextResponse.json(result);
}
