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

// Ближайший предстоящий матч кубка — источник ОТДЕЛЬНЫЙ от cupPath (тот
// строится проходом по раундам cupmatches.xml, который по определению не
// запрашивает ещё не наступившие раунды, см. resolveOurCupPath). Здесь же —
// матч с MatchType=3 и статусом UPCOMING из обычного matches.xml (см.
// findNextUpcomingCupMatch в dashboard/cup/page.tsx): та же команда
// использует его и на "Обзоре" для ближайших матчей вообще, просто
// отфильтрованный до кубковых. Если этот же матч уже показан в cupPath.path
// как "текущий" раунд — сюда он не передаётся (дедуп на странице), чтобы не
// дублировать одно и то же дважды.
export interface UpcomingCupMatch {
  matchId: string;
  date: string;
  home: boolean;
  opponent: string;
}

function NextCupMatchBlock({ nextMatch }: { nextMatch: UpcomingCupMatch }) {
  const { shortDate, time } = formatMatchDateTime(nextMatch.date);
  return (
    <div className={styles.nextMatchBlock}>
      <div className={styles.cardTitle} style={{ marginBottom: 8 }}>
        Ближайший матч кубка
      </div>
      <div className={styles.matchRow}>
        <span className={styles.matchDate}>
          {shortDate}
          {time ? ` · ${time}` : ""}
        </span>
        <span className={styles.matchOpponent}>
          {nextMatch.home ? "vs" : "@"} {nextMatch.opponent}
        </span>
        {nextMatch.home && <span className={styles.homeTag}>дома</span>}
      </div>
    </div>
  );
}

export default function CupSection({
  cupPath,
  nextMatch,
}: {
  cupPath?: OurCupPathResult;
  nextMatch?: UpcomingCupMatch | null;
}) {
  if (!cupPath || cupPath.error) {
    return (
      <div className={styles.stack}>
        {nextMatch && (
          <div className={styles.card}>
            <NextCupMatchBlock nextMatch={nextMatch} />
          </div>
        )}
        <div className={styles.card}>
          <div className={styles.cardTitle}>Кубок</div>
          <p className={styles.prizeNote}>
            {cupPath?.error ??
              "Не удалось определить, в каком кубке участвует команда, — либо сезон/кубок ещё не начался, либо CHPP пока не отдаёт эти данные."}
          </p>
        </div>
      </div>
    );
  }

  if (cupPath.path.length === 0) {
    return (
      <div className={styles.stack}>
        <div className={styles.card}>
          <div className={styles.cardTitle}>{cupPath.cupName || "Кубок"}</div>
          {nextMatch && (
            <div style={{ marginTop: 16 }}>
              <NextCupMatchBlock nextMatch={nextMatch} />
            </div>
          )}
          <p className={styles.prizeNote} style={{ marginTop: nextMatch ? 16 : 0 }}>
            Матчей нашей команды в этом кубке не найдено (сезон {cupPath.season}, текущий раунд турнира —{" "}
            {cupPath.currentRound}). Возможно, мы ещё не участвовали или уже выбыли раньше проверенных раундов.
          </p>
        </div>
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

        {nextMatch && (
          <div style={{ marginTop: 20 }}>
            <NextCupMatchBlock nextMatch={nextMatch} />
          </div>
        )}

        <div className={styles.timeline} style={{ marginTop: nextMatch ? 12 : 20 }}>
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
