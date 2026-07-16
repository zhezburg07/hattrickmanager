import Header from "@/components/Header";
import Footer from "@/components/Footer";
import TrainingSection from "@/components/dashboard/TrainingSection";
import DemoModeBanner from "@/components/dashboard/DemoModeBanner";
import styles from "@/components/dashboard/Dashboard.module.css";
import { getRequiredHattrickTokens, requestChppXmlRaw, type StoredHattrickTokens } from "@/lib/hattrickApi";
import { parseTeamDetailsXml } from "@/lib/teamDetails";
import { parsePlayersDetailedXml } from "@/lib/squadPlayers";
import { parseTrainingXml, type RealTraining } from "@/lib/training";

interface RealCoach {
  name: string;
  leadership: number;
}

async function resolveCoach(tokens: StoredHattrickTokens): Promise<{ coach: RealCoach | null; error: string | null }> {
  try {
    const teamRaw = await requestChppXmlRaw("teamdetails", {}, tokens);
    if (teamRaw.httpStatus < 200 || teamRaw.httpStatus >= 300) {
      throw new Error(`HTTP ${teamRaw.httpStatus}: ${teamRaw.rawXml.slice(0, 200)}`);
    }
    const trainerPlayerId = parseTeamDetailsXml(teamRaw.rawXml).trainerPlayerId;

    const playersRaw = await requestChppXmlRaw("players", {}, tokens);
    if (playersRaw.httpStatus < 200 || playersRaw.httpStatus >= 300) {
      throw new Error(`HTTP ${playersRaw.httpStatus}: ${playersRaw.rawXml.slice(0, 200)}`);
    }
    const trainer = parsePlayersDetailedXml(playersRaw.rawXml, null).find((p) => String(p.id) === trainerPlayerId);
    if (!trainer) {
      throw new Error("Тренер не найден среди игроков ростера (players.xml)");
    }
    return { coach: { name: trainer.name, leadership: trainer.leadership }, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    return { coach: null, error: `Тренер (teamdetails/players): ${message}` };
  }
}

// training — ни разу не пробовался в этом проекте живьём до сих пор (см.
// src/lib/training.ts). Если файла с таким именем нет или CHPP не отдаёт
// его на чтение — молча остаёмся с тестовыми типом/интенсивностью, как
// раньше, без отдельного баннера (это второстепенная деталь плановой
// панели, см. комментарий в TrainingSection.tsx).
async function resolveTraining(tokens: StoredHattrickTokens): Promise<RealTraining | null> {
  try {
    const raw = await requestChppXmlRaw("training", {}, tokens);
    if (raw.httpStatus < 200 || raw.httpStatus >= 300) return null;
    return parseTrainingXml(raw.rawXml);
  } catch {
    return null;
  }
}

export default async function TrainingPage() {
  const tokens = getRequiredHattrickTokens();
  const [{ coach, error }, training] = await Promise.all([resolveCoach(tokens), resolveTraining(tokens)]);

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className={`container ${styles.stack}`} style={{ paddingBottom: 72 }}>
          {error && <DemoModeBanner title="Не удалось определить реального тренера" reasons={[error]} />}
          <TrainingSection
            coachName={coach?.name}
            coachLeadership={coach?.leadership}
            realTypeKey={training?.typeKey ?? undefined}
            realIntensity={training?.intensity ?? undefined}
            realStaminaShare={training?.staminaShare ?? undefined}
          />
        </div>
      </main>
      <Footer />
    </>
  );
}
