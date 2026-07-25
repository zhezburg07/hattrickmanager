import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CupSection, { type UpcomingCupMatch } from "@/components/dashboard/CupSection";
import DemoModeBanner from "@/components/dashboard/DemoModeBanner";
import styles from "@/components/dashboard/Dashboard.module.css";
import { getRequiredHattrickTokens, requestChppXmlRaw, type StoredHattrickTokens } from "@/lib/hattrickApi";
import { parseTeamDetailsXml } from "@/lib/teamDetails";
import { parseClubXml } from "@/lib/clubStaff";
import { parseMatchesXml, debugRawMatchFields, CUP_MATCH_TYPE, type RealMatch } from "@/lib/matches";
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
  nextMatchFound: string | null;
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
    nextMatchFound: null,
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

// Один запрос matches.xml переиспользуется для двух целей: (1) запасной
// поиск CupID через MatchContextId кубкового матча (как и раньше), и (2)
// поиск ближайшего ПРЕДСТОЯЩЕГО кубкового матча (MatchType=3, статус
// UPCOMING) — resolveOurCupPath (cupmatches.xml) по определению не
// запрашивает ещё не наступившие раунды турнира (соперник в них может быть
// не определён), а обычный matches.xml знает о ближайшем СВОЁМ матче, даже
// кубковом, если Hattrick уже его назначил.
async function fetchMatchesForCup(
  tokens: StoredHattrickTokens,
  teamId: string,
): Promise<{ matches: RealMatch[]; rawSample: Record<string, unknown>[] }> {
  try {
    const raw = await requestChppXmlRaw("matches", {}, tokens);
    if (raw.httpStatus < 200 || raw.httpStatus >= 300) return { matches: [], rawSample: [] };
    const matches = parseMatchesXml(raw.rawXml, teamId);
    const rawSample = debugRawMatchFields(raw.rawXml, 10);
    return { matches, rawSample };
  } catch {
    return { matches: [], rawSample: [] };
  }
}

function findNextUpcomingCupMatch(matches: RealMatch[], cupId: string | null): RealMatch | null {
  const candidates = matches
    .filter((m) => Number(m.matchType) === CUP_MATCH_TYPE && m.status === "UPCOMING")
    .filter((m) => cupId === null || m.cupId === null || m.cupId === cupId)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return candidates[0] ?? null;
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
  let matchesForCup: RealMatch[] = [];
  if (teamId) {
    const [fromClub, matchesResult] = await Promise.all([
      cupId ? Promise.resolve(null) : findCupIdFromClub(tokens),
      fetchMatchesForCup(tokens, teamId),
    ]);
    matchesForCup = matchesResult.matches;
    debug.clubCupId = fromClub;
    debug.matchesCupId = matchesForCup.find((m) => m.cupId !== null)?.cupId ?? null;
    debug.matchesRawSample = matchesResult.rawSample;
    if (!cupId) cupId = fromClub ?? debug.matchesCupId;
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

  // Ближайший предстоящий кубковый матч — из matches.xml (см.
  // findNextUpcomingCupMatch выше). Не показываем повторно, если тот же
  // матч уже присутствует в cupPath.path как "текущий" раунд (проход по
  // раундам cupmatches иногда всё же успевает захватить уже назначенный,
  // но ещё не сыгранный раунд).
  const rawNextMatch = findNextUpcomingCupMatch(matchesForCup, cupId);
  const alreadyInPath = cupPath?.path.some((m) => m.matchId === rawNextMatch?.matchId) ?? false;
  debug.nextMatchFound = rawNextMatch
    ? `MatchID ${rawNextMatch.matchId} (${rawNextMatch.date}, соперник «${rawNextMatch.opponent}»)${alreadyInPath ? " — уже показан в пути по раундам, отдельно не дублируем" : ""}`
    : "не найден среди матчей matches.xml (MatchType=3, статус UPCOMING)";
  const nextMatch: UpcomingCupMatch | null =
    rawNextMatch && !alreadyInPath
      ? { matchId: rawNextMatch.matchId, date: rawNextMatch.date, home: rawNextMatch.home, opponent: rawNextMatch.opponent }
      : null;

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

              <div className={styles.balanceLabel} style={{ marginTop: 16 }}>
                Диагностика: ближайший предстоящий кубковый матч (matches.xml)
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 8, fontSize: 12.5 }}>
                <div>{debug.nextMatchFound ?? "—"}</div>
              </div>
            </div>
          )}

          <CupSection cupPath={cupPath ?? undefined} nextMatch={nextMatch} />
        </div>
      </main>
      <Footer />
    </>
  );
}
