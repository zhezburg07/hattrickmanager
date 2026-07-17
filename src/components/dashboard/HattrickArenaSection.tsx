import { formatMatchDateTime } from "@/data/dashboard";
import type { ArenaChallengesResult } from "@/lib/hattrickArena";
import ProLockOverlay from "./ProLockOverlay";
import styles from "./Matches.module.css";

function formatMaybeDate(raw: string | null): string {
  if (!raw) return "дата не указана";
  const { shortDate, time } = formatMatchDateTime(raw);
  return time ? `${shortDate} · ${time}` : shortDate;
}

export default function HattrickArenaSection({ challenges }: { challenges: ArenaChallengesResult }) {
  return (
    <ProLockOverlay
      title="Hattrick Arena"
      description="Доступно на тарифе Pro — заявки на товарищеские матчи и статус лестниц/приватных турниров."
    >
      <div className={styles.card}>
        <div className={styles.cardTitle}>Hattrick Arena</div>

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
          Лестницы (ladder) и приватные турниры: CHPP не даёт способа определить, в каких лестницах участвует именно
          ваша команда — ladderlist.xml отдаёт общий список всех лестниц игры без привязки к команде, а
          ladderdetails.xml показывает таблицу только по уже известному ID лестницы. Отдельного файла для приватных
          турниров CHPP не предоставляет.
        </p>
      </div>
    </ProLockOverlay>
  );
}
