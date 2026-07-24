import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CupSection from "@/components/dashboard/CupSection";
import DemoModeBanner from "@/components/dashboard/DemoModeBanner";
import styles from "@/components/dashboard/Dashboard.module.css";
import { getRequiredHattrickTokens, requestChppXmlRaw, type StoredHattrickTokens } from "@/lib/hattrickApi";
import { parseTeamDetailsXml } from "@/lib/teamDetails";
import { parseClubXml } from "@/lib/clubStaff";
import { parseMatchesXml, debugRawMatchFields } from "@/lib/matches";
import { resolveOurCupPath, type OurCupPathResult } from "@/lib/cupMatches";

// ВРЕМЕННАЯ диагностика — показывает, откуда (если откуда-то) реально
// нашёлся CupID (teamdetails/club/matches) и что вернул проход по раундам
// cupmatches (resolveOurCupPath в src/lib/cupMatches.ts). Уберите, когда
// поведение стабильно подтвердится на реальных данных.
const SHOW_CUP_DEBUG_PANEL = true;

interface CupDebugInfo {
  teamId: string | null;
  stillInCup: boolean | null;
  teamDetailsCupId: string | null;
  teamDetailsCupName: string | null;
  clubCupId: string | null;
  matchesCupId: string | null;
  chosenCupId: string | null;
  matchesRawSample: Record<string, unknown>[];
  pathDebug: string[];
}

function emptyCupDebug(): CupDebugInfo {
  return {
    teamId: null,
    stillInCup: null,
    teamDetailsCupId: null,
    teamDetailsCupName: null,
    clubCupId: null,
    matchesCupId: null,
    chosenCupId: null,
    matchesRawSample: [],
    pathDebug: [],
  };
}

async function resolveTeamCupInfo(tokens: StoredHattrickTokens): Promise<{
  teamId: string | null;
  stillInCup: boolean | null;
  cupId: string | null;
  cupName: string | null;
  error: string | null;
}> {
  try {
    const raw = await requestChppXmlRaw("teamdetails", {}, tokens);
    if (raw.httpStatus < 200 || raw.httpStatus >= 300) {
      throw new Error(`HTTP ${raw.httpStatus}: ${raw.rawXml.slice(0, 200)}`);
    }
    const team = parseTeamDetailsXml(raw.rawXml);
    return { teamId: team.teamId, stillInCup: team.stillInCup, cupId: team.cupId, cupName: team.cupName, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    return { teamId: null, stillInCup: null, cupId: null, cupName: null, error: `Кубки (teamdetails): ${message}` };
  }
}

async function findCupIdFromClub(tokens: StoredHattrickTokens): Promise<string | null> {
  try {
    const raw = await requestChppXmlRaw("club", {}, tokens);
    if (raw.httpStatus < 200 || raw.httpStatus >= 300) return null;
    return parseClubXml(raw.rawXml).cupId;
  } catch {
    return null;
  }
}

async function findCupIdFromMatches(
  tokens: StoredHattrickTokens,
  teamId: string,
): Promise<{ cupId: string | null; rawSample: Record<string, unknown>[] }> {
  try {
    const raw = await requestChppXmlRaw("matches", {}, tokens);
    if (raw.httpStatus < 200 || raw.httpStatus >= 300) return { cupId: null, rawSample: [] };
    const matches = parseMatchesXml(raw.rawXml, teamId);
    const rawSample = debugRawMatchFields(raw.rawXml, 10);
    return { cupId: matches.find((m) => m.cupId !== null)?.cupId ?? null, rawSample };
  } catch {
    return { cupId: null, rawSample: [] };
  }
}

export default async function CupPage() {
  const tokens = await getRequiredHattrickTokens();
  const debug = emptyCupDebug();

  const {
    teamId,
    stillInCup,
    cupId: cupIdFromTeamDetails,
    cupName: cupNameFromTeamDetails,
    error: teamError,
  } = await resolveTeamCupInfo(tokens);
  debug.teamId = teamId;
  debug.stillInCup = stillInCup;
  debug.teamDetailsCupId = cupIdFromTeamDetails;
  debug.teamDetailsCupName = cupNameFromTeamDetails;

  let cupId = cupIdFromTeamDetails;
  if (!cupId && teamId) {
    const [fromClub, fromMatches] = await Promise.all([
      findCupIdFromClub(tokens),
      findCupIdFromMatches(tokens, teamId),
    ]);
    debug.clubCupId = fromClub;
    debug.matchesCupId = fromMatches.cupId;
    debug.matchesRawSample = fromMatches.rawSample;
    cupId = fromClub ?? fromMatches.cupId ?? null;
  }
  debug.chosenCupId = cupId;

  let cupPath: OurCupPathResult | null = null;
  let pathError: string | null = null;
  if (cupId && teamId) {
    cupPath = await resolveOurCupPath(tokens, cupId, teamId);
    debug.pathDebug = cupPath.debug;
    pathError = cupPath.error;
  }
  const errors = [teamError, pathError].filter((e): e is string => e !== null);

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className={`container ${styles.stack}`} style={{ paddingBottom: 72 }}>
          {errors.length > 0 && (
            <DemoModeBanner title="Не удалось загрузить часть данных о кубках" reasons={errors} />
          )}

          {SHOW_CUP_DEBUG_PANEL && (
            <div className={styles.card}>
              <div className={styles.balanceLabel}>Диагностика: поиск CupID и проход по раундам cupmatches</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 8, fontSize: 12.5 }}>
                <div>TeamID: {debug.teamId ?? "—"}</div>
                <div>StillInCup (teamdetails): {debug.stillInCup === null ? "поле недоступно" : debug.stillInCup ? "да" : "нет"}</div>
                <div>
                  CupID из teamdetails (Team.Cup.CupID): {debug.teamDetailsCupId ?? "не найден"}
                  {debug.teamDetailsCupName && ` — название по данным Hattrick: «${debug.teamDetailsCupName}»`}
                </div>
                <div>CupID из club.xml (Team.Cup.CupID): {debug.clubCupId ?? "не найден / не запрашивался"}</div>
                <div>
                  CupID из matches.xml (MatchContextId у матча с MatchType=3): {debug.matchesCupId ?? "не найден / не запрашивался"}
                </div>
                <div style={{ fontWeight: 700, marginTop: 4 }}>Итоговый CupID: {debug.chosenCupId ?? "не найден — cupmatches не запрашивался"}</div>
              </div>

              {debug.matchesRawSample.length > 0 && (
                <>
                  <div className={styles.balanceLabel} style={{ marginTop: 16 }}>
                    Диагностика: сырые MatchType/MatchContextId последних матчей из matches.xml
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8, fontSize: 12.5 }}>
                    {debug.matchesRawSample.map((m, i) => (
                      <div key={i}>{JSON.stringify(m)}</div>
                    ))}
                  </div>
                </>
              )}

              <div className={styles.balanceLabel} style={{ marginTop: 16 }}>
                Диагностика: проход по раундам (resolveOurCupPath)
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 8, fontSize: 12.5 }}>
                {debug.pathDebug.length === 0 && <div>Проход по раундам не выполнялся (CupID/TeamID не найдены).</div>}
                {debug.pathDebug.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
                {pathError && <div style={{ color: "#c0503f" }}>Ошибка: {pathError}</div>}
              </div>
            </div>
          )}

          <CupSection cupPath={cupPath ?? undefined} />
        </div>
      </main>
      <Footer />
    </>
  );
}
