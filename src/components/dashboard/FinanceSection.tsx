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
    { label: "Проданные игроки", amount: data.income.soldPlayers },
    { label: "Комиссионные", amount: data.income.commission },
    { label: "Разовый", amount: data.income.other },
  ];
}

// Реальный отчёт Hattrick показывает строку "Проценты" отдельно только у уже
// завершившейся ("прошлой") недели — на текущей неделе showInterestSeparately
// решает, куда девать эту сумму: отдельной строкой или внутри остатка
// "Разовый", чтобы сумма показанных строк всегда совпадала с итогом.
function expenseLines(data: FinanceWeekData, showInterestSeparately: boolean): Line[] {
  const { players, arena, arenaBuilding, staff, youth, boughtPlayers, interest, other } = data.expense;
  return [
    { label: "Зарплата", amount: players },
    { label: "Содержание стадиона", amount: arena },
    { label: "Строительство стадиона", amount: arenaBuilding },
    { label: "Персонал", amount: staff },
    { label: "Затраты на молодёжь", amount: youth },
    { label: "Купленные игроки*", amount: boughtPlayers },
    ...(showInterestSeparately ? [{ label: "Проценты", amount: interest }] : []),
    { label: "Разовый", amount: showInterestSeparately ? other : other + interest },
  ];
}

function WeekBlock({
  title,
  data,
  showInterestSeparately,
  cashAtEnd,
  formatMoney,
}: {
  title: string;
  data: FinanceWeekData;
  showInterestSeparately: boolean;
  cashAtEnd?: number;
  formatMoney: (value: number) => string;
}) {
  const income = incomeLines(data).filter((l) => l.amount !== 0);
  const expense = expenseLines(data, showInterestSeparately).filter((l) => l.amount !== 0);
  const profit = data.incomeSum - data.expenseSum;
  const isProfit = profit >= 0;

  return (
    <div>
      <div className={styles.financeGroupTitle} style={{ fontSize: 13, marginBottom: 14 }}>
        {title}
      </div>
      <div className={styles.financeTables}>
        <div>
          <div className={styles.financeGroupTitle}>Доход</div>
          {income.map((line) => (
            <div className={styles.financeRow} key={line.label}>
              <span className={styles.financeRowLabel}>{line.label}</span>
              <span className={styles.financeRowValue}>+{formatMoney(line.amount)}</span>
            </div>
          ))}
        </div>
        <div>
          <div className={styles.financeGroupTitle}>Расход</div>
          {expense.map((line) => (
            <div className={styles.financeRow} key={line.label}>
              <span className={styles.financeRowLabel}>{line.label}</span>
              <span className={styles.financeRowValue}>−{formatMoney(line.amount)}</span>
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
        <span>{isProfit ? "Ожидаемая прибыль" : "Ожидаемые убытки"}</span>
        <span className={isProfit ? styles.financeIncomeValue : styles.financeExpenseValue}>
          {isProfit ? "+" : "−"}
          {formatMoney(Math.abs(profit))}
        </span>
      </div>
      {cashAtEnd !== undefined && (
        <div className={styles.financeTotalRow}>
          <span>Наличность на конец недели</span>
          <span>{formatMoney(cashAtEnd)}</span>
        </div>
      )}
    </div>
  );
}

export default function FinanceSection({
  cash,
  thisWeek,
  lastWeek,
  currencyLabel,
}: {
  cash: number;
  thisWeek: FinanceWeekData;
  lastWeek: FinanceWeekData | null;
  currencyLabel?: string;
}) {
  const currency = currencyLabel ?? defaultCurrency.label;
  const formatMoney = (value: number) => `${value.toLocaleString("ru-RU")} ${currency}`;

  return (
    <div className={styles.card}>
      <div className={styles.balanceLabel}>Доступные средства</div>
      <div className={styles.balanceValue}>{formatMoney(cash)}</div>

      <div style={{ marginTop: 28 }}>
        <WeekBlock title="На этой неделе" data={thisWeek} showInterestSeparately={false} formatMoney={formatMoney} />
      </div>

      <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid var(--color-border)" }}>
        {lastWeek ? (
          <WeekBlock
            title="На прошлой неделе"
            data={lastWeek}
            showInterestSeparately
            cashAtEnd={lastWeek.cash}
            formatMoney={formatMoney}
          />
        ) : (
          <>
            <div className={styles.financeGroupTitle} style={{ fontSize: 13, marginBottom: 8 }}>
              На прошлой неделе
            </div>
            <p className={styles.financeSummaryHint}>
              Пока недостаточно данных для сравнения — загляните на эту вкладку через неделю.
            </p>
          </>
        )}
      </div>

      <p className={styles.financeSummaryHint} style={{ marginTop: 20 }}>
        * «Купленные игроки» также включает зарплату игрока за первую неделю в клубе, так как она является частью
        трансферной сделки.
      </p>
    </div>
  );
}
