import { NextRequest, NextResponse } from "next/server";
import { getStoredHattrickTokens } from "@/lib/hattrickApi";
import { resolveTrainingEvents } from "@/lib/trainingEvents";

// Вызывается с клиента при раскрытии блока "Официальный журнал тренировок"
// в карточке игрока (см. PlayerDetailModal.tsx) — по конкретному PlayerID,
// "по требованию".
export async function GET(request: NextRequest) {
  const tokens = await getStoredHattrickTokens();
  if (!tokens) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const playerId = request.nextUrl.searchParams.get("playerId");
  if (!playerId) {
    return NextResponse.json({ error: "Не указан playerId" }, { status: 400 });
  }

  const result = await resolveTrainingEvents(tokens, playerId);
  return NextResponse.json(result);
}
