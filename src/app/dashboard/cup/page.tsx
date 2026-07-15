import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CupSection from "@/components/dashboard/CupSection";
import DemoModeBanner from "@/components/dashboard/DemoModeBanner";
import styles from "@/components/dashboard/Dashboard.module.css";
import { getStoredHattrickTokens, requestChppXmlRaw, type StoredHattrickTokens } from "@/lib/hattrickApi";
import { parseTeamDetailsXml } from "@/lib/teamDetails";
import { parseCupMatchesXml, type RealCupMatch } from "@/lib/cupMatches";

async function resolveTeamCupInfo(
  tokens: StoredHattrickTokens,
): Promise<{ teamId: string | null; stillInCup: boolean | null; error: string | null }> {
  try {
    const raw = await requestChppXmlRaw("teamdetails", {}, tokens);
    if (raw.httpStatus < 200 || raw.httpStatus >= 300) {
      throw new Error(`HTTP ${raw.httpStatus}: ${raw.rawXml.slice(0, 200)}`);
    }
    const team = parseTeamDetailsXml(raw.rawXml);
    return { teamId: team.teamId, stillInCup: team.stillInCup, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    return { teamId: null, stillInCup: null, error: `Кубки (teamdetails): ${message}` };
  }
}

// cupmatches — ни разу не пробовался в этом проекте живьём до сих пор (см.
// src/lib/cupMatches.ts). Если файла с таким именем нет или схема другая —
// просто останемся без этого блока, ничего не сломав.
async function resolveCupMatches(
  tokens: StoredHattrickTokens,
  teamId: string,
): Promise<{ matches: RealCupMatch[] | null; error: string | null }> {
  try {
    const raw = await requestChppXmlRaw("cupmatches", {}, tokens);
    if (raw.httpStatus < 200 || raw.httpStatus >= 300) {
      throw new Error(`HTTP ${raw.httpStatus}: ${raw.rawXml.slice(0, 200)}`);
    }
    return { matches: parseCupMatchesXml(raw.rawXml, teamId), error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    return { matches: null, error: `Матчи кубка (cupmatches): ${message}` };
  }
}

export default async function CupPage() {
  const tokens = getStoredHattrickTokens();

  if (!tokens) {
    return (
      <>
        <Header />
        <main className={styles.page}>
          <div className={`container ${styles.stack}`} style={{ paddingBottom: 72 }}>
            <DemoModeBanner title="Демо-режим" reasons={["Команда ещё не подключена к Hattrick."]} />
            <CupSection />
          </div>
        </main>
        <Footer />
      </>
    );
  }

  const { teamId, stillInCup, error: teamError } = await resolveTeamCupInfo(tokens);
  const { matches, error: matchesError } = teamId
    ? await resolveCupMatches(tokens, teamId)
    : { matches: null, error: null };
  const errors = [teamError, matchesError].filter((e): e is string => e !== null);

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className={`container ${styles.stack}`} style={{ paddingBottom: 72 }}>
          {errors.length > 0 && (
            <DemoModeBanner title="Не удалось загрузить часть данных о кубках" reasons={errors} />
          )}
          <CupSection stillInCup={stillInCup ?? undefined} realCupMatches={matches ?? undefined} />
        </div>
      </main>
      <Footer />
    </>
  );
}
