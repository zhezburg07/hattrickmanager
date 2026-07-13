import Header from "@/components/Header";
import Footer from "@/components/Footer";
import TrainingSection from "@/components/dashboard/TrainingSection";
import DemoModeBanner from "@/components/dashboard/DemoModeBanner";
import styles from "@/components/dashboard/Dashboard.module.css";
import { getStoredHattrickTokens, requestChppXmlRaw } from "@/lib/hattrickApi";
import { parseTeamDetailsXml } from "@/lib/teamDetails";
import { parsePlayersDetailedXml } from "@/lib/squadPlayers";

interface RealCoach {
  name: string;
  leadership: number;
}

async function resolveCoach(): Promise<{ coach: RealCoach | null; error: string | null }> {
  const tokens = getStoredHattrickTokens();
  if (!tokens) return { coach: null, error: null };

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

export default async function TrainingPage() {
  const { coach, error } = await resolveCoach();
  const tokens = getStoredHattrickTokens();

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className={`container ${styles.stack}`} style={{ paddingBottom: 72 }}>
          {!tokens && <DemoModeBanner title="Демо-режим" reasons={["Команда ещё не подключена к Hattrick."]} />}
          {tokens && error && (
            <DemoModeBanner title="Не удалось определить реального тренера" reasons={[error]} />
          )}
          <TrainingSection coachName={coach?.name} coachLeadership={coach?.leadership} />
        </div>
      </main>
      <Footer />
    </>
  );
}
