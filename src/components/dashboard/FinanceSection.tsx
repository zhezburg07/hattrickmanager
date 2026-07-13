import { finance, defaultCurrency, type FinanceLine } from "@/data/dashboard";
import styles from "./Dashboard.module.css";

export default function FinanceSection({
  balance,
  income,
  expense,
  totalIncome: totalIncomeProp,
  totalExpense: totalExpenseProp,
  currencyLabel,
}: {
  balance?: number;
  income?: FinanceLine[];
  expense?: FinanceLine[];
  // CHPP не разбивает доход/расход на статьи без остатка — official-тотал
  // (LastIncomeSum/LastCostsSum) может не совпадать с суммой видимых строк
  // (Hattrick не раскрывает часть категорий через API). Поэтому в реальном
  // режиме итог передаётся отдельно, а не считается по строкам.
  totalIncome?: number;
  totalExpense?: number;
  currencyLabel?: string;
} = {}) {
  const currency = currencyLabel ?? defaultCurrency.label;
  const formatMoney = (value: number) => `${value.toLocaleString("ru-RU")} ${currency}`;

  // В реальных данных нулевые статьи (например, "Финансовые операции" за
  // неделю без займов/процентов) просто скрываем — показывать их незачем.
  const incomeLines = (income ?? finance.income).filter((l) => l.amount !== 0);
  const expenseLines = (expense ?? finance.expense).filter((l) => l.amount !== 0);
  const balanceValue = balance ?? finance.balance;
  const totalIncome = totalIncomeProp ?? incomeLines.reduce((sum, line) => sum + line.amount, 0);
  const totalExpense = totalExpenseProp ?? expenseLines.reduce((sum, line) => sum + line.amount, 0);

  return (
    <div className={styles.card}>
      <div className={styles.balanceLabel}>Доступные средства</div>
      <div className={styles.balanceValue}>{formatMoney(balanceValue)}</div>

      <div className={styles.financeTables}>
        <div>
          <div className={styles.financeGroupTitle}>Доход за неделю</div>
          {incomeLines.map((line) => (
            <div className={styles.financeRow} key={line.label}>
              <span className={styles.financeRowLabel}>{line.label}</span>
              <span className={styles.financeRowValue}>+{formatMoney(line.amount)}</span>
            </div>
          ))}
          <div className={styles.financeTotalRow}>
            <span>Общий доход</span>
            <span className={styles.financeIncomeValue}>+{formatMoney(totalIncome)}</span>
          </div>
        </div>

        <div>
          <div className={styles.financeGroupTitle}>Расход за неделю</div>
          {expenseLines.map((line) => (
            <div className={styles.financeRow} key={line.label}>
              <span className={styles.financeRowLabel}>{line.label}</span>
              <span className={styles.financeRowValue}>−{formatMoney(line.amount)}</span>
            </div>
          ))}
          <div className={styles.financeTotalRow}>
            <span>Общий расход</span>
            <span className={styles.financeExpenseValue}>−{formatMoney(totalExpense)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
