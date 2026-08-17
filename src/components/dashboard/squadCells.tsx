// Общие для "Состава" (SquadTable.tsx) и списка игроков на "Расстановке"
// (LineupPlayerList.tsx) кусочки отображения — вынесены сюда, чтобы обе
// таблицы были буквально одним и тем же кодом/стилем, а не двумя похожими,
// но постепенно расходящимися копиями. Единственное, что осталось только в
// SquadTable.tsx — сам редактируемый PositionBadge (select с возможностью
// сменить амплуа): в "Расстановке" амплуа только отображается, без
// возможности поменять (см. PositionBadgeReadOnly ниже).
import {
  positionAbbrev,
  positionAccentColorForAbbrev,
  positionGroupLabel,
  statusLabel,
  specialtyLabel,
  skillLabel,
  skillWord,
  staminaToLevel,
  type SquadPlayer,
  type PlayerStatus,
  type PlayerStatSnapshot,
  type SquadSkills,
  type PositionGroup,
} from "@/data/squad";
import {
  effectivePositionGroup,
  type PositionOverrides,
  type PositionOverrideValue,
} from "@/data/positionOverrides";
import { computePlayerPotential, type RoleCalibration } from "./zoneRatings";
import type { SlotRole } from "@/data/pitchBoard";
import HeartIcon from "./HeartIcon";
import { SpecialtyIcon, InjuryIcon, CardIcon } from "./StatusIcons";
import { GoalBallIcon } from "./TimelineIcons";
import { diffDirection, diffTitle, type DiffDirection } from "./playerStatChanges";
import styles from "./SquadTable.module.css";
import diffStyles from "./StatDiff.module.css";

export type SkillKey = keyof SquadSkills;

export const skillKeys: SkillKey[] = ["goalkeeping", "defending", "midfield", "winger", "passing", "scoring", "setPieces"];

export const skillShortLabel: Record<SkillKey, string> = {
  goalkeeping: "Вр",
  defending: "Защ",
  midfield: "Пол",
  winger: "Фл",
  passing: "Пас",
  scoring: "Нап",
  setPieces: "Ст",
};

export function diffClass(dir: DiffDirection): string {
  return dir === "up" ? diffStyles.statUp : dir === "down" ? diffStyles.statDown : "";
}

// Цвет самой цифры при изменении — тот же зелёный/красный, что и у фона
// ячейки (diffClass выше), только это цвет текста, а не подсветка.
export function diffTextClass(dir: DiffDirection): string {
  return dir === "up" ? diffStyles.statUpText : dir === "down" ? diffStyles.statDownText : "";
}

// Маленький треугольник рядом с числом — ▲ зелёным при росте, ▼ красным при
// падении, ничего не показываем, если значение не изменилось.
export function DiffArrow({ dir }: { dir: DiffDirection }) {
  if (dir === "none") return null;
  return (
    <span className={`${diffStyles.diffArrow} ${diffTextClass(dir)}`} aria-hidden="true">
      {dir === "up" ? "▲" : "▼"}
    </span>
  );
}

// Каждая шкала (скиллы, форма, лидерство, общая) имеет свой диапазон уровней —
// тир (цвет) считаем по доле от максимума, чтобы раскраска была честной для каждой шкалы
export function tierFromRatio(ratio: number): string {
  if (ratio >= 0.65) return styles.skillTierHigh;
  if (ratio >= 0.3) return styles.skillTierMid;
  return styles.skillTierLow;
}

// Игровой год Hattrick — 112 дней. Дробная часть возраста: округляем дни до
// десятых доли года (Y = round(дни/112*10)/10), например 23 года и 22 дня →
// 23.2.
export function formatAge(age: number, ageDays: number): string {
  const tenths = Math.round((ageDays / 112) * 10);
  return (age + tenths / 10).toFixed(1);
}

// Минимальная форма игрока, которой достаточно для расчёта амплуа/выбора в
// select'е — специально ýже, чем SquadPlayer, чтобы теми же функциями (и
// тем же редактируемым бейджем EditablePositionBadge ниже) могла
// пользоваться и "Юношеская команда" (RealYouthPlayer из youthPlayers.ts),
// у которой нет большинства остальных полей SquadPlayer (форма, TSI и
// т.п.) — см. чат "Юношеская команда: ручной выбор позиции".
export interface AmpluaSource {
  id: number;
  positionGroup: PositionGroup;
  skills: SquadSkills;
}

// Итоговая подпись амплуа с учётом ручного переопределения: если оно явно
// задаёт "MID" или "WING", берём соответствующую подпись напрямую (CM/W), а
// не пересчитываем по навыкам заново — иначе выбор "CM" для игрока с
// доминирующим флангом (или наоборот) сразу же откатился бы обратно.
// Без переопределения — обычная positionAbbrev по навыкам игрока.
export function effectiveAbbrev(player: AmpluaSource, overrides: PositionOverrides): string {
  const override = overrides[player.id];
  if (override === "WING") return "W";
  if (override === "MID") return "CM";
  return positionAbbrev(effectivePositionGroup(player, overrides), player.skills);
}

export function effectiveAbbrevColor(player: AmpluaSource, overrides: PositionOverrides): string {
  return positionAccentColorForAbbrev(effectiveAbbrev(player, overrides));
}

// 5 явно выбираемых вариантов вместо 4 — полузащита разделена на "MID"
// (центральный, CM) и "WING" (фланговый, W), чтобы оба были доступны для
// ручного выбора наравне с GK/DEF/FWD, а не только тот, что подсказывают
// навыки игрока (см. PositionOverrideValue в data/positionOverrides.ts).
export const positionOptions: PositionOverrideValue[] = ["GK", "DEF", "MID", "WING", "FWD"];

export const overrideAbbrevLabel: Record<PositionOverrideValue, string> = {
  GK: "GK",
  DEF: "CD",
  MID: "CM",
  WING: "W",
  FWD: "ST",
};

export const abbrevToOverrideValue: Record<string, PositionOverrideValue> = {
  GK: "GK",
  CD: "DEF",
  CM: "MID",
  W: "WING",
  ST: "FWD",
};

// Что сейчас выбрано в select'е (см. EditablePositionBadge) — ручное
// переопределение, если задано, иначе то же значение, что вывела бы
// effectiveAbbrev, только в словаре PositionOverrideValue (GK/DEF/MID/
// WING/FWD), а не готовых подписях.
export function currentSelection(player: AmpluaSource, overrides: PositionOverrides): PositionOverrideValue {
  return abbrevToOverrideValue[effectiveAbbrev(player, overrides)];
}

// Природное значение без учёта переопределений — нужно, чтобы понять,
// вернул ли выбор в select'е игрока к его естественному амплуа (тогда
// переопределение снимается целиком, onChange получает null) или задаёт
// настоящее ручное исключение.
export function naturalSelection(player: AmpluaSource): PositionOverrideValue {
  return abbrevToOverrideValue[effectiveAbbrev(player, {})];
}

// Амплуа игрока — цветной бейдж-селект (акцент по эффективной подписи:
// ручное переопределение, если оно задано, иначе естественная позиция/
// навыки игрока). Клик открывает нативный выбор из 5 вариантов (GK/CD/CM/
// W/ST); при выборе значения, отличного от естественного, рядом
// появляется значок "✎" с подсказкой. Общий для "Состава" (SquadTable.tsx
// оборачивает его своей проверкой на тренера — у него амплуа менять
// нечему, см. TrainerPositionBadge) и "Юношеской команды" (YouthTable.tsx,
// тренера там нет вовсе).
export function EditablePositionBadge<T extends AmpluaSource>({
  player,
  overrides,
  onChange,
}: {
  player: T;
  overrides: PositionOverrides;
  onChange: (playerId: number, value: PositionOverrideValue | null) => void;
}) {
  const selection = currentSelection(player, overrides);
  const natural = naturalSelection(player);
  const isOverridden = selection !== natural;
  const naturalAbbrev = effectiveAbbrev(player, {});
  const overrideTitle = `Амплуа изменено вручную — естественная позиция: ${naturalAbbrev} (${positionGroupLabel[player.positionGroup]})`;

  return (
    <span className={styles.positionWrap} onClick={(e) => e.stopPropagation()}>
      <select
        className={styles.positionBadge}
        style={{ "--position-accent": effectiveAbbrevColor(player, overrides) } as React.CSSProperties}
        value={selection}
        title={isOverridden ? overrideTitle : undefined}
        onChange={(e) => {
          const next = e.target.value as PositionOverrideValue;
          onChange(player.id, next === natural ? null : next);
        }}
      >
        {positionOptions.map((v) => (
          <option key={v} value={v}>
            {overrideAbbrevLabel[v]}
          </option>
        ))}
      </select>
      {isOverridden && (
        <span className={styles.overrideMark} title={overrideTitle}>
          ✎
        </span>
      )}
    </span>
  );
}

// Порядок позиций по умолчанию (сортировка "Поз." по возрастанию): Вратарь →
// Защитник → Полузащитник → Вингер → Нападающий. Тренер команды получает
// ранг ЗА пределами этой шкалы (5) — сортируется последним независимо от
// его игровой позиции, как и попросили (см. чат "сортировка по умолчанию").
const positionRank: Record<string, number> = { GK: 0, CD: 1, CM: 2, W: 3, ST: 4 };
const TRAINER_RANK = 5;

export function positionSortValue<T extends AmpluaSource>(
  player: T,
  overrides: PositionOverrides,
  trainerPlayerId: number | undefined,
): number {
  if (trainerPlayerId !== undefined && player.id === trainerPlayerId) return TRAINER_RANK;
  return positionRank[effectiveAbbrev(player, overrides)] ?? TRAINER_RANK;
}

// Обозначение тренера в столбце "Поз." — "Т" вместо его игровой позиции: у
// тренера нет настоящего амплуа в смысле навыков/расстановки, и он не
// участвует в подсчёте средних (см. AverageRow), так что показывать его
// GK/CD/CM/W/ST было бы вводящим в заблуждение. Бейдж не кликабелен (даже
// в "Составе", где остальные позиции можно менять вручную) — амплуа менять
// нечему.
const TRAINER_ABBREV = "Т";
// Отдельный синий — не пересекается ни с одним амплуа (GK зелёный, DEF
// оранжевый, MID жёлтый, WING бирюзовый, FWD красный, см.
// positionGroupAccentColor/positionAbbrevAccentColor в data/squad.ts) — по
// запросу цвет бейджа тренера сделан однозначно отличимым от игровых
// позиций.
const TRAINER_ACCENT_COLOR = "#4a90d9";

export function TrainerPositionBadge() {
  return (
    <span
      className={`${styles.positionBadge} ${styles.positionBadgeStatic}`}
      style={{ "--position-accent": TRAINER_ACCENT_COLOR, cursor: "default" } as React.CSSProperties}
      title="Тренер команды"
    >
      {TRAINER_ABBREV}
    </span>
  );
}

// Цветовая метка амплуа перед именем игрока — та же акцентная полоска
// везде, где показывается список игроков (Состав, Расстановка, карточки на
// поле). Цвет всегда берётся из эффективного амплуа (ручное переопределение,
// если оно задано, иначе естественная позиция) — то есть зависит от самого
// игрока, а не от того, где он сейчас числится в составе.
export function AmpluaAccent({ player, overrides }: { player: SquadPlayer; overrides: PositionOverrides }) {
  return <span className={styles.ampluaAccent} style={{ background: effectiveAbbrevColor(player, overrides) }} />;
}

// Амплуа игрока — цветной бейдж, БЕЗ возможности изменить (в отличие от
// PositionBadge в SquadTable.tsx, который рендерит редактируемый select) —
// используется в списке игроков на "Расстановке", где менять амплуа нельзя.
export function PositionBadgeReadOnly({
  player,
  overrides,
  trainerPlayerId,
}: {
  player: SquadPlayer;
  overrides: PositionOverrides;
  trainerPlayerId?: number;
}) {
  if (trainerPlayerId !== undefined && player.id === trainerPlayerId) {
    return <TrainerPositionBadge />;
  }
  const abbrev = effectiveAbbrev(player, overrides);
  const color = positionAccentColorForAbbrev(abbrev);
  return (
    <span
      className={`${styles.positionBadge} ${styles.positionBadgeStatic}`}
      style={{ "--position-accent": color, cursor: "default" } as React.CSSProperties}
    >
      {abbrev}
    </span>
  );
}

function StatusTag({ status }: { status: PlayerStatus }) {
  const cls =
    status === "starting"
      ? styles.statusStarting
      : status === "bench" || status === "squad"
        ? styles.statusBench
        : styles.statusInjured;
  return (
    <span className={`${styles.statusTag} ${cls}`}>
      <span className={styles.statusDot} />
      {statusLabel[status]}
    </span>
  );
}

// Обычная SVG вместо эмодзи-символа 👍 — не все эмодзи одинаково рисуются
// как картинка на Windows.
function ThumbsUpIcon({ title }: { title: string }) {
  return (
    <span title={title} aria-label={title} style={{ display: "inline-flex", flex: "none" }}>
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path d="M4 11h3v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z" fill="var(--color-good)" />
        <path
          d="M9 11l3.2-6.4a1.4 1.4 0 0 1 2.6 1l-.9 3.4H18a2 2 0 0 1 1.9 2.6l-1.6 5.6A2 2 0 0 1 16.4 19H9v-8Z"
          fill="none"
          stroke="var(--color-good)"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

// Статус игрока — "в составе"/"в основе" (здоров, ничего особенного)
// показываем иконкой вместо текста, с общей подсказкой "Готов" (одна и та
// же иконка для обоих статусов — незачем показывать разный текст); "в
// запасе" — текстовой меткой. Травма (InjuryIcon) и 👍 взаимоисключающие —
// обе идут через ОДНУ и ту же функцию (эта), а не через отдельные условные
// блоки в разных местах разметки: раньше InjuryIcon рендерился отдельным
// блоком ПОСЛЕ специализации в StatusRow, из-за чего у травмированного
// игрока порядок значков в столбце "Статус" отличался от здорового (значок
// травмы оказывался вторым, а не первым) — фиксированный порядок (статус →
// специализация → карточки) требует ровно одного места для 1-й позиции.
function StatusIndicator({ player }: { player: SquadPlayer }) {
  if (player.injuryWeeksRemaining !== undefined) {
    return <InjuryIcon weeksRemaining={player.injuryWeeksRemaining} />;
  }
  if (player.status === "starting" || player.status === "squad") {
    return <ThumbsUpIcon title="Готов" />;
  }
  if (player.status === "injured") {
    return null;
  }
  return <StatusTag status={player.status} />;
}

// Компактный ряд значков в столбце "Статус" — ФИКСИРОВАННЫЙ порядок позиций
// (1 — готовность/травма, 2 — специализация, 3 — карточки), не зависящий от
// того, какие именно значки есть у конкретного игрока: отсутствующая позиция
// просто пропускается, а не сдвигает следующие. См. StatusIndicator выше про
// то, почему готовность и травма — это ОДНА позиция, а не две.
export function StatusRow({ player }: { player: SquadPlayer }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, flexWrap: "nowrap" }}>
      <StatusIndicator player={player} />
      {player.specialty && <SpecialtyIcon specialty={player.specialty} label={specialtyLabel[player.specialty]} />}
      {player.isSuspended && <CardIcon color="red" />}
      {!player.isSuspended && player.yellowCards !== undefined && player.yellowCards > 0 && (
        <CardIcon color="yellow" count={player.yellowCards} />
      )}
    </span>
  );
}

// Навыки (Вратарь/Защита/.../Стандарты), Опыт и Преданность — числом по
// официальной шкале 0-20; Форма и Выносливость — по короткой шкале 0-8.
// max задаёт диапазон для цветовой раскраски (тира) и подсказки.
export function SkillNumberCell({
  value,
  max = 20,
  diff = "none",
  hoverWord,
}: {
  value: number;
  max?: number;
  diff?: DiffDirection;
  hoverWord: string;
}) {
  const valueColorClass = diff !== "none" ? diffTextClass(diff) : tierFromRatio(value / max);
  return (
    <td className={`${styles.skillCell} ${diffClass(diff)}`} title={hoverWord}>
      <span className={`${styles.skillWord} ${valueColorClass}`}>
        {value}
        <DiffArrow dir={diff} />
      </span>
    </td>
  );
}

// Преданность клубу — числом 0-20 (см. SkillNumberCell), либо сердцем у
// воспитанников родного клуба вместо цифры.
export function LoyaltyCell({ player }: { player: SquadPlayer }) {
  if (player.isClubProduct) {
    return (
      <td className={styles.skillCell} title="Воспитанник родного клуба">
        <HeartIcon />
      </td>
    );
  }
  if (player.loyalty === undefined) {
    return <td className={styles.skillCell}>—</td>;
  }
  return <SkillNumberCell value={player.loyalty} hoverWord={skillWord(player.loyalty)} />;
}

// Универсальная звёздная ячейка — переиспользуется для Рейтинга последнего
// матча и Потенциала, оба на реальной шкале звёзд Hattrick (открытой сверху,
// см. STAR_SCALE_FLOOR в zoneRatings.ts — оценки 13+ бывают на практике, "из
// 10" было бы неверно). Раскраска по "тиру" (tierFromRatio) остаётся условным
// делением на 10 просто как якорь шкалы — не жёсткий потолок отображения.
// "—", если значения нет.
export function RatingCell({ rating }: { rating?: number }) {
  if (rating === undefined) {
    return <td className={styles.skillCell}>—</td>;
  }
  return (
    <td className={styles.skillCell} title={`${rating.toFixed(1)}★`}>
      <span className={`${styles.skillWord} ${tierFromRatio(rating / 10)}`}>★ {rating.toFixed(1)}</span>
    </td>
  );
}

// Тренер команды в Hattrick — небольшая нейтральная иконка рядом с именем.
export function TrainerIcon() {
  return (
    <span
      title="Тренер команды"
      aria-label="Тренер команды"
      style={{ display: "inline-flex", marginLeft: 6, verticalAlign: "middle", flex: "none" }}
    >
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
        <circle cx="8" cy="12" r="6" fill="none" stroke="var(--color-accent)" strokeWidth="1.8" />
        <circle cx="8" cy="12" r="1.6" fill="var(--color-accent)" />
        <path d="M14 12h6" stroke="var(--color-accent)" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M18 9v6" stroke="var(--color-accent)" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function average(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// Как diffTitle, но не считает подсказку вовсе, если самого текущего
// среднего нет (пустой состав или ни у кого нет этого показателя) — иначе
// diffTitle получил бы фиктивный 0 вместо реального "нечего показывать".
function avgDiffTitle(
  label: string,
  prev: number | undefined,
  curr: number | undefined,
  format?: (n: number) => string,
): string | undefined {
  if (curr === undefined) return undefined;
  return diffTitle(label, prev, curr, format);
}

function AverageDecimalCell({
  value,
  max = 20,
  diff = "none",
  hoverWord,
}: {
  value: number | undefined;
  max?: number;
  diff?: DiffDirection;
  hoverWord?: string;
}) {
  if (value === undefined) {
    return <td className={styles.skillCell}>—</td>;
  }
  const valueColorClass = diff !== "none" ? diffTextClass(diff) : tierFromRatio(value / max);
  return (
    <td className={`${styles.skillCell} ${diffClass(diff)}`} title={hoverWord}>
      <span className={`${styles.skillWord} ${valueColorClass}`}>
        {value.toFixed(1)}
        <DiffArrow dir={diff} />
      </span>
    </td>
  );
}

function AverageRatingCell({ value }: { value: number | undefined }) {
  if (value === undefined) return <td className={styles.skillCell}>—</td>;
  return (
    <td className={styles.skillCell} title={`${value.toFixed(1)}★`}>
      <span className={`${styles.skillWord} ${tierFromRatio(value / 10)}`}>★ {value.toFixed(1)}</span>
    </td>
  );
}

// Строка "Среднее" под таблицей (Состав/Расстановка — общая реализация, обе
// таблицы делят один и тот же набор столбцов) — усреднённое значение по
// каждому числовому столбцу текущего состава. Тренер исключён из подсчёта
// (см. trainerPlayerId) — его показатели не сопоставимы с показателями
// игроков. Подсказка при наведении сравнивает это среднее со средним на
// момент прошлого сохранённого снимка — та же понедельная логика сравнения,
// что и у отдельных игроков (playerStatChanges.ts), только "прошлое
// среднее" считается по подмножеству игроков, у которых вообще есть
// сохранённый прошлый снимок (лучшее доступное приближение к "средний
// показатель команды неделю назад", если состав успел немного измениться —
// трансферы и т.п.). Столбцы без исторического снимка (возраст,
// преданность, рейтинг матча, потенциал) показывают среднее без стрелки —
// сравнивать не с чем.
export function AverageRow({
  players,
  prevByPlayerId,
  hasLoyalty,
  hasRating,
  trainerPlayerId,
  calibrations = {},
  teamMoraleValue = null,
  teamConfidenceValue = null,
}: {
  players: SquadPlayer[];
  prevByPlayerId: Record<number, PlayerStatSnapshot | undefined>;
  hasLoyalty: boolean;
  hasRating: boolean;
  trainerPlayerId?: number;
  calibrations?: Partial<Record<SlotRole, RoleCalibration>>;
  teamMoraleValue?: number | null;
  teamConfidenceValue?: number | null;
}) {
  const squad = trainerPlayerId !== undefined ? players.filter((p) => p.id !== trainerPlayerId) : players;
  if (squad.length === 0) return null;

  const fmt1 = (n: number) => n.toFixed(1);
  const withPrev = squad.filter((p) => prevByPlayerId[p.id] !== undefined);
  const prevOf = (p: SquadPlayer) => prevByPlayerId[p.id] as PlayerStatSnapshot;

  const avgAge = average(squad.map((p) => p.age + p.ageDays / 112));

  const avgTsi = average(squad.map((p) => p.tsi));
  const prevAvgTsi = average(withPrev.map((p) => prevOf(p).tsi));
  const tsiDiff = avgTsi !== undefined ? diffDirection(avgTsi, prevAvgTsi) : "none";

  const avgForm = average(squad.map((p) => p.form));
  const prevAvgForm = average(withPrev.map((p) => prevOf(p).form));
  const formDiff = avgForm !== undefined ? diffDirection(avgForm, prevAvgForm) : "none";

  const avgExperience = average(squad.map((p) => p.experience));
  const prevAvgExperience = average(withPrev.map((p) => prevOf(p).experience));
  const experienceDiff = avgExperience !== undefined ? diffDirection(avgExperience, prevAvgExperience) : "none";

  const avgStamina = average(squad.map((p) => staminaToLevel(p.stamina)));
  const prevAvgStamina = average(withPrev.map((p) => staminaToLevel(prevOf(p).stamina)));
  const staminaDiff = avgStamina !== undefined ? diffDirection(avgStamina, prevAvgStamina) : "none";

  const avgLoyalty = average(squad.filter((p) => p.loyalty !== undefined).map((p) => p.loyalty as number));
  const avgRating = average(
    squad.filter((p) => p.lastMatchRating !== undefined).map((p) => p.lastMatchRating as number),
  );
  const avgPotential = average(
    squad.map((p) => computePlayerPotential(p, p.positionGroup, calibrations, teamMoraleValue, teamConfidenceValue)),
  );

  return (
    <tr className={styles.avgRow}>
      <td colSpan={2} className={styles.avgLabel} title="Среднее по составу (без учёта тренера)">
        <GoalBallIcon size={16} />
      </td>
      <td className={styles.numCell}>{avgAge !== undefined ? avgAge.toFixed(1) : "—"}</td>
      <td className={styles.flagCell}>—</td>
      <td>—</td>
      <td
        className={`${styles.moneyCell} ${diffClass(tsiDiff)}`}
        title={avgDiffTitle("Средний TSI", prevAvgTsi, avgTsi, (n) => Math.round(n).toLocaleString("ru-RU"))}
      >
        {avgTsi !== undefined ? (
          <>
            <span className={diffTextClass(tsiDiff)}>{Math.round(avgTsi).toLocaleString("ru-RU")}</span>
            <DiffArrow dir={tsiDiff} />
          </>
        ) : (
          "—"
        )}
      </td>
      <AverageDecimalCell
        value={avgForm}
        max={8}
        diff={formDiff}
        hoverWord={avgDiffTitle("Средняя форма", prevAvgForm, avgForm, fmt1)}
      />
      <AverageDecimalCell
        value={avgExperience}
        diff={experienceDiff}
        hoverWord={avgDiffTitle("Средний опыт", prevAvgExperience, avgExperience, fmt1)}
      />
      <AverageDecimalCell
        value={avgStamina}
        max={8}
        diff={staminaDiff}
        hoverWord={avgDiffTitle("Средняя выносливость", prevAvgStamina, avgStamina, fmt1)}
      />
      {skillKeys.map((k) => {
        const avgSkill = average(squad.map((p) => p.skills[k]));
        const prevAvgSkill = average(withPrev.map((p) => prevOf(p).skills[k]));
        const skillDiff = avgSkill !== undefined ? diffDirection(avgSkill, prevAvgSkill) : "none";
        return (
          <AverageDecimalCell
            key={k}
            value={avgSkill}
            diff={skillDiff}
            hoverWord={avgDiffTitle(`Средний(ая) ${skillLabel[k]}`, prevAvgSkill, avgSkill, fmt1)}
          />
        );
      })}
      {hasLoyalty && <AverageDecimalCell value={avgLoyalty} />}
      {hasRating && <AverageRatingCell value={avgRating} />}
      <AverageRatingCell value={avgPotential} />
    </tr>
  );
}

export { skillLabel };
