"use client";

import { useMemo, useState } from "react";
import type { TransferHistoryResult, TransferHistoryEntry } from "@/lib/transferMarket";
import { defaultCurrency } from "@/data/dashboard";
import styles from "./Transfers.module.css";

type FilterType = "all" | "sale" | "buy";

const filterOptions: { key: FilterType; label: string }[] = [
  { key: "all", label: "Все" },
  { key: "buy", label: "Купленные" },
  { key: "sale", label: "Проданные" },
];

// Итоговые суммы (TotalSumOfBuys/TotalSumOfSales) CHPP всегда отдаёт в
// шведских кронах независимо от валюты команды (см. transferMarket.ts) —
// это единственное такое исключение, отдельная функция намеренно НЕ
// принимает currencyLabel. Цена конкретного трансфера — обычная локальная
// валюта команды, та же currencyLabel, что уже используют Финансы/Стадион
// (см. чат "Кубки/Юношеская команда/Трансферы: диагностика" — раньше здесь
// был захардкожен символ ₸ вместо реальной синхронизированной валюты).
function formatSek(value: number): string {
  return `${value.toLocaleString("ru-RU")} kr`;
}

// Реальная история трансферов команды (transfersteam.xml) — раньше здесь
// запрашивался несуществующий файл "transfers" (см. src/lib/transferMarket.ts).
// CHPP не даёт отдельного файла "что сейчас выставлено этой командой на
// продажу" — только завершённую историю. Живой поиск по рынку (transfersearch,
// раньше TransferSearchPanel.tsx) убран целиком (см. чат "Трансферы: убрать
// поиск") — вместо него показываем ВСЮ карьерную историю сделок команды (см.
// чат "Трансферы: покажи все сделки за карьеру" — синхронизация теперь
// дозапрашивает все страницы transfersteam.xml, а не только последнюю),
// отсортированную по дате (от новых к старым), с фильтром по типу.
export default function TransfersSection({
  history,
  historyError,
  currencyLabel,
}: {
  history: TransferHistoryResult | null;
  historyError: string | null;
  currencyLabel?: string;
}) {
  const [filter, setFilter] = useState<FilterType>("all");
  const currency = currencyLabel ?? defaultCurrency.label;
  const formatLocal = (value: number) => `${value.toLocaleString("ru-RU")} ${currency}`;

  const shown: TransferHistoryEntry[] = useMemo(() => {
    if (!history) return [];
    // Снимок из chppSync.ts уже приходит отсортированным по Deadline (по
    // убыванию) — сортируем здесь ещё раз на всякий случай (дёшево, а
    // защищает от старых снимков, сохранённых до этого исправления).
    const sorted = [...history.transfers].sort((a, b) => b.deadline.localeCompare(a.deadline));
    return filter === "all" ? sorted : sorted.filter((t) => t.transferType === filter);
  }, [history, filter]);

  return (
    <div className={styles.card}>
      <div className={styles.cardHeadRow}>
        <div className={styles.cardTitle} style={{ margin: 0 }}>
          История трансферов{history?.teamName ? ` — ${history.teamName}` : ""}
          {history && history.transfers.length > 0 ? ` (${shown.length} из ${history.transfers.length})` : ""}
        </div>
      </div>

      {historyError ? (
        <p className={styles.hint} style={{ marginBottom: 0 }}>
          {historyError}
        </p>
      ) : !history ? (
        // Ни данных, ни ошибки — снимок transferHistory ещё ни разу не
        // создавался для этого аккаунта (например, аккаунт подключён до
        // того, как появился этот раздел синхронизации), а не "трансферов
        // действительно нет" (то отдельное сообщение — ниже, когда history
        // есть, но history.transfers пуст). Раньше здесь молча не
        // рендерилось вообще ничего (см. чат "Кубки/Юношеская команда/
        // Трансферы: диагностика").
        <p className={styles.hint} style={{ marginBottom: 0 }}>
          Данные ещё не загружены — нажмите «Обновить данные» на странице «Обновления».
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

            <div className={styles.viewToggle}>
              {filterOptions.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  className={`${styles.viewToggleBtn} ${filter === opt.key ? styles.viewToggleBtnActive : ""}`}
                  onClick={() => setFilter(opt.key)}
                >
                  {opt.label}
                </button>
              ))}
            </div>

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
                  {shown.map((t) => (
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
              {shown.length === 0 && (
                <div className={styles.emptyState}>
                  {history.transfers.length === 0
                    ? "Трансферная история этой команды пока пуста"
                    : "По этому фильтру трансферов не найдено"}
                </div>
              )}
            </div>
          </>
        )
      )}
    </div>
  );
}
