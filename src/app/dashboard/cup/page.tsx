import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CupSection from "@/components/dashboard/CupSection";
import DemoModeBanner from "@/components/dashboard/DemoModeBanner";
import styles from "@/components/dashboard/Dashboard.module.css";
import { getRequiredHattrickTokens, requestChppXmlRaw, type StoredHattrickTokens } from "@/lib/hattrickApi";
import { parseTeamDetailsXml } from "@/lib/teamDetails";
import { parseClubXml } from "@/lib/clubStaff";
import { parseMatchesXml, debugRawMatchFields } from "@/lib/matches";
import { parseCupMatchesXml, type RealCupMatch } from "@/lib/cupMatches";

// ВРЕМЕННАЯ диагностика — показывает, откуда (если откуда-то) реально
// нашёлся CupID (teamdetails/club/matches) и что произошло при попытке
// запросить cupmatches с этим ID: HTTP-статус, сколько матчей разобралось,
// сырой XML начала ответа. Нужна, чтобы точно увидеть, на каком шаге
// застревает "Кубки" — то ли CupID нигде не находится (тогда это ожидаемо,
// раз CHPP ещё не показывает участие в кубке), то ли ID находится, но
// cupmatches всё равно не отдаёт матчи (тогда проблема в самом запросе/
// разборе). Уберите, когда причина будет понятна.
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
  cupMatchesRequested: boolean;
  cupMatchesHttpStatus: number | null;
  cupMatchesRawSnippet: string;
  // Точная длина сырого тела ответа cupmatches в символах — по запросу,
  // чтобы однозначно отличать "ответ реально пустой" от "диагностика
  // обрезает/не показывает то, что реально пришло". Символы (JS string
  // length), а не байты — этого достаточно, чтобы отличить пустой ответ от
  // непустого; XML здесь всегда ASCII/UTF-8-совместимый текст, так что
  // расхождение символы/байты несущественно для этой проверки.
  cupMatchesRawLength: number | null;
  cupMatchesParsedCount: number | null;
  cupMatchesParseError: string | null;
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
    cupMatchesRequested: false,
    cupMatchesHttpStatus: null,
    cupMatchesRawSnippet: "(запрос не отправлялся)",
    cupMatchesRawLength: null,
    cupMatchesParsedCount: null,
    cupMatchesParseError: null,
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

// Версия cupmatches.xml, подтверждённая исходным кодом независимого CHPP-
// клиента github.com/lucianoq/hattrick (chpp/file_cupmatches.go,
// CupMatchesAPIVersion = "1.4"). requestChppXmlRaw без явного параметра
// version подставляет общий дефолт "1.5" (см. src/lib/hattrickApi.ts) —
// для большинства файлов CHPP это не мешает (сервер, похоже, терпимо
// относится к более новой версии), но для cupmatches именно это и могло
// быть причиной пустого тела ответа при HTTP 200: несуществующая для этого
// файла версия "1.5" вместо ошибки просто отдаёт пустой контейнер без
// единого матча — без какого-либо признака ошибки в самом ответе.
const CUP_MATCHES_VERSION = "1.4";

async function resolveCupMatches(
  tokens: StoredHattrickTokens,
  teamId: string,
  cupId: string,
  debug: CupDebugInfo,
): Promise<{ matches: RealCupMatch[] | null; error: string | null }> {
  debug.cupMatchesRequested = true;
  try {
    const raw = await requestChppXmlRaw("cupmatches", { CupID: cupId, version: CUP_MATCHES_VERSION }, tokens);
    debug.cupMatchesHttpStatus = raw.httpStatus;
    debug.cupMatchesRawLength = raw.rawXml.length;
    debug.cupMatchesRawSnippet = raw.rawXml.slice(0, 4000);
    if (raw.httpStatus < 200 || raw.httpStatus >= 300) {
      throw new Error(`HTTP ${raw.httpStatus}: ${raw.rawXml.slice(0, 200)}`);
    }
    const matches = parseCupMatchesXml(raw.rawXml, teamId);
    debug.cupMatchesParsedCount = matches.length;
    return { matches, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    debug.cupMatchesParseError = message;
    return { matches: null, error: `Матчи кубка (cupmatches): ${message}` };
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

  const { matches, error: matchesError } =
    cupId && teamId ? await resolveCupMatches(tokens, teamId, cupId, debug) : { matches: null, error: null };
  const errors = [teamError, matchesError].filter((e): e is string => e !== null);

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
              <div className={styles.balanceLabel}>Диагностика: поиск CupID и запрос cupmatches</div>
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
                <div style={{ fontWeight: 700, marginTop: 4 }}>Итоговый CupID, использованный для cupmatches: {debug.chosenCupId ?? "не найден — cupmatches не запрашивался"}</div>
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
                Диагностика: результат запроса cupmatches
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 8, fontSize: 12.5 }}>
                <div>Запрос отправлялся: {debug.cupMatchesRequested ? `да (version=${CUP_MATCHES_VERSION})` : "нет (CupID не найден ни в одном источнике)"}</div>
                <div>HTTP статус: {debug.cupMatchesHttpStatus ?? "—"}</div>
                <div style={{ fontWeight: 700 }}>
                  Длина тела ответа: {debug.cupMatchesRawLength === null ? "—" : `${debug.cupMatchesRawLength} символов`}
                  {debug.cupMatchesRawLength === 0 && " — ответ реально пустой (0 символов), это не ошибка отображения"}
                </div>
                <div>Матчей разобрано: {debug.cupMatchesParsedCount ?? "—"}</div>
                {debug.cupMatchesParseError && (
                  <div style={{ color: "#c0503f" }}>Ошибка: {debug.cupMatchesParseError}</div>
                )}
              </div>
              {debug.cupMatchesRequested && (
                <details style={{ marginTop: 6 }} open>
                  <summary style={{ cursor: "pointer", fontSize: 12.5 }}>
                    Сырой XML cupmatches
                    {debug.cupMatchesRawLength !== null &&
                      debug.cupMatchesRawLength > debug.cupMatchesRawSnippet.length &&
                      ` (показаны первые ${debug.cupMatchesRawSnippet.length} из ${debug.cupMatchesRawLength} символов)`}
                  </summary>
                  <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", fontSize: 10.5, maxHeight: 400, overflow: "auto" }}>
                    {debug.cupMatchesRawLength === 0 ? "(пустая строка — 0 символов)" : debug.cupMatchesRawSnippet}
                  </pre>
                </details>
              )}
            </div>
          )}

          <CupSection stillInCup={stillInCup ?? undefined} realCupMatches={matches ?? undefined} />
        </div>
      </main>
      <Footer />
    </>
  );
}
