import Header from "@/components/Header";
import Footer from "@/components/Footer";
import YouthTable from "@/components/dashboard/YouthTable";
import DemoModeBanner from "@/components/dashboard/DemoModeBanner";
import styles from "@/components/dashboard/Dashboard.module.css";
import { getStoredHattrickTokens, requestChppXmlRaw } from "@/lib/hattrickApi";
import { parseClubXml } from "@/lib/clubStaff";
import { parseYouthPlayerListXml, type RealYouthPlayer } from "@/lib/youthPlayers";

async function resolveYouthLevel(): Promise<{ youthLevel: number | null; error: string | null }> {
  const tokens = getStoredHattrickTokens();
  if (!tokens) return { youthLevel: null, error: null };

  try {
    const raw = await requestChppXmlRaw("club", {}, tokens);
    if (raw.httpStatus < 200 || raw.httpStatus >= 300) {
      throw new Error(`HTTP ${raw.httpStatus}: ${raw.rawXml.slice(0, 200)}`);
    }
    return { youthLevel: parseClubXml(raw.rawXml).youthLevel, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    return { youthLevel: null, error: `Академия (club): ${message}` };
  }
}

// youthplayerlist — ни разу не пробовался в этом проекте живьём (прошлая
// пометка "401" в src/lib/clubStaff.ts относится к другим именам файлов,
// youthplayers/youthdetails). Если и это упадёт — честно откатываемся на
// демо-список, как раньше, показывая точную причину в баннере.
async function resolveYouthPlayers(): Promise<{ players: RealYouthPlayer[] | null; error: string | null }> {
  const tokens = getStoredHattrickTokens();
  if (!tokens) return { players: null, error: null };

  try {
    const raw = await requestChppXmlRaw("youthplayerlist", {}, tokens);
    if (raw.httpStatus < 200 || raw.httpStatus >= 300) {
      throw new Error(`HTTP ${raw.httpStatus}: ${raw.rawXml.slice(0, 200)}`);
    }
    return { players: parseYouthPlayerListXml(raw.rawXml), error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    return { players: null, error: `Список академии (youthplayerlist): ${message}` };
  }
}

export default async function YouthPage() {
  const tokens = getStoredHattrickTokens();
  const [{ youthLevel, error: levelError }, { players, error: playersError }] = await Promise.all([
    resolveYouthLevel(),
    resolveYouthPlayers(),
  ]);
  const errors = [levelError, playersError].filter((e): e is string => e !== null);

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className={`container ${styles.stack}`} style={{ paddingBottom: 72 }}>
          {!tokens && <DemoModeBanner title="Демо-режим" reasons={["Команда ещё не подключена к Hattrick."]} />}
          {tokens && errors.length > 0 && (
            <DemoModeBanner title="Не удалось загрузить часть данных академии" reasons={errors} />
          )}
          <YouthTable realYouthLevel={youthLevel ?? undefined} realYouthPlayers={players ?? undefined} />
        </div>
      </main>
      <Footer />
    </>
  );
}
