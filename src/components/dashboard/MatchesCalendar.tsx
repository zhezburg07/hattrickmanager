"use client";

import { Fragment, useState } from "react";
import type { Competition, SeasonMatch } from "@/data/matches";
import MatchDetailAnalysis from "./MatchDetailAnalysis";
import styles from "./Matches.module.css";

const competitionClass: Record<Competition, string> = {
  Лига: styles.competitionLeague,
  Кубок: styles.competitionCup,
  Товарищеский: styles.competitionFriendly,
  Официальный: styles.competitionLeague,
};

// Список содержит только уже сыгранные матчи основной команды, реально
// учитываемые Hattrick для тренировки игроков (лига/кубок/товарищеские) —
// предстоящие матчи, юношеская команда и Hattrick Arena/Masters/лестницы
// отфильтрованы ещё на сервере (см. filterTrainingRelevantMatches в
// src/lib/matches.ts), так что здесь можно считать, что счёт есть всегда.
export default function MatchesCalendar({ matches }: { matches: SeasonMatch[] }) {
  const matchList = matches;
  const [expandedId, setExpandedId] = useState<number | null>(null);

  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>Сыгранные матчи</div>
      <p className={styles.hint}>
        Последние {matchList.length === 25 ? "25" : matchList.length} матчей основной команды, влияющие на тренировку
        игроков — лига, кубок и товарищеские, от недавних к самым старым. Предстоящие матчи, юношеская команда и
        Hattrick Arena/Masters/лестницы сюда не входят. Нажмите на матч, чтобы открыть полный анализ.
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
              const isExpanded = expandedId === m.id;

              return (
                <Fragment key={m.id}>
                  <tr
                    className={`${styles.row} ${styles.rowClickable} ${isExpanded ? styles.rowExpanded : ""}`}
                    title="Показать анализ матча"
                    onClick={() => setExpandedId((id) => (id === m.id ? null : m.id))}
                  >
                    <td className={styles.roundCell}>
                      <span className={`${styles.competitionTag} ${competitionClass[m.competition]}`}>
                        {m.round !== null ? `Тур ${m.round}` : m.competition}
                      </span>
                    </td>
                    <td>{m.date}</td>
                    <td className={styles.opponentCell}>{m.opponent}</td>
                    <td>
                      <span className={styles.homeTag}>{m.home ? "Дома" : "В гостях"}</span>
                    </td>
                    <td className={styles.scoreCell} style={{ textAlign: "right" }}>
                      {m.ourScore}:{m.oppScore}
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr className={styles.expandedRow}>
                      <td colSpan={5}>
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
        <span>Сыграно матчей: {matchList.length}</span>
      </div>
    </div>
  );
}
