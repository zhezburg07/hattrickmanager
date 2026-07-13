import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CupSection from "@/components/dashboard/CupSection";
import DemoModeBanner from "@/components/dashboard/DemoModeBanner";
import styles from "@/components/dashboard/Dashboard.module.css";
import { getStoredHattrickTokens, requestChppXmlRaw } from "@/lib/hattrickApi";
import { parseTeamDetailsXml } from "@/lib/teamDetails";

async function resolveStillInCup(): Promise<{ stillInCup: boolean | null; error: string | null }> {
  const tokens = getStoredHattrickTokens();
  if (!tokens) return { stillInCup: null, error: null };

  try {
    const raw = await requestChppXmlRaw("teamdetails", {}, tokens);
    if (raw.httpStatus < 200 || raw.httpStatus >= 300) {
      throw new Error(`HTTP ${raw.httpStatus}: ${raw.rawXml.slice(0, 200)}`);
    }
    return { stillInCup: parseTeamDetailsXml(raw.rawXml).stillInCup, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    return { stillInCup: null, error: `Кубки (teamdetails): ${message}` };
  }
}

export default async function CupPage() {
  const { stillInCup, error } = await resolveStillInCup();
  const tokens = getStoredHattrickTokens();

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className={`container ${styles.stack}`} style={{ paddingBottom: 72 }}>
          {!tokens && <DemoModeBanner title="Демо-режим" reasons={["Команда ещё не подключена к Hattrick."]} />}
          {tokens && error && (
            <DemoModeBanner title="Не удалось определить участие в кубке" reasons={[error]} />
          )}
          <CupSection stillInCup={stillInCup ?? undefined} />
        </div>
      </main>
      <Footer />
    </>
  );
}
