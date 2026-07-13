import { stadiumSectors, defaultCurrency, type StadiumSector } from "@/data/dashboard";
import type { RealArenaCapacity } from "@/lib/arena";
import styles from "./Dashboard.module.css";

// CHPP отдаёт реальное число мест по категориям (arenadetails.xml), но не
// доход/содержание за место — эти ставки остаются ориентировочными
// (те же значения, что и в тестовых данных), только количество мест реальное.
function mergeRealCapacity(real: RealArenaCapacity): StadiumSector[] {
  const seatsByKey: Record<string, number> = {
    terraces: real.terraces,
    basic: real.basic,
    roofed: real.roof,
    vip: real.vip,
  };
  return stadiumSectors.map((s) => ({ ...s, seats: seatsByKey[s.key] ?? s.seats }));
}

export default function StadiumSection({
  arenaName,
  realCapacity,
  currencyLabel,
}: {
  arenaName?: string;
  realCapacity?: RealArenaCapacity;
  currencyLabel?: string;
} = {}) {
  const currency = currencyLabel ?? defaultCurrency.label;
  const formatMoney = (value: number) => `${value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} ${currency}`;

  const sectors = realCapacity ? mergeRealCapacity(realCapacity) : stadiumSectors;
  const totalCapacity = sectors.reduce((sum, s) => sum + s.seats, 0);
  const totalMatchIncome = sectors.reduce((sum, s) => sum + s.seats * s.incomePerSeat, 0);
  const totalWeeklyUpkeep = sectors.reduce((sum, s) => sum + s.seats * s.upkeepPerSeat, 0);

  return (
    <div className={styles.card}>
      <div className={styles.statsHeaderRow}>
        <div className={styles.cardTitle} style={{ margin: 0 }}>
          Стадион{arenaName ? ` «${arenaName}»` : ""}
        </div>
        <span className={styles.statsFillCount}>
          Вместимость <b>{totalCapacity.toLocaleString("ru-RU")}</b> мест
        </span>
      </div>
      {realCapacity && (
        <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "0 0 12px" }}>
          Число мест по категориям реальное. Доход и содержание за место CHPP не сообщает — здесь ориентировочные
          ставки.
        </p>
      )}

      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Категория</th>
              <th style={{ textAlign: "right" }}>Мест</th>
              <th style={{ textAlign: "right" }}>Доход / место</th>
              <th style={{ textAlign: "right" }}>Содержание / место в нед.</th>
            </tr>
          </thead>
          <tbody>
            {sectors.map((sector) => (
              <tr key={sector.key}>
                <td className={styles.teamCell}>{sector.label}</td>
                <td className={styles.numCell}>{sector.seats.toLocaleString("ru-RU")}</td>
                <td className={styles.numCell}>{formatMoney(sector.incomePerSeat)}</td>
                <td className={styles.numCell}>{formatMoney(sector.upkeepPerSeat)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.stadiumTotals}>
        <div>
          <div className={styles.balanceLabel}>Доход за домашний матч (полный стадион)</div>
          <div className={styles.financeIncomeValue} style={{ fontSize: 20 }}>
            +{formatMoney(totalMatchIncome)}
          </div>
        </div>
        <div>
          <div className={styles.balanceLabel}>Содержание за неделю</div>
          <div className={styles.financeExpenseValue} style={{ fontSize: 20 }}>
            −{formatMoney(totalWeeklyUpkeep)}
          </div>
        </div>
      </div>

      <button type="button" className="btnPrimary" disabled title="Реконструкция появится позже">
        Улучшить стадион
      </button>
    </div>
  );
}
