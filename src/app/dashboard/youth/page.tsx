import Header from "@/components/Header";
import Footer from "@/components/Footer";
import YouthTable from "@/components/dashboard/YouthTable";
import DemoModeBanner from "@/components/dashboard/DemoModeBanner";
import styles from "@/components/dashboard/Dashboard.module.css";
import { getRequiredHattrickTokens, requestChppXmlRaw, type StoredHattrickTokens } from "@/lib/hattrickApi";
import { parseClubXml } from "@/lib/clubStaff";
import { parseYouthPlayerListXml, debugYouthPlayerListRawCount, type RealYouthPlayer } from "@/lib/youthPlayers";

// ВРЕМЕННАЯ диагностика — показывает реальный HTTP-статус и количество
// игроков, найденных в ответе youthplayerlist, чтобы сразу отличать "запрос
// упал" от "запрос успешен, но разбор XML вернул пусто" (именно вторая
// причина оказалась настоящим багом — см. комментарий в src/lib/youthPlayers.ts).
const SHOW_YOUTH_DEBUG_PANEL = true;

async function resolveYouthLevel(tokens: StoredHattrickTokens): Promise<{ youthLevel: number | null; error: string | null }> {
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

// ИСПРАВЛЕНО: раньше версия файла не передавалась явно (по умолчанию
// requestChppXmlRaw подставляет "1.5") — подтверждённая по независимому
// CHPP-клиенту версия именно этого файла — "1.3" (chpp/file_youthplayerlist.go,
// YouthPlayerListAPIVersion). Настоящая причина пустой вкладки была не в
// версии (см. src/lib/youthPlayers.ts), но версия указана явно на всякий
// случай — так же, как уже сделано для youthplayerdetails.xml.
async function resolveYouthPlayers(tokens: StoredHattrickTokens): Promise<{
  players: RealYouthPlayer[] | null;
  error: string | null;
  httpStatus: number | null;
  rawPlayerCount: number;
}> {
  let httpStatus: number | null = null;
  try {
    const raw = await requestChppXmlRaw("youthplayerlist", { version: "1.3" }, tokens);
    httpStatus = raw.httpStatus;
    const rawPlayerCount = debugYouthPlayerListRawCount(raw.rawXml);
    if (raw.httpStatus < 200 || raw.httpStatus >= 300) {
      throw new Error(`HTTP ${raw.httpStatus}: ${raw.rawXml.slice(0, 200)}`);
    }
    return { players: parseYouthPlayerListXml(raw.rawXml), error: null, httpStatus, rawPlayerCount };
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    return { players: null, error: `Список академии (youthplayerlist): ${message}`, httpStatus, rawPlayerCount: 0 };
  }
}

export default async function YouthPage() {
  const tokens = await getRequiredHattrickTokens();
  const [
    { youthLevel, error: levelError },
    { players, error: playersError, httpStatus: playersHttpStatus, rawPlayerCount },
  ] = await Promise.all([resolveYouthLevel(tokens), resolveYouthPlayers(tokens)]);
  const errors = [levelError, playersError].filter((e): e is string => e !== null);

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className={`container ${styles.stack}`} style={{ paddingBottom: 72 }}>
          {errors.length > 0 && (
            <DemoModeBanner title="Не удалось загрузить часть данных академии" reasons={errors} />
          )}

          {SHOW_YOUTH_DEBUG_PANEL && (
            <div className={styles.card}>
              <div className={styles.balanceLabel}>Диагностика: youthplayerlist</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 8, fontSize: 12.5 }}>
                <div>HTTP-статус: {playersHttpStatus ?? "запрос не выполнен (см. ошибку ниже)"}</div>
                <div>Игроков в ответе (реально разобрано из &lt;PlayerList&gt;&lt;YouthPlayer&gt;): {rawPlayerCount}</div>
                {playersError && <div style={{ color: "#c0503f" }}>Ошибка: {playersError}</div>}
              </div>
            </div>
          )}

          <YouthTable youthLevel={youthLevel ?? undefined} players={players ?? undefined} />
        </div>
      </main>
      <Footer />
    </>
  );
}
