import { NextResponse } from "next/server";
import { getStoredHattrickTokens, getStoredHattrickUserId } from "@/lib/hattrickApi";
import { syncTeamData } from "@/lib/chppSync";
import { getSyncStatus } from "@/lib/chppSyncDb";

// Только чтение статуса — НЕ трогает CHPP вообще (в отличие от POST ниже).
// Используется Header.tsx, чтобы решить, показывать ли на иконке
// "Обновления" напоминание о том, что данные не обновлялись больше недели
// (см. чат) — клиентский fetch по требованию, а не серверное чтение cookie
// прямо в Header.tsx, чтобы не превращать все публичные страницы обратно в
// динамические ради того, что нужно только внутри кабинета.
export async function GET() {
  const hattrickUserId = await getStoredHattrickUserId();
  if (!hattrickUserId) {
    return NextResponse.json({ lastSyncedAt: null });
  }
  const status = await getSyncStatus(hattrickUserId).catch(() => null);
  return NextResponse.json({ lastSyncedAt: status?.lastSyncedAt ?? null });
}

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
