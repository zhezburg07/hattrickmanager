import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FinanceSection from "@/components/dashboard/FinanceSection";
import DemoModeBanner from "@/components/dashboard/DemoModeBanner";
import styles from "@/components/dashboard/Dashboard.module.css";
import {
  getRequiredHattrickTokens,
  getStoredHattrickUserId,
  requestChppXmlRaw,
  type StoredHattrickTokens,
} from "@/lib/hattrickApi";
import { parseEconomyXml, type RealEconomy } from "@/lib/economy";
import { resolveRealCurrencyLabel } from "@/lib/worldCurrency";
import { resolveLastWeekFinance } from "@/lib/financeHistoryDb";

// Названия полей в src/lib/economy.ts сверены с реальным ответом на живом
// аккаунте — диагностика сырых полей <Team> больше не нужна на экране.
// Поставьте true, если снова понадобится свериться с CHPP (например, если
// Hattrick изменит схему economy.xml).
const SHOW_ECONOMY_DEBUG = false;

async function resolveEconomy(
  tokens: StoredHattrickTokens,
): Promise<{ data: RealEconomy | null; error: string | null }> {
  try {
    const raw = await requestChppXmlRaw("economy", {}, tokens);
    if (raw.httpStatus < 200 || raw.httpStatus >= 300) {
      throw new Error(`HTTP ${raw.httpStatus}: ${raw.rawXml.slice(0, 200)}`);
    }
    return { data: parseEconomyXml(raw.rawXml), error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    return { data: null, error: `Финансы (economy): ${message}` };
  }
}

export default async function FinancePage() {
  const tokens = await getRequiredHattrickTokens();
  const hattrickUserId = getStoredHattrickUserId();

  const [{ data: economy, error }, { label: currencyLabel }] = await Promise.all([
    resolveEconomy(tokens),
    resolveRealCurrencyLabel(tokens),
  ]);

  const lastWeek = economy ? await resolveLastWeekFinance(hattrickUserId, economy.thisWeek) : null;

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className={`container ${styles.stack}`} style={{ paddingBottom: 72 }}>
          {error && <DemoModeBanner title="Не удалось загрузить реальные финансы" reasons={[error]} />}
          {economy && (
            <FinanceSection
              cash={economy.cash}
              thisWeek={economy.thisWeek}
              lastWeek={lastWeek}
              currencyLabel={currencyLabel ?? undefined}
            />
          )}
          {SHOW_ECONOMY_DEBUG && economy && (
            <div className={styles.card}>
              <div className={styles.balanceLabel}>Диагностика: сырые поля economy.xml → Team</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 8, fontSize: 12.5 }}>
                {Object.entries(economy.rawTeamFields).map(([key, value]) => (
                  <div key={key} style={{ display: "flex", gap: 10 }}>
                    <span style={{ color: "var(--color-text-muted)", minWidth: 220 }}>{key}</span>
                    <span>{typeof value === "object" ? JSON.stringify(value) : String(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
