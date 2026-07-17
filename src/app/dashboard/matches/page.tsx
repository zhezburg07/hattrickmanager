import Header from "@/components/Header";
import Footer from "@/components/Footer";
import MatchesCalendar from "@/components/dashboard/MatchesCalendar";
import HattrickArenaSection from "@/components/dashboard/HattrickArenaSection";
import DemoModeBanner from "@/components/dashboard/DemoModeBanner";
import styles from "@/components/dashboard/Dashboard.module.css";
import { getRequiredHattrickTokens, requestChppXmlRaw, type StoredHattrickTokens } from "@/lib/hattrickApi";
import { parseTeamDetailsXml } from "@/lib/teamDetails";
import { parseMatchesXml, toSeasonMatches, dedupeMatches, type RealMatch } from "@/lib/matches";
import { resolveArenaChallenges } from "@/lib/hattrickArena";
import type { SeasonMatch } from "@/data/matches";

interface MatchesResult {
  matches: SeasonMatch[] | null;
  error: string | null;
  // Необязательное предупреждение — matches.xml (текущий сезон) загрузился,
  // но matchesarchive.xml (более длинная история) не удалось получить, так
  // что список показан не полностью. Не блокирует страницу — тот же принцип
  // "второстепенный шаг не должен ломать основной результат", что и при
  // мягком входе (см. /api/auth/callback).
  archiveWarning: string | null;
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
    return { matches: toSeasonMatches(merged), error: null, archiveWarning };
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    return { matches: null, error: `Матчи (matches): ${message}`, archiveWarning: null };
  }
}

export default async function MatchesPage() {
  const tokens = await getRequiredHattrickTokens();
  const [{ matches, error, archiveWarning }, challenges] = await Promise.all([
    resolveMatchesData(tokens),
    resolveArenaChallenges(tokens),
  ]);

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className={`container ${styles.stack}`} style={{ paddingBottom: 72 }}>
          {error && <DemoModeBanner title="Не удалось загрузить реальные матчи" reasons={[error]} />}
          {archiveWarning && <DemoModeBanner title="Показана не вся история" reasons={[archiveWarning]} showConnectAction={false} />}
          {matches && <MatchesCalendar matches={matches} />}
          <HattrickArenaSection challenges={challenges} />
        </div>
      </main>
      <Footer />
    </>
  );
}
