"use client";

import { Fragment, useEffect, useState } from "react";
import type { SeasonMatch } from "@/data/matches";
import MatchDetailAnalysis from "./MatchDetailAnalysis";
import MatchTypeIcon from "./MatchTypeIcon";
import styles from "./Matches.module.css";

// Постраничный вывод (см. чат "Официальные матчи: та же архитектура, что и
// у Трансферов") — синхронизация теперь хранит ВСЮ накопленную историю без
// кэпа (см. chppSync.ts, StoredMatchesCalendar.matchHistory), поэтому список
// режется на страницы здесь, а не на сервере, тем же паттерном, что и на
// "Трансферах" (см. PAGE_SIZE в TransfersSection.tsx).
const PAGE_SIZE = 30;

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
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(matchList.length / PAGE_SIZE));
  // Список пришёл заново (обновление данных) — вернуться на страницу 1,
  // иначе можно оказаться на несуществующей странице, если история стала
  // короче (тот же приём, что и на "Трансферах").
  useEffect(() => setPage(1), [matchList.length]);
  const safePage = Math.min(page, totalPages);
  const shown = matchList.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>Сыгранные матчи</div>
      <p className={styles.hint}>
        Всего {matchList.length} матчей основной команды, влияющие на тренировку игроков — лига, кубок и
        товарищеские, от недавних к самым старым. Предстоящие матчи, юношеская команда и Hattrick Arena/Masters/
        лестницы сюда не входят. Нажмите на матч, чтобы открыть полный анализ.
      </p>

      <div className={styles.matchListWrap}>
        {shown.map((m) => {
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
                    ourTeamName={ourTeamName}
                  />
                </div>
              )}
            </Fragment>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button type="button" className={styles.pageBtn} disabled={safePage === 1} onClick={() => setPage(safePage - 1)}>
            ‹
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              className={`${styles.pageBtn} ${n === safePage ? styles.pageBtnActive : ""}`}
              onClick={() => setPage(n)}
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            className={styles.pageBtn}
            disabled={safePage === totalPages}
            onClick={() => setPage(safePage + 1)}
          >
            ›
          </button>
        </div>
      )}

      <div className={styles.legend}>
        <span>Сыграно матчей: {matchList.length}</span>
      </div>
    </div>
  );
}
