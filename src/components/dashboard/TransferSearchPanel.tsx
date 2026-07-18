"use client";

import { Fragment, useState } from "react";
import styles from "./Transfers.module.css";

interface TransferSearchResultEntry {
  playerId: number;
  name: string;
  age: number;
  tsi: number;
  askingPrice: number;
  deadline: string;
  highestBid: number;
  bidderTeamName: string;
  sellerTeamName: string;
}

interface TransferSearchResponse {
  itemCount: number;
  pageSize: number;
  pageIndex: number;
  results: TransferSearchResultEntry[];
}

interface PlayerTransferHistoryEntry {
  transferId: string;
  deadline: string;
  buyerTeamName: string;
  sellerTeamName: string;
  price: number;
  tsi: number;
}

const skillOptions = [
  { value: 1, label: "Вратарское мастерство" },
  { value: 2, label: "Выносливость" },
  { value: 3, label: "Стандарты" },
  { value: 4, label: "Защита" },
  { value: 5, label: "Нападение" },
  { value: 6, label: "Игра на фланге" },
  { value: 7, label: "Пас" },
  { value: 8, label: "Плеймейкинг" },
  { value: 10, label: "Лидерство" },
  { value: 11, label: "Опыт" },
];

function formatMoney(value: number): string {
  return `${value.toLocaleString("ru-RU")} kr`;
}

// Реальный поиск по трансферному рынку (transfersearch.xml) — CHPP требует
// обязательные фильтры (возраст + один основной навык с диапазоном), поэтому
// это форма, а не пассивный список: без формы CHPP просто не примет запрос.
// Раскрытие строки игрока подгружает его личную историю трансферов
// (transfersplayer.xml) отдельным запросом "по требованию".
export default function TransferSearchPanel() {
  const [ageMin, setAgeMin] = useState(18);
  const [ageMax, setAgeMax] = useState(32);
  const [skillType, setSkillType] = useState(5);
  const [skillMin, setSkillMin] = useState(1);
  const [skillMax, setSkillMax] = useState(20);

  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [data, setData] = useState<TransferSearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<PlayerTransferHistoryEntry[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  async function runSearch() {
    setLoading(true);
    setSearched(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        ageMin: String(ageMin),
        ageMax: String(ageMax),
        skillType: String(skillType),
        skillMin: String(skillMin),
        skillMax: String(skillMax),
      });
      const res = await fetch(`/api/dashboard/transfer-search?${params.toString()}`);
      const json = await res.json();
      if (json.error) {
        setData(null);
        setError(json.error);
      } else {
        setData(json.data);
        setError(json.error ?? null);
      }
    } catch {
      setData(null);
      setError("Не удалось выполнить поиск");
    } finally {
      setLoading(false);
    }
  }

  async function toggleHistory(playerId: number) {
    if (expandedId === playerId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(playerId);
    setHistoryEntries(null);
    setHistoryError(null);
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/dashboard/transfer-player-history?playerId=${playerId}`);
      const json = await res.json();
      if (json.error) {
        setHistoryError(json.error);
      } else {
        setHistoryEntries(json.entries ?? []);
      }
    } catch {
      setHistoryError("Не удалось загрузить историю игрока");
    } finally {
      setHistoryLoading(false);
    }
  }

  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>Поиск по рынку трансферов</div>
      <p className={styles.hint}>
        Hattrick требует указать возраст и один основной навык с диапазоном — без этих фильтров рынок не отдаёт
        результаты (transfersearch.xml).
      </p>

      <div className={styles.formBox}>
        <div className={styles.formRow}>
          <div className={styles.formField}>
            <label className={styles.formLabel}>Возраст от</label>
            <input
              type="number"
              className={styles.formInput}
              value={ageMin}
              min={16}
              max={50}
              onChange={(e) => setAgeMin(Number(e.target.value))}
            />
          </div>
          <div className={styles.formField}>
            <label className={styles.formLabel}>Возраст до</label>
            <input
              type="number"
              className={styles.formInput}
              value={ageMax}
              min={16}
              max={50}
              onChange={(e) => setAgeMax(Number(e.target.value))}
            />
          </div>
          <div className={styles.formField}>
            <label className={styles.formLabel}>Навык</label>
            <select className={styles.formSelect} value={skillType} onChange={(e) => setSkillType(Number(e.target.value))}>
              {skillOptions.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.formField}>
            <label className={styles.formLabel}>Уровень от</label>
            <input
              type="number"
              className={styles.formInput}
              value={skillMin}
              min={0}
              max={20}
              onChange={(e) => setSkillMin(Number(e.target.value))}
            />
          </div>
          <div className={styles.formField}>
            <label className={styles.formLabel}>Уровень до</label>
            <input
              type="number"
              className={styles.formInput}
              value={skillMax}
              min={0}
              max={20}
              onChange={(e) => setSkillMax(Number(e.target.value))}
            />
          </div>
        </div>
        <div className={styles.formActions}>
          <button type="button" className="btnPrimary" onClick={runSearch} disabled={loading}>
            {loading ? "Ищем…" : "Искать"}
          </button>
        </div>
      </div>

      {error && (
        <p className={styles.hint} style={{ color: "var(--color-bad)" }}>
          {error}
        </p>
      )}

      {!error && searched && !loading && data && (
        <>
          <p className={styles.hint}>
            Найдено (всего по рынку): {data.itemCount < 0 ? "больше 100" : data.itemCount}, показана страница{" "}
            {data.pageIndex + 1}
          </p>
          <div className={styles.gridWrap}>
            <table className={styles.grid}>
              <thead>
                <tr>
                  <th>Игрок</th>
                  <th style={{ textAlign: "right" }}>Возраст</th>
                  <th style={{ textAlign: "right" }}>TSI</th>
                  <th style={{ textAlign: "right" }}>Стартовая цена</th>
                  <th style={{ textAlign: "right" }}>Текущая ставка</th>
                  <th>Кто ведёт</th>
                  <th>Продавец</th>
                  <th>Срок</th>
                  <th>История</th>
                </tr>
              </thead>
              <tbody>
                {data.results.map((r) => (
                  <Fragment key={r.playerId}>
                    <tr>
                      <td className={styles.nameCell}>{r.name}</td>
                      <td className={styles.numCell}>{r.age}</td>
                      <td className={styles.numCell}>{r.tsi.toLocaleString("ru-RU")}</td>
                      <td className={styles.numCell}>{formatMoney(r.askingPrice)}</td>
                      <td className={styles.numCell}>{r.highestBid > 0 ? formatMoney(r.highestBid) : "—"}</td>
                      <td>{r.bidderTeamName || "—"}</td>
                      <td>{r.sellerTeamName || "—"}</td>
                      <td>{r.deadline}</td>
                      <td className={styles.actionCell}>
                        <button type="button" className={styles.rowBtn} onClick={() => toggleHistory(r.playerId)}>
                          {expandedId === r.playerId ? "Скрыть" : "Показать"}
                        </button>
                      </td>
                    </tr>
                    {expandedId === r.playerId && (
                      <tr>
                        <td colSpan={9} style={{ background: "var(--color-bg-darker)" }}>
                          {historyLoading && <span className={styles.hint}>Загрузка истории…</span>}
                          {!historyLoading && historyError && <span className={styles.hint}>{historyError}</span>}
                          {!historyLoading &&
                            !historyError &&
                            historyEntries &&
                            (historyEntries.length === 0 ? (
                              <span className={styles.hint}>Трансферная история этого игрока пуста.</span>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "6px 0" }}>
                                {historyEntries.map((h) => (
                                  <div key={h.transferId} style={{ fontSize: 11 }}>
                                    {h.deadline}: {h.sellerTeamName} → {h.buyerTeamName}, {formatMoney(h.price)} (TSI{" "}
                                    {h.tsi.toLocaleString("ru-RU")})
                                  </div>
                                ))}
                              </div>
                            ))}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
            {data.results.length === 0 && (
              <div className={styles.emptyState}>По этим фильтрам сейчас никто не выставлен на трансфер</div>
            )}
          </div>
        </>
      )}

      <p className={styles.feeNote} style={{ marginTop: 16 }}>
        Цены — в локальной валюте команды-продавца (как и другие суммы CHPP); история конкретного игрока показывает
        цены в шведских кронах (kr) — так их отдаёт сам Hattrick.
      </p>
    </div>
  );
}
