"use client";

import { Fragment, useState } from "react";
import type { SeasonMatch } from "@/data/matches";
import MatchDetailAnalysis from "./MatchDetailAnalysis";
import MatchTypeIcon from "./MatchTypeIcon";
import styles from "./Matches.module.css";

// Список содержит только уже сыгранные матчи основной команды, реально
// учитываемые Hattrick для тренировки игроков (лига/кубок/товарищеские) —
// предстоящие матчи, юношеская команда и Hattrick Arena/Masters/лестницы
// отфильтрованы ещё на сервере (см. filterTrainingRelevantMatches в
// src/lib/matches.ts), так что здесь можно считать, что счёт есть всегда.
// Единый список без вкладок/фильтров по типу — как на реальном сайте
// Hattrick, разница между лигой/кубком/товарищеским — только маленькой
// иконкой слева (см. MatchTypeIcon).
export default function MatchesCalendar({
  matches,
  ourTeamName,
}: {
  matches: SeasonMatch[];
  ourTeamName: string;
}) {
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

      <div className={styles.matchListWrap}>
        {matchList.map((m) => {
          const isExpanded = expandedId === m.id;
          const isWin = (m.ourScore ?? 0) > (m.oppScore ?? 0);
          const isLoss = (m.ourScore ?? 0) < (m.oppScore ?? 0);
          const scoreClass = isWin ? styles.scoreWin : isLoss ? styles.scoreLoss : styles.scoreDraw;

          return (
            <Fragment key={m.id}>
              <div
                className={`${styles.matchRow} ${isExpanded ? styles.matchRowExpanded : ""}`}
                title={`${m.competition} — показать анализ матча`}
                onClick={() => setExpandedId((id) => (id === m.id ? null : m.id))}
              >
                <span className={styles.matchIcon} title={m.competition}>
                  <MatchTypeIcon competition={m.competition} />
                </span>
                <span className={styles.matchDate}>{m.date}</span>
                <span className={styles.matchTeams}>
                  {m.home ? (
                    <>
                      <b>{ourTeamName}</b> — {m.opponent}
                    </>
                  ) : (
                    <>
                      {m.opponent} — <b>{ourTeamName}</b>
                    </>
                  )}
                </span>
                <span className={`${styles.matchScore} ${scoreClass}`}>
                  {m.ourScore}:{m.oppScore}
                </span>
              </div>

              {isExpanded && (
                <div className={styles.matchExpanded}>
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
                </div>
              )}
            </Fragment>
          );
        })}
      </div>

      <div className={styles.legend}>
        <span>Сыграно матчей: {matchList.length}</span>
      </div>
    </div>
  );
}
