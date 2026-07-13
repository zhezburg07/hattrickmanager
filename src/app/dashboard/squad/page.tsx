import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SquadTable from "@/components/dashboard/SquadTable";
import DemoModeBanner from "@/components/dashboard/DemoModeBanner";
import styles from "@/components/dashboard/Dashboard.module.css";
import { getStoredHattrickTokens, requestChppXmlRaw, type StoredHattrickTokens } from "@/lib/hattrickApi";
import { parsePlayersDetailedXml } from "@/lib/squadPlayers";
import { resolveRealHomeCountry, type HomeCountryInfo } from "@/lib/worldCurrency";
import type { SquadPlayer } from "@/data/squad";

async function fetchPlayersRaw(tokens: StoredHattrickTokens) {
  return requestChppXmlRaw("players", {}, tokens);
}

export default async function SquadPage() {
  const tokens = getStoredHattrickTokens();

  if (!tokens) {
    return (
      <>
        <Header />
        <main className={styles.page}>
          <div className={`container ${styles.stack}`} style={{ paddingBottom: 72 }}>
            <DemoModeBanner title="Демо-режим" reasons={["Команда ещё не подключена к Hattrick."]} />
            <SquadTable />
          </div>
        </main>
        <Footer />
      </>
    );
  }

  const [{ homeCountry }, playersRaw] = await Promise.all([
    resolveRealHomeCountry(tokens),
    fetchPlayersRaw(tokens).catch(() => null),
  ]);

  let players: SquadPlayer[] | null = null;
  let error: string | null = null;
  try {
    if (!playersRaw) throw new Error("запрос не выполнился");
    if (playersRaw.httpStatus < 200 || playersRaw.httpStatus >= 300) {
      throw new Error(`HTTP ${playersRaw.httpStatus}: ${playersRaw.rawXml.slice(0, 200)}`);
    }
    players = parsePlayersDetailedXml(playersRaw.rawXml, homeCountry);
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    error = `Состав (players): ${message}`;
  }

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className={`container ${styles.stack}`} style={{ paddingBottom: 72 }}>
          {error && <DemoModeBanner title="Не удалось загрузить реальный состав" reasons={[error]} />}
          <SquadTable players={players ?? undefined} />
        </div>
      </main>
      <Footer />
    </>
  );
}
