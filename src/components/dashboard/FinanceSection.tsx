import { defaultCurrency } from "@/data/dashboard";
import type { FinanceWeekData } from "@/lib/economy";
import styles from "./Dashboard.module.css";

interface Line {
  label: string;
  amount: number;
}

function incomeLines(data: FinanceWeekData): Line[] {
  return [
    { label: "Зрители", amount: data.income.spectators },
    { label: "Спонсоры", amount: data.income.sponsors },
    { label: "Комиссионные", amount: data.income.commission },
    { label: "Разовый", amount: data.income.temporary },
  ];
}

// "Проценты" — единственная строка, которая не показывается всегда: она
// применима только когда у команды есть непогашенный кредит. Явного поля
// "есть ли долг" CHPP не даёт, поэтому используем сам факт ненулевых
// процентов как признак долга — если проценты за неделю равны 0, строку
// просто не показываем (per user: "можно не показывать, раз не всегда
// применима"). Решается отдельно для каждой недели (this/last), а не только
// для "прошлой" — экономически проценты могут начисляться в любую неделю.
function expenseLines(data: FinanceWeekData): Line[] {
  const { players, arena, staff, youth, interest, temporary } = data.expense;
  const lines: Line[] = [
    { label: "Зарплата", amount: players },
    { label: "Содержание стадиона", amount: arena },
    { label: "Персонал", amount: staff },
    { label: "Затраты на молодёжь", amount: youth },
  ];
  if (interest !== 0) lines.push({ label: "Проценты", amount: interest });
  lines.push({ label: "Разовый", amount: temporary });
  return lines;
}

// Все статьи (кроме условных "Проценты", уже отфильтрованных в
// expenseLines) показываются всегда, даже при нулевой сумме — это реальный
// финансовый отчёт, и отсутствие строки не должно читаться как "нет данных".
function formatSignedAmount(amount: number, sign: "+" | "−", formatMoney: (value: number) => string): string {
  return amount === 0 ? formatMoney(0) : `${sign}${formatMoney(amount)}`;
}

function WeekBlock({
  title,
  hint,
  data,
  formatMoney,
}: {
  title: string;
  hint?: string;
  data: FinanceWeekData;
  formatMoney: (value: number) => string;
}) {
  const income = incomeLines(data);
  const expense = expenseLines(data);
  const isProfit = data.profit >= 0;

  return (
    <div>
      <div className={styles.financeGroupTitle} style={{ fontSize: 13, marginBottom: 4 }}>
        {title}
      </div>
      {hint && (
        <p className={styles.financeSummaryHint} style={{ marginTop: 0, marginBottom: 14 }}>
          {hint}
        </p>
      )}
      <div className={styles.financeTables}>
        <div>
          <div className={styles.financeGroupTitle}>Доход</div>
          {income.map((line) => (
            <div className={styles.financeRow} key={line.label}>
              <span className={styles.financeRowLabel}>{line.label}</span>
              <span className={styles.financeRowValue}>{formatSignedAmount(line.amount, "+", formatMoney)}</span>
            </div>
          ))}
        </div>
        <div>
          <div className={styles.financeGroupTitle}>Расход</div>
          {expense.map((line) => (
            <div className={styles.financeRow} key={line.label}>
              <span className={styles.financeRowLabel}>{line.label}</span>
              <span className={styles.financeRowValue}>{formatSignedAmount(line.amount, "−", formatMoney)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.financeTotalRow}>
        <span>Общий доход</span>
        <span className={styles.financeIncomeValue}>+{formatMoney(data.incomeSum)}</span>
      </div>
      <div className={styles.financeTotalRow}>
        <span>Общий расход</span>
        <span className={styles.financeExpenseValue}>−{formatMoney(data.expenseSum)}</span>
      </div>
      <div className={styles.financeTotalRow}>
        <span>{isProfit ? "Прибыль" : "Убытки"}</span>
        <span className={isProfit ? styles.financeIncomeValue : styles.financeExpenseValue}>
          {isProfit ? "+" : "−"}
          {formatMoney(Math.abs(data.profit))}
        </span>
      </div>
    </div>
  );
}

export default function FinanceSection({
  cash,
  expectedCash,
  thisWeek,
  lastWeek,
  currencyLabel,
}: {
  cash: number;
  expectedCash?: number;
  thisWeek: FinanceWeekData;
  lastWeek: FinanceWeekData;
  currencyLabel?: string;
}) {
  const currency = currencyLabel ?? defaultCurrency.label;
  const formatMoney = (value: number) => `${value.toLocaleString("ru-RU")} ${currency}`;

  return (
    <div className={styles.card}>
      <div className={styles.balanceLabel}>Доступные средства</div>
      <div className={styles.balanceValue}>{formatMoney(cash)}</div>
      {expectedCash !== undefined && (
        <p className={styles.financeSummaryHint} style={{ marginTop: 4 }}>
          Ожидается на следующей неделе: {formatMoney(expectedCash)}
        </p>
      )}

      <div style={{ marginTop: 28 }}>
        <WeekBlock title="На этой неделе" hint="План — неделя ещё не завершилась" data={thisWeek} formatMoney={formatMoney} />
      </div>

      <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid var(--color-border)" }}>
        <WeekBlock title="На прошлой неделе" hint="Факт — завершившаяся неделя" data={lastWeek} formatMoney={formatMoney} />
      </div>
    </div>
  );
}
