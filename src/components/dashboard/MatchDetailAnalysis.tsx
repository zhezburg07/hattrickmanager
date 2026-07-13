"use client";

import { useMemo, useState } from "react";
import { getMatchAnalysis, eventIcon, type AnalyzableMatch } from "@/data/matchAnalysis";
import { club } from "@/data/dashboard";
import { skillWord } from "@/data/squad";
import styles from "./MatchAnalysis.module.css";

type ReportTab = "ratings" | "zones" | "timeline" | "attendance";

const reportTabs: { key: ReportTab; label: string }[] = [
  { key: "ratings", label: "Рейтинги игроков" },
  { key: "zones", label: "Командные показатели" },
  { key: "timeline", label: "Хронология моментов" },
  { key: "attendance", label: "Посещаемость" },
];

function formatTenge(value: number): string {
  return `${value.toLocaleString("ru-RU")} тенге`;
}

export default function MatchDetailAnalysis({ match }: { match: AnalyzableMatch }) {
  const [tab, setTab] = useState<ReportTab>("ratings");
  const analysis = useMemo(() => getMatchAnalysis(match), [match]);

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
          <span className={styles.matchHeadTeam}>{match.home ? club.name : match.opponent}</span>
          <span className={styles.matchHeadScore}>
            {match.home ? `${match.ourScore}:${match.oppScore}` : `${match.oppScore}:${match.ourScore}`}
          </span>
          <span className={styles.matchHeadTeam}>{match.home ? match.opponent : club.name}</span>
          <span className={styles.matchHeadDate}>{match.date}</span>
        </div>

        {tab === "ratings" && (
          <>
            <div className={styles.splitPitch}>
              <div className={styles.splitDivider} />
              {analysis.ownRatings.map((p) => (
                <div
                  key={p.id}
                  className={styles.ratingMarker}
                  style={{ left: `${p.x}%`, top: `${p.y}%` }}
                  title={`${p.name} — ${p.positionLabel}`}
                >
                  <div className={`${styles.ratingBadge} ${styles.ratingBadgeOwn}`}>{p.rating.toFixed(1)}</div>
                  <span className={styles.ratingName}>{p.name}</span>
                </div>
              ))}
              {analysis.oppRatings.map((p) => (
                <div
                  key={p.id}
                  className={styles.ratingMarker}
                  style={{ left: `${p.x}%`, top: `${p.y}%` }}
                  title={`${p.name} — ${p.positionLabel}`}
                >
                  <div className={`${styles.ratingBadge} ${styles.ratingBadgeOpp}`}>{p.rating.toFixed(1)}</div>
                  <span className={styles.ratingName}>{p.name}</span>
                </div>
              ))}
            </div>
            <div className={styles.legendRow}>
              <span>
                <span className={styles.legendDot} style={{ background: "var(--color-good)" }} />
                {club.name}
              </span>
              <span>
                <span className={styles.legendDot} style={{ background: "var(--color-text-muted)" }} />
                {match.opponent}
              </span>
            </div>
          </>
        )}

        {tab === "zones" && (
          <div>
            {analysis.zones.map((z) => (
              <div key={z.key} className={styles.zoneRow}>
                <div className={styles.zoneSide}>
                  <span className={styles.zoneShare}>{z.ownShare}%</span>
                  <span className={styles.zoneLevel}>{skillWord(z.ownLevel)}</span>
                  <div className={styles.zoneBar}>
                    <div className={styles.zoneBarOwn} style={{ width: `${z.ownShare}%` }} />
                  </div>
                </div>

                <div className={styles.zoneLabel}>{z.label}</div>

                <div className={`${styles.zoneSide} ${styles.zoneSideRight}`}>
                  <span className={styles.zoneShare}>{z.oppShare}%</span>
                  <span className={styles.zoneLevel}>{skillWord(z.oppLevel)}</span>
                  <div className={styles.zoneBar} style={{ flexDirection: "row-reverse" }}>
                    <div className={styles.zoneBarOpp} style={{ width: `${z.oppShare}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "timeline" && (
          <div className={styles.timelineWrap}>
            <div className={styles.timelineTrack}>
              {analysis.timeline.map((ev, i) => (
                <div key={i} className={styles.timelineEvent} style={{ left: `${(ev.minute / 90) * 100}%` }}>
                  <span className={styles.timelineEventIcon} title={`${ev.minute}' — ${ev.label}`}>
                    {eventIcon[ev.type]}
                  </span>
                  <span className={styles.timelineEventMinute}>{ev.minute}&apos;</span>
                </div>
              ))}
            </div>
            <div className={styles.timelineEndLabels}>
              <span>0&apos;</span>
              <span>45&apos;</span>
              <span>90&apos;</span>
            </div>
            <div className={styles.timelineLegend}>
              <span>⚽ Гол</span>
              <span>⚠ Опасный момент</span>
              <span>🟨 Жёлтая карточка</span>
            </div>
          </div>
        )}

        {tab === "attendance" && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Категория</th>
                  <th style={{ textAlign: "right" }}>Мест</th>
                  <th style={{ textAlign: "right" }}>Продано билетов</th>
                  <th style={{ textAlign: "right" }}>Доход</th>
                </tr>
              </thead>
              <tbody>
                {analysis.attendance.map((row) => (
                  <tr key={row.key}>
                    <td>{row.label}</td>
                    <td className={styles.numCell}>{row.seats.toLocaleString("ru-RU")}</td>
                    <td className={styles.numCell}>{row.ticketsSold.toLocaleString("ru-RU")}</td>
                    <td className={styles.numCell}>{formatTenge(row.revenue)}</td>
                  </tr>
                ))}
                <tr className={styles.totalRow}>
                  <td colSpan={3}>Общий доход от матча</td>
                  <td className={styles.numCell}>{formatTenge(analysis.totalAttendanceRevenue)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
