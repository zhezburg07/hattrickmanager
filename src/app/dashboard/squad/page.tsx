import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SquadTable from "@/components/dashboard/SquadTable";
import DemoModeBanner from "@/components/dashboard/DemoModeBanner";
import styles from "@/components/dashboard/Dashboard.module.css";
import { getStoredHattrickTokens, getStoredHattrickUserId, requestChppXmlRaw, type StoredHattrickTokens } from "@/lib/hattrickApi";
import { parsePlayersDetailedXml, debugRawPlayerCountryIds, type DebugPlayerCountryRaw } from "@/lib/squadPlayers";
import { resolveRealHomeCountry } from "@/lib/worldCurrency";
import { getCountryIdLookup } from "@/lib/worldCountries";
import { resolvePlayerHistory } from "@/lib/playerHistoryDb";
import type { SquadPlayer } from "@/data/squad";

async function fetchPlayersRaw(tokens: StoredHattrickTokens) {
  return requestChppXmlRaw("players", {}, tokens);
}

// ВРЕМЕННАЯ диагностика флагов на реальных данных — покажите true, чтобы
// увидеть, что именно CHPP присылает в поле национальности игрока (сырой
// CountryID + все похожие поля) и как разрешилась "домашняя страна"
// команды. Уберите обратно в false, когда причина найдена (см. чат).
const SHOW_NATIONALITY_DEBUG = true;

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

  const [{ homeCountry, error: homeCountryError }, playersRaw, countryIdLookupResult] = await Promise.all([
    resolveRealHomeCountry(tokens),
    fetchPlayersRaw(tokens).catch(() => null),
    getCountryIdLookup(tokens),
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
              {debugPlayers.map((p, i) => (
                <div key={i} style={{ marginTop: 4 }}>
                  Игрок {i + 1} ({p.name}): CountryID={p.countryId} · {p.rawCountryFields}
                </div>
              ))}
            </div>
          )}
          {error && <DemoModeBanner title="Не удалось загрузить реальный состав" reasons={[error]} />}
          <SquadTable players={players ?? undefined} prevByPlayerId={players ? prevByPlayerId : undefined} />
        </div>
      </main>
      <Footer />
    </>
  );
}
