"use client";

import { useEffect, useState } from "react";
import styles from "./MatchAnalysis.module.css";

export interface AnalyzableMatch {
  id: number;
  date: string;
  opponent: string;
  home: boolean;
  ourScore: number;
  oppScore: number;
}

type ReportTab = "ratings" | "timeline";

const reportTabs: { key: ReportTab; label: string }[] = [
  { key: "ratings", label: "Рейтинги игроков" },
  { key: "timeline", label: "Хронология" },
];

interface MatchPlayerRating {
  playerId: number;
  name: string;
  rating: number;
}

interface MatchAnalysisResponse {
  homeTeamName: string;
  awayTeamName: string;
  homeRatings: MatchPlayerRating[];
  awayRatings: MatchPlayerRating[];
  error: string | null;
}

// Реальный рейтинг игроков обеих команд за этот конкретный матч (см.
// src/lib/matchAnalysis.ts, /api/dashboard/match-analysis) — раньше здесь
// были 4 вкладки с полностью выдуманными данными (рейтинги на схеме поля,
// "зоны владения", хронология с фейковыми событиями, посещаемость по
// секторам). Зоны владения и посещаемость по конкретному матчу CHPP не
// даёт вообще никак — эти вкладки просто убраны. Хронология голов оставлена
// как честная заглушка "недоступно", а не выдумка — см. комментарий в
// src/lib/matchAnalysis.ts.
export default function MatchDetailAnalysis({ match }: { match: AnalyzableMatch }) {
  const [tab, setTab] = useState<ReportTab>("ratings");
  const [data, setData] = useState<MatchAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/dashboard/match-analysis?matchId=${match.id}`)
      .then((res) => res.json())
      .then((json: MatchAnalysisResponse) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) {
          setData({ homeTeamName: "", awayTeamName: "", homeRatings: [], awayRatings: [], error: "Не удалось загрузить" });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [match.id]);

  const ourName = "Наша команда";
  const homeName = match.home ? ourName : match.opponent;
  const awayName = match.home ? match.opponent : ourName;

  return (
    <div className={styles.card}>
      <div className={styles.reportTabs}>
        {reportTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`${styles.reportTabBtn} ${tab === t.key ? styles.reportTabBtnActive : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 18 }}>
        <div className={styles.matchHead}>
          <span className={styles.matchHeadTeam}>{homeName}</span>
          <span className={styles.matchHeadScore}>
            {match.home ? `${match.ourScore}:${match.oppScore}` : `${match.oppScore}:${match.ourScore}`}
          </span>
          <span className={styles.matchHeadTeam}>{awayName}</span>
          <span className={styles.matchHeadDate}>{match.date}</span>
        </div>

        {tab === "ratings" &&
          (loading ? (
            <p className={styles.cardTitle} style={{ fontWeight: 400, textTransform: "none" }}>
              Загрузка рейтингов…
            </p>
          ) : data?.error ? (
            <p className={styles.cardTitle} style={{ fontWeight: 400, textTransform: "none" }}>
              Рейтинги игроков за этот матч недоступны.
            </p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              <div>
                <div className={styles.matchHeadTeam} style={{ marginBottom: 8 }}>
                  {data?.homeTeamName || homeName}
                </div>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <tbody>
                      {data?.homeRatings.map((p) => (
                        <tr key={p.playerId}>
                          <td>{p.name}</td>
                          <td className={styles.numCell}>{p.rating.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {(data?.homeRatings.length ?? 0) === 0 && <p>Нет данных.</p>}
              </div>
              <div>
                <div className={styles.matchHeadTeam} style={{ marginBottom: 8 }}>
                  {data?.awayTeamName || awayName}
                </div>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <tbody>
                      {data?.awayRatings.map((p) => (
                        <tr key={p.playerId}>
                          <td>{p.name}</td>
                          <td className={styles.numCell}>{p.rating.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {(data?.awayRatings.length ?? 0) === 0 && <p>Нет данных.</p>}
              </div>
            </div>
          ))}

        {tab === "timeline" && (
          <p className={styles.cardTitle} style={{ fontWeight: 400, textTransform: "none" }}>
            Хронология событий матча (голы, карточки) пока недоступна — Hattrick не отдаёт её через открытое CHPP API
            в подтверждённом виде.
          </p>
        )}
      </div>
    </div>
  );
}
