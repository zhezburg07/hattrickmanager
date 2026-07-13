import Header from "@/components/Header";
import Footer from "@/components/Footer";
import YouthTable from "@/components/dashboard/YouthTable";
import DemoModeBanner from "@/components/dashboard/DemoModeBanner";
import styles from "@/components/dashboard/Dashboard.module.css";
import { getStoredHattrickTokens, requestChppXmlRaw } from "@/lib/hattrickApi";
import { parseClubXml } from "@/lib/clubStaff";

async function resolveYouthLevel(): Promise<{ youthLevel: number | null; error: string | null }> {
  const tokens = getStoredHattrickTokens();
  if (!tokens) return { youthLevel: null, error: null };

  try {
    const raw = await requestChppXmlRaw("club", {}, tokens);
    if (raw.httpStatus < 200 || raw.httpStatus >= 300) {
      throw new Error(`HTTP ${raw.httpStatus}: ${raw.rawXml.slice(0, 200)}`);
    }
    return { youthLevel: parseClubXml(raw.rawXml).youthLevel, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    return { youthLevel: null, error: `Академия (club): ${message}` };
  }
}

export default async function YouthPage() {
  const { youthLevel, error } = await resolveYouthLevel();
  const tokens = getStoredHattrickTokens();

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className={`container ${styles.stack}`} style={{ paddingBottom: 72 }}>
          {!tokens && <DemoModeBanner title="Демо-режим" reasons={["Команда ещё не подключена к Hattrick."]} />}
          {tokens && error && (
            <DemoModeBanner title="Не удалось загрузить реальный уровень академии" reasons={[error]} />
          )}
          <YouthTable realYouthLevel={youthLevel ?? undefined} />
        </div>
      </main>
      <Footer />
    </>
  );
}
