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
  statusLabel,
  specialtyLabel,
  skillLabel,
  skillWord,
  type SquadPlayer,
  type PlayerStatus,
  type SquadSkills,
} from "@/data/squad";
import { effectivePositionGroup, type PositionOverrides } from "@/data/positionOverrides";
import HeartIcon from "./HeartIcon";
import { SpecialtyIcon, InjuryIcon, CardIcon } from "./StatusIcons";
import { type DiffDirection } from "./playerStatChanges";
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

// Итоговая подпись амплуа с учётом ручного переопределения: если оно явно
// задаёт "MID" или "WING", берём соответствующую подпись напрямую (CM/W), а
// не пересчитываем по навыкам заново — иначе выбор "CM" для игрока с
// доминирующим флангом (или наоборот) сразу же откатился бы обратно.
// Без переопределения — обычная positionAbbrev по навыкам игрока.
export function effectiveAbbrev(player: SquadPlayer, overrides: PositionOverrides): string {
  const override = overrides[player.id];
  if (override === "WING") return "W";
  if (override === "MID") return "CM";
  return positionAbbrev(effectivePositionGroup(player, overrides), player.skills);
}

export function effectiveAbbrevColor(player: SquadPlayer, overrides: PositionOverrides): string {
  return positionAccentColorForAbbrev(effectiveAbbrev(player, overrides));
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
export function PositionBadgeReadOnly({ player, overrides }: { player: SquadPlayer; overrides: PositionOverrides }) {
  const abbrev = effectiveAbbrev(player, overrides);
  const color = positionAccentColorForAbbrev(abbrev);
  return (
    <span
      className={styles.positionBadge}
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
// показываем иконкой вместо текста; "в запасе" — текстовой меткой.
// "Травмирован" текстом не показываем вовсе — статус травмы виден по
// значку InjuryIcon ниже (рендерится отдельно, по injuryWeeksRemaining).
function StatusIndicator({ status }: { status: PlayerStatus }) {
  if (status === "starting" || status === "squad") {
    return <ThumbsUpIcon title={statusLabel[status]} />;
  }
  if (status === "injured") {
    return null;
  }
  return <StatusTag status={status} />;
}

// Компактный ряд значков в столбце "Статус": базовый статус (👍/в запасе) +
// специализация (если есть) + значок травмы по сроку восстановления +
// карточки (жёлтые с числом предупреждений в сезоне, красная — при
// дисквалификации).
export function StatusRow({ player }: { player: SquadPlayer }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, flexWrap: "nowrap" }}>
      <StatusIndicator status={player.status} />
      {player.specialty && <SpecialtyIcon specialty={player.specialty} label={specialtyLabel[player.specialty]} />}
      {player.injuryWeeksRemaining !== undefined && <InjuryIcon weeksRemaining={player.injuryWeeksRemaining} />}
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

// Универсальная звёздная ячейка (0-10, с десятыми) — переиспользуется для
// Рейтинга последнего матча и Потенциала. "—", если значения нет.
export function RatingCell({ rating }: { rating?: number }) {
  if (rating === undefined) {
    return <td className={styles.skillCell}>—</td>;
  }
  return (
    <td className={styles.skillCell} title={`${rating.toFixed(1)} из 10`}>
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

export { skillLabel };
