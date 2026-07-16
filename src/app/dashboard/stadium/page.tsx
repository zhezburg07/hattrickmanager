import Header from "@/components/Header";
import Footer from "@/components/Footer";
import StadiumSection from "@/components/dashboard/StadiumSection";
import DemoModeBanner from "@/components/dashboard/DemoModeBanner";
import styles from "@/components/dashboard/Dashboard.module.css";
import { getRequiredHattrickTokens, requestChppXmlRaw, type StoredHattrickTokens } from "@/lib/hattrickApi";
import { parseArenaDetailsXml, type RealArenaCapacity } from "@/lib/arena";
import { resolveRealCurrencyLabel } from "@/lib/worldCurrency";

async function resolveArenaData(
  tokens: StoredHattrickTokens,
): Promise<{ data: RealArenaCapacity | null; error: string | null }> {
  try {
    const raw = await requestChppXmlRaw("arenadetails", {}, tokens);
    if (raw.httpStatus < 200 || raw.httpStatus >= 300) {
      throw new Error(`HTTP ${raw.httpStatus}: ${raw.rawXml.slice(0, 200)}`);
    }
    return { data: parseArenaDetailsXml(raw.rawXml), error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    return { data: null, error: `Стадион (arenadetails): ${message}` };
  }
}

export default async function StadiumPage() {
  const tokens = await getRequiredHattrickTokens();

  const [{ data, error }, { label: currencyLabel }] = await Promise.all([
    resolveArenaData(tokens),
    resolveRealCurrencyLabel(tokens),
  ]);

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className={`container ${styles.stack}`} style={{ paddingBottom: 72 }}>
          {error && <DemoModeBanner title="Не удалось загрузить реальный стадион" reasons={[error]} />}
          {data && (
            <StadiumSection arenaName={data.arenaName} realCapacity={data} currencyLabel={currencyLabel ?? undefined} />
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
