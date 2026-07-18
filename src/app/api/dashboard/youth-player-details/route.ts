import { NextRequest, NextResponse } from "next/server";
import { getStoredHattrickTokens } from "@/lib/hattrickApi";
import { resolveYouthPlayerDetails } from "@/lib/youthPlayerDetails";

// Вызывается при открытии карточки юношеского игрока (см.
// YouthPlayerDetailModal.tsx) — по конкретному YouthPlayerID, "по требованию".
export async function GET(request: NextRequest) {
  const tokens = await getStoredHattrickTokens();
  if (!tokens) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const youthPlayerId = request.nextUrl.searchParams.get("youthPlayerId");
  if (!youthPlayerId) {
    return NextResponse.json({ error: "Не указан youthPlayerId" }, { status: 400 });
  }

  const result = await resolveYouthPlayerDetails(tokens, youthPlayerId);
  return NextResponse.json(result);
}
