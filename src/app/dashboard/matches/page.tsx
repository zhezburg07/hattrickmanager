import Header from "@/components/Header";
import Footer from "@/components/Footer";
import MatchesCalendar from "@/components/dashboard/MatchesCalendar";
import HattrickArenaSection from "@/components/dashboard/HattrickArenaSection";
import DemoModeBanner from "@/components/dashboard/DemoModeBanner";
import styles from "@/components/dashboard/Dashboard.module.css";
import { getRequiredHattrickTokens, requestChppXmlRaw, type StoredHattrickTokens } from "@/lib/hattrickApi";
import { parseTeamDetailsXml } from "@/lib/teamDetails";
import {
  parseMatchesXml,
  toSeasonMatches,
  dedupeMatches,
  filterTrainingRelevantMatches,
  debugRawMatchFields,
  parseArchiveEchoedRange,
  type RealMatch,
} from "@/lib/matches";
import { resolveArenaChallenges } from "@/lib/hattrickArena";
import type { SeasonMatch } from "@/data/matches";

const MAX_MATCHES_SHOWN = 25;

// ВРЕМЕННАЯ диагностика — показывает количество матчей на каждом шаге
// конвейера (matches.xml → matchesarchive.xml → объединение → строгий
// фильтр → мягкий фильтр) и сырые поля первых матчей, чтобы сразу видеть,
// на каком именно шаге список становится пустым, если это повторится.
// Поставьте false, когда список стабильно показывает реальные матчи.
const SHOW_MATCHES_DEBUG = true;

interface MatchesResult {
  matches: SeasonMatch[] | null;
  ourTeamName: string;
  error: string | null;
  // Необязательное предупреждение (не блокирует страницу) — например,
  // matchesarchive не подключился, или фильтр по SourceSystem === "youth"
  // отсеял всё и пришлось откатиться к более мягкому условию.
  warning: string | null;
  debugCounts: string[];
  debugRaw: Record<string, unknown>[];
}

async function resolveMatchesData(tokens: StoredHattrickTokens): Promise<MatchesResult> {
  const debugCounts: string[] = [];
  let debugRaw: Record<string, unknown>[] = [];
  try {
    const teamRaw = await requestChppXmlRaw("teamdetails", {}, tokens);
    if (teamRaw.httpStatus < 200 || teamRaw.httpStatus >= 300) {
      throw new Error(`HTTP ${teamRaw.httpStatus}: ${teamRaw.rawXml.slice(0, 200)}`);
    }
    const ourTeam = parseTeamDetailsXml(teamRaw.rawXml);
    const teamId = ourTeam.teamId;

    const raw = await requestChppXmlRaw("matches", {}, tokens);
    if (raw.httpStatus < 200 || raw.httpStatus >= 300) {
      throw new Error(`HTTP ${raw.httpStatus}: ${raw.rawXml.slice(0, 200)}`);
    }
    const currentSeasonMatches = parseMatchesXml(raw.rawXml, teamId);
    debugCounts.push(`matches.xml: ${currentSeasonMatches.length} матчей (HTTP ${raw.httpStatus})`);
    debugRaw = debugRawMatchFields(raw.rawXml);

    // matchesarchive.xml — более полная история прошлых сезонов (matches.xml
    // документированно ограничен ~50 матчами). ВАЖНО: если не передать
    // FirstMatchDate/LastMatchDate, CHPP по документации молча использует
    // диапазон по умолчанию — только последние 3 месяца (это и есть причина,
    // по которой список ранее обрывался на 8 матчах при MAX_MATCHES_SHOWN=25:
    // ограничивал не наш код, а дефолтный 3-месячный диапазон CHPP).
    //
    // ИСПРАВЛЕНО (2 раза подряд): 1) все даты CHPP — это "Hattrick Time"
    // (HTT), официально равное шведскому времени (CET/CEST), а не UTC — уже
    // поправлено. 2) Первая попытка запросить один widе-диапазон (270 дней)
    // одним запросом, скорее всего, сама попадала под официальное
    // ограничение CHPP "не более ~2 сезонов за один запрос" и тихо
    // подрезалась обратно до тех же 3 месяцев — отсюда и то, что после
    // первого "фикса" число матчей не изменилось. Независимый CHPP-клиент
    // (github.com/lucianoq/hattrick, api/matchesarchive.go), для которого
    // подтверждено, что это реально работает на живых ответах, никогда не
    // запрашивает диапазон шире 50 дней за один вызов — вместо одного
    // широкого запроса он разбивает нужный период на несколько 50-дневных
    // "окон" и делает по одному запросу на каждое. Повторяем эту же тактику
    // здесь: 6 окон по 45 дней (с запасом от 50) = ~270 дней истории,
    // запросы идут параллельно. Диагностика ниже показывает per-окно
    // запрошенный и реально применённый CHPP диапазон (see
    // parseArchiveEchoedRange в matches.ts) — если CHPP всё равно подрежет
    // хоть одно окно, это будет видно явно, а не как молчаливая недостача.
    const toHattrickTimeString = (d: Date) => {
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Stockholm",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }).formatToParts(d);
      const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
      return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
    };

    const ARCHIVE_WINDOW_DAYS = 45;
    const ARCHIVE_WINDOW_COUNT = 6;
    const dayMs = 24 * 60 * 60 * 1000;
    const now = new Date();
    const archiveWindows = Array.from({ length: ARCHIVE_WINDOW_COUNT }, (_, i) => {
      const last = new Date(now.getTime() - i * ARCHIVE_WINDOW_DAYS * dayMs);
      const first = new Date(last.getTime() - ARCHIVE_WINDOW_DAYS * dayMs);
      return { firstMatchDate: toHattrickTimeString(first), lastMatchDate: toHattrickTimeString(last) };
    });

    let archiveMatches: RealMatch[] = [];
    let archiveWarning: string | null = null;
    const archiveResults = await Promise.allSettled(
      archiveWindows.map((w) =>
        requestChppXmlRaw("matchesarchive", { FirstMatchDate: w.firstMatchDate, LastMatchDate: w.lastMatchDate }, tokens),
      ),
    );

    let anyArchiveSuccess = false;
    let clampedWindowCount = 0;
    archiveResults.forEach((result, i) => {
      const w = archiveWindows[i];
      const windowLabel = `окно ${i + 1}/${ARCHIVE_WINDOW_COUNT} (${w.firstMatchDate}..${w.lastMatchDate})`;
      if (result.status !== "fulfilled") {
        const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
        debugCounts.push(`matchesarchive.xml [${windowLabel}]: ошибка запроса — ${message}`);
        return;
      }
      const archiveRaw = result.value;
      if (archiveRaw.httpStatus < 200 || archiveRaw.httpStatus >= 300) {
        debugCounts.push(`matchesarchive.xml [${windowLabel}]: HTTP ${archiveRaw.httpStatus}`);
        return;
      }
      try {
        const windowMatches = parseMatchesXml(archiveRaw.rawXml, teamId, { isArchive: true });
        archiveMatches.push(...windowMatches);
        anyArchiveSuccess = true;
        const echoed = parseArchiveEchoedRange(archiveRaw.rawXml);
        const clamped = echoed.firstMatchDate !== null && echoed.firstMatchDate !== w.firstMatchDate;
        if (clamped) clampedWindowCount += 1;
        debugCounts.push(
          `matchesarchive.xml [${windowLabel}]: ${windowMatches.length} матчей` +
            (clamped ? ` ⚠ CHPP применил другой диапазон: ${echoed.firstMatchDate}..${echoed.lastMatchDate}` : ""),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "неизвестная ошибка";
        debugCounts.push(`matchesarchive.xml [${windowLabel}]: ошибка разбора — ${message}`);
      }
    });

    if (!anyArchiveSuccess) {
      archiveWarning = "Полная история прошлых сезонов (matchesarchive) недоступна — показан только текущий сезон (matches).";
    } else if (clampedWindowCount > 0) {
      archiveWarning = `CHPP подрезал запрошенный диапазон дат в ${clampedWindowCount} из ${ARCHIVE_WINDOW_COUNT} запросов к matchesarchive — история может быть неполной несмотря на попытку.`;
    }
    debugCounts.push(`matchesarchive.xml — всего собрано из всех окон: ${archiveMatches.length} матчей`);

    // currentSeasonMatches — ПЕРВЫМ аргументом: dedupeMatches оставляет
    // первое вхождение по MatchID, так что уже подтверждённый разбор
    // matches.xml не может быть тихо переписан менее проверенным разбором
    // matchesarchive.xml при совпадении ID (см. комментарий в
    // src/lib/matches.ts).
    const merged = dedupeMatches([...currentSeasonMatches, ...archiveMatches]);
    debugCounts.push(`после объединения и удаления дублей: ${merged.length}`);

    if (merged.length === 0) {
      const archiveNote = archiveMatches.length === 0 ? " и matchesarchive" : "";
      return {
        matches: null,
        ourTeamName: ourTeam.teamName,
        error: `Матчи (matches${archiveNote}): запрос выполнился (HTTP ${raw.httpStatus}), но вернул пустой список матчей — либо у команды ещё нет ни одного матча в ответе CHPP, либо структура ответа отличается от ожидаемой (см. RealMatch в src/lib/matches.ts).`,
        warning: null,
        debugCounts,
        debugRaw,
      };
    }

    // Строгий фильтр (см. filterTrainingRelevantMatches в src/lib/matches.ts)
    // отличает матчи основной команды от юношеских/Hattrick Arena по полю
    // SourceSystem — оно ни разу не проверялось на живом ответе. Если из-за
    // этого список стал пустым, откатываемся к более мягкому условию
    // (просто "сыграно") — список не должен молча пропадать из-за одной
    // непроверенной догадки.
    let trainingRelevant = filterTrainingRelevantMatches(merged);
    debugCounts.push(`после строгого фильтра (сыграно + основная команда): ${trainingRelevant.length}`);

    // ВРЕМЕННАЯ диагностика — раскладывает КАЖДЫЙ отсеянный матч по точной
    // причине (не "сыграно" / нет счёта / юношеская команда), плюс сырые
    // поля первых нескольких отсеянных, чтобы увидеть настоящие значения
    // Status/HomeGoals/AwayGoals/SourceSystem у matchesarchive-матчей — до
    // сих пор дамп сырых полей показывал только 3 матча из matches.xml, а
    // основная потеря (59 → 8) происходит среди matchesarchive-записей,
    // которые в дамп не попадали вовсе.
    if (merged.length !== trainingRelevant.length) {
      const passedIds = new Set(trainingRelevant.map((m) => m.matchId));
      const excluded = merged.filter((m) => !passedIds.has(m.matchId));
      let notFinished = 0;
      let missingScore = 0;
      let youth = 0;
      for (const m of excluded) {
        if (m.status !== "FINISHED") notFinished += 1;
        else if (m.ourScore === null || m.oppScore === null) missingScore += 1;
        else if (m.sourceSystem === "youth") youth += 1;
      }
      debugCounts.push(
        `отсеяно ${excluded.length}: не "FINISHED" — ${notFinished}, нет счёта — ${missingScore}, sourceSystem="youth" — ${youth}`,
      );
      debugCounts.push(
        `сырые поля первых отсеянных: ${excluded
          .slice(0, 8)
          .map((m) => `#${m.matchId} ${m.date} status=${m.status} score=${m.ourScore}:${m.oppScore} src=${m.sourceSystem} type=${m.matchType}`)
          .join(" | ")}`,
      );
    }
    let filterWarning: string | null = null;
    if (trainingRelevant.length === 0) {
      trainingRelevant = merged.filter((m) => m.status === "FINISHED" && m.ourScore !== null && m.oppScore !== null);
      debugCounts.push(`после мягкого фильтра (только "сыграно"): ${trainingRelevant.length}`);
      if (trainingRelevant.length > 0) {
        filterWarning =
          "Не удалось надёжно отличить матчи основной команды от юношеских/Hattrick Arena по данным CHPP (поле SourceSystem) — показаны все сыгранные матчи без этой фильтрации.";
      }
    }

    const shown = toSeasonMatches(trainingRelevant).slice(0, MAX_MATCHES_SHOWN);
    const warning = [archiveWarning, filterWarning].filter(Boolean).join(" ") || null;
    return { matches: shown, ourTeamName: ourTeam.teamName, error: null, warning, debugCounts, debugRaw };
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    return { matches: null, ourTeamName: "", error: `Матчи (matches): ${message}`, warning: null, debugCounts, debugRaw };
  }
}

export default async function MatchesPage() {
  const tokens = await getRequiredHattrickTokens();
  const [{ matches, ourTeamName, error, warning, debugCounts, debugRaw }, challenges] = await Promise.all([
    resolveMatchesData(tokens),
    resolveArenaChallenges(tokens),
  ]);

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className={`container ${styles.stack}`} style={{ paddingBottom: 72 }}>
          {error && <DemoModeBanner title="Не удалось загрузить реальные матчи" reasons={[error]} />}
          {warning && <DemoModeBanner title="Показана не вся история" reasons={[warning]} showConnectAction={false} />}
          {SHOW_MATCHES_DEBUG && (debugCounts.length > 0 || debugRaw.length > 0) && (
            <div className={styles.card}>
              <div className={styles.balanceLabel}>Диагностика: количество матчей на каждом шаге</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 8, fontSize: 12.5 }}>
                {debugCounts.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
              {debugRaw.length > 0 && (
                <>
                  <div className={styles.balanceLabel} style={{ marginTop: 16 }}>
                    Диагностика: сырые поля первых матчей из matches.xml
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8, fontSize: 12.5 }}>
                    {debugRaw.map((m, i) => (
                      <div key={i}>{JSON.stringify(m)}</div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          {matches && <MatchesCalendar matches={matches} ourTeamName={ourTeamName} />}
          <HattrickArenaSection challenges={challenges} />
        </div>
      </main>
      <Footer />
    </>
  );
}
