// Счётчик посещений на верхней полосе главной страницы — реальные данные из
// Vercel Web Analytics (уже включена в панели проекта), через официальный
// Web Analytics API (GET /v1/query/web-analytics/visits/count), доступный с
// мая 2026 на любом плане, где включена Web Analytics. Нужны три переменные
// окружения:
//   VERCEL_ANALYTICS_TOKEN — токен доступа (Vercel → Account Settings →
//     Tokens), НЕ путать с автоматической системной переменной VERCEL_*.
//   VERCEL_PROJECT_ID — ID проекта (Vercel → Project Settings → General).
//   VERCEL_TEAM_ID — ID команды (если проект принадлежит команде, а не
//     личному аккаунту) — для личного аккаунта не задавайте вовсе.
// Если что-то из этого не настроено или запрос не удался — счётчик честно
// показывает "—" вместо чисел, никогда не показывает выдуманные значения.
export interface VisitStat {
  label: string;
  value: number | null; // null — не удалось получить (см. VercelAnalyticsResult.error)
}

export interface VercelAnalyticsResult {
  stats: VisitStat[];
  // Только для серверных логов — на публичной странице не показывается
  // (не стоит показывать посетителям сайта детали настройки токенов).
  error: string | null;
}

const emptyStats: VisitStat[] = [
  { label: "Сегодня", value: null },
  { label: "За неделю", value: null },
  { label: "За месяц", value: null },
  { label: "Всего", value: null },
];

interface CountResponse {
  data?: { pageviews?: number; visitors?: number };
}

async function fetchVisitorCount(
  since: string | null,
  token: string,
  projectId: string,
  teamId: string | undefined,
): Promise<number | null> {
  const params = new URLSearchParams({ projectId });
  if (since) params.set("since", since);
  if (teamId) params.set("teamId", teamId);

  const url = `https://api.vercel.com/v1/query/web-analytics/visits/count?${params.toString()}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    // Публичная главная страница может открываться часто — кэшируем на
    // минуту, чтобы не дёргать Vercel API на каждый заход и не упереться в
    // лимиты; для счётчика посещений отставание в пределах минуты не важно.
    next: { revalidate: 60 },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} (since=${since ?? "всё время"}): ${(await res.text()).slice(0, 200)}`);
  }

  const json = (await res.json()) as CountResponse;
  return json.data?.visitors ?? null;
}

// "За неделю"/"За месяц" — скользящее окно (последние 7/30 дней), а не
// календарная неделя/месяц — проще и не зависит от часового пояса.
export async function resolveVisitStats(): Promise<VercelAnalyticsResult> {
  const token = process.env.VERCEL_ANALYTICS_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;

  if (!token || !projectId) {
    return {
      stats: emptyStats,
      error: "Не заданы VERCEL_ANALYTICS_TOKEN / VERCEL_PROJECT_ID — счётчик посещений не настроен.",
    };
  }

  const now = Date.now();
  const startOfToday = new Date(now);
  startOfToday.setUTCHours(0, 0, 0, 0);
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

  try {
    const [today, week, month, total] = await Promise.all([
      fetchVisitorCount(startOfToday.toISOString(), token, projectId, teamId),
      fetchVisitorCount(weekAgo.toISOString(), token, projectId, teamId),
      fetchVisitorCount(monthAgo.toISOString(), token, projectId, teamId),
      fetchVisitorCount(null, token, projectId, teamId),
    ]);

    return {
      stats: [
        { label: "Сегодня", value: today },
        { label: "За неделю", value: week },
        { label: "За месяц", value: month },
        { label: "Всего", value: total },
      ],
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    return { stats: emptyStats, error: `Vercel Web Analytics API: ${message}` };
  }
}
