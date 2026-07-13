import Link from "next/link";
import { defaultCurrency } from "@/data/dashboard";
import styles from "./Overview.module.css";

export default function FinanceSummary({
  balance,
  totalIncome,
  totalExpense,
  currencyLabel,
}: {
  balance: number;
  totalIncome: number;
  totalExpense: number;
  currencyLabel?: string;
}) {
  const currency = currencyLabel ?? defaultCurrency.label;
  const formatMoney = (value: number) => `${value.toLocaleString("ru-RU")} ${currency}`;

  return (
    <div className={styles.panel}>
      <div className={styles.panelTitle}>Финансы</div>
      <div className={styles.financeList}>
        <div className={styles.rowListItem}>
          <span>Доступные средства</span>
          <span className={styles.financeBalance}>{formatMoney(balance)}</span>
        </div>
        <div className={styles.rowListItem}>
          <span>Доход за неделю</span>
          <span className={styles.financeIncome}>+{formatMoney(totalIncome)}</span>
        </div>
        <div className={styles.rowListItem}>
          <span>Расход за неделю</span>
          <span className={styles.financeExpense}>−{formatMoney(totalExpense)}</span>
        </div>
      </div>
      <Link href="/dashboard/finance" className={styles.panelLink}>
        Подробный отчёт →
      </Link>
    </div>
  );
}
