import Link from "next/link";
import styles from "./Overview.module.css";

// В демо-режиме показываем деление "в основе/в запасе" (это собственная
// тактическая раскладка приложения). В реальном режиме CHPP такого деления
// на уровне ростера не даёт — это тактическое решение по конкретному матчу,
// а не свойство самого игрока, — поэтому третий вариант там просто не
// передаётся, и строка не рендерится.
export default function SquadSummaryPanel({
  totalPlayers,
  starting,
  bench,
  injured,
  avgForm,
}: {
  totalPlayers?: number;
  starting?: number;
  bench?: number;
  injured: number;
  avgForm: string;
}) {
  return (
    <div className={styles.panel}>
      <div className={styles.panelTitle}>Состав</div>
      <div className={styles.summaryRow}>
        {starting !== undefined && (
          <span>
            В основе <b>{starting}</b>
          </span>
        )}
        {bench !== undefined && (
          <span>
            В запасе <b>{bench}</b>
          </span>
        )}
        {totalPlayers !== undefined && (
          <span>
            Всего игроков <b>{totalPlayers}</b>
          </span>
        )}
        <span>
          Травмированы <b>{injured}</b>
        </span>
      </div>
      <div className={styles.summaryRow} style={{ marginBottom: 0 }}>
        <span>
          Средняя форма команды <b>{avgForm}</b>
        </span>
      </div>
      <Link href="/dashboard/squad" className={styles.panelLink}>
        Перейти к составу →
      </Link>
    </div>
  );
}
