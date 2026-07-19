import Header from "@/components/Header";
import Footer from "@/components/Footer";
import LineupBoard from "@/components/dashboard/LineupBoard";
import DemoModeBanner from "@/components/dashboard/DemoModeBanner";
import styles from "@/components/dashboard/Dashboard.module.css";
import { getRequiredHattrickTokens, getStoredHattrickUserId, requestChppXmlRaw, type StoredHattrickTokens } from "@/lib/hattrickApi";
import { parsePlayersDetailedXml, PLAYERS_XML_VERSION } from "@/lib/squadPlayers";
import { resolveRealHomeCountry } from "@/lib/worldCurrency";
import { getCountryIdLookup } from "@/lib/worldCountries";
import { resolvePlayerHistory } from "@/lib/playerHistoryDb";
import { resolveLastMatchRatings } from "@/lib/lastMatchRating";
import { resolveOpponentAnalysis } from "@/lib/opponentAnalysis";
import type { SquadPlayer } from "@/data/squad";

async function fetchPlayersRaw(tokens: StoredHattrickTokens) {
  return requestChppXmlRaw("players", { version: PLAYERS_XML_VERSION }, tokens);
}

export default async function LineupPage() {
  const tokens = await getRequiredHattrickTokens();

  const [{ homeCountry }, playersRaw, countryIdLookupResult, lastMatchRatingResult, opponentAnalysis] =
    await Promise.all([
      resolveRealHomeCountry(tokens),
      fetchPlayersRaw(tokens).catch(() => null),
      getCountryIdLookup(tokens),
      resolveLastMatchRatings(tokens),
      resolveOpponentAnalysis(tokens),
    ]);

  let players: SquadPlayer[] | null = null;
  let error: string | null = null;
  try {
    if (!playersRaw) throw new Error("запрос не выполнился");
    if (playersRaw.httpStatus < 200 || playersRaw.httpStatus >= 300) {
      throw new Error(`HTTP ${playersRaw.httpStatus}: ${playersRaw.rawXml.slice(0, 200)}`);
    }
    players = parsePlayersDetailedXml(playersRaw.rawXml, homeCountry, countryIdLookupResult.lookup ?? undefined);
    players = players.map((p) => ({
      ...p,
      lastMatchRating: lastMatchRatingResult.lastMatchRatings[p.id],
      recentBestRating: lastMatchRatingResult.bestOfRecentRatings[p.id],
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    error = `Состав (players): ${message}`;
  }

  const prevByPlayerId = players ? await resolvePlayerHistory(getStoredHattrickUserId(), players) : {};

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className={`container ${styles.stack}`} style={{ paddingBottom: 72 }}>
          {error && <DemoModeBanner title="Не удалось загрузить реальный состав" reasons={[error]} />}
          {players && (
            <>
              <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "0 0 12px" }}>
                CHPP не сообщает, кто сейчас стоит в основе — расставьте игроков сами или нажмите
                «Рекомендовать состав».
              </p>
              <LineupBoard players={players} prevByPlayerId={prevByPlayerId} opponentAnalysis={opponentAnalysis} />
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
