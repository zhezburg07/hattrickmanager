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

// Явное "Наша команда vs Соперник" / "Соперник vs Наша команда" вместо
// голого "vs Соперник"/"@ Соперник" — по запросу (см. чат "Кубки: явно
// показывать нашу команду в списке матчей"), раньше по одной лишь строке
// матча не было видно, кто вообще играет, кроме соперника.
function matchupLabel(home: boolean, opponent: string, ourTeamName: string): string {
  const our = ourTeamName || "Наша команда";
  return home ? `${our} vs ${opponent}` : `${opponent} vs ${our}`;
}

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

function NextCupMatchBlock({ nextMatch, ourTeamName }: { nextMatch: UpcomingCupMatch; ourTeamName: string }) {
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
        <span className={styles.matchOpponent}>{matchupLabel(nextMatch.home, nextMatch.opponent, ourTeamName)}</span>
        {nextMatch.home && <span className={styles.homeTag}>дома</span>}
      </div>
    </div>
  );
}

// Одна карточка одного кубка — команда за сезон могла сыграть в нескольких
// (каскад Национальный Кубок → Кубок Вызова → ... после вылета), см.
// CupSection ниже, который рендерит по одной такой карточке на кубок.
// ВРЕМЕННАЯ диагностика (см. чат "Кубки: по-прежнему показывают чужие
// матчи") — TeamID/TeamName нашей команды, которой строился этот путь, и
// TeamID/TeamName обеих сторон каждого показанного матча, прямо в самой
// карточке, а не только в скрытой debug-панели. Позволяет сразу увидеть,
// действительно ли opponentTeamId в каком-то матче совпадает с нашим же
// teamId (тогда "наш" матч на самом деле матч другой команды) или расходится
// с ourTeamId, показанным здесь же. Убрать вместе с этим комментарием,
// когда причина найдена и подтверждена.
function OurTeamDiagnosticLine({ cupPath }: { cupPath: OurCupPathResult }) {
  return (
    <p style={{ fontSize: 11.5, color: "var(--color-muted, #888)", margin: "4px 0 0" }}>
      Путь построен для: {cupPath.ourTeamName || "(имя не определено)"} (TeamID {cupPath.ourTeamId || "(пусто!)"})
    </p>
  );
}

function CupCard({ cupPath, nextMatch }: { cupPath: OurCupPathResult; nextMatch?: UpcomingCupMatch | null }) {
  if (cupPath.path.length === 0) {
    return (
      <div className={styles.card}>
        <div className={styles.cardTitle}>{cupPath.cupName || "Кубок"}</div>
        <OurTeamDiagnosticLine cupPath={cupPath} />
        {nextMatch && (
          <div style={{ marginTop: 16 }}>
            <NextCupMatchBlock nextMatch={nextMatch} ourTeamName={cupPath.ourTeamName} />
          </div>
        )}
        <p className={styles.prizeNote} style={{ marginTop: nextMatch ? 16 : 0 }}>
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
    <div className={styles.card}>
      <div className={styles.statusRow}>
        <div>
          <div className={styles.cupName}>{cupPath.cupName || "Кубок"}</div>
          <div className={styles.cupRound}>
            Сезон {cupPath.season} · текущий раунд турнира: {cupPath.currentRound}
          </div>
          <OurTeamDiagnosticLine cupPath={cupPath} />
        </div>
        <span className={`${styles.statusTag} ${statusClass}`}>
          <span className={styles.statusDot} />
          {statusLabel}
        </span>
      </div>

      {nextMatch && (
        <div style={{ marginTop: 20 }}>
          <NextCupMatchBlock nextMatch={nextMatch} ourTeamName={cupPath.ourTeamName} />
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
                  {matchupLabel(m.home, m.opponent, cupPath.ourTeamName)} · {shortDate}
                  {time ? ` · ${time}` : ""}
                </div>
                <div style={{ fontSize: 11, color: "var(--color-muted, #888)", marginTop: 2 }}>
                  MatchID {m.matchId} · {m.home ? "дома" : "в гостях"} · наш TeamID {cupPath.ourTeamId || "(пусто!)"} vs
                  соперник «{m.opponent}» TeamID {m.opponentTeamId || "(пусто!)"}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Команда за один сезон может успеть сыграть в НЕСКОЛЬКИХ кубках подряд —
// после вылета из Национального Кубка Hattrick переводит команду в Кубок
// Вызова, затем (при повторном вылете) в Кубок Надежды. cupPaths — уже
// готовый список от самого раннего кубка сезона к текущему/последнему (см.
// "cupInfo" в src/lib/chppSync.ts) — рендерим по карточке на каждый,
// каскадом сверху вниз; ближайший предстоящий матч относится только к
// последнему (текущему) кубку.
export default function CupSection({
  cupPaths,
  nextMatch,
}: {
  cupPaths: OurCupPathResult[];
  nextMatch?: UpcomingCupMatch | null;
}) {
  const validPaths = cupPaths.filter((c) => !c.error);
  // Наше имя команды почти всегда есть даже у "провалившихся" cupPaths
  // (ourTeamName проставляется ДО попытки пройти по раундам, см.
  // OurCupPathResult в cupMatches.ts) — нужен запасной источник для блока
  // "Ближайший матч" в пустом состоянии, где ни одной валидной карточки
  // кубка ещё нет.
  const ourTeamName = cupPaths.find((c) => c.ourTeamName)?.ourTeamName ?? "";

  if (validPaths.length === 0) {
    const firstError = cupPaths.find((c) => c.error)?.error;
    return (
      <div className={styles.stack}>
        {nextMatch && (
          <div className={styles.card}>
            <NextCupMatchBlock nextMatch={nextMatch} ourTeamName={ourTeamName} />
          </div>
        )}
        <div className={styles.card}>
          <div className={styles.cardTitle}>Кубок</div>
          <p className={styles.prizeNote}>
            {firstError ??
              "Не удалось определить, в каком кубке участвует команда, — либо сезон/кубок ещё не начался, либо CHPP пока не отдаёт эти данные."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.stack}>
      {validPaths.map((cupPath, i) => (
        <CupCard key={cupPath.cupId} cupPath={cupPath} nextMatch={i === validPaths.length - 1 ? nextMatch : null} />
      ))}
    </div>
  );
}
