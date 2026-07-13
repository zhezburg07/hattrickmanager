import { describeChppErrorCode } from "@/lib/chppErrorCodes";
import styles from "./Overview.module.css";

export interface ChppDebugEntry {
  file: string;
  tokenPreview: string;
  httpStatus: number | null;
  chppErrorCode: number | null;
  rawXmlSnippet: string;
  networkError?: string;
}

// ВРЕМЕННАЯ отладочная панель — показывает сырой ответ Hattrick по каждому
// запрошенному файлу CHPP: какой токен реально ушёл в запрос, какой был
// HTTP-статус, какой код ошибки вернул сам CHPP (если вернул) и начало
// самого XML-ответа. Нужна, чтобы найти, где именно ломается цепочка
// "получили токен → запросили данные → показали на странице". Уберите этот
// компонент и его использование в dashboard/page.tsx, когда причина найдена.
export default function ChppDebugPanel({ entries }: { entries: ChppDebugEntry[] }) {
  return (
    <div className={styles.debugPanel}>
      <div className={styles.debugPanelTitle}>⚠ Временная отладка CHPP-запросов (удалить после диагностики)</div>
      {entries.map((entry) => (
        <details key={entry.file} className={styles.debugEntry} open>
          <summary className={styles.debugSummary}>
            <b>{entry.file}</b>
            {" — "}
            {entry.networkError
              ? `сетевая ошибка: ${entry.networkError}`
              : entry.httpStatus === null
                ? "не выполнялся"
                : `HTTP ${entry.httpStatus}`}
            {entry.chppErrorCode !== null && ` · код CHPP: ${describeChppErrorCode(entry.chppErrorCode)}`}
          </summary>
          <div className={styles.debugBody}>
            <div>
              Токен, отправленный в этом запросе: <code>{entry.tokenPreview}</code>
            </div>
            <div className={styles.debugLabel}>Сырой ответ (начало):</div>
            <pre className={styles.debugRaw}>{entry.rawXmlSnippet || "(пусто)"}</pre>
          </div>
        </details>
      ))}
    </div>
  );
}
