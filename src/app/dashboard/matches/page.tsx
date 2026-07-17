import Header from "@/components/Header";
import Footer from "@/components/Footer";
import MatchesCalendar from "@/components/dashboard/MatchesCalendar";
import HattrickArenaSection from "@/components/dashboard/HattrickArenaSection";
import DemoModeBanner from "@/components/dashboard/DemoModeBanner";
import styles from "@/components/dashboard/Dashboard.module.css";
import { getRequiredHattrickTokens, requestChppXmlRaw, type StoredHattrickTokens } from "@/lib/hattrickApi";
import { parseTeamDetailsXml } from "@/lib/teamDetails";
import { parseMatchesXml, toSeasonMatches, dedupeMatches, filterTrainingRelevantMatches, type RealMatch } from "@/lib/matches";
import { resolveArenaChallenges } from "@/lib/hattrickArena";
import type { SeasonMatch } from "@/data/matches";

const MAX_MATCHES_SHOWN = 25;

// ВРЕМЕННАЯ диагностика — показывает количество матчей на каждом шаге
// конвейера (matches.xml → matchesarchive.xml → объединение → строгий
// фильтр → мягкий фильтр), чтобы сразу видеть, на каком именно шаге список
// становится пустым, если это повторится. Поставьте false, когда список
// стабильно показывает реальные матчи.
const SHOW_MATCHES_DEBUG = true;

interface MatchesResult {
  matches: SeasonMatch[] | null;
  error: string | null;
  // Необязательное предупреждение (не блокирует страницу) — например,
  // matchesarchive не подключился, или строгий фильтр по SourceSystem
  // отсеял всё и пришлось откатиться к более мягкому условию.
  warning: string | null;
  debugCounts: string[];
}

async function resolveMatchesData(tokens: StoredHattrickTokens): Promise<MatchesResult> {
  const debugCounts: string[] = [];
  try {
    const teamRaw = await requestChppXmlRaw("teamdetails", {}, tokens);
    if (teamRaw.httpStatus < 200 || teamRaw.httpStatus >= 300) {
      throw new Error(`HTTP ${teamRaw.httpStatus}: ${teamRaw.rawXml.slice(0, 200)}`);
    }
    const teamId = parseTeamDetailsXml(teamRaw.rawXml).teamId;

    const raw = await requestChppXmlRaw("matches", {}, tokens);
    if (raw.httpStatus < 200 || raw.httpStatus >= 300) {
      throw new Error(`HTTP ${raw.httpStatus}: ${raw.rawXml.slice(0, 200)}`);
    }
    const currentSeasonMatches = parseMatchesXml(raw.rawXml, teamId);
    debugCounts.push(`matches.xml: ${currentSeasonMatches.length} матчей (HTTP ${raw.httpStatus})`);

    // matchesarchive.xml — более полная история прошлых сезонов (matches.xml
    // документированно ограничен ~50 матчами). Ни имя файла, ни параметры
    // здесь ни разу не проверялись на живом ответе — если запрос не удастся,
    // страница всё равно показывает текущий сезон из matches.xml, просто с
    // честным предупреждением, а не пустой.
    let archiveMatches: RealMatch[] = [];
    let archiveWarning: string | null = null;
    try {
      const archiveRaw = await requestChppXmlRaw("matchesarchive", {}, tokens);
      if (archiveRaw.httpStatus < 200 || archiveRaw.httpStatus >= 300) {
        throw new Error(`HTTP ${archiveRaw.httpStatus}: ${archiveRaw.rawXml.slice(0, 200)}`);
      }
      archiveMatches = parseMatchesXml(archiveRaw.rawXml, teamId);
      debugCounts.push(`matchesarchive.xml: ${archiveMatches.length} матчей (HTTP ${archiveRaw.httpStatus})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "неизвестная ошибка";
      archiveWarning = `Полная история прошлых сезонов (matchesarchive) недоступна: ${message}. Показан только текущий сезон (matches).`;
      debugCounts.push(`matchesarchive.xml: ошибка — ${message}`);
    }

    // currentSeasonMatches — ПЕРВЫМ аргументом: dedupeMatches оставляет
    // первое вхождение по MatchID, так что уже подтверждённый разбор
    // matches.xml не может быть тихо переписан менее проверенным разбором
    // matchesarchive.xml при совпадении ID (см. комментарий в
    // src/lib/matches.ts).
    const merged = dedupeMatches([...currentSeasonMatches, ...archiveMatches]);
    debugCounts.push(`после объединения и удаления дублей: ${merged.length}`);

    if (merged.length === 0) {
      const archiveNote = archiveMatches.length === 0 ? " и matchesarchive" : "";
      return {
        matches: null,
        error: `Матчи (matches${archiveNote}): запрос выполнился (HTTP ${raw.httpStatus}), но вернул пустой список матчей — либо у команды ещё нет ни одного матча в ответе CHPP, либо структура ответа отличается от ожидаемой (см. RealMatch в src/lib/matches.ts).`,
        warning: null,
        debugCounts,
      };
    }

    // Строгий фильтр (см. filterTrainingRelevantMatches в src/lib/matches.ts)
    // отличает матчи основной команды от юношеских/Hattrick Arena по полю
    // SourceSystem — оно ни разу не проверялось на живом ответе. Если из-за
    // этого список стал пустым, откатываемся к более мягкому условию
    // (просто "сыграно") — список не должен молча пропадать из-за одной
    // непроверенной догадки.
    let trainingRelevant = filterTrainingRelevantMatches(merged);
    debugCounts.push(`после строгого фильтра (сыграно + основная команда): ${trainingRelevant.length}`);
    let filterWarning: string | null = null;
    if (trainingRelevant.length === 0) {
      trainingRelevant = merged.filter((m) => m.status === "FINISHED" && m.ourScore !== null && m.oppScore !== null);
      debugCounts.push(`после мягкого фильтра (только "сыграно"): ${trainingRelevant.length}`);
      if (trainingRelevant.length > 0) {
        filterWarning =
          "Не удалось надёжно отличить матчи основной команды от юношеских/Hattrick Arena по данным CHPP (поле SourceSystem) — показаны все сыгранные матчи без этой фильтрации.";
      }
    }

    const shown = toSeasonMatches(trainingRelevant).slice(0, MAX_MATCHES_SHOWN);
    const warning = [archiveWarning, filterWarning].filter(Boolean).join(" ") || null;
    return { matches: shown, error: null, warning, debugCounts };
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    return { matches: null, error: `Матчи (matches): ${message}`, warning: null, debugCounts };
  }
}

export default async function MatchesPage() {
  const tokens = await getRequiredHattrickTokens();
  const [{ matches, error, warning, debugCounts }, challenges] = await Promise.all([
    resolveMatchesData(tokens),
    resolveArenaChallenges(tokens),
  ]);

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className={`container ${styles.stack}`} style={{ paddingBottom: 72 }}>
          {error && <DemoModeBanner title="Не удалось загрузить реальные матчи" reasons={[error]} />}
          {warning && <DemoModeBanner title="Показана не вся история" reasons={[warning]} showConnectAction={false} />}
          {SHOW_MATCHES_DEBUG && debugCounts.length > 0 && (
            <div className={styles.card}>
              <div className={styles.balanceLabel}>Диагностика: количество матчей на каждом шаге</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 8, fontSize: 12.5 }}>
                {debugCounts.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
            </div>
          )}
          {matches && <MatchesCalendar matches={matches} />}
          <HattrickArenaSection challenges={challenges} />
        </div>
      </main>
      <Footer />
    </>
  );
}
