import { NextRequest, NextResponse } from "next/server";
import { getStoredHattrickTokens } from "@/lib/hattrickApi";
import { resolveMatchAnalysis } from "@/lib/matchAnalysis";

// Вызывается с клиента при раскрытии сыгранного матча в календаре (см.
// src/components/dashboard/MatchDetailAnalysis.tsx) — по конкретному MatchID
// нужен отдельный запрос "по требованию", а не заранее для всех матчей
// сразу (это был бы десяток лишних обращений к CHPP на одну загрузку
// страницы).
export async function GET(request: NextRequest) {
  const tokens = await getStoredHattrickTokens();
  if (!tokens) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const matchId = request.nextUrl.searchParams.get("matchId");
  if (!matchId) {
    return NextResponse.json({ error: "Не указан matchId" }, { status: 400 });
  }

  const result = await resolveMatchAnalysis(tokens, matchId);
  return NextResponse.json(result);
}
