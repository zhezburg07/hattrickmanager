import type { TransferHistoryResult } from "@/lib/transferMarket";
import TransferSearchPanel from "./TransferSearchPanel";
import styles from "./Transfers.module.css";

function formatLocal(value: number): string {
  return `${value.toLocaleString("ru-RU")} ₸`;
}

function formatSek(value: number): string {
  return `${value.toLocaleString("ru-RU")} kr`;
}

// Реальная история трансферов команды (transfersteam.xml) — раньше здесь
// запрашивался несуществующий файл "transfers" (см. src/lib/transferMarket.ts).
// CHPP не даёт отдельного файла "что сейчас выставлено этой командой на
// продажу" — только завершённую историю купли/продажи, поэтому вкладка
// показывает именно её, плюс реальный поиск по рынку (см.
// TransferSearchPanel.tsx).
export default function TransfersSection({
  history,
  historyError,
}: {
  history: TransferHistoryResult | null;
  historyError: string | null;
}) {
  return (
    <>
      <div className={styles.card}>
        <div className={styles.cardHeadRow}>
          <div className={styles.cardTitle} style={{ margin: 0 }}>
            История трансферов{history?.teamName ? ` — ${history.teamName}` : ""}
          </div>
        </div>

        {historyError ? (
          <p className={styles.hint} style={{ marginBottom: 0 }}>
            {historyError}
          </p>
        ) : (
          history && (
            <>
              <div className={styles.formRow} style={{ marginBottom: 16 }}>
                <div>
                  <div className={styles.formLabel}>Куплено игроков</div>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>{history.numberOfBuys}</div>
                </div>
                <div>
                  <div className={styles.formLabel}>Продано игроков</div>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>{history.numberOfSales}</div>
                </div>
                <div>
                  <div className={styles.formLabel}>Потрачено всего</div>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>{formatSek(history.totalSumOfBuysSek)}</div>
                </div>
                <div>
                  <div className={styles.formLabel}>Выручено всего</div>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>{formatSek(history.totalSumOfSalesSek)}</div>
                </div>
              </div>
              <p className={styles.hint} style={{ marginTop: -8 }}>
                Итоговые суммы Hattrick всегда отдаёт в шведских кронах (kr), независимо от валюты команды — это
                официальное поведение CHPP, а не ошибка отображения. Цены отдельных трансферов ниже — в обычной
                локальной валюте.
              </p>

              <div className={styles.gridWrap}>
                <table className={styles.grid}>
                  <thead>
                    <tr>
                      <th>Игрок</th>
                      <th>Тип</th>
                      <th>Контрагент</th>
                      <th style={{ textAlign: "right" }}>TSI</th>
                      <th style={{ textAlign: "right" }}>Цена</th>
                      <th>Дата</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.transfers.map((t) => (
                      <tr key={t.transferId}>
                        <td className={styles.nameCell}>{t.playerName}</td>
                        <td style={{ color: t.transferType === "sale" ? "var(--color-good)" : "var(--color-accent)" }}>
                          {t.transferType === "sale" ? "Продажа" : "Покупка"}
                        </td>
                        <td>{t.counterpartTeamName || "—"}</td>
                        <td className={styles.numCell}>{t.tsi.toLocaleString("ru-RU")}</td>
                        <td className={styles.numCell}>{formatLocal(t.price)}</td>
                        <td>{t.deadline}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {history.transfers.length === 0 && (
                  <div className={styles.emptyState}>Трансферная история этой команды пока пуста</div>
                )}
              </div>
            </>
          )
        )}
      </div>

      <div style={{ marginTop: 20 }}>
        <TransferSearchPanel />
      </div>
    </>
  );
}
