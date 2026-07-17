"use client";

import { Fragment, useState } from "react";
import type { Competition, SeasonMatch } from "@/data/matches";
import MatchInstructions from "./MatchInstructions";
import MatchDetailAnalysis from "./MatchDetailAnalysis";
import styles from "./Matches.module.css";

const competitionClass: Record<Competition, string> = {
  Лига: styles.competitionLeague,
  Кубок: styles.competitionCup,
  Товарищеский: styles.competitionFriendly,
  Официальный: styles.competitionLeague,
};

export default function MatchesCalendar({ matches }: { matches: SeasonMatch[] }) {
  const matchList = matches;
  const [expandedId, setExpandedId] = useState<number | null>(null);
  // matchList отсортирован от новых/ближайших к старым (сверху вниз) — все
  // ещё не сыгранные матчи оказываются одним сплошным блоком в начале
  // списка, и среди них ближайший по времени идёт ПОСЛЕДНИМ (у него
  // наименьшая дата среди будущих) — поэтому берём последний элемент среди
  // несыгранных, а не первый.
  const upcomingMatches = matchList.filter((m) => m.ourScore === null);
  const nextMatch = upcomingMatches.length > 0 ? upcomingMatches[upcomingMatches.length - 1] : null;

  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>Календарь сезона</div>
      <p className={styles.hint}>
        Полный список игр — лига, кубок и товарищеские матчи, от ближайших/недавних к самым старым. Нажмите на
        сыгранный матч, чтобы открыть полный анализ, или на предстоящий — чтобы задать указания на игру.
      </p>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Тур</th>
              <th>Дата</th>
              <th>Соперник</th>
              <th>Поле</th>
              <th style={{ textAlign: "right" }}>Счёт</th>
            </tr>
          </thead>
          <tbody>
            {matchList.map((m) => {
              const isNext = nextMatch !== null && m.id === nextMatch.id;
              const played = m.ourScore !== null && m.oppScore !== null;
              const isExpanded = expandedId === m.id;

              return (
                <Fragment key={m.id}>
                  <tr
                    className={`${styles.row} ${styles.rowClickable} ${isNext ? styles.rowNext : ""} ${isExpanded ? styles.rowExpanded : ""}`}
                    title={played ? "Показать анализ матча" : "Задать указания на матч"}
                    onClick={() => setExpandedId((id) => (id === m.id ? null : m.id))}
                  >
                    <td className={styles.roundCell}>
                      <span className={`${styles.competitionTag} ${competitionClass[m.competition]}`}>
                        {m.round !== null ? `Тур ${m.round}` : m.competition}
                      </span>
                    </td>
                    <td>
                      {m.date}
                      {isNext && <span className={styles.nextBadge}>Ближайший</span>}
                    </td>
                    <td className={styles.opponentCell}>{m.opponent}</td>
                    <td>
                      <span className={styles.homeTag}>{m.home ? "Дома" : "В гостях"}</span>
                    </td>
                    <td className={styles.scoreCell} style={{ textAlign: "right" }}>
                      {played ? (
                        `${m.ourScore}:${m.oppScore}`
                      ) : (
                        <span className={styles.scorePending}>—</span>
                      )}
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr className={styles.expandedRow}>
                      <td colSpan={5}>
                        {played ? (
                          <MatchDetailAnalysis
                            match={{
                              id: m.id,
                              date: m.date,
                              opponent: m.opponent,
                              home: m.home,
                              ourScore: m.ourScore as number,
                              oppScore: m.oppScore as number,
                            }}
                          />
                        ) : (
                          <MatchInstructions match={m} />
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={styles.legend}>
        <span>Всего игр: {matchList.length}</span>
        <span>Сыграно: {matchList.filter((m) => m.ourScore !== null).length}</span>
        <span>Осталось: {matchList.filter((m) => m.ourScore === null).length}</span>
      </div>
    </div>
  );
}
