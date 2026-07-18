import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";
import { requestChppXmlRaw, type StoredHattrickTokens } from "./hattrickApi";

// Достижения менеджера (achievements.xml, v1.2) — подтверждено по
// независимому CHPP-клиенту github.com/lucianoq/hattrick. Заголовок и текст
// каждого достижения (AchievementTitle/AchievementText) уже приходят от
// самого Hattrick готовым читаемым текстом — переводить/придумывать
// подписи самим не нужно, только категория (CategoryID, 6 официальных
// значений) переведена на русский для бейджа.
const ACHIEVEMENTS_VERSION = "1.2";

const categoryLabels: Record<number, string> = {
  1: "Рейтинг",
  2: "Команда",
  3: "Матчи",
  4: "Менеджер",
  5: "Особые награды",
  6: "Болельщики",
};

export interface Achievement {
  id: number;
  title: string;
  text: string;
  categoryLabel: string;
  eventDate: string;
  points: number;
  multiLevel: boolean;
  rank: number;
  numberOfEvents: number;
}

export interface AchievementsResult {
  maxPoints: number;
  achievements: Achievement[];
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : value ? [value as Record<string, unknown>] : [];
}

export function parseAchievementsXml(xml: string): AchievementsResult {
  const parser = new XMLParser();
  const data = parser.parse(xml);
  const root = data?.HattrickData;
  assertNoChppError(root, "achievements");

  const achievementList = root?.AchievementList as Record<string, unknown> | undefined;
  const rawAchievements = asArray(achievementList?.Achievement);

  const achievements: Achievement[] = rawAchievements.map((a) => {
    const category = Number(a.CategoryID ?? 0);
    return {
      id: Number(a.AchievementTypeID ?? 0),
      title: String(a.AchievementTitle ?? ""),
      text: String(a.AchievementText ?? ""),
      categoryLabel: categoryLabels[category] ?? "Прочее",
      eventDate: String(a.EventDate ?? ""),
      points: Number(a.Points ?? 0),
      multiLevel: String(a.Multilevel ?? "").toLowerCase() === "true",
      rank: Number(a.Rank ?? 0),
      numberOfEvents: Number(a.NumberOfEvents ?? 0),
    };
  });

  return {
    maxPoints: Number(root?.MaxPoints ?? 0),
    achievements: achievements.sort((a, b) => b.eventDate.localeCompare(a.eventDate)),
  };
}

export async function resolveAchievements(
  tokens: StoredHattrickTokens,
): Promise<{ data: AchievementsResult | null; error: string | null }> {
  try {
    const raw = await requestChppXmlRaw("achievements", { version: ACHIEVEMENTS_VERSION }, tokens);
    if (raw.httpStatus < 200 || raw.httpStatus >= 300) {
      throw new Error(`HTTP ${raw.httpStatus}: ${raw.rawXml.slice(0, 200)}`);
    }
    return { data: parseAchievementsXml(raw.rawXml), error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    return { data: null, error: `Достижения (achievements): ${message}` };
  }
}
