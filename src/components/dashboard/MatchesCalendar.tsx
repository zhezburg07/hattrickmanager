"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import type { SeasonMatch } from "@/data/matches";
import MatchDetailAnalysis from "./MatchDetailAnalysis";
import MatchTypeIcon from "./MatchTypeIcon";
import styles from "./Matches.module.css";

// Постраничный вывод ВНУТРИ сезона (см. чат "Официальные матчи: та же
// архитектура, что и у Трансферов") — синхронизация хранит ВСЮ накопленную
// историю без кэпа (см. chppSync.ts, StoredMatchesCalendar.matchHistory), а
// разбивка на сезоны (см. ниже) и на страницы внутри сезона — на фронтенде,
// тем же паттерном, что и на "Трансферах" (см. PAGE_SIZE в TransfersSection.tsx).
const PAGE_SIZE = 30;

// Ключ группы сезона в SEASON_UNKNOWN_KEY — матчи с season=null (якорь
// текущего сезона, см. computeSeasonNumber в matches.ts, ещё ни разу не был
// получен для этого аккаунта — leaguefixtures.xml не отдал нужных полей ни
// в одну синхронизацию). Отдельная псевдо-группа, а не молчаливая
// подмешивание к какому-то конкретному сезону — см. чат "Матчи по сезонам".
const SEASON_UNKNOWN_KEY = "unknown";

function groupBySeason(matches: SeasonMatch[]): { key: string; season: number | null; matches: SeasonMatch[] }[] {
  const bySeason = new Map<string, { season: number | null; matches: SeasonMatch[] }>();
  for (const m of matches) {
    const key = m.season === null ? SEASON_UNKNOWN_KEY : String(m.season);
    const entry = bySeason.get(key) ?? { season: m.season, matches: [] };
    entry.matches.push(m);
    bySeason.set(key, entry);
  }
  // Сезоны — от новых к старым (список matches уже отсортирован по дате по
  // убыванию, см. toSeasonMatches, порядок внутри группы сохраняется); группа
  // "сезон не определён" — самая первая, как требующая внимания (см. комментарий
  // у SEASON_UNKNOWN_KEY выше), а не потерянная где-то в середине списка.
  return [...bySeason.entries()]
    .map(([key, { season, matches }]) => ({ key, season, matches }))
    .sort((a, b) => {
      if (a.season === null) return -1;
      if (b.season === null) return 1;
      return b.season - a.season;
    });
}

// Список содержит только уже сыгранные матчи основной команды, реально
// учитываемые Hattrick для тренировки игроков (лига/кубок/товарищеские) —
// предстоящие матчи, юношеская команда и Hattrick Arena/Masters/лестницы
// отфильтрованы ещё на сервере (см. filterTrainingRelevantMatches в
// src/lib/matches.ts), так что здесь можно считать, что счёт есть всегда.
// Единый список без вкладок/фильтров по типу — как на реальном сайте
// Hattrick, разница между лигой/кубком/товарищеским — только маленькой
// иконкой слева (см. MatchTypeIcon).
//
// РАЗБИТО ПО СЕЗОНАМ (см. чат "Матчи по сезонам") — по аналогии с
// hattrick.org: переключатель "‹ Сезон N | Сезон N+1 ›" сверху вместо
// единого списка со сквозной постраничной прокруткой; внутри сезона — та
// же сортировка (новые сверху) и та же постраничная прокрутка по 30, если
// в сезоне матчей больше.
export default function MatchesCalendar({
  matches,
  ourTeamName,
}: {
  matches: SeasonMatch[];
  ourTeamName: string;
}) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [seasonIndex, setSeasonIndex] = useState(0);

  const seasonGroups = useMemo(() => groupBySeason(matches), [matches]);
  const safeSeasonIndex = Math.min(seasonIndex, Math.max(0, seasonGroups.length - 1));
  const currentGroup = seasonGroups[safeSeasonIndex] as { key: string; season: number | null; matches: SeasonMatch[] } | undefined;
  const matchList = currentGroup?.matches ?? [];

  // Список пришёл заново (обновление данных) — вернуться к самому свежему
  // сезону и странице 1, иначе можно оказаться на несуществующей
  // странице/сезоне, если история изменилась (тот же приём, что и на
  // "Трансферах").
  useEffect(() => setSeasonIndex(0), [matches]);
  useEffect(() => setPage(1), [safeSeasonIndex, matches]);

  const totalPages = Math.max(1, Math.ceil(matchList.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const shown = matchList.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const seasonLabel = (g: { season: number | null } | undefined) =>
    !g ? "" : g.season === null ? "Сезон не определён" : `Сезон ${g.season}`;
  const prevGroup = seasonGroups[safeSeasonIndex + 1]; // индекс+1 — сезон СТАРШЕ (список отсортирован по убыванию)
  const nextGroup = seasonGroups[safeSeasonIndex - 1]; // индекс-1 — сезон НОВЕЕ

  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>Сыгранные матчи</div>
      <p className={styles.hint}>
        Всего {matches.length} матчей основной команды, влияющие на тренировку игроков — лига, кубок и товарищеские,
        сгруппированы по сезонам, от недавних к самым старым. Предстоящие матчи, юношеская команда и Hattrick
        Arena/Masters/лестницы сюда не входят. Нажмите на матч, чтобы открыть полный анализ.
      </p>
      {currentGroup?.season === null && (
        <p className={styles.hint} style={{ marginTop: -8 }}>
          Номер сезона для этих матчей ещё не определён — потребуется ещё одна успешная синхронизация, пока сезон в
          лиге не начался или данные о нём не были получены.
        </p>
      )}

      {seasonGroups.length > 1 && (
        <div className={styles.pagination} style={{ marginTop: 0, marginBottom: 16 }}>
          <button
            type="button"
            className={styles.pageBtn}
            disabled={!prevGroup}
            onClick={() => setSeasonIndex(safeSeasonIndex + 1)}
            title={prevGroup ? seasonLabel(prevGroup) : undefined}
          >
            ‹ {prevGroup ? seasonLabel(prevGroup) : ""}
          </button>
          <span className={`${styles.pageBtn} ${styles.pageBtnActive}`} style={{ cursor: "default" }}>
            {seasonLabel(currentGroup)}
          </span>
          <button
            type="button"
            className={styles.pageBtn}
            disabled={!nextGroup}
            onClick={() => setSeasonIndex(safeSeasonIndex - 1)}
            title={nextGroup ? seasonLabel(nextGroup) : undefined}
          >
            {nextGroup ? seasonLabel(nextGroup) : ""} ›
          </button>
        </div>
      )}

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
        <span>
          {seasonLabel(currentGroup)}: {matchList.length} матчей
        </span>
      </div>
    </div>
  );
}
