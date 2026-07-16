import type { RealTransferListing } from "@/lib/transferMarket";
import styles from "./Transfers.module.css";

function formatMoney(value: number): string {
  return `${value.toLocaleString("ru-RU")} ₸`;
}

// Раньше здесь была полностью выдуманная интерактивная демо-версия (ставки,
// листинги, рынок игроков) — не привязанная ни к каким реальным данным.
// Теперь: реальная попытка получить листинги команды (см.
// src/lib/transferMarket.ts); если не удалось — честная заглушка без
// технических деталей ошибки (см. src/app/dashboard/transfers/page.tsx).
export default function TransfersSection({
  listings,
  unavailable,
}: {
  listings: RealTransferListing[] | null;
  unavailable: boolean;
}) {
  if (unavailable) {
    return (
      <div className={styles.card}>
        <div className={styles.cardTitle}>Трансферы</div>
        <p className={styles.hint} style={{ marginBottom: 0 }}>
          Мы дорабатываем подключение к трансферному рынку Hattrick — раздел скоро станет доступен.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>Мои трансферы</div>
      <div className={styles.gridWrap}>
        <table className={styles.grid}>
          <thead>
            <tr>
              <th>Игрок</th>
              <th style={{ textAlign: "right" }}>Стартовая цена</th>
              <th style={{ textAlign: "right" }}>Текущая ставка</th>
              <th style={{ textAlign: "right" }}>Ставок</th>
              <th>Срок</th>
            </tr>
          </thead>
          <tbody>
            {(listings ?? []).map((l) => (
              <tr key={l.playerId}>
                <td className={styles.nameCell}>{l.playerName}</td>
                <td className={styles.numCell}>{formatMoney(l.askingPrice)}</td>
                <td className={styles.numCell}>{formatMoney(l.currentBid)}</td>
                <td className={styles.numCell}>{l.bidCount}</td>
                <td>{l.deadline}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(listings?.length ?? 0) === 0 && (
          <div className={styles.emptyState}>Сейчас нет игроков, выставленных на трансфер</div>
        )}
      </div>
    </div>
  );
}
