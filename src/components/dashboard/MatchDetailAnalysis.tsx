"use client";

import { useEffect, useState } from "react";
import { skillWord } from "@/data/squad";
import styles from "./MatchAnalysis.module.css";

export interface AnalyzableMatch {
  id: number;
  date: string;
  opponent: string;
  home: boolean;
  ourScore: number;
  oppScore: number;
}

type ReportTab = "ratings" | "zones" | "attendance" | "timeline";

const reportTabs: { key: ReportTab; label: string }[] = [
  { key: "ratings", label: "Рейтинги игроков" },
  { key: "zones", label: "Зоны поля" },
  { key: "attendance", label: "Посещаемость" },
  { key: "timeline", label: "Хронология" },
];

interface MatchPlayerRating {
  playerId: number;
  name: string;
  rating: number;
}

interface MatchZoneRatings {
  midfield: number | null;
  rightDef: number | null;
  midDef: number | null;
  leftDef: number | null;
  rightAtt: number | null;
  midAtt: number | null;
  leftAtt: number | null;
  setPiecesDef: number | null;
  setPiecesAtt: number | null;
}

interface MatchAttendance {
  arenaName: string;
  terraces: number;
  basic: number;
  roof: number;
  vip: number;
  total: number;
}

type MatchTimelineKind = "goal" | "card" | "event";

interface MatchTimelineEntry {
  minute: number;
  matchPart: number;
  text: string;
  kind: MatchTimelineKind;
  teamSide: "home" | "away" | null;
}

interface MatchAnalysisResponse {
  homeTeamName: string;
  awayTeamName: string;
  homeRatings: MatchPlayerRating[];
  awayRatings: MatchPlayerRating[];
  ratingsError: string | null;
  homeZones: MatchZoneRatings | null;
  awayZones: MatchZoneRatings | null;
  zonesError: string | null;
  attendance: MatchAttendance | null;
  attendanceError: string | null;
  timeline: MatchTimelineEntry[] | null;
  timelineSource: "events" | "goals-cards" | null;
  timelineError: string | null;
  error: string | null;
}

// Реальные данные конкретного матча (см. src/lib/matchAnalysis.ts,
// /api/dashboard/match-analysis). Раньше рейтинги игроков всегда приходили
// пустыми — читались из несуществующего в matchdetails.xml поля Lineup;
// список игроков с рейтингом отдаёт отдельный файл matchlineup.xml.
// Зональные показатели команд, посещаемость и хронология (голы/карточки,
// либо полный список игровых моментов при matchEvents=true) — тоже реальные
// поля matchdetails.xml, ранее ошибочно считавшиеся недоступными.
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
          setData({
            homeTeamName: "",
            awayTeamName: "",
            homeRatings: [],
            awayRatings: [],
            ratingsError: "Не удалось загрузить",
            homeZones: null,
            awayZones: null,
            zonesError: "Не удалось загрузить",
            attendance: null,
            attendanceError: "Не удалось загрузить",
            timeline: null,
            timelineSource: null,
            timelineError: "Не удалось загрузить",
            error: "Не удалось загрузить",
          });
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

  const zoneRows: { label: string; homeKey: keyof MatchZoneRatings; awayKey: keyof MatchZoneRatings }[] = [
    { label: "Защита (левый фланг)", homeKey: "leftDef", awayKey: "leftDef" },
    { label: "Защита (центр)", homeKey: "midDef", awayKey: "midDef" },
    { label: "Защита (правый фланг)", homeKey: "rightDef", awayKey: "rightDef" },
    { label: "Полузащита", homeKey: "midfield", awayKey: "midfield" },
    { label: "Атака (левый фланг)", homeKey: "leftAtt", awayKey: "leftAtt" },
    { label: "Атака (центр)", homeKey: "midAtt", awayKey: "midAtt" },
    { label: "Атака (правый фланг)", homeKey: "rightAtt", awayKey: "rightAtt" },
    { label: "Стандарты в защите", homeKey: "setPiecesDef", awayKey: "setPiecesDef" },
    { label: "Стандарты в атаке", homeKey: "setPiecesAtt", awayKey: "setPiecesAtt" },
  ];

  const zoneWord = (raw: number | null) => {
    if (raw === null) return null;
    const skillLevel = Math.max(1, Math.min(20, Math.ceil(raw / 4)));
    return skillWord(skillLevel);
  };

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

        {loading && (
          <p className={styles.cardTitle} style={{ fontWeight: 400, textTransform: "none" }}>
            Загрузка…
          </p>
        )}

        {!loading && data?.error && (
          <p className={styles.cardTitle} style={{ fontWeight: 400, textTransform: "none" }}>
            Не удалось загрузить разбор матча: {data.error}
          </p>
        )}

        {!loading && data && !data.error && tab === "ratings" && (
          <>
            {data.ratingsError && (
              <p className={styles.cardTitle} style={{ fontWeight: 400, textTransform: "none", marginBottom: 12 }}>
                {data.ratingsError}
              </p>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              <div>
                <div className={styles.matchHeadTeam} style={{ marginBottom: 8 }}>
                  {data.homeTeamName || homeName}
                </div>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <tbody>
                      {data.homeRatings.map((p) => (
                        <tr key={p.playerId}>
                          <td>{p.name}</td>
                          <td className={styles.numCell}>{p.rating.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {data.homeRatings.length === 0 && <p>Нет данных.</p>}
              </div>
              <div>
                <div className={styles.matchHeadTeam} style={{ marginBottom: 8 }}>
                  {data.awayTeamName || awayName}
                </div>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <tbody>
                      {data.awayRatings.map((p) => (
                        <tr key={p.playerId}>
                          <td>{p.name}</td>
                          <td className={styles.numCell}>{p.rating.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {data.awayRatings.length === 0 && <p>Нет данных.</p>}
              </div>
            </div>
          </>
        )}

        {!loading && data && !data.error && tab === "zones" && (
          <>
            {data.zonesError ? (
              <p className={styles.cardTitle} style={{ fontWeight: 400, textTransform: "none" }}>
                {data.zonesError}
              </p>
            ) : (
              <div>
                <div className={styles.legendRow} style={{ justifyContent: "space-between", marginTop: 0, marginBottom: 8 }}>
                  <span style={{ fontWeight: 700, color: "var(--color-text)" }}>{data.homeTeamName || homeName}</span>
                  <span style={{ fontWeight: 700, color: "var(--color-text)" }}>{data.awayTeamName || awayName}</span>
                </div>
                {zoneRows.map((row) => {
                  const homeRaw = data.homeZones?.[row.homeKey] ?? null;
                  const awayRaw = data.awayZones?.[row.awayKey] ?? null;
                  const homeWord = zoneWord(homeRaw);
                  const awayWord = zoneWord(awayRaw);
                  const total = (homeRaw ?? 0) + (awayRaw ?? 0);
                  const homeShare = total > 0 ? ((homeRaw ?? 0) / total) * 100 : 50;
                  return (
                    <div className={styles.zoneRow} key={row.label}>
                      <div className={styles.zoneSide}>
                        <span className={styles.zoneShare}>{homeWord ?? "—"}</span>
                        <span className={styles.zoneLevel}>{homeRaw !== null ? `${homeRaw}/80` : "нет данных"}</span>
                      </div>
                      <div className={styles.zoneLabel}>
                        {row.label}
                        <div className={styles.zoneBar} style={{ marginTop: 6 }}>
                          <div className={styles.zoneBarOwn} style={{ width: `${homeShare}%` }} />
                          <div className={styles.zoneBarOpp} style={{ width: `${100 - homeShare}%` }} />
                        </div>
                      </div>
                      <div className={`${styles.zoneSide} ${styles.zoneSideRight}`}>
                        <span className={styles.zoneShare}>{awayWord ?? "—"}</span>
                        <span className={styles.zoneLevel}>{awayRaw !== null ? `${awayRaw}/80` : "нет данных"}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {!loading && data && !data.error && tab === "attendance" && (
          <>
            {data.attendanceError ? (
              <p className={styles.cardTitle} style={{ fontWeight: 400, textTransform: "none" }}>
                {data.attendanceError}
              </p>
            ) : (
              data.attendance && (
                <>
                  {data.attendance.arenaName && (
                    <p className={styles.cardTitle} style={{ fontWeight: 400, textTransform: "none", marginBottom: 12 }}>
                      Стадион «{data.attendance.arenaName}»
                    </p>
                  )}
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Категория мест</th>
                          <th style={{ textAlign: "right" }}>Продано билетов</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>Террасы</td>
                          <td className={styles.numCell}>{data.attendance.terraces.toLocaleString("ru-RU")}</td>
                        </tr>
                        <tr>
                          <td>Обычные</td>
                          <td className={styles.numCell}>{data.attendance.basic.toLocaleString("ru-RU")}</td>
                        </tr>
                        <tr>
                          <td>Под крышей</td>
                          <td className={styles.numCell}>{data.attendance.roof.toLocaleString("ru-RU")}</td>
                        </tr>
                        <tr>
                          <td>VIP</td>
                          <td className={styles.numCell}>{data.attendance.vip.toLocaleString("ru-RU")}</td>
                        </tr>
                        <tr className={styles.totalRow}>
                          <td>Итого</td>
                          <td className={styles.numCell}>{data.attendance.total.toLocaleString("ru-RU")}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 12 }}>
                    Количество проданных билетов — реальные данные CHPP. Доход от продажи билетов именно за этот матч
                    Hattrick отдельным полем не сообщает (только количество мест по категориям) — цена за место не
                    входит в ответ CHPP.
                  </p>
                </>
              )
            )}
          </>
        )}

        {!loading && data && !data.error && tab === "timeline" && (
          <>
            {data.timelineError ? (
              <p className={styles.cardTitle} style={{ fontWeight: 400, textTransform: "none" }}>
                {data.timelineError}
              </p>
            ) : (
              data.timeline && (
                <>
                  {data.timelineSource === "goals-cards" && (
                    <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 12 }}>
                      Хронология собрана из голов и карточек матча — полный список игровых моментов для этого матча не
                      вернулся.
                    </p>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {data.timeline.map((ev, i) => (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          gap: 12,
                          alignItems: "baseline",
                          borderBottom: "1px solid rgba(44, 74, 64, 0.6)",
                          paddingBottom: 8,
                        }}
                      >
                        <span style={{ fontWeight: 800, color: "var(--color-accent)", minWidth: 34 }}>{ev.minute}&apos;</span>
                        <span
                          style={{
                            color: ev.kind === "goal" ? "var(--color-good)" : ev.kind === "card" ? "#e0c04a" : "var(--color-text)",
                          }}
                        >
                          {ev.text}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )
            )}
          </>
        )}
      </div>
    </div>
  );
}
