import { formatMatchDateTime } from "@/data/dashboard";
import type { OurCupPathResult, RealCupMatch } from "@/lib/cupMatches";
import styles from "./Cup.module.css";

// Полностью на реальных данных cupmatches.xml (см. resolveOurCupPath в
// src/lib/cupMatches.ts) — иллюстративный пример (src/data/cup.ts) удалён:
// теперь есть реальный проход по раундам, отдельный иллюстративный fallback
// больше не нужен и только сбивал бы с толку рядом с настоящими данными.

type RoundStatus = "won" | "lost" | "current";

function roundStatus(m: RealCupMatch): RoundStatus {
  if (m.status === "UPCOMING") return "current";
  if (m.ourScore !== null && m.oppScore !== null) return m.ourScore > m.oppScore ? "won" : "lost";
  return "current";
}

const dotIcon: Record<RoundStatus, string> = { won: "✓", lost: "✕", current: "★" };
const dotClass: Record<RoundStatus, string> = {
  won: styles.timelineDotWon,
  lost: styles.timelineDotLost,
  current: styles.timelineDotCurrent,
};
const itemClass: Record<RoundStatus, string> = { won: "", lost: "", current: styles.timelineItemCurrent };

export default function CupSection({ cupPath }: { cupPath?: OurCupPathResult }) {
  if (!cupPath || cupPath.error) {
    return (
      <div className={styles.card}>
        <div className={styles.cardTitle}>Кубок</div>
        <p className={styles.prizeNote}>
          {cupPath?.error ??
            "Не удалось определить, в каком кубке участвует команда, — либо сезон/кубок ещё не начался, либо CHPP пока не отдаёт эти данные."}
        </p>
      </div>
    );
  }

  if (cupPath.path.length === 0) {
    return (
      <div className={styles.card}>
        <div className={styles.cardTitle}>{cupPath.cupName || "Кубок"}</div>
        <p className={styles.prizeNote}>
          Матчей нашей команды в этом кубке не найдено (сезон {cupPath.season}, текущий раунд турнира —{" "}
          {cupPath.currentRound}). Возможно, мы ещё не участвовали или уже выбыли раньше проверенных раундов.
        </p>
      </div>
    );
  }

  const last = cupPath.path[cupPath.path.length - 1];
  const lastStatus = roundStatus(last);
  const statusLabel =
    lastStatus === "current"
      ? `В игре (раунд ${last.round})`
      : lastStatus === "won"
        ? `Прошли раунд ${last.round}`
        : `Выбыли в раунде ${last.round}`;
  const statusClass = lastStatus === "lost" ? styles.statusOut : styles.statusIn;

  return (
    <div className={styles.stack}>
      <div className={styles.card}>
        <div className={styles.statusRow}>
          <div>
            <div className={styles.cupName}>{cupPath.cupName || "Кубок"}</div>
            <div className={styles.cupRound}>
              Сезон {cupPath.season} · текущий раунд турнира: {cupPath.currentRound}
            </div>
          </div>
          <span className={`${styles.statusTag} ${statusClass}`}>
            <span className={styles.statusDot} />
            {statusLabel}
          </span>
        </div>

        <div className={styles.timeline} style={{ marginTop: 20 }}>
          {cupPath.path.map((m) => {
            const status = roundStatus(m);
            const { shortDate, time } = formatMatchDateTime(m.date);
            return (
              <div key={m.matchId} className={`${styles.timelineItem} ${itemClass[status]}`}>
                <div className={styles.timelineLine} />
                <div className={`${styles.timelineDot} ${dotClass[status]}`}>{dotIcon[status]}</div>
                <div className={styles.timelineBody}>
                  <div className={styles.timelineRound}>
                    Раунд {m.round}
                    {status !== "current" && (
                      <span
                        className={`${styles.timelineScore} ${status === "won" ? styles.timelineScoreWon : styles.timelineScoreLost}`}
                      >
                        {m.ourScore}:{m.oppScore}
                      </span>
                    )}
                  </div>
                  <div className={styles.timelineDetail}>
                    {m.home ? "vs" : "@"} {m.opponent} · {shortDate}
                    {time ? ` · ${time}` : ""}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
