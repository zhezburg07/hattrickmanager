import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";
import { requestChppXmlRaw, type StoredHattrickTokens } from "./hattrickApi";
import { parseTeamDetailsXml } from "./teamDetails";
import { parseMatchesXml } from "./matches";
import { ROLE_ID_TO_SLOT_ROLE, type SlotRole } from "@/data/pitchBoard";
import { trainingWeekKey } from "./playerHistoryDb";

// Рейтинг игрока за сыгранные матчи (звёзды, как в самой Hattrick) —
// раньше в проекте таких данных не было: src/data/matchAnalysis.ts (теперь
// удалён) для "Обзора матча" был целиком иллюстративной детерминированной
// генерацией, а не реальным ответом CHPP.
//
// Схема: 1) teamdetails.xml → наш TeamID; 2) matches.xml → последние N
// матчей со статусом FINISHED; 3) matchlineup.xml по каждому MatchID →
// наш состав и рейтинг (RatingStars) вышедших на поле игроков.
//
// ИСПРАВЛЕНО: раньше здесь запрашивался matchdetails.xml и читалось
// Team/Lineup/Player/RatingStars — это поле никогда не было подтверждено
// на живом ответе и было лишь предположением по аналогии с matches.xml.
// Проверка реальной схемы matchdetails.xml (v3.1, через независимый CHPP-
// клиент github.com/lucianoq/hattrick) показала, что HomeTeam/AwayTeam там
// вообще не содержат Lineup/Player — только командные показатели (Rating*
// по зонам, Formation, TacticType и т.п.). Список игроков с их рейтингом
// (RatingStars/RatingStarsEndOfMatch) отдаёт ОТДЕЛЬНЫЙ файл — matchlineup.xml
// (v2.1), причём по одному запросу на одну команду (свою — без teamID,
// чужую — с явным teamID). Здесь нужна только "наша" сторона, поэтому одного
// запроса на матч достаточно (teamID не передаём — CHPP по умолчанию отдаёт
// команду залогиненного пользователя).
//
// УВЕЛИЧЕНО с 3 до 10 (см. чат "Ускорить накопление данных для калибровки
// звёзд") — честная оценка показала, что полный бэкфилл по matchesarchive.xml
// не стоит затрат (player_weekly_stat_snapshots физически не имеет истории
// глубже ~3.5 недель, см. commit 073e006 — более старые матчи всё равно
// отсеются getSnapshotAsOf), а вот увеличение окна "последних N матчей"
// заставляет каждую ОБЫЧНУЮ синхронизацию сразу же полнее использовать уже
// доступную, безопасную часть истории (в пределах того же окна снимков
// навыков) — без всякого риска для точности калибровки, тем же самым
// уже проверенным путём (getSnapshotAsOf возвращает null и просто
// пропускает кандидата, если снимка на дату матча ещё нет). Цена — 10
// параллельных запросов matchlineup.xml на синхронизацию вместо 3 (см.
// Promise.all ниже и в chppSync.ts) — заметно, но не критично, один раз в
// несколько минут на пользователя, а не на каждый рендер страницы.
export const RECENT_MATCH_COUNT = 10;
export const MATCH_LINEUP_VERSION = "2.1";

export interface RecentMatchRatingsResult {
  lastMatchRatings: Record<number, number>;
  bestOfRecentRatings: Record<number, number>;
  error: string | null;
}

export async function resolveLastMatchRatings(tokens: StoredHattrickTokens): Promise<RecentMatchRatingsResult> {
  const empty: RecentMatchRatingsResult = { lastMatchRatings: {}, bestOfRecentRatings: {}, error: null };
  try {
    const teamRaw = await requestChppXmlRaw("teamdetails", {}, tokens);
    if (teamRaw.httpStatus < 200 || teamRaw.httpStatus >= 300) {
      throw new Error(`teamdetails HTTP ${teamRaw.httpStatus}`);
    }
    const teamId = parseTeamDetailsXml(teamRaw.rawXml).teamId;

    const matchesRaw = await requestChppXmlRaw("matches", {}, tokens);
    if (matchesRaw.httpStatus < 200 || matchesRaw.httpStatus >= 300) {
      throw new Error(`matches HTTP ${matchesRaw.httpStatus}`);
    }
    const matches = parseMatchesXml(matchesRaw.rawXml, teamId);
    const recentFinished = matches
      .filter((m) => m.status === "FINISHED" && m.matchId)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, RECENT_MATCH_COUNT);
    if (recentFinished.length === 0) {
      return empty;
    }

    const lineupRaws = await Promise.all(
      recentFinished.map((m) =>
        requestChppXmlRaw("matchlineup", { matchID: m.matchId, version: MATCH_LINEUP_VERSION, sourceSystem: "hattrick" }, tokens),
      ),
    );

    const perMatchRatings = lineupRaws.map((raw) => {
      if (raw.httpStatus < 200 || raw.httpStatus >= 300) return {};
      try {
        return parseMatchLineupRatings(raw.rawXml);
      } catch {
        return {};
      }
    });

    const lastMatchRatings: Record<number, number> = {};
    for (const [playerId, entry] of Object.entries(perMatchRatings[0] ?? {})) {
      lastMatchRatings[Number(playerId)] = entry.rating;
    }
    const bestOfRecentRatings: Record<number, number> = {};
    for (const ratings of perMatchRatings) {
      for (const [playerId, entry] of Object.entries(ratings)) {
        const id = Number(playerId);
        bestOfRecentRatings[id] =
          bestOfRecentRatings[id] !== undefined ? Math.max(bestOfRecentRatings[id], entry.rating) : entry.rating;
      }
    }

    return { lastMatchRatings, bestOfRecentRatings, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    return { ...empty, error: `Рейтинг последних матчей: ${message}` };
  }
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : value ? [value as Record<string, unknown>] : [];
}

// Пара "рейтинг + позиция" на игрока за конкретный матч. roleId — сырой
// RoleID из matchlineup.xml (100-113 — одна из 11 стартовых позиций, см.
// ROLE_ID_TO_SLOT_ROLE в src/data/pitchBoard.ts), null если поле не пришло
// или относится к скамейке/спецроли. Добавлено для "Калибровка позиционного
// рейтинга по реальным звёздам Hattrick" (см. план в .claude/plans, шаг 1) —
// раньше эта функция отдавала только рейтинг, roleId отбрасывался.
//
// ratingStarsFull/ratingStarsEndOfMatch — ОБЕ оценки звёзд по отдельности
// (см. чат "Калькулятор оптимальной минуты замены" — сбор данных для
// будущей калибровки формулы усталости, шаг 1 плана). rating (выше) — как и
// раньше, ТОЛЬКО для отображения/существующей позиционной калибровки, его
// логика (RatingStars ?? RatingStarsEndOfMatch) не меняется. Новые два поля
// — сырые значения независимо друг от друга, null если конкретное поле не
// пришло в этом ответе (не гадаем, не подставляем одно вместо другого).
export interface MatchLineupRatingEntry {
  rating: number;
  roleId: number | null;
  ratingStarsFull: number | null;
  ratingStarsEndOfMatch: number | null;
}

export function parseMatchLineupRatings(xml: string): Record<number, MatchLineupRatingEntry> {
  const parser = new XMLParser();
  const data = parser.parse(xml);
  const root = data?.HattrickData;
  assertNoChppError(root, "matchlineup");

  const team = root?.Team as Record<string, unknown> | undefined;
  const lineup = team?.Lineup as Record<string, unknown> | undefined;
  const players = asArray(lineup?.Player);

  // ИСПРАВЛЕНО: RatingStars — основной рейтинг за матч (то, что Hattrick
  // официально показывает как "звёзды" игрока за игру); RatingStarsEndOfMatch —
  // отдельное поле, дающее рейтинг именно К КОНЦУ матча, уже сниженный
  // усталостью к 90-й минуте. Раньше здесь бралось RatingStarsEndOfMatch
  // первым — из-за этого столбец "Рейтинг последнего матча" в "Составе"
  // систематически показывал заниженные значения по сравнению с реальным
  // hattrick.org (подтверждено на живых данных: например, Elimbetov 7.5 на
  // сайте Hattrick vs 5.5 здесь, Farstad 11.5 vs 9, Usenov 8 vs 5.5).
  //
  // Игрок может встретиться в списке несколько раз (спецроль вроде
  // капитана/пробивающего пенальти — та же ситуация, что и в
  // fetchTeamLineupRatings в matchAnalysis.ts, тот же приём дедупликации:
  // запись с RoleID в диапазоне 100-113 ("стартовый состав") побеждает
  // запись без него, а не первая/последняя по порядку).
  const ratings: Record<number, MatchLineupRatingEntry> = {};
  for (const p of players) {
    const id = Number(p.PlayerID ?? p.PlayerId ?? 0);
    const ratingRaw = p.RatingStars ?? p.RatingStarsEndOfMatch;
    if (!id || ratingRaw === undefined) continue;
    const rating = Number(ratingRaw);
    if (Number.isNaN(rating)) continue;

    const roleIdRaw = p.RoleID ?? p.RoleId;
    const roleId = roleIdRaw !== undefined ? Number(roleIdRaw) : null;
    const isFieldRole = roleId !== null && roleId >= 100 && roleId <= 113;

    // Обе оценки НЕЗАВИСИМО друг от друга (см. комментарий у
    // MatchLineupRatingEntry выше) — только для будущей калибровки, не
    // участвуют в выборе rating/roleId выше.
    const fullRaw = p.RatingStars !== undefined ? Number(p.RatingStars) : NaN;
    const endOfMatchRaw = p.RatingStarsEndOfMatch !== undefined ? Number(p.RatingStarsEndOfMatch) : NaN;
    const ratingStarsFull = Number.isNaN(fullRaw) ? null : fullRaw;
    const ratingStarsEndOfMatch = Number.isNaN(endOfMatchRaw) ? null : endOfMatchRaw;

    const existing = ratings[id];
    if (!existing || isFieldRole) {
      ratings[id] = {
        rating,
        roleId: isFieldRole ? roleId : (existing?.roleId ?? roleId),
        ratingStarsFull,
        ratingStarsEndOfMatch,
      };
    }
  }
  return ratings;
}

// Кандидат на запись в датасет калибровки позиционного рейтинга (см. чат
// "Калибровка позиционного рейтинга по реальным звёздам Hattrick", план в
// .claude/plans, шаг 3) — один игрок в одном матче, с уже вычисленными
// slotRole/matchWeek. Само сохранение (поиск исторического снимка навыков
// + запись в БД) остаётся в chppSync.ts, здесь — только чистый отбор,
// вынесенный отдельно ради юнит-тестируемости без реальной БД.
export interface CalibrationCandidate {
  matchId: string;
  playerId: number;
  matchDate: string;
  matchWeek: string;
  roleId: number;
  slotRole: SlotRole;
  actualRatingStars: number;
  // Обе оценки звёзд по отдельности — только сбор данных для будущей
  // калибровки калькулятора замены (см. чат "Калькулятор оптимальной минуты
  // замены", шаг 1), не используются позиционной калибровкой рейтинга
  // (actualRatingStars выше). null, если конкретное поле не пришло.
  ratingStarsFull: number | null;
  ratingStarsEndOfMatch: number | null;
}

// Только игроки СТАРТОВОГО состава (RoleID 100-113) — вышедшие на замену/
// скамейка пропускаются (поведение RoleID при замене в середине матча не
// проверено, см. план калибровки шаг 0). matchWeek — та же "пятница не
// позже даты матча", что и у обычных недельных снимков навыков
// (trainingWeekKey), нужна для поиска исторического снимка на дату матча
// (getSnapshotAsOf в playerHistoryDb.ts), а не сегодняшнего.
export function buildCalibrationCandidates(
  matches: { matchId: string; date: string }[],
  perMatchRatings: Record<number, MatchLineupRatingEntry>[],
): CalibrationCandidate[] {
  const candidates: CalibrationCandidate[] = [];
  matches.forEach((m, i) => {
    const ratings = perMatchRatings[i] ?? {};
    const matchDateMs = Date.parse(m.date.replace(" ", "T") + "Z");
    if (Number.isNaN(matchDateMs)) return;
    const matchWeek = trainingWeekKey(new Date(matchDateMs));
    for (const [playerIdStr, entry] of Object.entries(ratings)) {
      if (entry.roleId === null || entry.roleId < 100 || entry.roleId > 113) continue;
      const slotRole = ROLE_ID_TO_SLOT_ROLE[entry.roleId];
      if (!slotRole) continue;
      candidates.push({
        matchId: m.matchId,
        playerId: Number(playerIdStr),
        matchDate: m.date,
        matchWeek,
        roleId: entry.roleId,
        slotRole,
        actualRatingStars: entry.rating,
        ratingStarsFull: entry.ratingStarsFull,
        ratingStarsEndOfMatch: entry.ratingStarsEndOfMatch,
      });
    }
  });
  return candidates;
}
