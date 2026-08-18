import { getTacticMidfieldComparison } from "@/lib/matchResearchDb";

// force-dynamic — без auth/cookies() эта страница не даёт Next.js повода
// считать её динамической сама по себе, и билд статически пререндерит её
// ОДИН раз (проверено: без этой строки build пометил маршрут "○ Static" —
// зафиксировал бы результат на момент сборки, а не запрашивал бы БД заново
// при каждом визите, что для живой диагностики бессмысленно).
export const dynamic = "force-dynamic";

// ВРЕМЕННАЯ страница — см. комментарий у getTacticMidfieldComparison в
// src/lib/matchResearchDb.ts. Проверяет, отражена ли официальная поправка
// "Контратаки: −7% к полузащите" уже в самом RatingMidfield (matchdetails.xml),
// который использует computePowerIndex — если да, явная поправка в коде
// была бы двойным счётом. Удалить эту страницу и getTacticMidfieldComparison
// после проверки.
export default async function VerifyTacticMidfieldTmp() {
  let rows: Awaited<ReturnType<typeof getTacticMidfieldComparison>> = [];
  let error: string | null = null;
  try {
    rows = await getTacticMidfieldComparison();
  } catch (err) {
    error = err instanceof Error ? err.message : "неизвестная ошибка";
  }

  const avgPctDiff = rows.length > 0 ? rows.reduce((sum, r) => sum + r.pctDiff, 0) / rows.length : null;

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto", fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 20 }}>Контратаки vs Обычная игра: RatingMidfield одной и той же команды</h1>
      <p style={{ color: "#666", fontSize: 14, lineHeight: 1.5 }}>
        Для каждой команды, у которой в обезличенном журнале матчей (match_research_log) есть и матчи с тактикой
        &laquo;Контратаки&raquo;, и матчи с &laquo;Обычной игрой&raquo; — средний RatingMidfield в каждой группе и
        разница в процентах. Если разница стабильно около −7% — официальная поправка уже отражена в самом
        RatingMidfield (computePowerIndex ничего менять не нужно). Если разница около 0% — рейтинг не учитывает
        тактику, и явную поправку стоит добавить.
      </p>

      {error && (
        <p style={{ color: "#b00", fontWeight: 600 }}>Ошибка запроса к БД: {error}</p>
      )}

      {!error && rows.length === 0 && (
        <p style={{ color: "#b60" }}>
          Пока нет ни одной команды, у которой в журнале есть матчи ОБОИХ тактик одновременно — данных
          недостаточно для проверки. Это не ошибка, просто журнал ещё маленький (заполняется только когда кто-то
          открывает разбор конкретного матча на вкладке «Матчи»).
        </p>
      )}

      {rows.length > 0 && (
        <>
          <p style={{ fontSize: 14 }}>
            Команд с обеими тактиками: <b>{rows.length}</b>. Среднее отклонение по всем командам:{" "}
            <b>{avgPctDiff?.toFixed(1)}%</b>.
          </p>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #ccc", textAlign: "right" }}>
                <th style={{ textAlign: "left", padding: 6 }}>TeamID</th>
                <th style={{ padding: 6 }}>Ср. полузащита (Обычная)</th>
                <th style={{ padding: 6 }}>N (Обычная)</th>
                <th style={{ padding: 6 }}>Ср. полузащита (Контратаки)</th>
                <th style={{ padding: 6 }}>N (Контратаки)</th>
                <th style={{ padding: 6 }}>Разница, %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.teamId} style={{ borderBottom: "1px solid #eee", textAlign: "right" }}>
                  <td style={{ textAlign: "left", padding: 6 }}>{r.teamId}</td>
                  <td style={{ padding: 6 }}>{r.avgMidfieldNormal.toFixed(1)}</td>
                  <td style={{ padding: 6 }}>{r.nNormal}</td>
                  <td style={{ padding: 6 }}>{r.avgMidfieldCounterAttack.toFixed(1)}</td>
                  <td style={{ padding: 6 }}>{r.nCounterAttack}</td>
                  <td style={{ padding: 6, fontWeight: 700, color: r.pctDiff < 0 ? "#0a0" : "#b00" }}>
                    {r.pctDiff > 0 ? "+" : ""}
                    {r.pctDiff.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
