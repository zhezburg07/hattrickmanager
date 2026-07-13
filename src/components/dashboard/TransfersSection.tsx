"use client";

import { Fragment, useRef, useState } from "react";
import {
  squadPlayers,
  positionGroupLabel,
  positionGroupShort,
  skillLabel,
  type SquadSkills,
} from "@/data/squad";
import NationalityTag from "./NationalityTag";
import {
  myTransfers as initialMyTransfers,
  marketPlayers as initialMarketPlayers,
  recentTransfers,
  CANCEL_WINDOW_MINUTES,
  LISTING_FEE,
  type MyTransferListing,
  type MarketPlayer,
} from "@/data/transfers";
import styles from "./Transfers.module.css";

type View = "mine" | "market";
type SkillKey = keyof SquadSkills;

const skillKeys: SkillKey[] = ["goalkeeping", "defending", "midfield", "winger", "passing", "scoring", "setPieces"];

const skillShortLabel: Record<SkillKey, string> = {
  goalkeeping: "ВР",
  defending: "ЗАЩ",
  midfield: "ПЗ",
  winger: "ФЛ",
  passing: "ПАС",
  scoring: "НАП",
  setPieces: "СТ",
};

function formatTenge(value: number): string {
  return `${value.toLocaleString("ru-RU")} тенге`;
}

const playersById = new Map(squadPlayers.map((p) => [p.id, p]));

export default function TransfersSection() {
  const [view, setView] = useState<View>("mine");

  const [myList, setMyList] = useState<MyTransferListing[]>(initialMyTransfers);
  const [market, setMarket] = useState<MarketPlayer[]>(initialMarketPlayers);

  const [addOpen, setAddOpen] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [startPrice, setStartPrice] = useState("");

  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [biddingId, setBiddingId] = useState<number | null>(null);
  const [bidAmount, setBidAmount] = useState("");
  const [autoBid, setAutoBid] = useState(false);
  const [autoBidMax, setAutoBidMax] = useState("");

  function showNotice(message: string) {
    setNotice(message);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 4000);
  }

  const listedPlayerIds = new Set(myList.map((l) => l.playerId));
  const availablePlayers = squadPlayers.filter((p) => !listedPlayerIds.has(p.id));

  function handleAddListing(e: React.FormEvent) {
    e.preventDefault();
    const price = Number(startPrice);
    if (!selectedPlayerId || !price || price <= 0) return;

    const entry: MyTransferListing = {
      id: Date.now(),
      playerId: Number(selectedPlayerId),
      startPrice: price,
      currentBid: price,
      bidCount: 0,
      timeLeft: "3 дня 0 часов",
      listedMinutesAgo: 0,
    };
    setMyList((list) => [...list, entry]);
    showNotice(`Размещение на трансфер стоит ${formatTenge(LISTING_FEE)}`);
    setAddOpen(false);
    setSelectedPlayerId("");
    setStartPrice("");
  }

  function handleCancelListing(id: number) {
    setMyList((list) => list.filter((l) => l.id !== id));
  }

  function handleSubmitBid(e: React.FormEvent, player: MarketPlayer) {
    e.preventDefault();
    const amount = Number(bidAmount);
    if (!amount || amount <= player.currentPrice) return;
    setMarket((list) => list.map((p) => (p.id === player.id ? { ...p, currentPrice: amount } : p)));
    setBiddingId(null);
  }

  return (
    <>
    <div className={styles.card}>
      <div className={styles.viewToggle}>
        <button
          type="button"
          className={`${styles.viewToggleBtn} ${view === "mine" ? styles.viewToggleBtnActive : ""}`}
          onClick={() => setView("mine")}
        >
          Мои трансферы
        </button>
        <button
          type="button"
          className={`${styles.viewToggleBtn} ${view === "market" ? styles.viewToggleBtnActive : ""}`}
          onClick={() => setView("market")}
        >
          Рынок игроков
        </button>
      </div>

      {notice && <div className={styles.notice}>{notice}</div>}

      {view === "mine" ? (
        <>
          <div className={styles.cardHeadRow}>
            <div className={styles.cardTitle} style={{ margin: 0 }}>
              Мои трансферы
            </div>
            <button type="button" className="btnPrimary" onClick={() => setAddOpen((v) => !v)}>
              Выставить игрока на трансфер
            </button>
          </div>

          {addOpen && (
            <form className={styles.formBox} onSubmit={handleAddListing}>
              <div className={styles.formRow}>
                <div className={styles.formField}>
                  <label className={styles.formLabel} htmlFor="transferPlayer">
                    Игрок
                  </label>
                  <select
                    id="transferPlayer"
                    className={styles.formSelect}
                    value={selectedPlayerId}
                    onChange={(e) => setSelectedPlayerId(e.target.value)}
                  >
                    <option value="">Выберите игрока…</option>
                    {availablePlayers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {positionGroupLabel[p.positionGroup]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.formField}>
                  <label className={styles.formLabel} htmlFor="startPrice">
                    Стартовая цена
                  </label>
                  <input
                    id="startPrice"
                    type="number"
                    min={1}
                    className={styles.formInput}
                    placeholder="напр. 300000"
                    value={startPrice}
                    onChange={(e) => setStartPrice(e.target.value)}
                  />
                </div>
              </div>

              <div className={styles.formActions}>
                <button type="submit" className="btnPrimary">
                  Выставить
                </button>
                <button type="button" className="btnSecondary" onClick={() => setAddOpen(false)}>
                  Отмена
                </button>
              </div>
            </form>
          )}

          <div className={styles.gridWrap}>
            <table className={styles.grid}>
              <thead>
                <tr>
                  <th>Игрок</th>
                  <th>Поз</th>
                  <th style={{ textAlign: "right" }}>Стартовая цена</th>
                  <th style={{ textAlign: "right" }}>Текущая ставка</th>
                  <th style={{ textAlign: "right" }}>Ставок</th>
                  <th>Осталось</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {myList.map((listing) => {
                  const player = playersById.get(listing.playerId);
                  if (!player) return null;
                  const canCancel = listing.listedMinutesAgo < CANCEL_WINDOW_MINUTES;
                  return (
                    <tr key={listing.id}>
                      <td className={styles.nameCell}>{player.name}</td>
                      <td>{positionGroupShort[player.positionGroup]}</td>
                      <td className={styles.numCell}>{formatTenge(listing.startPrice)}</td>
                      <td className={styles.numCell}>{formatTenge(listing.currentBid)}</td>
                      <td className={styles.numCell}>{listing.bidCount}</td>
                      <td>{listing.timeLeft}</td>
                      <td className={styles.actionCell}>
                        <button
                          type="button"
                          className={styles.rowBtn}
                          disabled={!canCancel}
                          title={
                            canCancel
                              ? "Снять игрока с трансфера"
                              : `Отменить можно только в первые ${CANCEL_WINDOW_MINUTES} минут после выставления`
                          }
                          onClick={() => handleCancelListing(listing.id)}
                        >
                          Отменить трансфер
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {myList.length === 0 && <div className={styles.emptyState}>Нет игроков, выставленных на продажу</div>}
          </div>
        </>
      ) : (
        <>
          <div className={styles.cardTitle}>Рынок игроков</div>

          <div className={styles.gridWrap}>
            <table className={styles.grid}>
              <thead>
                <tr>
                  <th>Флаг</th>
                  <th>Имя</th>
                  <th>Клуб</th>
                  <th>Поз</th>
                  <th style={{ textAlign: "right" }}>Возр</th>
                  <th style={{ textAlign: "right" }}>Форма</th>
                  <th style={{ textAlign: "right" }}>Вын</th>
                  {skillKeys.map((k) => (
                    <th key={k} style={{ textAlign: "right" }} title={skillLabel[k]}>
                      {skillShortLabel[k]}
                    </th>
                  ))}
                  <th style={{ textAlign: "right" }}>TSI</th>
                  <th style={{ textAlign: "right" }}>Цена</th>
                  <th>Осталось</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {market.map((p) => (
                  <Fragment key={p.id}>
                    <tr>
                      <td className={styles.flagCell} title={p.nationality.name}>
                        <NationalityTag nationality={p.nationality} />
                      </td>
                      <td className={styles.nameCell}>{p.name}</td>
                      <td>{p.club}</td>
                      <td>{positionGroupShort[p.positionGroup]}</td>
                      <td className={styles.numCell}>{p.age}</td>
                      <td className={styles.numCell}>{p.form}</td>
                      <td className={styles.numCell}>{p.stamina}%</td>
                      {skillKeys.map((k) => (
                        <td className={styles.numCell} key={k}>
                          {p.skills[k]}
                        </td>
                      ))}
                      <td className={styles.numCell}>{p.tsi.toLocaleString("ru-RU")}</td>
                      <td className={styles.numCell}>{formatTenge(p.currentPrice)}</td>
                      <td>{p.timeLeft}</td>
                      <td className={styles.actionCell}>
                        <button
                          type="button"
                          className={styles.rowBtn}
                          onClick={() => {
                            setBiddingId((id) => (id === p.id ? null : p.id));
                            setBidAmount("");
                            setAutoBid(false);
                            setAutoBidMax("");
                          }}
                        >
                          Сделать ставку
                        </button>
                      </td>
                    </tr>
                    {biddingId === p.id && (
                      <tr>
                        <td colSpan={13 + skillKeys.length}>
                          <form className={styles.formBox} style={{ margin: "6px 0" }} onSubmit={(e) => handleSubmitBid(e, p)}>
                            <div className={styles.formRow}>
                              <div className={styles.formField}>
                                <label className={styles.formLabel} htmlFor={`bid-${p.id}`}>
                                  Сумма ставки
                                </label>
                                <input
                                  id={`bid-${p.id}`}
                                  type="number"
                                  min={p.currentPrice + 1}
                                  className={styles.formInput}
                                  placeholder={`от ${formatTenge(p.currentPrice + Math.max(100_000, Math.round(p.currentPrice * 0.02)))}`}
                                  value={bidAmount}
                                  onChange={(e) => setBidAmount(e.target.value)}
                                />
                              </div>

                              <div className={styles.formField}>
                                <label className={styles.formLabel} htmlFor={`autoBidMax-${p.id}`}>
                                  Максимальная сумма
                                </label>
                                <input
                                  id={`autoBidMax-${p.id}`}
                                  type="number"
                                  className={styles.formInput}
                                  disabled={!autoBid}
                                  value={autoBidMax}
                                  onChange={(e) => setAutoBidMax(e.target.value)}
                                />
                              </div>
                            </div>

                            <p className={styles.formHint}>Минимальный шаг — 100 000 тенге или 2% от текущей цены</p>

                            <div className={styles.formCheckRow}>
                              <input
                                id={`autoBid-${p.id}`}
                                type="checkbox"
                                checked={autoBid}
                                onChange={(e) => setAutoBid(e.target.checked)}
                              />
                              <label htmlFor={`autoBid-${p.id}`}>Автоставка</label>
                              <span
                                className={styles.infoHint}
                                title="Система будет автоматически поднимать вашу ставку до указанного максимума"
                              >
                                ?
                              </span>
                            </div>

                            <div className={styles.formActions}>
                              <button type="submit" className="btnPrimary">
                                Подтвердить ставку
                              </button>
                              <button type="button" className="btnSecondary" onClick={() => setBiddingId(null)}>
                                Отмена
                              </button>
                            </div>
                          </form>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>

    <div className={styles.card}>
      <div className={styles.cardTitle}>Последние трансферы за сезон</div>
      <div className={styles.gridWrap}>
        <table className={styles.grid}>
          <thead>
            <tr>
              <th>Игрок</th>
              <th>Из клуба</th>
              <th>В клуб</th>
              <th style={{ textAlign: "right" }}>Цена</th>
              <th>Дата</th>
            </tr>
          </thead>
          <tbody>
            {recentTransfers.map((t) => (
              <tr key={t.id}>
                <td className={styles.nameCell}>{t.playerName}</td>
                <td>{t.fromClub}</td>
                <td>{t.toClub}</td>
                <td className={styles.numCell}>{formatTenge(t.price)}</td>
                <td>{t.completedDate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>

    <p className={styles.feeNote}>
      Комиссия агенту зависит от того, как долго игрок был в клубе (от 12% в день продажи до 2% после 16 недель).
      Дополнительно 2% уходит родному клубу игрока и 3% — предыдущему клубу, если применимо.
    </p>
    </>
  );
}
