"use client";

import { useState } from "react";
import { cupEntries, type CupEntry, type CupKind, type CupOverallStatus, type CupRound } from "@/data/cup";
import styles from "./Cup.module.css";

function formatTenge(value: number): string {
  return `${value.toLocaleString("ru-RU")} тенге`;
}

const statusTagClass: Record<CupOverallStatus, string> = {
  champion: styles.statusChampion,
  active: styles.statusIn,
  eliminated: styles.statusOut,
};

const dotIcon: Record<CupRound["status"], string> = {
  won: "✓",
  lost: "✕",
  current: "★",
  upcoming: "",
};

const dotClass: Record<CupRound["status"], string> = {
  won: styles.timelineDotWon,
  lost: styles.timelineDotLost,
  current: styles.timelineDotCurrent,
  upcoming: styles.timelineDotUpcoming,
};

const itemClass: Record<CupRound["status"], string> = {
  won: "",
  lost: "",
  current: styles.timelineItemCurrent,
  upcoming: styles.timelineItemUpcoming,
};

// Значок кубка: у трёх Кубков Вызова — цветной узор щита (переданный
// accent), у Национального/Кубка Лиги и Кубка Надежды — нейтральный, без
// цветовой окраски (просто разные эмодзи: кубок / простой щит).
function CupIcon({ entry }: { entry: CupEntry }) {
  const style = entry.iconAccent
    ? ({
        borderColor: entry.iconAccent,
        color: entry.iconAccent,
        background: `${entry.iconAccent}26`,
      } as React.CSSProperties)
    : undefined;

  return (
    <span className={styles.cupIcon} style={style}>
      {entry.icon}
    </span>
  );
}

function CupCard({
  entry,
  isExpanded,
  onToggle,
}: {
  entry: CupEntry;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const nextMatch = entry.path?.find((r) => r.status === "current");
  const canExpand = Boolean(entry.path);

  return (
    <div className={styles.card}>
      <button
        type="button"
        className={styles.cupHeadRow}
        onClick={onToggle}
        disabled={!canExpand}
        aria-expanded={isExpanded}
      >
        <CupIcon entry={entry} />
        <div className={styles.cupHeadBody}>
          <div className={styles.cupName}>{entry.name}</div>
          <div className={styles.lastMatchLine}>
            {entry.lastMatch.round} · {entry.lastMatch.ourScore}:{entry.lastMatch.oppScore} с «{entry.lastMatch.opponent}»
          </div>
        </div>
        <span className={`${styles.statusTag} ${statusTagClass[entry.status]}`}>
          <span className={styles.statusDot} />
          {entry.statusLabel}
        </span>
        {canExpand && (
          <span className={`${styles.expandChevron} ${isExpanded ? styles.expandChevronOpen : ""}`}>▾</span>
        )}
      </button>

      {isExpanded && entry.path && (
        <div className={styles.expanded}>
          {nextMatch && (
            <div className={styles.nextMatchBlock}>
              <div className={styles.cardTitle}>Ближайший матч</div>
              <div className={styles.matchRow}>
                <span className={styles.matchDate}>{nextMatch.date}</span>
                <span className={styles.matchOpponent}>
                  {nextMatch.home ? "vs" : "@"} {nextMatch.opponent}
                </span>
                <span className={styles.homeTag}>{nextMatch.home ? "Дома" : "В гостях"}</span>
              </div>
            </div>
          )}

          <div className={styles.grid2}>
            <div>
              <div className={styles.cardTitle}>Путь по сетке</div>
              <div className={styles.timeline}>
                {entry.path.map((r) => (
                  <div key={r.round} className={`${styles.timelineItem} ${itemClass[r.status]}`}>
                    <div className={styles.timelineLine} />
                    <div className={`${styles.timelineDot} ${dotClass[r.status]}`}>{dotIcon[r.status]}</div>
                    <div className={styles.timelineBody}>
                      <div className={styles.timelineRound}>
                        {r.round}
                        {r.status === "won" && (
                          <span className={`${styles.timelineScore} ${styles.timelineScoreWon}`}>
                            {r.ourScore}:{r.oppScore}
                          </span>
                        )}
                        {r.status === "lost" && (
                          <span className={`${styles.timelineScore} ${styles.timelineScoreLost}`}>
                            {r.ourScore}:{r.oppScore}
                          </span>
                        )}
                      </div>
                      <div className={styles.timelineDetail}>
                        {r.opponent
                          ? `${r.home ? "vs" : "@"} ${r.opponent}${r.date ? ` · ${r.date}` : ""}`
                          : "Соперник пока не определён"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className={styles.cardTitle}>Призовые</div>
              {entry.prizes ? (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Раунд / место</th>
                        <th style={{ textAlign: "right" }}>Приз</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entry.prizes.map((row) => (
                        <tr key={row.place}>
                          <td>{row.place}</td>
                          <td className={styles.prizeCell}>{formatTenge(row.prize)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className={styles.prizeNote}>Этот кубок не предусматривает призовых.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CupSection({ stillInCup }: { stillInCup?: boolean } = {}) {
  // Развёрнутые карточки — по умолчанию открыт только активный кубок (как и
  // раньше), остальные разворачиваются по клику. Несколько карточек можно
  // держать открытыми одновременно — открытие одной не закрывает другие.
  const [expanded, setExpanded] = useState<Set<CupKind>>(
    () => new Set(cupEntries.filter((e) => e.status === "active").map((e) => e.kind)),
  );

  function toggle(kind: CupKind) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }

  return (
    <div className={styles.stack}>
      {stillInCup !== undefined && (
        <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "0 0 4px" }}>
          По данным Hattrick, команда сейчас {stillInCup ? "участвует в кубковом розыгрыше" : "не участвует ни в одном кубке"}.
          Точную сетку и историю раундов CHPP этому приложению не отдаёт — ниже показан иллюстративный пример.
        </p>
      )}
      {cupEntries.map((entry) => (
        <CupCard key={entry.kind} entry={entry} isExpanded={expanded.has(entry.kind)} onToggle={() => toggle(entry.kind)} />
      ))}
    </div>
  );
}
