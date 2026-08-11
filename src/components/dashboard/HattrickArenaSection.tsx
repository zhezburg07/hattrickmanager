import { formatMatchDateTime } from "@/data/dashboard";
import type { ArenaChallengesResult, ArenaRecentMatch } from "@/lib/hattrickArena";
import ProLockOverlay from "./ProLockOverlay";
import styles from "./Matches.module.css";

function formatMaybeDate(raw: string | null): string {
  if (!raw) return "дата не указана";
  const { shortDate, time } = formatMatchDateTime(raw);
  return time ? `${shortDate} · ${time}` : shortDate;
}

export default function HattrickArenaSection({
  challenges,
  arenaResults,
}: {
  challenges: ArenaChallengesResult;
  arenaResults: ArenaRecentMatch[];
}) {
  return (
    <ProLockOverlay
      title="Hattrick Arena"
      description="Доступно на тарифе Pro — результаты, заявки на товарищеские матчи и статус лестниц/приватных турниров."
    >
      <div className={styles.card}>
        <div className={styles.cardTitle}>Hattrick Arena</div>

        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Последние сыгранные матчи</div>
          {arenaResults.length === 0 ? (
            <p className={styles.hint}>Сыгранных матчей через турниры или лестницу не найдено.</p>
          ) : (
            <ul>
              {arenaResults.map((m) => (
                <li key={m.matchId}>
                  {m.opponent} — {m.ourScore}:{m.oppScore} ({m.home ? "дома" : "в гостях"}) · {formatMaybeDate(m.date)}
                  {m.source === "tournament" && m.tournamentName ? ` · ${m.tournamentName}` : ""}
                </li>
              ))}
            </ul>
          )}
          <p className={styles.hint} style={{ marginTop: 8, marginBottom: 0 }}>
            Матчи турниров — через tournamentlist.xml/tournamentfixtures.xml (список турниров команды и их
            результаты). Матчи через лестницу CHPP не отдаёт ни в каком виде — см. пояснение ниже.
          </p>
        </div>

        {challenges.error ? (
          <p className={styles.hint}>{challenges.error}</p>
        ) : (
          <>
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Наши заявки на товарищеский матч</div>
              {challenges.sentByUs.length === 0 ? (
                <p className={styles.hint}>Нет отправленных заявок.</p>
              ) : (
                <ul>
                  {challenges.sentByUs.map((c) => (
                    <li key={c.opponentTeamId}>
                      {c.opponentTeamName} — {formatMaybeDate(c.matchDate)}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Предложения от других команд</div>
              {challenges.offersFromOthers.length === 0 ? (
                <p className={styles.hint}>Нет предложений.</p>
              ) : (
                <ul>
                  {challenges.offersFromOthers.map((c) => (
                    <li key={c.opponentTeamId}>
                      {c.opponentTeamName} — {formatMaybeDate(c.matchDate)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        <p className={styles.hint} style={{ marginTop: 18 }}>
          Лестницы (ladder): подтверждено на реальных данных — CHPP не даёт способа получить эти матчи ни через
          основной список матчей команды, ни через ladderlist.xml (общий список всех лестниц игры без привязки к
          команде), ни через ladderdetails.xml (нужен заранее известный ID лестницы, который CHPP не сообщает). Это
          честное ограничение самого CHPP, а не пропуск в синхронизации.
        </p>
      </div>
    </ProLockOverlay>
  );
}
