import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";
import { requestChppXmlRaw, type StoredHattrickTokens } from "./hattrickApi";
import { LADDER_MATCH_TYPE, type RealMatch } from "./matches";

// "Hattrick Arena" (Pro): заявки на товарищеские матчи через challenges.xml
// — CHPP-файл, подтверждённый по официальным именам (constants "challenges",
// версия "1.6"), но поля ВНУТРИ каждой заявки (TeamID/TeamName/дата) в этом
// проекте не проверялись на живом ответе — структура контейнеров
// (Team.ChallengesByMe.Challenge, Team.OffersByOthers.Offer) подтверждена,
// а поля отдельной заявки — лучшее предположение.
//
// ПЕРЕСМОТРЕНО про "лестницы" (ladder) (см. чат "Ещё одна честная попытка
// найти данные по лестницам") — раньше здесь считалось, что ladderlist.xml
// отдаёт общий список ВСЕХ лестниц игры без привязки к команде. Свежая
// проверка докстроки независимого клиента (chpp/file_ladderlist.go)
// опровергает это: "LadderListXML contains the list of ladders that a team
// currently takes part in" — та же ситуация, что уже была с
// tournamentlist.xml (тоже когда-то считался "общим списком", тоже оказался
// команд-специфичным на практике). LadderListEntry по докстроке содержит
// Position/Wins/Lost/NextMatchDate — то есть именно ТЕКУЩЕЕ МЕСТО команды в
// лестнице, без похода в ladderdetails.xml вообще. НЕ проверено на живых
// данных этого аккаунта — см. debugLadderListRawStructure и диагностику в
// chppSync.ts, тот же приём, что уже подтвердил/опроверг структуру
// tournamentfixtures.xml и leaguefixtures.xml раньше в этом проекте.
//
// ВАЖНО — это НЕ решает всё про Arena: ladderlist.xml даёт только ТЕКУЩУЮ
// СВОДКУ (место, W/L), а не список отдельных сыгранных матчей лестницы
// (соперник/счёт/дата) — тот вопрос остаётся подтверждённым ограничением:
// matches.xml/matchesarchive.xml не содержат матчи лестницы ни под каким
// MatchType (сверено по датам с реальными данными hattrick.org), а
// ladderdetails.xml — это таблица ЛЕСТНИЦЫ целиком (все команды), не список
// НАШИХ матчей, и всё ещё требует уже известный LadderID (теперь, впрочем,
// доступный из самого ladderlist.xml — если когда-нибудь понадобится полная
// таблица лестницы, это уже решаемо, просто не то же самое, что список
// сыгранных матчей).
export const LADDER_LIST_VERSION = "1.0";

export interface ArenaLadderPosition {
  ladderId: string;
  name: string;
  position: number;
  wins: number;
  lost: number;
  nextMatchDate: string | null;
}

export function parseLadderListXml(xml: string): ArenaLadderPosition[] {
  const parser = new XMLParser();
  const data = parser.parse(xml);
  const root = data?.HattrickData;
  assertNoChppError(root, "ladderlist");

  const ladders = asArray((root?.Ladders as Record<string, unknown> | undefined)?.Ladder);
  return ladders.map((l) => ({
    ladderId: String(l.LadderId ?? l.LadderID ?? ""),
    name: String(l.Name ?? `Лестница #${l.LadderId ?? l.LadderID ?? "?"}`),
    // Posistion — подтверждённая опечатка в самом CHPP (см. докстроку
    // независимого клиента: "the doc's own element name is misspelled...
    // it is not a typo to fix"), Position — запасной вариант на случай,
    // если Hattrick когда-нибудь всё же исправит написание.
    position: Number(l.Posistion ?? l.Position ?? 0),
    wins: Number(l.Wins ?? 0),
    lost: Number(l.Lost ?? 0),
    nextMatchDate: l.NextMatchDate !== undefined ? String(l.NextMatchDate) : null,
  }));
}

// ДИАГНОСТИКА (тот же приём, что уже выручил с tournamentfixtures.xml и
// leaguefixtures.xml) — пробует несколько вероятных путей к списку лестниц
// одновременно и дампит ПОЛНЫЙ первый найденный сырой элемент (все поля как
// есть), чтобы одним взглядом подтвердить или опровергнуть структуру, а не
// гадать по одному полю за раз.
export function debugLadderListRawStructure(xml: string): string {
  const parser = new XMLParser();
  const data = parser.parse(xml);
  const root = data?.HattrickData as Record<string, unknown> | undefined;
  if (!root) return "root (HattrickData) не найден — либо другой корневой тег, либо XML не разобрался";

  const rootKeys = Object.keys(root);
  const candidates: { path: string; count: number; sample: string }[] = [];
  const record = (path: string, value: unknown) => {
    const arr = asArray(value);
    candidates.push({ path, count: arr.length, sample: arr.length > 0 ? JSON.stringify(arr[0]).slice(0, 400) : "" });
  };

  record("root.Ladders.Ladder", (root.Ladders as Record<string, unknown> | undefined)?.Ladder);
  record("root.Ladder", root.Ladder);
  record("root.Team.Ladders.Ladder", ((root.Team as Record<string, unknown> | undefined)?.Ladders as Record<string, unknown> | undefined)?.Ladder);

  const summary = candidates
    .map((c) => `${c.path}: ${c.count} эл.${c.sample ? ` первый=${c.sample}` : ""}`)
    .join(" | ");
  return `Ключи HattrickData: [${rootKeys.join(", ")}]. ${summary}`;
}

// ladderdetails.xml (v1.0) — по докстроке независимого клиента и его
// struct-полям (LadderDetailsTeam: только Position/Wins/Lost/WinsInARow/
// LostInARow) это ТОЛЬКО общая таблица лестницы целиком, без списка
// отдельных сыгранных матчей. НО это предположение никогда не проверялось
// на реальном подтверждённом LadderId (см. чат "Ещё одна честная проверка
// ladderdetails.xml") — раньше решение не запрашивать его вообще
// опиралось только на документацию/схему клиента, а не на живой ответ.
// Параметр запроса ("ladderID") НЕ подтверждён официальной документацией
// (недоступна из песочницы) — по аналогии с cupID/matchID/tournamentID в
// этом проекте.
export const LADDER_DETAILS_VERSION = "1.0";

// ДИАГНОСТИКА — дампит АБСОЛЮТНО ВСЕ поля ответа (не только уже
// предполагаемые Position/Wins/Lost), включая полный дамп каждой записи
// внутри Teams (или что бы ни называлось), на случай, если там всё же
// найдётся дата/соперник/счёт отдельного матча, а не только текущая
// позиция в таблице — тот же приём, что уже применялся для
// tournamentlist.xml/tournamentfixtures.xml/ladderlist.xml.
export function debugLadderDetailsFullResponse(xml: string): string {
  const parser = new XMLParser();
  const data = parser.parse(xml);
  const root = data?.HattrickData as Record<string, unknown> | undefined;
  if (!root) return "root (HattrickData) не найден — либо другой корневой тег, либо XML не разобрался";

  const rootKeys = Object.keys(root);
  const scalarRoot = Object.entries(root).filter(([k, v]) => k !== "Ladder" && (typeof v !== "object" || v === null));

  const candidates: { path: string; count: number; sample: string }[] = [];
  const record = (path: string, value: unknown) => {
    const arr = asArray(value);
    candidates.push({ path, count: arr.length, sample: arr.length > 0 ? JSON.stringify(arr[0]).slice(0, 500) : "" });
  };

  const ladder = root.Ladder as Record<string, unknown> | undefined;
  const ladderKeys = ladder ? Object.keys(ladder) : [];
  const scalarLadder = ladder
    ? Object.entries(ladder).filter(([k, v]) => typeof v !== "object" || v === null)
    : [];

  record("root.Ladder.Teams.Team", (ladder?.Teams as Record<string, unknown> | undefined)?.Team);
  record("root.Ladder.Team", ladder?.Team);
  record("root.Teams.Team", (root.Teams as Record<string, unknown> | undefined)?.Team);
  record("root.Ladder.Matches.Match", (ladder?.Matches as Record<string, unknown> | undefined)?.Match);
  record("root.Matches.Match", (root.Matches as Record<string, unknown> | undefined)?.Match);

  const summary = candidates
    .map((c) => `${c.path}: ${c.count} эл.${c.sample ? ` первый=${c.sample}` : ""}`)
    .join(" | ");

  return (
    `Ключи HattrickData: [${rootKeys.join(", ")}]. Скалярные поля HattrickData: ${scalarRoot.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ") || "(нет)"}. ` +
    `Ключи <Ladder>: [${ladderKeys.join(", ")}]. Скалярные поля <Ladder>: ${scalarLadder.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ") || "(нет)"}. ` +
    `${summary}`
  );
}

export interface ArenaChallengeEntry {
  opponentTeamId: string;
  opponentTeamName: string;
  matchDate: string | null;
}

export interface ArenaChallengesResult {
  sentByUs: ArenaChallengeEntry[];
  offersFromOthers: ArenaChallengeEntry[];
  error: string | null;
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : value ? [value as Record<string, unknown>] : [];
}

function parseChallengeEntry(entry: Record<string, unknown>): ArenaChallengeEntry {
  const teamId = String(entry.TeamID ?? entry.TeamId ?? "");
  const teamName = String(entry.TeamName ?? "");
  const matchDateRaw = entry.MatchDate ?? entry.Date ?? entry.ProposedDate;
  return {
    opponentTeamId: teamId,
    opponentTeamName: teamName || `Команда #${teamId || "?"}`,
    matchDate: matchDateRaw !== undefined ? String(matchDateRaw) : null,
  };
}

// Разбор вынесен отдельно от fetch (см. чат "Фаза 3") — синхронизация
// (src/lib/chppSync.ts) переиспользует уже полученный raw XML вместо
// повторного запроса challenges.xml.
export function parseChallengesXml(xml: string): Omit<ArenaChallengesResult, "error"> {
  const parser = new XMLParser();
  const data = parser.parse(xml);
  const root = data?.HattrickData;
  assertNoChppError(root, "challenges");

  const team = root?.Team as Record<string, unknown> | undefined;
  const challengesByMe = asArray((team?.ChallengesByMe as Record<string, unknown> | undefined)?.Challenge);
  const offersByOthers = asArray((team?.OffersByOthers as Record<string, unknown> | undefined)?.Offer);

  return {
    sentByUs: challengesByMe.map(parseChallengeEntry),
    offersFromOthers: offersByOthers.map(parseChallengeEntry),
  };
}

export async function resolveArenaChallenges(tokens: StoredHattrickTokens): Promise<ArenaChallengesResult> {
  try {
    const raw = await requestChppXmlRaw("challenges", {}, tokens);
    if (raw.httpStatus < 200 || raw.httpStatus >= 300) {
      throw new Error(`HTTP ${raw.httpStatus}: ${raw.rawXml.slice(0, 200)}`);
    }
    const { sentByUs, offersFromOthers } = parseChallengesXml(raw.rawXml);
    return { sentByUs, offersFromOthers, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    return { sentByUs: [], offersFromOthers: [], error: `Заявки на товарищеские матчи (challenges): ${message}` };
  }
}

// ---------- Последние сыгранные Arena-матчи (см. чат "Hattrick Arena:
// синхронизация последних сыгранных матчей") ----------
//
// CHPP не даёт единого файла "результаты Arena" — источники РАЗНЫЕ для
// разных подсистем Arena, и это ПОДТВЕРЖДЕНО на реальных данных (см. чат
// "Отличная новость по Турнирам"):
//   - "Ладдер" (лестница): подтверждено — физически недоступен через CHPP
//     ни в каком виде. matches.xml/matchesarchive.xml НЕ содержат эти матчи
//     вообще (сверено по датам с реальными матчами на hattrick.org — полное
//     отсутствие, не вопрос неверного MatchType). ladderlist.xml/
//     ladderdetails.xml тоже не годятся (см. комментарий выше про Ladder).
//     LADDER_MATCH_TYPE (62) оставлен как есть — вдруг на каком-то другом
//     аккаунте это всё же сработает, но на практике пока ни разу не дал
//     результата, и дальше не угадываем (решение пользователя — честное
//     ограничение, не самоцель "найти любой ценой").
//   - "Турнир": подтверждено — tournamentlist.xml реально отдаёт турниры
//     ИМЕННО нашей команды (докстрока независимого клиента "The list of
//     tournaments the given team takes part in" оказалась верной), а
//     tournamentfixtures.xml по TournamentID даёт реальные результаты
//     матчей. УТОЧНЕНО (см. чат "Полный дамп подтвердил гипотезу №3
//     однозначно"): это ТОЛЬКО турниры, созданные ВРУЧНУЮ другими игроками
//     ("HTO" — подтверждено полем Creator, реально заполненным у обоих
//     турниров). Автоматически генерируемые турниры Hattrick Arena — вне
//     охвата, тот же класс подтверждённого ограничения, что и Ladder (см.
//     выше). Рабочий источник для РУЧНЫХ турниров — здесь.
export interface ArenaRecentMatch {
  matchId: string;
  date: string;
  home: boolean;
  opponent: string;
  ourScore: number;
  oppScore: number;
  source: "ladder" | "tournament";
  tournamentId?: string;
  tournamentName?: string;
  // Group === 0 в tournamentfixtures.xml — по независимому клиенту это
  // именно матч плей-офф стадии (не групповой/лиговый тур турнира), см.
  // комментарий у didWinTournament ниже — единственный сигнал, на основе
  // которого вообще можно предположить "выигран ли турнир".
  isPlayoffMatch?: boolean;
}

// limit=10 — по запросу ("последние 10 сыгранных матчей"). Сортировка по
// дате по убыванию — те же строки MatchDate, что и везде в проекте
// (лексикографически сортируемый формат), см. TransferHistoryEntry.deadline.
export function filterRecentArenaMatches(matches: RealMatch[], limit = 10): ArenaRecentMatch[] {
  return matches
    .filter(
      (m) =>
        Number(m.matchType) === LADDER_MATCH_TYPE &&
        m.status === "FINISHED" &&
        m.ourScore !== null &&
        m.oppScore !== null,
    )
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit)
    .map((m) => ({
      matchId: m.matchId,
      date: m.date,
      home: m.home,
      opponent: m.opponent,
      ourScore: m.ourScore as number,
      oppScore: m.oppScore as number,
      source: "ladder" as const,
    }));
}

// ---------- tournamentlist.xml / tournamentfixtures.xml (см. чат
// "Отличная новость по Турнирам", уточнено в чате "tournamentlist.xml
// возвращает только 2 турнира, а на сайте их явно больше") ----------
//
// tournamentlist.xml (v1.0) — список турниров ИМЕННО нашей команды.
// Подтверждено на реальных данных: 2 турнира ("Champions League (Small
// club)" TournamentId=6994463, "Kazakhstan Cup - Liga: III"
// TournamentId=5484335). Не требует параметров, кроме версии — сам User
// определяется по OAuth-токену, как и остальные "мои данные" файлы.
//
// НЕПОЛНОЕ ПОКРЫТИЕ — ПОДТВЕРЖДЕНО, расследование закрыто (см. чат
// "tournamentlist.xml возвращает только 2 турнира, а на сайте их явно
// больше" → "Полный дамп подтвердил гипотезу №3 однозначно"): tournamentlist.xml
// намеренно возвращает только турниры, СОЗДАННЫЕ ВРУЧНУЮ другими игроками
// ("HTO" — Hattrick Tournament Organizer). Полный дамп реального ответа
// подтвердил оба пункта:
//   1) Пагинации нет — ни на уровне HattrickData, ни внутри <Tournaments>
//      (пустая строка в дампе обоих кандидатов).
//   2) Оба турнира несут реально заполненное поле Creator (UserID/Loginname
//      конкретных пользователей — MilkoVv и 3EHUT в диагностике
//      пользователя) — прямое подтверждение, что это именно
//      пользовательские турниры, а не автоматические события Arena.
// Автоматически генерируемые турниры Hattrick Arena (например, соперники
// вроде "POCCOBXO3 Aktobe", "FC Begonia 87 Bonn") — ОТДЕЛЬНАЯ категория,
// вне охвата tournamentlist.xml (и вообще любого найденного файла CHPP) —
// тот же класс подтверждённого ограничения, что и Ladder (см. выше): нет
// команд-специфичного источника для автоматических Arena-турниров/матчей в
// CHPP вообще. Дальше не ищем (решение пользователя) — см.
// src/components/dashboard/HattrickArenaSection.tsx для честной формулировки
// в интерфейсе.
export const TOURNAMENT_LIST_VERSION = "1.0";

// ИСПРАВЛЕНО (см. чат "Трофеи/Турниры прямо сейчас показывают пустоту,
// хотя пользователь реально ещё участвует") — живая диагностика
// подтвердила: IsMatchesOngoing означает "матч идёт прямо в эту секунду"
// (буквально в момент запроса), а НЕ "турнир ещё не завершён" — у обоих
// турниров пользователя IsMatchesOngoing=0, хотя NextMatchRoundDate у
// обоих указывает на реальную будущую дату (пользователь подтвердил, что
// всё ещё участвует). Теперь "турнир ещё активен для нас" определяется
// присутствием НЕ-пустой, не-заглушечной NextMatchRoundDate — это прямо
// подтверждено на живых данных, в отличие от прежнего IsMatchesOngoing.
function hasUpcomingMatchRound(raw: unknown): boolean {
  const s = String(raw ?? "").trim();
  if (!s) return false;
  // Hattrick отдаёт "нет даты" как дату-заглушку из нулей/минимальную дату
  // (тот же приём уже использовался в проекте для похожих полей) — не
  // проверено конкретно для NextMatchRoundDate на живых данных этого
  // аккаунта (у обоих турниров дата была реальной), но защититься от такой
  // заглушки безопаснее, чем считать любую непустую строку за реальную дату.
  return !s.startsWith("0000-00-00") && !s.startsWith("0001-01-01");
}

export interface TournamentListEntry {
  tournamentId: string;
  name: string;
  // "Турнир идёт прямо сейчас" (для нас) — см. hasUpcomingMatchRound выше.
  isOngoing: boolean;
}

export function parseTournamentListXml(xml: string): TournamentListEntry[] {
  const parser = new XMLParser();
  const data = parser.parse(xml);
  const root = data?.HattrickData;
  assertNoChppError(root, "tournamentlist");

  const tournaments = asArray((root?.Tournaments as Record<string, unknown> | undefined)?.Tournament);
  return tournaments.map((t) => ({
    tournamentId: String(t.TournamentId ?? t.TournamentID ?? ""),
    name: String(t.Name ?? `Турнир #${t.TournamentId ?? t.TournamentID ?? "?"}`),
    isOngoing: hasUpcomingMatchRound(t.NextMatchRoundDate),
  }));
}

// ДИАГНОСТИКА (см. чат "tournamentlist.xml возвращает только 2 турнира, а
// на сайте их явно больше") — дампит АБСОЛЮТНО ВСЕ поля ответа, не только
// сам массив турниров: скалярные поля прямо на HattrickData (на случай,
// если счётчик страниц лежит ТАМ, а не внутри <Tournaments>, как было с
// PageIndex/Pages в transfersteam.xml) и скалярные поля самого контейнера
// <Tournaments> (кроме повторяющегося <Tournament>), плюс ПОЛНЫЙ дамп
// каждого найденного турнира со всеми его полями как есть (Type/
// TrophyType/NumberOfTeams/Creator и т.д. — сейчас используются только
// TournamentId/Name/IsMatchesOngoing, остальные поля никогда не
// проверялись на то, дают ли они сигнал "это не HTO-турнир").
export function debugTournamentListFullResponse(xml: string): string {
  const parser = new XMLParser();
  const data = parser.parse(xml);
  const root = data?.HattrickData as Record<string, unknown> | undefined;
  if (!root) return "root (HattrickData) не найден — либо другой корневой тег, либо XML не разобрался";

  const rootKeys = Object.keys(root);
  const scalarRoot = Object.entries(root).filter(([, v]) => typeof v !== "object" || v === null);
  const tournamentsContainer = root.Tournaments as Record<string, unknown> | undefined;
  const containerKeys = tournamentsContainer ? Object.keys(tournamentsContainer) : [];
  const scalarContainer = tournamentsContainer
    ? Object.entries(tournamentsContainer).filter(([k, v]) => k !== "Tournament" && (typeof v !== "object" || v === null))
    : [];
  const tournaments = asArray(tournamentsContainer?.Tournament);
  const fullDump = tournaments.map((t) => JSON.stringify(t)).join(" || ");

  return (
    `Ключи HattrickData: [${rootKeys.join(", ")}]. ` +
    `Скалярные поля HattrickData (кандидаты на пагинацию вне <Tournaments>): ${scalarRoot.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ") || "(нет)"}. ` +
    `Ключи <Tournaments>: [${containerKeys.join(", ")}]. ` +
    `Скалярные поля <Tournaments> кроме Tournament (кандидаты на PageIndex/Pages/TotalCount): ${scalarContainer.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ") || "(нет)"}. ` +
    `Полный дамп каждого найденного турнира (все поля как есть): ${fullDump || "(турниров нет)"}.`
  );
}

// tournamentfixtures.xml (v1.1) — реальные матчи (включая счёт) конкретного
// турнира, ПО ВСЕМ участникам, а не только нашей команде (структура
// TournamentFixture по независимому клиенту: HomeTeamID/AwayTeamID/
// HomeGoals/AwayGoals/Status на КАЖДЫЙ матч турнира) — поэтому здесь, как и
// в matches.ts, нужно самим отфильтровать по ourTeamId и определить
// домашнюю/гостевую сторону.
//
// ПАРАМЕТР ЗАПРОСА НЕ ПОДТВЕРЖДЁН НА ЖИВЫХ ДАННЫХ: официальная документация
// CHPP по этому файлу недоступна из песочницы (сайты chpp.hattrick.org и
// hattrick.org недоступны отсюда), а независимый клиент lucianoq/hattrick
// содержит только формы ответа, не параметры запроса. Используется
// "tournamentID" по аналогии с остальными ID-параметрами проекта
// (cupID/matchID/youthPlayerId) — если CHPP ответит ошибкой/пустым списком,
// это будет видно в диагностике (см. chppSync.ts) и параметр нужно будет
// подобрать по-другому, а не считать, что турниров действительно нет.
export const TOURNAMENT_FIXTURES_VERSION = "1.1";

// ДИАГНОСТИКА (см. чат "tournamentfixtures.xml реально содержит 28 <Match>,
// но наш разбор находит 0") — пользователь подтвердил на сыром теле ответа:
// матчи ЕСТЬ (HomeTeamId=793810, HomeTeamName=Zhezburg видны прямо в тексте),
// но parseTournamentFixturesXml их не находит. Поле HomeTeamId уже
// проверяется в правильном регистре (см. m.HomeTeamId в фильтре ниже) —
// значит, вероятнее всего, дело не в регистре самого поля игрока/счёта, а в
// ПУТИ КОНТЕЙНЕРА (root.Matches.Match может не совпадать с реальной
// вложенностью). Пробуем несколько вероятных путей одновременно и
// показываем, где реально нашлись элементы, плюс ПОЛНЫЙ дамп первого сырого
// найденного матча (все поля как есть, без каких-либо допущений об именах) —
// чтобы одним взглядом увидеть, как на самом деле называются Status/
// MatchDate/HomeTeamId и т.п., а не гадать по одному полю за раз.
export function debugTournamentFixturesRawStructure(xml: string): string {
  const parser = new XMLParser();
  const data = parser.parse(xml);
  const root = data?.HattrickData as Record<string, unknown> | undefined;
  if (!root) return "root (HattrickData) не найден — либо другой корневой тег, либо XML не разобрался";

  const rootKeys = Object.keys(root);
  const candidates: { path: string; count: number; sample: string }[] = [];
  const record = (path: string, value: unknown) => {
    const arr = asArray(value);
    candidates.push({ path, count: arr.length, sample: arr.length > 0 ? JSON.stringify(arr[0]).slice(0, 400) : "" });
  };

  record("root.Matches.Match", (root.Matches as Record<string, unknown> | undefined)?.Match);
  record("root.Match", root.Match);
  record("root.Team.Matches.Match", ((root.Team as Record<string, unknown> | undefined)?.Matches as Record<string, unknown> | undefined)?.Match);
  record("root.Tournament.Matches.Match", ((root.Tournament as Record<string, unknown> | undefined)?.Matches as Record<string, unknown> | undefined)?.Match);
  record("root.TournamentFixtures.Match", (root.TournamentFixtures as Record<string, unknown> | undefined)?.Match);

  const summary = candidates
    .map((c) => `${c.path}: ${c.count} эл.${c.sample ? ` первый=${c.sample}` : ""}`)
    .join(" | ");
  return `Ключи HattrickData: [${rootKeys.join(", ")}]. ${summary}`;
}

// ИСПРАВЛЕНО (см. чат "Наконец нашли точную причину!") — путь контейнера
// (root.Matches.Match) с самого начала был верным, 28 матчей реально
// находились; проблема была в статусе. Подтверждено на реальных данных:
// Status здесь ЧИСЛОВОЙ (например "2"), а не текстовый "FINISHED", как в
// matches.xml/matchesarchive.xml — код сравнивал с текстом и поэтому
// отбрасывал вообще все матчи как "не сыгранные". Числовые коды подтверждены
// по независимому CHPP-клиенту (chpp/type_match_status.go, MatchStatus):
// 0=NotStarted (UPCOMING), 1=Ongoing, 2=Finished — та же неймингом система,
// что и MatchType в этом же файле (см. MatchType=50 —
// MatchTypeTournamentLeagueMatch, отдельное подтверждение, что
// tournamentfixtures.xml вообще использует другую, "числовую" схему
// кодирования полей по сравнению с обычным списком матчей команды).
// Принимаем И числовой (2), И текстовый ("FINISHED") варианты — на случай,
// если CHPP когда-нибудь всё же начнёт присылать текст, как и остальные
// файлы.
function isFinishedTournamentStatus(rawStatus: unknown): boolean {
  const s = String(rawStatus ?? "").toUpperCase();
  return s === "2" || s === "FINISHED";
}

export function parseTournamentFixturesXml(
  xml: string,
  ourTeamId: string,
  tournamentId: string,
  tournamentName: string,
): ArenaRecentMatch[] {
  const parser = new XMLParser();
  const data = parser.parse(xml);
  const root = data?.HattrickData;
  assertNoChppError(root, "tournamentfixtures");

  const rawMatches = asArray((root?.Matches as Record<string, unknown> | undefined)?.Match);

  return rawMatches
    .filter((m) => {
      const homeId = String(m.HomeTeamId ?? m.HomeTeamID ?? "");
      const awayId = String(m.AwayTeamId ?? m.AwayTeamID ?? "");
      return (homeId === ourTeamId || awayId === ourTeamId) && isFinishedTournamentStatus(m.Status);
    })
    .map((m) => {
      const homeId = String(m.HomeTeamId ?? m.HomeTeamID ?? "");
      const isHome = homeId === ourTeamId;
      const homeGoals = m.HomeGoals !== undefined ? Number(m.HomeGoals) : 0;
      const awayGoals = m.AwayGoals !== undefined ? Number(m.AwayGoals) : 0;
      const opponent = isHome ? String(m.AwayTeamName ?? "") : String(m.HomeTeamName ?? "");
      // Group=0 — по независимому клиенту (TournamentFixture.Group)
      // означает именно матч плей-офф стадии турнира, см. didWinTournament.
      const isPlayoffMatch = Number(m.Group ?? -1) === 0;
      return {
        matchId: String(m.MatchId ?? m.MatchID ?? ""),
        date: String(m.MatchDate ?? ""),
        home: isHome,
        opponent,
        ourScore: isHome ? homeGoals : awayGoals,
        oppScore: isHome ? awayGoals : homeGoals,
        source: "tournament" as const,
        tournamentId,
        tournamentName,
        isPlayoffMatch,
      };
    });
}

// ---------- Трофеи/текущие турниры (см. чат "Матчи: закладка Арена —
// трофеи и текущие турниры") ----------
//
// CHPP не даёт официального поля "мы выиграли этот турнир" — эвристика,
// явно помеченная как предположение (не факт) везде в интерфейсе:
// считаем турнир выигранным, только если (1) он НЕ идёт сейчас
// (isOngoing=false — по документации это подтверждённое поле турнира) и
// (2) наш САМЫЙ ПОЗДНИЙ сыгранный матч со стадией плей-офф (isPlayoffMatch,
// Group=0 — см. parseTournamentFixturesXml) закончился нашей победой.
// Group=0-матчи по докстроке независимого клиента ("the winner of the
// first match becomes the home team" для последующих раундов) — это именно
// раунды плей-офф-сетки одного турнира; последний по дате такой матч,
// сыгранный нами, логически и есть финал (или наш последний матч в сетке,
// если мы вылетели раньше финала — тогда это НЕ победа, что корректно
// учитывается сравнением счёта). Если у турнира вообще нет матчей с
// isPlayoffMatch (турнир не плей-офф формата, а круговой/лиговый) — трофей
// не определяется вообще (не гадаем про круговые турниры без плей-офф).
export interface ArenaTournamentSummary {
  tournamentId: string;
  name: string;
  isOngoing: boolean;
  wonTrophy: boolean;
}

function didWinTournament(matches: ArenaRecentMatch[]): boolean {
  const playoffMatches = matches.filter((m) => m.isPlayoffMatch).sort((a, b) => b.date.localeCompare(a.date));
  const last = playoffMatches[0];
  return !!last && last.ourScore > last.oppScore;
}

export function buildArenaTournamentSummaries(
  tournaments: TournamentListEntry[],
  matchesByTournamentId: Map<string, ArenaRecentMatch[]>,
): ArenaTournamentSummary[] {
  return tournaments.map((t) => {
    const matches = matchesByTournamentId.get(t.tournamentId) ?? [];
    return {
      tournamentId: t.tournamentId,
      name: t.name,
      isOngoing: t.isOngoing,
      wonTrophy: !t.isOngoing && didWinTournament(matches),
    };
  });
}

// Итог раздела "Арена" — сохраняется в chpp_snapshots целиком (см.
// DATA_KEYS.arenaResults в chppSync.ts).
export interface ArenaSyncResult {
  matches: ArenaRecentMatch[];
  tournaments: ArenaTournamentSummary[];
  ladders: ArenaLadderPosition[];
}
