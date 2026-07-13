import Header from "@/components/Header";
import Footer from "@/components/Footer";
import MatchesCalendar from "@/components/dashboard/MatchesCalendar";
import DemoModeBanner from "@/components/dashboard/DemoModeBanner";
import styles from "@/components/dashboard/Dashboard.module.css";
import { getStoredHattrickTokens, requestChppXmlRaw } from "@/lib/hattrickApi";
import { parseTeamDetailsXml } from "@/lib/teamDetails";
import { parseMatchesXml, toSeasonMatches } from "@/lib/matches";
import type { SeasonMatch } from "@/data/matches";

async function resolveMatchesData(): Promise<{ matches: SeasonMatch[] | null; error: string | null }> {
  const tokens = getStoredHattrickTokens();
  if (!tokens) return { matches: null, error: null };

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
    const realMatches = parseMatchesXml(raw.rawXml, teamId);
    return { matches: toSeasonMatches(realMatches), error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    return { matches: null, error: `Матчи (matches): ${message}` };
  }
}

export default async function MatchesPage() {
  const { matches, error } = await resolveMatchesData();
  const tokens = getStoredHattrickTokens();

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className={`container ${styles.stack}`} style={{ paddingBottom: 72 }}>
          {!tokens && <DemoModeBanner title="Демо-режим" reasons={["Команда ещё не подключена к Hattrick."]} />}
          {tokens && error && (
            <DemoModeBanner title="Не удалось загрузить реальные матчи" reasons={[error]} />
          )}
          <MatchesCalendar matches={matches ?? undefined} />
        </div>
      </main>
      <Footer />
    </>
  );
}
