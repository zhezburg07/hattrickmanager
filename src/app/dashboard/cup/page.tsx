import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CupSection from "@/components/dashboard/CupSection";
import DemoModeBanner from "@/components/dashboard/DemoModeBanner";
import styles from "@/components/dashboard/Dashboard.module.css";
import { getRequiredHattrickTokens, requestChppXmlRaw, type StoredHattrickTokens } from "@/lib/hattrickApi";
import { parseTeamDetailsXml } from "@/lib/teamDetails";
import { parseClubXml } from "@/lib/clubStaff";
import { parseMatchesXml } from "@/lib/matches";
import { parseCupMatchesXml, type RealCupMatch } from "@/lib/cupMatches";

async function resolveTeamCupInfo(
  tokens: StoredHattrickTokens,
): Promise<{ teamId: string | null; stillInCup: boolean | null; cupId: string | null; error: string | null }> {
  try {
    const raw = await requestChppXmlRaw("teamdetails", {}, tokens);
    if (raw.httpStatus < 200 || raw.httpStatus >= 300) {
      throw new Error(`HTTP ${raw.httpStatus}: ${raw.rawXml.slice(0, 200)}`);
    }
    const team = parseTeamDetailsXml(raw.rawXml);
    return { teamId: team.teamId, stillInCup: team.stillInCup, cupId: team.cupId, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    return { teamId: null, stillInCup: null, cupId: null, error: `Кубки (teamdetails): ${message}` };
  }
}

// cupmatches требует параметр CupID ("CupId must be provided" — проверено
// на живом ответе). teamdetails.xml сам по себе CupID не отдаёт (там
// только StillInCup) — поэтому при отсутствии пробуем найти его ещё в двух
// вероятных местах: club.xml и matches.xml (у кубковых матчей может быть
// поле CupID). Если ни там, ни там его нет — честно не делаем запрос
// cupmatches вообще (чтобы не получать гарантированную ошибку), и остаётся
// прежнее поведение: реальный статус участия + иллюстративная сетка.
async function findCupIdFromClub(tokens: StoredHattrickTokens): Promise<string | null> {
  try {
    const raw = await requestChppXmlRaw("club", {}, tokens);
    if (raw.httpStatus < 200 || raw.httpStatus >= 300) return null;
    return parseClubXml(raw.rawXml).cupId;
  } catch {
    return null;
  }
}

async function findCupIdFromMatches(tokens: StoredHattrickTokens, teamId: string): Promise<string | null> {
  try {
    const raw = await requestChppXmlRaw("matches", {}, tokens);
    if (raw.httpStatus < 200 || raw.httpStatus >= 300) return null;
    const matches = parseMatchesXml(raw.rawXml, teamId);
    return matches.find((m) => m.cupId !== null)?.cupId ?? null;
  } catch {
    return null;
  }
}

async function resolveCupMatches(
  tokens: StoredHattrickTokens,
  teamId: string,
  cupId: string,
): Promise<{ matches: RealCupMatch[] | null; error: string | null }> {
  try {
    const raw = await requestChppXmlRaw("cupmatches", { CupID: cupId }, tokens);
    if (raw.httpStatus < 200 || raw.httpStatus >= 300) {
      throw new Error(`HTTP ${raw.httpStatus}: ${raw.rawXml.slice(0, 200)}`);
    }
    return { matches: parseCupMatchesXml(raw.rawXml, teamId), error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    return { matches: null, error: `Матчи кубка (cupmatches): ${message}` };
  }
}

export default async function CupPage() {
  const tokens = getRequiredHattrickTokens();

  const { teamId, stillInCup, cupId: cupIdFromTeamDetails, error: teamError } = await resolveTeamCupInfo(tokens);

  let cupId = cupIdFromTeamDetails;
  if (!cupId && teamId) {
    const [fromClub, fromMatches] = await Promise.all([
      findCupIdFromClub(tokens),
      findCupIdFromMatches(tokens, teamId),
    ]);
    cupId = fromClub ?? fromMatches ?? null;
  }

  const { matches, error: matchesError } =
    cupId && teamId ? await resolveCupMatches(tokens, teamId, cupId) : { matches: null, error: null };
  const errors = [teamError, matchesError].filter((e): e is string => e !== null);

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className={`container ${styles.stack}`} style={{ paddingBottom: 72 }}>
          {errors.length > 0 && (
            <DemoModeBanner title="Не удалось загрузить часть данных о кубках" reasons={errors} />
          )}
          <CupSection stillInCup={stillInCup ?? undefined} realCupMatches={matches ?? undefined} />
        </div>
      </main>
      <Footer />
    </>
  );
}
