import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FinanceSection from "@/components/dashboard/FinanceSection";
import DemoModeBanner from "@/components/dashboard/DemoModeBanner";
import styles from "@/components/dashboard/Dashboard.module.css";
import { getRequiredHattrickTokens, requestChppXmlRaw, type StoredHattrickTokens } from "@/lib/hattrickApi";
import { parseEconomyXml, type RealFinanceLine } from "@/lib/economy";
import { resolveRealCurrencyLabel } from "@/lib/worldCurrency";

interface RealFinanceData {
  balance: number;
  income: RealFinanceLine[];
  expense: RealFinanceLine[];
  totalIncome: number;
  totalExpense: number;
}

async function resolveFinanceData(
  tokens: StoredHattrickTokens,
): Promise<{ data: RealFinanceData | null; error: string | null }> {
  try {
    const raw = await requestChppXmlRaw("economy", {}, tokens);
    if (raw.httpStatus < 200 || raw.httpStatus >= 300) {
      throw new Error(`HTTP ${raw.httpStatus}: ${raw.rawXml.slice(0, 200)}`);
    }
    const economy = parseEconomyXml(raw.rawXml);
    return {
      data: {
        balance: economy.cash,
        income: economy.incomeBreakdown,
        expense: economy.expenseBreakdown,
        totalIncome: economy.lastWeekIncome,
        totalExpense: economy.lastWeekExpense,
      },
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    return { data: null, error: `Финансы (economy): ${message}` };
  }
}

export default async function FinancePage() {
  const tokens = getRequiredHattrickTokens();

  const [{ data, error }, { label: currencyLabel }] = await Promise.all([
    resolveFinanceData(tokens),
    resolveRealCurrencyLabel(tokens),
  ]);

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className={`container ${styles.stack}`} style={{ paddingBottom: 72 }}>
          {error && <DemoModeBanner title="Не удалось загрузить реальные финансы" reasons={[error]} />}
          {data && (
            <FinanceSection
              balance={data.balance}
              income={data.income}
              expense={data.expense}
              totalIncome={data.totalIncome}
              totalExpense={data.totalExpense}
              currencyLabel={currencyLabel ?? undefined}
            />
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
