"use client";

import { useEffect, useState } from "react";
import { skillWord } from "@/data/squad";
import styles from "./MatchAnalysis.module.css";
import { GoalBallIcon, SubstitutionIcon, SpecialEventIcon } from "./TimelineIcons";

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
  capacityTerraces: number | null;
  capacityBasic: number | null;
  capacityRoof: number | null;
  capacityVip: number | null;
  capacityTotal: number | null;
}

// См. ZoneValue в src/lib/matchAnalysis.ts — confirmed=false значит, что
// число не измерено напрямую по коду события в EventList, а довычислено по
// остатку (официальный итог зоны минус подтверждённая часть), последний
// резервный шаг computeAttackZoneBreakdown.
interface ZoneValue {
  value: number;
  confirmed: boolean;
}

interface MatchAttackStats {
  chancesTotal: number | null;
  goals: number | null;
  missed: number | null;
  chancesLeft: number | null;
  chancesCenter: number | null;
  chancesRight: number | null;
  chancesSpecialEvents: number | null;
  chancesOther: number | null;
  goalsLeft: ZoneValue | null;
  goalsCenter: ZoneValue | null;
  goalsRight: ZoneValue | null;
  goalsSpecialEvents: ZoneValue | null;
  goalsOther: ZoneValue | null;
  missedLeft: ZoneValue | null;
  missedCenter: ZoneValue | null;
  missedRight: ZoneValue | null;
  missedSpecialEvents: ZoneValue | null;
  missedOther: ZoneValue | null;
}

type MatchTimelineKind = "goal" | "card" | "sub" | "injury" | "miss" | "special";

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
  homeTeamId: string;
  awayTeamId: string;
  homeRatings: MatchPlayerRating[];
  awayRatings: MatchPlayerRating[];
  ratingsError: string | null;
  homeZones: MatchZoneRatings | null;
  awayZones: MatchZoneRatings | null;
  zonesError: string | null;
  homePowerIndex: number | null;
  awayPowerIndex: number | null;
  homeTactic: string | null;
  awayTactic: string | null;
  homeTeamAttitude: string | null;
  awayTeamAttitude: string | null;
  attendance: MatchAttendance | null;
  attendanceError: string | null;
  weather: string | null;
  homeAttackStats: MatchAttackStats | null;
  awayAttackStats: MatchAttackStats | null;
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

// Координаты (x = глубина поля 0-100, y = ширина поля 0-100) для 7 боксов
// зон, встроенных теперь прямо в единое персистентное поле .matchPitch (см.
// ZONE_PITCH_SECTIONS выше для группировки по секциям/парам) — та же логика
// "глубины", что и в FIELD_POSITIONS для маркеров игроков (наши ворота
// слева ~x=20, центр поля x=50, ворота соперника ~x=80).
const SECTION_X: Record<"myHalf" | "center" | "oppHalf", number> = { myHalf: 20, center: 50, oppHalf: 80 };
const ROW_Y = [22, 50, 78];

function zoneSharePercent(own: number | null, opponentContest: number | null): number | null {
  if (own === null && opponentContest === null) return null;
  const o = own ?? 0;
  const p = opponentContest ?? 0;
  const total = o + p;
  if (total <= 0) return null;
  return Math.round((o / total) * 100);
}

const NO_DATA = "нет данных";

function fmtStat(v: number | null | undefined): string {
  return v !== null && v !== undefined ? String(v) : NO_DATA;
}

// Отдельная таблица статистики атакующих моментов (не на самой временной
// шкале) — см. комментарий у MatchAttackStats/computeAttackZoneBreakdown в
// src/lib/matchAnalysis.ts. "Всего моментов" — разбивка по зонам атаки из
// готового поля matchdetails (голы и нереализованные вместе, Hattrick сам
// зоны не разделяет по типу). "Голы"/"Нереализованные моменты" по зонам —
// это УЖЕ реальный расчёт из отдельных событий EventList по EventTypeID
// (неофициальная, но проверяемая расшифровка кодов, см. комментарий у
// computeAttackZoneBreakdown): число показывается напрямую, если сошлось с
// официальным итогом ЭТОЙ КОНКРЕТНОЙ зоны; если нет — последний резервный
// шаг довычисляет его по остатку (см. ZoneValue.confirmed=false). По запросу
// (после проверки на реальном матче) довычисленное число визуально НЕ
// отличается от подтверждённого — строгое вычитание из уже подтверждённых
// официальных сумм даёт точный результат почти всегда (единственный сбой —
// компенсирующая ошибка классификации сразу в двух зонах, которая не
// нарушит агрегатную сумму; отдельная, гораздо менее вероятная ситуация,
// чем противоречие в данных, которое уже обрабатывается как честный
// прочерк) — поэтому различие оставлено только во всплывающей подсказке при
// наведении, без курсива/значков, чтобы не создавать ложное впечатление
// "менее надёжного" числа. Если данных не хватает даже на алгебру —
// честное тире.
const NO_ZONE_BREAKDOWN_HINT =
  "Не удалось надёжно разобрать эту зону для этого матча (расчёт из отдельных событий EventList не сошёлся с официальным итогом зоны, и алгебраически довычислить по остатку тоже не удалось, либо EventList не пришёл).";
const COMPUTED_ZONE_HINT =
  "Довычислено по остатку (официальный итог зоны минус подтверждённая часть), а не подтверждено напрямую отдельным кодом события — см. computeAttackZoneBreakdown.";

function renderZoneValue(v: ZoneValue | null | undefined) {
  if (v === null || v === undefined) {
    return <span title={NO_ZONE_BREAKDOWN_HINT}>—</span>;
  }
  if (!v.confirmed) {
    return <span title={COMPUTED_ZONE_HINT}>{v.value}</span>;
  }
  return <span>{v.value}</span>;
}

function ZoneLcrCell({ l, c, r }: { l: ZoneValue | null | undefined; c: ZoneValue | null | undefined; r: ZoneValue | null | undefined }) {
  return (
    <td className={styles.numCell}>
      {renderZoneValue(l)} / {renderZoneValue(c)} / {renderZoneValue(r)}
    </td>
  );
}

function ZoneCell({ value }: { value: ZoneValue | null | undefined }) {
  return <td className={styles.numCell}>{renderZoneValue(value)}</td>;
}

// Только для "Всего моментов" — готовое поле matchdetails (chancesLeft и
// т.п.), обычные числа без confirmed/computed различия, т.к. это не расчёт
// из EventList, а сами официальные поля Hattrick.
function fmtZoneLcr(l: number | null | undefined, c: number | null | undefined, r: number | null | undefined): string | null {
  if (l === null || l === undefined || c === null || c === undefined || r === null || r === undefined) return null;
  return `${l} / ${c} / ${r}`;
}

function AttackMomentsTable({ teamLabel, teamId, stats }: { teamLabel: string; teamId: string; stats: MatchAttackStats | null }) {
  const lcr = fmtZoneLcr(stats?.chancesLeft, stats?.chancesCenter, stats?.chancesRight) ?? NO_DATA;

  return (
    <div className={styles.tableWrap} style={{ marginBottom: 20 }}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>
              {teamLabel}
              {teamId ? ` (ID ${teamId})` : ""}
            </th>
            <th style={{ textAlign: "right" }}>Л / Ц / П</th>
            <th style={{ textAlign: "right" }}>Спецсобытия</th>
            <th style={{ textAlign: "right" }}>Другое</th>
            <th style={{ textAlign: "right" }}>Всего</th>
          </tr>
        </thead>
        <tbody>
          <tr className={styles.attackMomentsRowGoals}>
            <td>Голы</td>
            <ZoneLcrCell l={stats?.goalsLeft} c={stats?.goalsCenter} r={stats?.goalsRight} />
            <ZoneCell value={stats?.goalsSpecialEvents} />
            <ZoneCell value={stats?.goalsOther} />
            <td className={styles.numCell}>{fmtStat(stats?.goals)}</td>
          </tr>
          <tr className={styles.attackMomentsRowMissed}>
            <td>Нереализованные моменты</td>
            <ZoneLcrCell l={stats?.missedLeft} c={stats?.missedCenter} r={stats?.missedRight} />
            <ZoneCell value={stats?.missedSpecialEvents} />
            <ZoneCell value={stats?.missedOther} />
            <td className={styles.numCell}>{fmtStat(stats?.missed)}</td>
          </tr>
          <tr className={styles.attackMomentsRowTotal}>
            <td>Всего моментов</td>
            <td className={styles.numCell}>{lcr}</td>
            <td className={styles.numCell}>{fmtStat(stats?.chancesSpecialEvents)}</td>
            <td className={styles.numCell}>{fmtStat(stats?.chancesOther)}</td>
            <td className={styles.numCell}>{fmtStat(stats?.chancesTotal)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// Заголовок + пояснение показываются один раз, над таблицей домашней
// команды (см. AttackMomentsHomeBlock/AttackMomentsAwayBlock ниже — сама
// временная шкала располагается МЕЖДУ этими двумя блоками, по запросу:
// таблица хозяев — над лентой, таблица гостей — под ней).
function AttackMomentsHeading() {
  return (
    <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--color-border)" }}>
      <div className={styles.cardTitle} style={{ marginBottom: 8 }}>
        Статистика атакующих моментов
      </div>
      <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 12 }}>
        Строка "Всего моментов" — разбивка по зонам атаки (Л/Ц/П, спецсобытия, другое) из готового поля matchdetails
        (голы и нереализованные вместе). Строки "Голы" и "Нереализованные моменты" по зонам — это уже отдельный расчёт
        из конкретных событий EventList по коду события (неофициальная, но проверяемая расшифровка кодов): если само
        число не сошлось с официальным итогом этой зоны напрямую, но его удалось довычислить по остатку (официальный
        итог зоны минус подтверждённая часть) — оно показано как обычное число, отличить его от напрямую
        подтверждённого можно только наведением (подсказка укажет, что это довычислено); тире — если данных не
        хватило даже на это. Что именно доступно по каждому типу событий на самой временной шкале ниже — см. чеклист
        над лентой; сырые счётчики по каждой зоне и разбор EventList по кодам — в панели "Диагностика" в самом низу
        страницы.
      </p>
    </div>
  );
}

// По запросу — не общее "нет данных", а точный статус ПО КАЖДОМУ типу
// событий отдельно: что реально показывается на шкале, что — лучшая оценка
// (эвристика), а что физически нечем показать (только итог за весь матч,
// без минуты конкретного события), и почему.
type TimelineEventStatus = "ok" | "heuristic" | "unavailable";
const TIMELINE_EVENT_STATUS: { label: string; status: TimelineEventStatus; detail: string }[] = [
  { label: "Голы", status: "ok", detail: "реальные данные с точной минутой (Scorers) — всегда доступны, показаны на шкале." },
  { label: "Травмы", status: "ok", detail: "реальные данные с точной минутой (Injuries) — всегда доступны, показаны на шкале." },
  {
    label: "Замены",
    status: "heuristic",
    detail:
      "теперь в основном определяются по подтверждённому коду события (EventTypeID 350/351/352 — та же неофициальная, но проверяемая расшифровка кодов, что и у зон голов/непопаданий), с ключевыми словами в тексте как запасным сигналом. Показаны зелёно-красной SVG-иконкой (стрелка вверх — выход на замену, вниз — уход с поля).",
  },
  {
    label: "Нереализованные моменты",
    status: "heuristic",
    detail:
      "показываются на шкале (красноватый мяч) — извлекаются из отдельных событий EventList по коду события (EventTypeID 200-299 — диапазон \"непопадание\", та же неофициальная, но проверяемая расшифровка кодов, что и в таблице статистики), с реальной минутой каждого конкретного события. Наведите на маркер — в тексте указана зона (лево/центр/право/другое); нереализованные спецсобытия показаны отдельно, см. ниже.",
  },
  {
    label: "Специальные события",
    status: "heuristic",
    detail:
      "теперь тоже на шкале — восклицательный знак акцентного цвета. Нереализованные спецсобытия показаны как отдельный маркер вместо обычного \"нереализованного момента\". Голы через спецсобытие показаны ДВУМЯ маркерами рядом: обычным голом (Scorers не различает способ гола сам по себе) и отдельным восклицательным знаком — оба факта реальны.",
  },
];
const TIMELINE_EVENT_ICON: Record<TimelineEventStatus, string> = { ok: "✅", heuristic: "⚠️", unavailable: "❌" };

function TimelineEventTypeChecklist() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
      {TIMELINE_EVENT_STATUS.map((r) => (
        <div key={r.label}>
          <b>
            {TIMELINE_EVENT_ICON[r.status]} {r.label}
          </b>
          <span style={{ color: "var(--color-text-muted)" }}> — {r.detail}</span>
        </div>
      ))}
    </div>
  );
}

// Реальные данные конкретного матча (см. src/lib/matchAnalysis.ts,
// /api/dashboard/match-analysis). Раньше рейтинги игроков всегда приходили
// пустыми — читались из несуществующего в matchdetails.xml поля Lineup;
// список игроков с рейтингом отдаёт отдельный файл matchlineup.xml, откуда
// же берётся RoleID для расстановки маркеров на поле ниже.
export default function MatchDetailAnalysis({ match, ourTeamName }: { match: AnalyzableMatch; ourTeamName: string }) {
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
            homeTeamId: "",
            awayTeamId: "",
            homeRatings: [],
            awayRatings: [],
            ratingsError: "Не удалось загрузить",
            homeZones: null,
            awayZones: null,
            zonesError: "Не удалось загрузить",
            homePowerIndex: null,
            awayPowerIndex: null,
            homeTactic: null,
            awayTactic: null,
            homeTeamAttitude: null,
            awayTeamAttitude: null,
            attendance: null,
            attendanceError: "Не удалось загрузить",
            weather: null,
            homeAttackStats: null,
            awayAttackStats: null,
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

  const ourName = ourTeamName;
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

  const timeline = !data?.timelineError ? (data?.timeline ?? null) : null;
  const maxMinute = timeline ? Math.max(90, ...timeline.map((ev) => ev.minute)) : 90;
  const RULER_MINUTES = [0, 15, 30, 45, 60, 75, 90].filter((m) => m <= maxMinute);

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

      <div className={styles.matchContentBackdrop}>
        <div className={`${styles.matchHead} ${styles.dataPanel}`}>
          <span className={styles.matchHeadTeam}>{homeName}</span>
          <span className={styles.matchHeadScore}>
            {match.home ? `${match.ourScore}:${match.oppScore}` : `${match.oppScore}:${match.ourScore}`}
          </span>
          <span className={styles.matchHeadTeam}>{awayName}</span>
          <span className={styles.matchHeadDate}>{match.date}</span>
        </div>

        {loading && (
          <p className={`${styles.cardTitle} ${styles.dataPanel}`} style={{ fontWeight: 400, textTransform: "none" }}>
            Загрузка…
          </p>
        )}

        {!loading && data?.error && (
          <p className={`${styles.cardTitle} ${styles.dataPanel}`} style={{ fontWeight: 400, textTransform: "none" }}>
            Не удалось загрузить разбор матча: {data.error}
          </p>
        )}

        {/* ЕДИНОЕ персистентное поле — один и тот же DOM-узел при любой
            вкладке (форма/размер не зависят от tab, как счёт матча выше).
            Меняется только содержимое ВНУТРИ него — маркеры/зоны/таймлайн/
            панель посещаемости — через абсолютное позиционирование. Ничего
            перед этим div не рендерится условно по вкладке, чтобы React не
            пересоздавал его при переключении (см. комментарий у .matchPitch
            в MatchAnalysis.module.css). */}
        {!loading && data && !data.error && (
          <div className={styles.matchPitch}>
            <div className={styles.matchPitchCenterLine} />
            <div className={styles.matchPitchCenterCircle} />
            <div className={`${styles.matchPitchPenaltyArea} ${styles.matchPitchPenaltyAreaLeft}`} />
            <div className={`${styles.matchPitchPenaltyArea} ${styles.matchPitchPenaltyAreaRight}`} />
            <div className={`${styles.matchPitchGoalArea} ${styles.matchPitchGoalAreaLeft}`} />
            <div className={`${styles.matchPitchGoalArea} ${styles.matchPitchGoalAreaRight}`} />
            <div className={`${styles.matchPitchPenaltySpot} ${styles.matchPitchPenaltySpotLeft}`} />
            <div className={`${styles.matchPitchPenaltySpot} ${styles.matchPitchPenaltySpotRight}`} />

            {tab === "ratings" &&
              (data.ratingsError ? (
                <div className={styles.matchPitchEmpty}>{data.ratingsError}</div>
              ) : (
                <>
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
                </>
              ))}

            {tab === "zones" &&
              (data.zonesError ? (
                <div className={styles.matchPitchEmpty}>{data.zonesError}</div>
              ) : (
                ZONE_PITCH_SECTIONS.flatMap(({ section, pairs }) =>
                  pairs.map(({ homeKey, awayKey }, i) => {
                    const homeValue = data.homeZones?.[homeKey] ?? null;
                    const awayValue = data.awayZones?.[awayKey] ?? null;
                    const homeShare = zoneSharePercent(homeValue, awayValue);
                    const awayShare = zoneSharePercent(awayValue, homeValue);
                    const x = SECTION_X[section];
                    const y = pairs.length === 1 ? 50 : ROW_Y[i];
                    return (
                      <div className={styles.pitchZoneSlot} style={{ left: `${x}%`, top: `${y}%` }} key={`${section}-${i}`}>
                        <div className={`${styles.pitchZoneBox} ${styles.zoneBoxHome}`}>
                          <div className={styles.pitchZoneBoxTop}>
                            <span className={styles.pitchZoneBoxRating}>{homeValue !== null ? Math.round(homeValue) : "—"}</span>
                            <span className={styles.pitchZoneBoxIcon}>{ZONE_ICON[homeKey]}</span>
                          </div>
                          <div className={styles.pitchZoneBoxShare}>{homeShare !== null ? `${homeShare}%` : "—"}</div>
                        </div>
                        <div className={`${styles.pitchZoneBox} ${styles.zoneBoxAway}`}>
                          <div className={styles.pitchZoneBoxTop}>
                            <span className={styles.pitchZoneBoxRating}>{awayValue !== null ? Math.round(awayValue) : "—"}</span>
                            <span className={styles.pitchZoneBoxIcon}>{ZONE_ICON[awayKey]}</span>
                          </div>
                          <div className={styles.pitchZoneBoxShare}>{awayShare !== null ? `${awayShare}%` : "—"}</div>
                        </div>
                      </div>
                    );
                  }),
                )
              ))}

            {tab === "timeline" &&
              (data.timelineError || !timeline ? (
                <div className={styles.matchPitchEmpty}>{data.timelineError ?? "Хронология недоступна для этого матча."}</div>
              ) : (
                <>
                  {/* Таблица статистики хозяев — НАД временной шкалой, гостей —
                      ПОД ней, но обе внутри границ .matchPitch (не выходят за
                      газон) — см. .pitchTimelineTablePanel в
                      MatchAnalysis.module.css. */}
                  <div className={`${styles.pitchTimelineTablePanel} ${styles.pitchTimelineTablePanelTop}`}>
                    <AttackMomentsTable
                      teamLabel={data.homeTeamName || homeName}
                      teamId={data.homeTeamId}
                      stats={data.homeAttackStats}
                    />
                  </div>
                  <div className={styles.pitchTimelineTrack}>
                  {RULER_MINUTES.map((m) => (
                    <span key={`tick-${m}`} className={styles.pitchTimelineTickMark} style={{ left: `${(m / maxMinute) * 100}%` }} />
                  ))}
                  {maxMinute > 90 && (
                    <span className={styles.pitchTimelineTickMark} style={{ left: "100%" }} />
                  )}
                  {RULER_MINUTES.map((m) => (
                    <span key={m} className={styles.pitchTimelineTick} style={{ left: `${(m / maxMinute) * 100}%` }}>
                      {m}&apos;
                    </span>
                  ))}
                  {maxMinute > 90 && (
                    <span className={styles.pitchTimelineTick} style={{ left: "100%" }}>
                      {maxMinute}&apos;
                    </span>
                  )}
                  {timeline.map((ev, i) => {
                    const isHomeEvent = ev.teamSide === "home";
                    const isRedCard = ev.kind === "card" && /красн/i.test(ev.text);
                    const isLightInjury = ev.kind === "injury" && /лёгк|ушиб/i.test(ev.text);
                    const sideClass = isHomeEvent ? styles.timelineMarkerAbove : styles.timelineMarkerBelow;
                    const markerClass =
                      ev.kind === "goal"
                        ? styles.timelineMarkerGoal
                        : ev.kind === "card"
                          ? isRedCard
                            ? styles.timelineMarkerCardRed
                            : styles.timelineMarkerCardYellow
                          : ev.kind === "sub"
                            ? styles.timelineMarkerSub
                            : ev.kind === "miss"
                              ? styles.timelineMarkerMiss
                              : ev.kind === "special"
                                ? styles.timelineMarkerSpecial
                                : styles.timelineMarkerInjury;
                    const icon =
                      ev.kind === "goal" ? (
                        <GoalBallIcon size={14} />
                      ) : ev.kind === "card" ? (
                        isRedCard ? (
                          "🟥"
                        ) : (
                          "🟨"
                        )
                      ) : ev.kind === "sub" ? (
                        <SubstitutionIcon size={14} />
                      ) : ev.kind === "miss" ? (
                        <GoalBallIcon size={14} />
                      ) : ev.kind === "special" ? (
                        <SpecialEventIcon size={14} />
                      ) : isLightInjury ? (
                        "🩹"
                      ) : (
                        "➕"
                      );
                    return (
                      <span
                        key={i}
                        className={`${styles.timelineMarker} ${sideClass} ${markerClass}`}
                        style={{ left: `${(ev.minute / maxMinute) * 100}%` }}
                        title={`${ev.minute}' — ${ev.text}`}
                      >
                        {icon}
                      </span>
                    );
                  })}
                  </div>
                  <div className={`${styles.pitchTimelineTablePanel} ${styles.pitchTimelineTablePanelBottom}`}>
                    <AttackMomentsTable
                      teamLabel={data.awayTeamName || awayName}
                      teamId={data.awayTeamId}
                      stats={data.awayAttackStats}
                    />
                  </div>
                </>
              ))}

            {tab === "attendance" && (
              <div className={styles.pitchOverlayPanel}>
                {data.attendanceError ? (
                  <p className={styles.cardTitle} style={{ fontWeight: 400, textTransform: "none" }}>
                    {data.attendanceError}
                  </p>
                ) : (
                  data.attendance && (
                    <>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12, alignItems: "baseline" }}>
                        {data.attendance.arenaName && (
                          <p className={styles.cardTitle} style={{ fontWeight: 400, textTransform: "none", margin: 0 }}>
                            Стадион «{data.attendance.arenaName}»
                          </p>
                        )}
                        {data.weather && (
                          <p className={styles.cardTitle} style={{ fontWeight: 400, textTransform: "none", margin: 0 }}>
                            Погода: {data.weather}
                          </p>
                        )}
                      </div>
                      <div className={styles.tableWrap}>
                        <table className={styles.table}>
                          <thead>
                            <tr>
                              <th>Категория мест</th>
                              <th style={{ textAlign: "right" }}>Продано билетов</th>
                              <th style={{ textAlign: "right" }}>Вместимость</th>
                              <th style={{ textAlign: "right" }}>Заполненность</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(
                              [
                                ["Террасы", data.attendance.terraces, data.attendance.capacityTerraces],
                                ["Обычные", data.attendance.basic, data.attendance.capacityBasic],
                                ["Под крышей", data.attendance.roof, data.attendance.capacityRoof],
                                ["VIP", data.attendance.vip, data.attendance.capacityVip],
                              ] as [string, number, number | null][]
                            ).map(([label, sold, capacity]) => (
                              <tr key={label}>
                                <td>{label}</td>
                                <td className={styles.numCell}>{sold.toLocaleString("ru-RU")}</td>
                                <td className={styles.numCell}>{capacity !== null ? capacity.toLocaleString("ru-RU") : "—"}</td>
                                <td className={styles.numCell}>
                                  {capacity !== null && capacity > 0 ? `${Math.round((sold / capacity) * 100)}%` : "—"}
                                </td>
                              </tr>
                            ))}
                            <tr className={styles.totalRow}>
                              <td>Итого</td>
                              <td className={styles.numCell}>{data.attendance.total.toLocaleString("ru-RU")}</td>
                              <td className={styles.numCell}>
                                {data.attendance.capacityTotal !== null ? data.attendance.capacityTotal.toLocaleString("ru-RU") : "—"}
                              </td>
                              <td className={styles.numCell}>
                                {data.attendance.capacityTotal !== null && data.attendance.capacityTotal > 0
                                  ? `${Math.round((data.attendance.total / data.attendance.capacityTotal) * 100)}%`
                                  : "—"}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 12 }}>
                        {data.attendance.capacityTotal === null &&
                          "Вместимость стадиона для этого матча получить не удалось (см. диагностику внизу). "}
                        Доход от продажи билетов именно за этот матч Hattrick отдельным полем не сообщает — цена за
                        место не входит в ответ CHPP.
                      </p>
                    </>
                  )
                )}
              </div>
            )}
          </div>
        )}

        {/* Сопутствующие панели — ВСЕГДА после .matchPitch (не перед), чтобы
            появление/исчезновение этих блоков при переключении вкладок не
            сдвигало позицию .matchPitch среди соседних элементов и не
            приводило к его пересозданию (React сравнивает детей по
            типу+позиции). */}
        {!loading && data && !data.error && tab === "ratings" && (
          <>
            {(homeStarters.length > 0 || awayStarters.length > 0) && (
              <div className={styles.legendRow} style={{ marginTop: 12 }}>
                <span>
                  <span className={styles.legendDot} style={{ background: "var(--color-good)" }} />
                  {data.homeTeamName || homeName}
                </span>
                <span>
                  <span className={styles.legendDot} style={{ background: "var(--color-text-muted)" }} />
                  {data.awayTeamName || awayName}
                </span>
              </div>
            )}
            <div className={styles.dataPanel} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 16 }}>
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

        {!loading && data && !data.error && tab === "zones" && !data.zonesError && (
          <>
            <div className={styles.dataPanel} style={{ marginTop: 16 }}>
              <div className={styles.zoneInfoPanel}>
                <div className={`${styles.zoneInfoCol} ${styles.zoneInfoColHome}`}>
                  <div className={styles.zoneInfoTeamName}>{data.homeTeamName || homeName}</div>
                  <div className={styles.zoneInfoRow}>
                    {data.homeTactic ?? "—"}
                    {data.homeTeamAttitude ? ` / ${data.homeTeamAttitude}` : ""}
                  </div>
                  <div
                    className={styles.zoneInfoPowerIndex}
                    title="Наш собственный расчётный показатель силы команды в этом матче, на основе зональных рейтингов — не официальный показатель Hattrick"
                  >
                    Индекс силы: <b>{data.homePowerIndex ?? "—"}</b>
                  </div>
                </div>
                <div className={styles.zoneInfoDivider} />
                <div className={`${styles.zoneInfoCol} ${styles.zoneInfoColAway}`}>
                  <div className={styles.zoneInfoTeamName}>{data.awayTeamName || awayName}</div>
                  <div className={styles.zoneInfoRow}>
                    {data.awayTactic ?? "—"}
                    {data.awayTeamAttitude ? ` / ${data.awayTeamAttitude}` : ""}
                  </div>
                  <div
                    className={styles.zoneInfoPowerIndex}
                    title="Наш собственный расчётный показатель силы команды в этом матче, на основе зональных рейтингов — не официальный показатель Hattrick"
                  >
                    Индекс силы: <b>{data.awayPowerIndex ?? "—"}</b>
                  </div>
                </div>
              </div>
              <p style={{ fontSize: 11.5, color: "var(--color-text-muted)", marginTop: 6, marginBottom: 0 }}>
                "Отношение к матчу" CHPP отдаёт только владельцу команды — для соперника поле честно отсутствует (не
                "—" по ошибке). "Индекс силы" — наш собственный расчётный показатель (защита + атака, взвешенные по
                силе полузащиты, 0-100), а не официальный показатель Hattrick и не формула HatStats/LoddarStats. При
                тактике "Контратаки" полузащита в расчёте учтена с официальной поправкой вики Hattrick (−7%) —
                подтверждено эмпирически, что сам RatingMidfield эту поправку не содержит.
              </p>
            </div>

            <div className={styles.dataPanel} style={{ marginTop: 16 }}>
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
          </>
        )}

        {!loading && data && !data.error && tab === "timeline" && !data.timelineError && timeline && (
          <>
            <div className={styles.dataPanel} style={{ marginTop: 16 }}>
              {data.timelineSource === "without-subs" && (
                <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 8 }}>
                  Полный список событий для этого матча не вернулся — показаны голы, карточки и травмы (всегда
                  доступны), но не замены (их можно распознать только из полного отчёта).
                </p>
              )}
              <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "0 0 12px" }}>
                {data.homeTeamName || homeName} — сверху от линии, {data.awayTeamName || awayName} — снизу.
              </p>
              <div className={styles.cardTitle} style={{ marginBottom: 8, fontSize: 11.5 }}>
                Что реально показано на шкале — по типу события
              </div>
              <TimelineEventTypeChecklist />
            </div>

            <div className={styles.dataPanel} style={{ marginTop: 16 }}>
              <AttackMomentsHeading />
            </div>
          </>
        )}

        {!loading && data && SHOW_MATCH_ANALYSIS_DEBUG && data.debug.length > 0 && (
          <div className={styles.dataPanel} style={{ marginTop: 16 }}>
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
