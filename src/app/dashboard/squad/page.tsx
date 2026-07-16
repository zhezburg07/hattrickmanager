import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SquadTable from "@/components/dashboard/SquadTable";
import DemoModeBanner from "@/components/dashboard/DemoModeBanner";
import styles from "@/components/dashboard/Dashboard.module.css";
import { getRequiredHattrickTokens, getStoredHattrickUserId, requestChppXmlRaw, type StoredHattrickTokens } from "@/lib/hattrickApi";
import { parsePlayersDetailedXml, debugRawPlayerCountryIds, type DebugPlayerCountryRaw } from "@/lib/squadPlayers";
import { resolveRealHomeCountry } from "@/lib/worldCurrency";
import { getCountryIdLookup } from "@/lib/worldCountries";
import { parseTeamDetailsXml } from "@/lib/teamDetails";
import { resolvePlayerHistory } from "@/lib/playerHistoryDb";
import { resolveLastMatchRatings } from "@/lib/lastMatchRating";
import type { SquadPlayer } from "@/data/squad";

async function fetchPlayersRaw(tokens: StoredHattrickTokens) {
  return requestChppXmlRaw("players", {}, tokens);
}

// Тренер команды в Hattrick — один из собственных игроков (см.
// src/lib/teamDetails.ts). Та же схема, что уже работает на "Тренировке"
// (src/app/dashboard/training/page.tsx): teamdetails.xml даёт его PlayerID.
async function resolveTrainerPlayerId(tokens: StoredHattrickTokens): Promise<number | undefined> {
  try {
    const raw = await requestChppXmlRaw("teamdetails", {}, tokens);
    if (raw.httpStatus < 200 || raw.httpStatus >= 300) return undefined;
    const id = Number(parseTeamDetailsXml(raw.rawXml).trainerPlayerId);
    return Number.isNaN(id) || id === 0 ? undefined : id;
  } catch {
    return undefined;
  }
}

// ВРЕМЕННАЯ диагностика флагов на реальных данных — причина (числовой
// CountryID без полного справочника) уже найдена и исправлена (см.
// src/lib/worldCountries.ts). Оставлено на false, легко включить обратно,
// если снова понадобится посмотреть сырые поля национальности.
const SHOW_NATIONALITY_DEBUG = false;

export default async function SquadPage() {
  const tokens = getRequiredHattrickTokens();

  const [{ homeCountry, error: homeCountryError }, playersRaw, countryIdLookupResult, trainerPlayerId, lastMatchRatingResult] =
    await Promise.all([
      resolveRealHomeCountry(tokens),
      fetchPlayersRaw(tokens).catch(() => null),
      getCountryIdLookup(tokens),
      resolveTrainerPlayerId(tokens),
      resolveLastMatchRatings(tokens),
    ]);

  let players: SquadPlayer[] | null = null;
  let error: string | null = null;
  let debugPlayers: DebugPlayerCountryRaw[] = [];
  try {
    if (!playersRaw) throw new Error("запрос не выполнился");
    if (playersRaw.httpStatus < 200 || playersRaw.httpStatus >= 300) {
      throw new Error(`HTTP ${playersRaw.httpStatus}: ${playersRaw.rawXml.slice(0, 200)}`);
    }
    players = parsePlayersDetailedXml(playersRaw.rawXml, homeCountry, countryIdLookupResult.lookup ?? undefined);
    players = players.map((p) => ({ ...p, lastMatchRating: lastMatchRatingResult.ratings[p.id] }));
    if (SHOW_NATIONALITY_DEBUG) debugPlayers = debugRawPlayerCountryIds(playersRaw.rawXml, 3);
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
          {SHOW_NATIONALITY_DEBUG && (
            <div
              style={{
                border: "2px dashed #c0503f",
                borderRadius: 8,
                padding: "12px 14px",
                marginBottom: 12,
                background: "rgba(192, 80, 63, 0.06)",
                fontSize: 12,
                color: "#f2ede1",
              }}
            >
              <div style={{ fontWeight: 800, color: "#c0503f", marginBottom: 6 }}>
                ⚠ Временная диагностика национальности игроков (убрать после отладки)
              </div>
              <div>
                Домашняя страна команды:{" "}
                {homeCountry
                  ? `countryId=${homeCountry.countryId}, страна=${homeCountry.country.name} (${homeCountry.country.isoCode || homeCountry.country.flagOverride || "нет кода"})`
                  : "не определена"}
              </div>
              {homeCountryError && <div style={{ color: "#c0503f" }}>Ошибка домашней страны: {homeCountryError}</div>}
              <div>
                Полный список стран (worlddetails без фильтра):{" "}
                {countryIdLookupResult.lookup
                  ? `используется, стран найдено: ${countryIdLookupResult.countriesFound}`
                  : "не используется"}
              </div>
              {countryIdLookupResult.error && (
                <div style={{ color: "#c0503f" }}>Причина: {countryIdLookupResult.error}</div>
              )}
              <div>
                Рейтинг последнего матча:{" "}
                {Object.keys(lastMatchRatingResult.ratings).length
                  ? `получено, игроков с рейтингом: ${Object.keys(lastMatchRatingResult.ratings).length}`
                  : "не получено"}
              </div>
              {lastMatchRatingResult.error && (
                <div style={{ color: "#c0503f" }}>Причина: {lastMatchRatingResult.error}</div>
              )}
              {debugPlayers.map((p, i) => (
                <div key={i} style={{ marginTop: 4 }}>
                  Игрок {i + 1} ({p.name}): CountryID={p.countryId} · {p.rawCountryFields}
                </div>
              ))}
            </div>
          )}
          {error && <DemoModeBanner title="Не удалось загрузить реальный состав" reasons={[error]} />}
          {players && (
            <SquadTable players={players} prevByPlayerId={prevByPlayerId} trainerPlayerId={trainerPlayerId} />
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
