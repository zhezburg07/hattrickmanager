import { neon } from "@neondatabase/serverless";
import type { FinanceWeekData } from "./economy";

// "На прошлой неделе" в реальном финансовом отчёте Hattrick — это отдельная,
// уже ЗАВЕРШИВШАЯСЯ неделя, а не то, что можно получить вторым запросом к
// economy.xml (CHPP отдаёт только текущий "Last*" срез — см. комментарии в
// economy.ts). Поэтому, как и с недельным TSI (см. player_weekly_tsi в
// playerHistoryDb.ts), мы сами копим историю: при каждом visit на Финансы
// сохраняем срез текущей недели в свою календарную "ячейку", а "прошлой
// неделей" считаем ячейку, сохранённую 7 дней назад.
function sql() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Не задана переменная окружения DATABASE_URL — база данных не подключена.");
  }
  return neon(url);
}

let tableEnsured = false;

async function ensureTable(): Promise<void> {
  if (tableEnsured) return;
  const db = sql();
  await db`
    CREATE TABLE IF NOT EXISTS team_weekly_finance (
      hattrick_user_id TEXT NOT NULL,
      week_start DATE NOT NULL,
      snapshot JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (hattrick_user_id, week_start)
    )
  `;
  tableEnsured = true;
}

// Сохраняет срез текущей недели (обновляется при каждом visit на этой же
// календарной неделе, как и player_weekly_tsi).
export async function saveWeeklyFinanceSnapshot(hattrickUserId: string, data: FinanceWeekData): Promise<void> {
  await ensureTable();
  const db = sql();
  await db`
    INSERT INTO team_weekly_finance (hattrick_user_id, week_start, snapshot, updated_at)
    VALUES (${hattrickUserId}, date_trunc('week', now())::date, ${JSON.stringify(data)}, now())
    ON CONFLICT (hattrick_user_id, week_start)
    DO UPDATE SET snapshot = EXCLUDED.snapshot, updated_at = now()
  `;
}

// Возвращает срез, сохранённый ровно неделю назад — если его нет (первая
// неделя использования сайта или пользователь не заходил на Финансы неделю
// назад), возвращает null, и блок "На прошлой неделе" честно показывает
// "недостаточно данных" вместо гадания.
export async function getLastWeekFinanceSnapshot(hattrickUserId: string): Promise<FinanceWeekData | null> {
  await ensureTable();
  const db = sql();
  const rows = await db`
    SELECT snapshot
    FROM team_weekly_finance
    WHERE hattrick_user_id = ${hattrickUserId}
      AND week_start = (date_trunc('week', now())::date - interval '7 days')::date
  `;
  if (rows.length === 0) return null;
  return rows[0].snapshot as FinanceWeekData;
}

// Сохраняет срез текущей недели и возвращает срез недели, случившейся ровно
// 7 дней назад (или null). Ошибки базы не должны ломать страницу Финансов —
// просто в этот раз "прошлая неделя" не покажется.
export async function resolveLastWeekFinance(
  hattrickUserId: string | null,
  currentWeek: FinanceWeekData,
): Promise<FinanceWeekData | null> {
  if (!hattrickUserId) return null;
  try {
    const lastWeek = await getLastWeekFinanceSnapshot(hattrickUserId);
    await saveWeeklyFinanceSnapshot(hattrickUserId, currentWeek);
    return lastWeek;
  } catch {
    return null;
  }
}
