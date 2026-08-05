import { NextResponse } from "next/server";
import { getStoredHattrickTokens, getStoredHattrickUserId } from "@/lib/hattrickApi";
import { syncTeamData } from "@/lib/chppSync";

// Единственная точка входа для синхронизации данных CHPP в базу — вызывается
// и автоматически (см. dashboard/page.tsx — при первом визите после
// подключения команды, если chpp_sync_status ещё нет), и вручную (кнопка
// "Обновить данные" на "Обновления", см. UpdatesSection.tsx). Оба случая —
// один и тот же POST-запрос, просто с разным триггером на клиенте/сервере.
export async function POST() {
  const tokens = await getStoredHattrickTokens();
  const hattrickUserId = await getStoredHattrickUserId();

  if (!tokens || !hattrickUserId) {
    return NextResponse.json({ error: "Команда не подключена — синхронизировать нечего." }, { status: 401 });
  }

  const result = await syncTeamData(hattrickUserId, tokens);
  return NextResponse.json(result);
}
