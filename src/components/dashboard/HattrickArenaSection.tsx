import { formatMatchDateTime } from "@/data/dashboard";
import type { ArenaChallengesResult, ArenaRecentMatch, ArenaTournamentSummary } from "@/lib/hattrickArena";
import ProLockOverlay from "./ProLockOverlay";
import styles from "./Matches.module.css";

function formatMaybeDate(raw: string | null): string {
  if (!raw) return "дата не указана";
  const { shortDate, time } = formatMatchDateTime(raw);
  return time ? `${shortDate} · ${time}` : shortDate;
}

export default function HattrickArenaSection({
  challenges,
  arenaMatches = [],
  arenaTournaments = [],
}: {
  challenges: ArenaChallengesResult;
  arenaMatches?: ArenaRecentMatch[];
  arenaTournaments?: ArenaTournamentSummary[];
}) {
  const wonTournaments = arenaTournaments.filter((t) => t.wonTrophy);
  const ongoingTournaments = arenaTournaments.filter((t) => t.isOngoing);

  return (
    <ProLockOverlay
      title="Hattrick Arena"
      description="Доступно на тарифе Pro — трофеи, турниры, результаты и заявки на товарищеские матчи."
    >
      <div className={styles.card}>
        <div className={styles.cardTitle}>Трофеи и турниры</div>

        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Выигранные трофеи</div>
          {wonTournaments.length === 0 ? (
            <p className={styles.hint} style={{ marginBottom: 0 }}>
              Пока нет турниров с определённой победой.
            </p>
          ) : (
            <ul className={styles.trophyList}>
              {wonTournaments.map((t) => (
                <li key={t.tournamentId} className={styles.trophyItem}>
                  <span className={styles.trophyIcon}>🏆</span>
                  {t.name}
                </li>
              ))}
            </ul>
          )}
          <p className={styles.hint} style={{ marginTop: 8, marginBottom: 0 }}>
            CHPP не даёт официального флага "турнир выигран" — это предположение по результату последнего сыгранного
            матча плей-офф стадии турнира, а не подтверждённый факт от Hattrick.
          </p>
        </div>

        <div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Турниры прямо сейчас</div>
          {ongoingTournaments.length === 0 ? (
            <p className={styles.hint} style={{ marginBottom: 0 }}>
              Сейчас команда не участвует ни в одном турнире.
            </p>
          ) : (
            <ul className={styles.trophyList}>
              {ongoingTournaments.map((t) => (
                <li key={t.tournamentId} className={styles.trophyItem}>
                  {t.name}
                  <span className={styles.ongoingTournamentBadge}>идёт сейчас</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>Матчи Арены</div>
        {arenaMatches.length === 0 ? (
          <p className={styles.hint} style={{ marginBottom: 0 }}>
            Сыгранных матчей через турниры или лестницу не найдено.
          </p>
        ) : (
          <ul>
            {arenaMatches.map((m) => (
              <li key={m.matchId}>
                {m.opponent} — {m.ourScore}:{m.oppScore} ({m.home ? "дома" : "в гостях"}) · {formatMaybeDate(m.date)}
                {m.source === "tournament" && m.tournamentName ? ` · ${m.tournamentName}` : ""}
              </li>
            ))}
          </ul>
        )}
        <p className={styles.hint} style={{ marginTop: 8, marginBottom: 0 }}>
          Матчи турниров — через tournamentlist.xml/tournamentfixtures.xml (список турниров команды и их результаты).
          Матчи через лестницу CHPP не отдаёт ни в каком виде — см. пояснение ниже.
        </p>
      </div>

      <div className={styles.card}>
        {challenges.error ? (
          <p className={styles.hint} style={{ marginBottom: 0 }}>
            {challenges.error}
          </p>
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

        <p className={styles.hint} style={{ marginTop: 18, marginBottom: 0 }}>
          Лестницы (ladder): подтверждено на реальных данных — CHPP не даёт способа получить эти матчи ни через
          основной список матчей команды, ни через ladderlist.xml (общий список всех лестниц игры без привязки к
          команде), ни через ladderdetails.xml (нужен заранее известный ID лестницы, который CHPP не сообщает). Это
          честное ограничение самого CHPP, а не пропуск в синхронизации.
        </p>
      </div>
    </ProLockOverlay>
  );
}
