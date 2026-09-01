"use client";

import { Fragment, useState } from "react";
import { formatMatchDateTime } from "@/data/dashboard";
import type { ArenaRecentMatch, ArenaTournamentSummary, ArenaLadderPosition } from "@/lib/hattrickArena";
import MatchDetailAnalysis from "./MatchDetailAnalysis";
import ProLockOverlay from "./ProLockOverlay";
import styles from "./Matches.module.css";

function formatMaybeDate(raw: string | null): string {
  if (!raw) return "дата не указана";
  const { shortDate, time } = formatMatchDateTime(raw);
  return time ? `${shortDate} · ${time}` : shortDate;
}

// ПЕРЕРАБОТАНО (см. чат "Переработать вкладку Арена") — убраны "Выигранные
// трофеи"/"Результат не определён" (эвристика по последнему матчу плей-офф,
// не официальный флаг CHPP — см. git-историю, если понадобится вернуть) и
// "Заявки на товарищеский матч"/"Предложения от других команд" (challenges),
// вместе с длинным пояснением про автоматические турниры/Arena/Ladder внизу
// страницы. Остаются "Турниры прямо сейчас" и "Место в лестнице" — теперь
// два равноправных блока рядом, а не части одной большой карточки "Трофеи и
// турниры", и "Матчи Арены" отдельной секцией ниже, как и было.
export default function HattrickArenaSection({
  arenaMatches = [],
  arenaTournaments = [],
  arenaLadders = [],
  ourTeamName = "",
}: {
  arenaMatches?: ArenaRecentMatch[];
  arenaTournaments?: ArenaTournamentSummary[];
  arenaLadders?: ArenaLadderPosition[];
  ourTeamName?: string;
}) {
  const ongoingTournaments = arenaTournaments.filter((t) => t.isOngoing);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <ProLockOverlay
      title="Hattrick Arena"
      description="Доступно на тарифе Pro — турниры, лестница и результаты матчей."
    >
      <div className={styles.twoColumnRow}>
        <div className={styles.card}>
          <div className={styles.cardTitle}>Турниры прямо сейчас</div>
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
        </div>
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
                      {/* ИСПРАВЛЕНО (см. чат "Расхождение в счёте: Inner
                          Focus Club — Zhezburg 4:3") — тот же приём, что и в
                          MatchDetailAnalysis.tsx: счёт в том же порядке, что
                          и названия команд выше, а не всегда "наш:чужой". */}
                      {m.home ? `${m.ourScore}:${m.oppScore}` : `${m.oppScore}:${m.ourScore}`}
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
          Матчи ручных турниров (HTO) — через tournamentlist.xml/tournamentfixtures.xml. Нажмите на матч, чтобы
          открыть полный анализ — те же вкладки (Рейтинги игроков/Зоны поля/Посещаемость/Хронология), что и для
          официальных матчей.
        </p>
      </div>
    </ProLockOverlay>
  );
}
