"use client";

import { Fragment, useState } from "react";
import { formatMatchDateTime } from "@/data/dashboard";
import type { ArenaChallengesResult, ArenaRecentMatch, ArenaTournamentSummary, ArenaLadderPosition } from "@/lib/hattrickArena";
import MatchDetailAnalysis from "./MatchDetailAnalysis";
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
  arenaLadders = [],
  ourTeamName = "",
}: {
  challenges: ArenaChallengesResult;
  arenaMatches?: ArenaRecentMatch[];
  arenaTournaments?: ArenaTournamentSummary[];
  arenaLadders?: ArenaLadderPosition[];
  ourTeamName?: string;
}) {
  const wonTournaments = arenaTournaments.filter((t) => t.wonTrophy);
  const ongoingTournaments = arenaTournaments.filter((t) => t.isOngoing);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <ProLockOverlay
      title="Hattrick Arena"
      description="Доступно на тарифе Pro — трофеи, турниры, лестница, результаты и заявки на товарищеские матчи."
    >
      <div className={styles.card}>
        <div className={styles.cardTitle}>Трофеи и турниры</div>
        <p className={styles.hint}>
          Только турниры, созданные вручную другими игроками (HTO) — автоматические турниры и матчи Hattrick
          Arena/Ladder сюда не входят, см. пояснение внизу страницы.
        </p>

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
        <div className={styles.cardTitle}>Место в лестнице (Ladder)</div>
        {arenaLadders.length === 0 ? (
          <p className={styles.hint} style={{ marginBottom: 0 }}>
            Данные о месте в лестнице не получены при последней синхронизации.
          </p>
        ) : (
          <ul className={styles.trophyList}>
            {arenaLadders.map((l) => (
              <li key={l.ladderId} className={styles.trophyItem}>
                {l.name} — место {l.position} ({l.wins}W/{l.lost}L)
                {l.nextMatchDate && (
                  <span style={{ color: "var(--color-text-muted)", fontWeight: 400 }}>
                    {" "}
                    · след. матч {formatMaybeDate(l.nextMatchDate)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className={styles.hint} style={{ marginTop: 8, marginBottom: 0 }}>
          Через ladderlist.xml — только текущая сводка (место, победы/поражения) команды в лестнице. Список
          отдельных сыгранных матчей лестницы (соперник/счёт/дата) недоступен — см. пояснение внизу страницы.
        </p>
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>Матчи Арены</div>
        {arenaMatches.length === 0 ? (
          <p className={styles.hint} style={{ marginBottom: 0 }}>
            Сыгранных матчей через турниры или лестницу не найдено.
          </p>
        ) : (
          <div className={styles.matchListWrap}>
            {arenaMatches.map((m) => {
              const isExpanded = expandedId === m.matchId;
              const isWin = m.ourScore > m.oppScore;
              const isLoss = m.ourScore < m.oppScore;
              const scoreClass = isWin ? styles.scoreWin : isLoss ? styles.scoreLoss : styles.scoreDraw;

              return (
                <Fragment key={m.matchId}>
                  <div
                    className={`${styles.matchRow} ${isExpanded ? styles.matchRowExpanded : ""}`}
                    title={`${m.tournamentName ?? "Арена"} — показать анализ матча`}
                    onClick={() => setExpandedId((id) => (id === m.matchId ? null : m.matchId))}
                  >
                    <span className={styles.matchDate}>{formatMaybeDate(m.date)}</span>
                    <span className={styles.matchTeams}>
                      {m.home ? (
                        <>
                          <b>{ourTeamName || "Мы"}</b> — {m.opponent}
                        </>
                      ) : (
                        <>
                          {m.opponent} — <b>{ourTeamName || "Мы"}</b>
                        </>
                      )}
                      {m.source === "tournament" && m.tournamentName ? ` · ${m.tournamentName}` : ""}
                    </span>
                    <span className={`${styles.matchScore} ${scoreClass}`}>
                      {m.ourScore}:{m.oppScore}
                    </span>
                  </div>

                  {isExpanded && (
                    <div className={styles.matchExpanded}>
                      <MatchDetailAnalysis
                        match={{
                          id: Number(m.matchId),
                          date: m.date,
                          opponent: m.opponent,
                          home: m.home,
                          ourScore: m.ourScore,
                          oppScore: m.oppScore,
                        }}
                        ourTeamName={ourTeamName}
                      />
                    </div>
                  )}
                </Fragment>
              );
            })}
          </div>
        )}
        <p className={styles.hint} style={{ marginTop: 8, marginBottom: 0 }}>
          Матчи ручных турниров (HTO) — через tournamentlist.xml/tournamentfixtures.xml. Автоматические турниры и
          матчи лестницы сюда не входят, см. пояснение внизу страницы. Нажмите на матч, чтобы открыть полный анализ —
          те же вкладки (Рейтинги игроков/Зоны поля/Посещаемость/Хронология), что и для официальных матчей;
          matchdetails.xml запрашивается впервые именно для Arena-матчей, так что результат не гарантирован для
          каждого матча.
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
          Автоматические турниры и матчи Hattrick Arena/Ladder вне ручных HTO-турниров: подтверждённое ограничение
          CHPP, а не пропуск в синхронизации. tournamentlist.xml возвращает только турниры, СОЗДАННЫЕ ВРУЧНУЮ другими
          игроками (подтверждено полем Creator — реальный автор турнира заполнен у обоих турниров выше), а
          автоматически генерируемые Hattrick-турниры (например, соперники вроде "POCCOBXO3 Aktobe") и матчи через
          лестницу CHPP не отдаёт ни через один официальный файл — ни через основной список матчей команды, ни через
          ladderlist.xml/ladderdetails.xml (только текущая сводка и таблица лестницы целиком, не список наших
          матчей), ни через какой-либо другой найденный источник.
        </p>
      </div>
    </ProLockOverlay>
  );
}
