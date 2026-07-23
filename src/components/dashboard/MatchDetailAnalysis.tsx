"use client";

import { useEffect, useState } from "react";
import { skillWord } from "@/data/squad";
import styles from "./MatchAnalysis.module.css";

export interface AnalyzableMatch {
  id: number;
  date: string;
  opponent: string;
  home: boolean;
  ourScore: number;
  oppScore: number;
}

type ReportTab = "ratings" | "zones" | "attendance" | "timeline";

const reportTabs: { key: ReportTab; label: string }[] = [
  { key: "ratings", label: "Рейтинги игроков" },
  { key: "zones", label: "Зоны поля" },
  { key: "attendance", label: "Посещаемость" },
  { key: "timeline", label: "Хронология" },
];

interface MatchPlayerRating {
  playerId: number;
  name: string;
  rating: number;
  roleId: number | null;
}

interface MatchZoneRatings {
  midfield: number | null;
  rightDef: number | null;
  midDef: number | null;
  leftDef: number | null;
  rightAtt: number | null;
  midAtt: number | null;
  leftAtt: number | null;
  setPiecesDef: number | null;
  setPiecesAtt: number | null;
}

interface MatchAttendance {
  arenaName: string;
  terraces: number;
  basic: number;
  roof: number;
  vip: number;
  total: number;
}

type MatchTimelineKind = "goal" | "card" | "sub" | "injury";

interface MatchTimelineEntry {
  minute: number;
  matchPart: number;
  text: string;
  kind: MatchTimelineKind;
  teamSide: "home" | "away" | null;
}

interface MatchAnalysisResponse {
  homeTeamName: string;
  awayTeamName: string;
  homeRatings: MatchPlayerRating[];
  awayRatings: MatchPlayerRating[];
  ratingsError: string | null;
  homeZones: MatchZoneRatings | null;
  awayZones: MatchZoneRatings | null;
  zonesError: string | null;
  homeTactic: string | null;
  awayTactic: string | null;
  homeTeamAttitude: string | null;
  awayTeamAttitude: string | null;
  attendance: MatchAttendance | null;
  attendanceError: string | null;
  timeline: MatchTimelineEntry[] | null;
  timelineSource: "with-subs" | "without-subs" | null;
  timelineError: string | null;
  debug: string[];
  error: string | null;
}

// ВРЕМЕННАЯ диагностика — показывает сырые счётчики из
// src/lib/matchAnalysis.ts (сколько элементов реально пришло в EventList/
// Scorers/Bookings, сколько рейтингов удалось разобрать и т.п.), чтобы
// сразу видеть, на каком шаге хронология/рейтинги теряют данные, если
// поведение снова станет нестабильным по конкретным матчам.
const SHOW_MATCH_ANALYSIS_DEBUG = true;

// RoleID из matchlineup.xml (см. src/lib/matchAnalysis.ts) — 11 формальных
// позиций стартового состава (100-113, схема 5-5-3). Координаты — доля
// поля по глубине (x, свой гол→0, центр поля→50) и по ширине (y, 0-100).
// Всё остальное (скамейка, спецроли вроде капитана/пробивающего пенальти)
// на схему не наносится — показывается отдельным списком под полем.
const FIELD_POSITIONS: Record<number, { x: number; y: number }> = {
  100: { x: 6, y: 50 }, // вратарь
  101: { x: 20, y: 18 }, // правый защитник
  102: { x: 20, y: 34 }, // правый центральный защитник
  103: { x: 20, y: 50 }, // центральный защитник
  104: { x: 20, y: 66 }, // левый центральный защитник
  105: { x: 20, y: 82 }, // левый защитник
  106: { x: 34, y: 12 }, // правый полузащитник (фланг)
  107: { x: 34, y: 34 }, // правый полузащитник (центр)
  108: { x: 34, y: 50 }, // центральный полузащитник
  109: { x: 34, y: 66 }, // левый полузащитник (центр)
  110: { x: 34, y: 88 }, // левый полузащитник (фланг)
  111: { x: 46, y: 30 }, // правый нападающий
  112: { x: 46, y: 50 }, // центральный нападающий
  113: { x: 46, y: 70 }, // левый нападающий
};

function fieldPosition(roleId: number | null, side: "home" | "away"): { x: number; y: number } | null {
  if (roleId === null) return null;
  const base = FIELD_POSITIONS[roleId];
  if (!base) return null;
  return side === "home" ? base : { x: 100 - base.x, y: base.y };
}

type ZoneKey = "leftDef" | "midDef" | "rightDef" | "midfield" | "leftAtt" | "midAtt" | "rightAtt";

// "Лево"/"право" в matchdetails.xml — с точки зрения самой команды, а команды
// стоят на поле лицом друг к другу — поэтому мой левый защитник встречается
// не с левым, а с ПРАВЫМ нападающим соперника (и наоборот). Через эту пару
// считается процент — доля именно этого сектора в очном противостоянии.
const ZONE_CONTEST: Record<ZoneKey, ZoneKey> = {
  leftDef: "rightAtt",
  midDef: "midAtt",
  rightDef: "leftAtt",
  midfield: "midfield",
  leftAtt: "rightDef",
  midAtt: "midDef",
  rightAtt: "leftDef",
};

// ОДНО горизонтальное поле слева направо (от наших ворот к воротам
// соперника), 3 секции по ГЛУБИНЕ: наша половина (у наших ворот) — центр —
// половина соперника (у его ворот). Внутри каждой секции — 3 (или 1 для
// центра) физических места по ширине поля (лево/центр/право), и в КАЖДОМ
// таком месте показана пара значений "наше vs их" — именно те два сектора,
// что физически сталкиваются здесь (см. ZONE_CONTEST выше): на нашей
// половине это наша Защита и Атака соперника, в центре — обе Полузащиты,
// на половине соперника — наша Атака и Защита соперника. Оба значения пары
// показаны рядом, а не на разных концах поля.
const ZONE_PITCH_SECTIONS: { section: "myHalf" | "center" | "oppHalf"; pairs: { homeKey: ZoneKey; awayKey: ZoneKey }[] }[] = [
  {
    section: "myHalf",
    pairs: [
      { homeKey: "leftDef", awayKey: "rightAtt" },
      { homeKey: "midDef", awayKey: "midAtt" },
      { homeKey: "rightDef", awayKey: "leftAtt" },
    ],
  },
  { section: "center", pairs: [{ homeKey: "midfield", awayKey: "midfield" }] },
  {
    section: "oppHalf",
    pairs: [
      { homeKey: "leftAtt", awayKey: "rightDef" },
      { homeKey: "midAtt", awayKey: "midDef" },
      { homeKey: "rightAtt", awayKey: "leftDef" },
    ],
  },
];

const ZONE_ICON: Record<ZoneKey, string> = {
  leftDef: "🛡",
  midDef: "🛡",
  rightDef: "🛡",
  midfield: "⚙",
  leftAtt: "⚽",
  midAtt: "⚽",
  rightAtt: "⚽",
};

function zoneSharePercent(own: number | null, opponentContest: number | null): number | null {
  if (own === null && opponentContest === null) return null;
  const o = own ?? 0;
  const p = opponentContest ?? 0;
  const total = o + p;
  if (total <= 0) return null;
  return Math.round((o / total) * 100);
}

// Реальные данные конкретного матча (см. src/lib/matchAnalysis.ts,
// /api/dashboard/match-analysis). Раньше рейтинги игроков всегда приходили
// пустыми — читались из несуществующего в matchdetails.xml поля Lineup;
// список игроков с рейтингом отдаёт отдельный файл matchlineup.xml, откуда
// же берётся RoleID для расстановки маркеров на поле ниже.
export default function MatchDetailAnalysis({ match }: { match: AnalyzableMatch }) {
  const [tab, setTab] = useState<ReportTab>("ratings");
  const [data, setData] = useState<MatchAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/dashboard/match-analysis?matchId=${match.id}`)
      .then((res) => res.json())
      .then((json: MatchAnalysisResponse) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) {
          setData({
            homeTeamName: "",
            awayTeamName: "",
            homeRatings: [],
            awayRatings: [],
            ratingsError: "Не удалось загрузить",
            homeZones: null,
            awayZones: null,
            zonesError: "Не удалось загрузить",
            homeTactic: null,
            awayTactic: null,
            homeTeamAttitude: null,
            awayTeamAttitude: null,
            attendance: null,
            attendanceError: "Не удалось загрузить",
            timeline: null,
            timelineSource: null,
            timelineError: "Не удалось загрузить",
            debug: [],
            error: "Не удалось загрузить",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [match.id]);

  const ourName = "Наша команда";
  const homeName = match.home ? ourName : match.opponent;
  const awayName = match.home ? match.opponent : ourName;

  // Стандарты — отдельная пара показателей (не входит в 7 секторов поля по
  // запросу), показана отдельной узкой полосой под полем в том же виде, что
  // и раньше.
  const setPieceRows: { label: string; homeKey: keyof MatchZoneRatings; awayKey: keyof MatchZoneRatings }[] = [
    { label: "Стандарты в защите", homeKey: "setPiecesDef", awayKey: "setPiecesDef" },
    { label: "Стандарты в атаке", homeKey: "setPiecesAtt", awayKey: "setPiecesAtt" },
  ];

  const zoneWord = (raw: number | null) => {
    if (raw === null) return null;
    const skillLevel = Math.max(1, Math.min(20, Math.ceil(raw / 4)));
    return skillWord(skillLevel);
  };

  const homeStarters = data?.homeRatings.filter((p) => fieldPosition(p.roleId, "home") !== null) ?? [];
  const awayStarters = data?.awayRatings.filter((p) => fieldPosition(p.roleId, "away") !== null) ?? [];
  const homeBench = data?.homeRatings.filter((p) => fieldPosition(p.roleId, "home") === null) ?? [];
  const awayBench = data?.awayRatings.filter((p) => fieldPosition(p.roleId, "away") === null) ?? [];

  return (
    <div className={styles.card}>
      <div className={styles.reportTabs}>
        {reportTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`${styles.reportTabBtn} ${tab === t.key ? styles.reportTabBtnActive : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 18 }}>
        <div className={styles.matchHead}>
          <span className={styles.matchHeadTeam}>{homeName}</span>
          <span className={styles.matchHeadScore}>
            {match.home ? `${match.ourScore}:${match.oppScore}` : `${match.oppScore}:${match.ourScore}`}
          </span>
          <span className={styles.matchHeadTeam}>{awayName}</span>
          <span className={styles.matchHeadDate}>{match.date}</span>
        </div>

        {loading && (
          <p className={styles.cardTitle} style={{ fontWeight: 400, textTransform: "none" }}>
            Загрузка…
          </p>
        )}

        {!loading && data?.error && (
          <p className={styles.cardTitle} style={{ fontWeight: 400, textTransform: "none" }}>
            Не удалось загрузить разбор матча: {data.error}
          </p>
        )}

        {!loading && data && !data.error && tab === "ratings" && (
          <>
            {data.ratingsError && (
              <p className={styles.cardTitle} style={{ fontWeight: 400, textTransform: "none", marginBottom: 12 }}>
                {data.ratingsError}
              </p>
            )}

            {(homeStarters.length > 0 || awayStarters.length > 0) && (
              <>
                <div className={styles.splitPitch}>
                  <div className={styles.splitDivider} />
                  {homeStarters.map((p) => {
                    const pos = fieldPosition(p.roleId, "home");
                    if (!pos) return null;
                    return (
                      <div key={`home-${p.playerId}`} className={styles.ratingMarker} style={{ left: `${pos.x}%`, top: `${pos.y}%` }}>
                        <div className={`${styles.ratingBadge} ${styles.ratingBadgeOwn}`}>{p.rating.toFixed(1)}</div>
                        <div className={styles.ratingName} title={p.name}>
                          {p.name}
                        </div>
                      </div>
                    );
                  })}
                  {awayStarters.map((p) => {
                    const pos = fieldPosition(p.roleId, "away");
                    if (!pos) return null;
                    return (
                      <div key={`away-${p.playerId}`} className={styles.ratingMarker} style={{ left: `${pos.x}%`, top: `${pos.y}%` }}>
                        <div className={`${styles.ratingBadge} ${styles.ratingBadgeOpp}`}>{p.rating.toFixed(1)}</div>
                        <div className={styles.ratingName} title={p.name}>
                          {p.name}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className={styles.legendRow}>
                  <span>
                    <span className={styles.legendDot} style={{ background: "var(--color-good)" }} />
                    {data.homeTeamName || homeName}
                  </span>
                  <span>
                    <span className={styles.legendDot} style={{ background: "var(--color-text-muted)" }} />
                    {data.awayTeamName || awayName}
                  </span>
                </div>
              </>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 24 }}>
              <div>
                <div className={styles.matchHeadTeam} style={{ marginBottom: 8 }}>
                  {data.homeTeamName || homeName}
                  {homeBench.length > 0 ? " — скамейка/прочие роли" : ""}
                </div>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <tbody>
                      {homeBench.map((p) => (
                        <tr key={p.playerId}>
                          <td>{p.name}</td>
                          <td className={styles.numCell}>{p.rating.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {data.homeRatings.length === 0 && <p>Нет данных.</p>}
              </div>
              <div>
                <div className={styles.matchHeadTeam} style={{ marginBottom: 8 }}>
                  {data.awayTeamName || awayName}
                  {awayBench.length > 0 ? " — скамейка/прочие роли" : ""}
                </div>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <tbody>
                      {awayBench.map((p) => (
                        <tr key={p.playerId}>
                          <td>{p.name}</td>
                          <td className={styles.numCell}>{p.rating.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {data.awayRatings.length === 0 && <p>Нет данных.</p>}
              </div>
            </div>
          </>
        )}

        {!loading && data && !data.error && tab === "zones" && (
          <>
            {data.zonesError ? (
              <p className={styles.cardTitle} style={{ fontWeight: 400, textTransform: "none" }}>
                {data.zonesError}
              </p>
            ) : (
              <div>
                <div className={styles.zoneInfoPanel}>
                  <div className={`${styles.zoneInfoCol} ${styles.zoneInfoColHome}`}>
                    <div className={styles.zoneInfoTeamName}>{data.homeTeamName || homeName}</div>
                    <div className={styles.zoneInfoRow}>
                      {data.homeTactic ?? "—"}
                      {data.homeTeamAttitude ? ` / ${data.homeTeamAttitude}` : ""}
                    </div>
                  </div>
                  <div className={styles.zoneInfoDivider} />
                  <div className={`${styles.zoneInfoCol} ${styles.zoneInfoColAway}`}>
                    <div className={styles.zoneInfoTeamName}>{data.awayTeamName || awayName}</div>
                    <div className={styles.zoneInfoRow}>
                      {data.awayTactic ?? "—"}
                      {data.awayTeamAttitude ? ` / ${data.awayTeamAttitude}` : ""}
                    </div>
                  </div>
                </div>
                <p style={{ fontSize: 11.5, color: "var(--color-text-muted)", marginTop: 6, marginBottom: 16 }}>
                  "Отношение к матчу" CHPP отдаёт только владельцу команды — для соперника поле честно отсутствует
                  (не "—" по ошибке). Ещё два показателя из примера ("Loddar Stats" и тройка Тайм/Состав/Рейтинг) в
                  реальном ответе matchdetails пока не опознаны — смотрите полный дамп полей команды в блоке
                  "Диагностика" внизу этой страницы (под всеми вкладками) и подскажите, какое поле им соответствует.
                </p>

                <div className={styles.zonePitch}>
                  {ZONE_PITCH_SECTIONS.map(({ section, pairs }) => (
                    <div
                      className={`${styles.zonePitchSection} ${section === "center" ? styles.zonePitchSectionCenter : ""}`}
                      key={section}
                    >
                      {pairs.map(({ homeKey, awayKey }, i) => {
                        const homeValue = data.homeZones?.[homeKey] ?? null;
                        const awayValue = data.awayZones?.[awayKey] ?? null;
                        const homeShare = zoneSharePercent(homeValue, awayValue);
                        const awayShare = zoneSharePercent(awayValue, homeValue);
                        return (
                          <div className={styles.zonePitchSlot} key={i}>
                            <div className={`${styles.zoneBox} ${styles.zoneBoxHome}`}>
                              <div className={styles.zoneBoxTop}>
                                <span className={styles.zoneBoxRating}>{homeValue !== null ? Math.round(homeValue) : "—"}</span>
                                <span className={styles.zoneBoxIcon}>{ZONE_ICON[homeKey]}</span>
                              </div>
                              <div className={styles.zoneBoxShare}>{homeShare !== null ? `${homeShare}%` : "—"}</div>
                            </div>
                            <div className={`${styles.zoneBox} ${styles.zoneBoxAway}`}>
                              <div className={styles.zoneBoxTop}>
                                <span className={styles.zoneBoxRating}>{awayValue !== null ? Math.round(awayValue) : "—"}</span>
                                <span className={styles.zoneBoxIcon}>{ZONE_ICON[awayKey]}</span>
                              </div>
                              <div className={styles.zoneBoxShare}>{awayShare !== null ? `${awayShare}%` : "—"}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 20 }}>
                  <div className={styles.cardTitle} style={{ marginBottom: 8 }}>
                    Стандарты
                  </div>
                  {setPieceRows.map((row) => {
                    const homeRaw = data.homeZones?.[row.homeKey] ?? null;
                    const awayRaw = data.awayZones?.[row.awayKey] ?? null;
                    const homeWord = zoneWord(homeRaw);
                    const awayWord = zoneWord(awayRaw);
                    const total = (homeRaw ?? 0) + (awayRaw ?? 0);
                    const homeShare = total > 0 ? ((homeRaw ?? 0) / total) * 100 : 50;
                    return (
                      <div className={styles.zoneRow} key={row.label}>
                        <div className={styles.zoneSide}>
                          <span className={styles.zoneShare}>{homeWord ?? "—"}</span>
                          <span className={styles.zoneLevel}>{homeRaw !== null ? `${homeRaw}/80` : "нет данных"}</span>
                        </div>
                        <div className={styles.zoneLabel}>
                          {row.label}
                          <div className={styles.zoneBar} style={{ marginTop: 6 }}>
                            <div className={styles.zoneBarOwn} style={{ width: `${homeShare}%` }} />
                            <div className={styles.zoneBarOpp} style={{ width: `${100 - homeShare}%` }} />
                          </div>
                        </div>
                        <div className={`${styles.zoneSide} ${styles.zoneSideRight}`}>
                          <span className={styles.zoneShare}>{awayWord ?? "—"}</span>
                          <span className={styles.zoneLevel}>{awayRaw !== null ? `${awayRaw}/80` : "нет данных"}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {!loading && data && !data.error && tab === "attendance" && (
          <>
            {data.attendanceError ? (
              <p className={styles.cardTitle} style={{ fontWeight: 400, textTransform: "none" }}>
                {data.attendanceError}
              </p>
            ) : (
              data.attendance && (
                <>
                  {data.attendance.arenaName && (
                    <p className={styles.cardTitle} style={{ fontWeight: 400, textTransform: "none", marginBottom: 12 }}>
                      Стадион «{data.attendance.arenaName}»
                    </p>
                  )}
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Категория мест</th>
                          <th style={{ textAlign: "right" }}>Продано билетов</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>Террасы</td>
                          <td className={styles.numCell}>{data.attendance.terraces.toLocaleString("ru-RU")}</td>
                        </tr>
                        <tr>
                          <td>Обычные</td>
                          <td className={styles.numCell}>{data.attendance.basic.toLocaleString("ru-RU")}</td>
                        </tr>
                        <tr>
                          <td>Под крышей</td>
                          <td className={styles.numCell}>{data.attendance.roof.toLocaleString("ru-RU")}</td>
                        </tr>
                        <tr>
                          <td>VIP</td>
                          <td className={styles.numCell}>{data.attendance.vip.toLocaleString("ru-RU")}</td>
                        </tr>
                        <tr className={styles.totalRow}>
                          <td>Итого</td>
                          <td className={styles.numCell}>{data.attendance.total.toLocaleString("ru-RU")}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 12 }}>
                    Количество проданных билетов — реальные данные CHPP. Доход от продажи билетов именно за этот матч
                    Hattrick отдельным полем не сообщает (только количество мест по категориям) — цена за место не
                    входит в ответ CHPP.
                  </p>
                </>
              )
            )}
          </>
        )}

        {!loading && data && !data.error && tab === "timeline" && (
          <>
            {data.timelineError ? (
              <p className={styles.cardTitle} style={{ fontWeight: 400, textTransform: "none" }}>
                {data.timelineError}
              </p>
            ) : (
              data.timeline &&
                (() => {
                  const ourSide = match.home ? "home" : "away";
                  const maxMinute = Math.max(90, ...data.timeline.map((ev) => ev.minute));
                  return (
                    <>
                      {data.timelineSource === "without-subs" && (
                        <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 12 }}>
                          Полный список событий для этого матча не вернулся — показаны голы, карточки и травмы (всегда
                          доступны), но не замены (их можно распознать только из полного отчёта).
                        </p>
                      )}
                      <div className={styles.timelineHorizontalWrap}>
                        <div className={styles.timelineHorizontalTrack}>
                          <span className={`${styles.timelineEndLabel} ${styles.timelineEndLabelStart}`}>0&apos;</span>
                          <span className={`${styles.timelineEndLabel} ${styles.timelineEndLabelEnd}`}>{maxMinute}&apos;</span>
                          {data.timeline.map((ev, i) => {
                            const isOurs = ev.teamSide === ourSide;
                            const isRedCard = ev.kind === "card" && /красн/i.test(ev.text);
                            const isLightInjury = ev.kind === "injury" && /лёгк|ушиб/i.test(ev.text);
                            const markerClass =
                              ev.kind === "goal"
                                ? isOurs
                                  ? styles.timelineMarkerGoal
                                  : styles.timelineMarkerGoalOpp
                                : ev.kind === "card"
                                  ? isRedCard
                                    ? styles.timelineMarkerCardRed
                                    : styles.timelineMarkerCardYellow
                                  : ev.kind === "sub"
                                    ? styles.timelineMarkerSub
                                    : styles.timelineMarkerInjury;
                            const icon =
                              ev.kind === "goal"
                                ? "⚽"
                                : ev.kind === "card"
                                  ? isRedCard
                                    ? "🟥"
                                    : "🟨"
                                  : ev.kind === "sub"
                                    ? "⇆"
                                    : isLightInjury
                                      ? "🩹"
                                      : "➕";
                            return (
                              <span
                                key={i}
                                className={`${styles.timelineMarker} ${markerClass}`}
                                style={{ left: `${(ev.minute / maxMinute) * 100}%` }}
                                title={`${ev.minute}' — ${ev.text}`}
                              >
                                {icon}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  );
                })()
            )}
          </>
        )}

        {!loading && data && SHOW_MATCH_ANALYSIS_DEBUG && data.debug.length > 0 && (
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--color-border)" }}>
            <div className={styles.cardTitle}>Диагностика (временная)</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12.5, color: "var(--color-text-muted)" }}>
              {data.debug.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
