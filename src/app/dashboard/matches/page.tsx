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

interface MatchesResult {
  matches: SeasonMatch[] | null;
  error: string | null;
  // Необязательное предупреждение (не блокирует страницу) — например,
  // matchesarchive не подключился, или строгий фильтр по SourceSystem
  // отсеял всё и пришлось откатиться к более мягкому условию.
  warning: string | null;
}

async function resolveMatchesData(tokens: StoredHattrickTokens): Promise<MatchesResult> {
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
    } catch (err) {
      const message = err instanceof Error ? err.message : "неизвестная ошибка";
      archiveWarning = `Полная история прошлых сезонов (matchesarchive) недоступна: ${message}. Показан только текущий сезон (matches).`;
    }

    const merged = dedupeMatches([...currentSeasonMatches, ...archiveMatches]);

    if (merged.length === 0) {
      const archiveNote = archiveMatches.length === 0 ? " и matchesarchive" : "";
      return {
        matches: null,
        error: `Матчи (matches${archiveNote}): запрос выполнился (HTTP ${raw.httpStatus}), но вернул пустой список матчей — либо у команды ещё нет ни одного матча в ответе CHPP, либо структура ответа отличается от ожидаемой (см. RealMatch в src/lib/matches.ts).`,
        warning: null,
      };
    }

    // Строгий фильтр (см. filterTrainingRelevantMatches в src/lib/matches.ts)
    // отличает матчи основной команды от юношеских/Hattrick Arena по полю
    // SourceSystem — оно ни разу не проверялось на живом ответе. Если из-за
    // этого список стал пустым, откатываемся к более мягкому условию
    // (просто "сыграно") — список не должен молча пропадать из-за одной
    // непроверенной догадки.
    let trainingRelevant = filterTrainingRelevantMatches(merged);
    let filterWarning: string | null = null;
    if (trainingRelevant.length === 0) {
      trainingRelevant = merged.filter((m) => m.status === "FINISHED" && m.ourScore !== null && m.oppScore !== null);
      if (trainingRelevant.length > 0) {
        filterWarning =
          "Не удалось надёжно отличить матчи основной команды от юношеских/Hattrick Arena по данным CHPP (поле SourceSystem) — показаны все сыгранные матчи без этой фильтрации.";
      }
    }

    const shown = toSeasonMatches(trainingRelevant).slice(0, MAX_MATCHES_SHOWN);
    const warning = [archiveWarning, filterWarning].filter(Boolean).join(" ") || null;
    return { matches: shown, error: null, warning };
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    return { matches: null, error: `Матчи (matches): ${message}`, warning: null };
  }
}

export default async function MatchesPage() {
  const tokens = await getRequiredHattrickTokens();
  const [{ matches, error, warning }, challenges] = await Promise.all([
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
          {matches && <MatchesCalendar matches={matches} />}
          <HattrickArenaSection challenges={challenges} />
        </div>
      </main>
      <Footer />
    </>
  );
}
