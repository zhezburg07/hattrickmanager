"use client";

import { useMemo, useState } from "react";
import {
  positionGroupLabel,
  positionGroupAccentColor,
  statusLabel,
  skillLabel,
  skillWord,
  formWord,
  leadershipWord,
  staminaToLevel,
  type SquadPlayer,
  type PlayerStatus,
  type PlayerStatSnapshot,
  type SquadSkills,
  type PositionGroup,
} from "@/data/squad";
import { usePositionOverrides, effectivePositionGroup, type PositionOverrides } from "@/data/positionOverrides";
import NationalityTag from "./NationalityTag";
import FlagIcon from "./FlagIcon";
import HeartIcon from "./HeartIcon";
import PlayerDetailModal from "./PlayerDetailModal";
import { diffDirection, diffTitle, type DiffDirection } from "./playerStatChanges";
import styles from "./SquadTable.module.css";
import diffStyles from "./StatDiff.module.css";

function diffClass(dir: DiffDirection): string {
  return dir === "up" ? diffStyles.statUp : dir === "down" ? diffStyles.statDown : "";
}

type SkillKey = keyof SquadSkills;
type SortKey =
  | "flag"
  | "name"
  | "age"
  | "positionGroup"
  | "experience"
  | "form"
  | "stamina"
  | SkillKey
  | "leadership"
  | "tsi"
  | "salary"
  | "status"
  | "loyalty"
  | "rating";

type SortDir = "asc" | "desc";

const skillKeys: SkillKey[] = ["goalkeeping", "defending", "midfield", "winger", "passing", "scoring", "setPieces"];

const skillShortLabel: Record<SkillKey, string> = {
  goalkeeping: "Вр",
  defending: "Защ",
  midfield: "Пол",
  winger: "Фл",
  passing: "Пас",
  scoring: "Нап",
  setPieces: "Ст",
};

const baseColumns: { key: SortKey; label: string; title?: string }[] = [
  { key: "positionGroup", label: "Позиция" },
  { key: "name", label: "Имя" },
  { key: "age", label: "Возраст" },
  { key: "flag", label: "Флаг", title: "Национальность" },
  { key: "status", label: "Статус" },
  { key: "tsi", label: "TSI" },
  { key: "form", label: "Форма" },
  { key: "experience", label: "Опыт" },
  { key: "stamina", label: "Вынос-ть" },
  ...skillKeys.map((k) => ({ key: k as SortKey, label: skillShortLabel[k], title: skillLabel[k] })),
  { key: "leadership", label: "Лидер", title: "Лидерство" },
  { key: "salary", label: "Зарплата" },
  { key: "loyalty", label: "Предан.", title: "Преданность клубу" },
  { key: "rating", label: "Рейтинг", title: "Рейтинг за последний сыгранный матч" },
];

// текстовые колонки по умолчанию сортируются от А до Я,
// числовые — сначала лучшие показатели
const textColumns = new Set<SortKey>(["flag", "name", "positionGroup", "status"]);

const statusRank: Record<PlayerStatus, number> = { starting: 0, bench: 1, squad: 1, injured: 2 };

const positionOptions: PositionGroup[] = ["GK", "DEF", "MID", "FWD"];

function getValue(player: SquadPlayer, key: SortKey, overrides: PositionOverrides): string | number {
  switch (key) {
    case "flag":
      return player.nationality.name;
    case "name":
      return player.name;
    case "age":
      return player.age + player.ageDays / 112;
    case "positionGroup":
      return positionGroupLabel[effectivePositionGroup(player, overrides)];
    case "form":
      return player.form;
    case "stamina":
      return player.stamina;
    case "experience":
      return player.experience;
    case "leadership":
      return player.leadership;
    case "loyalty":
      return player.isClubProduct ? 21 : (player.loyalty ?? -1);
    case "rating":
      return player.lastMatchRating ?? -1;
    case "tsi":
      return player.tsi;
    case "salary":
      return player.salary;
    case "status":
      return statusRank[player.status];
    default:
      return player.skills[key as SkillKey];
  }
}

// Каждая шкала (скиллы, форма, лидерство, общая) имеет свой диапазон уровней —
// тир (цвет) считаем по доле от максимума, чтобы раскраска была честной для каждой шкалы
function tierFromRatio(ratio: number): string {
  if (ratio >= 0.65) return styles.skillTierHigh;
  if (ratio >= 0.3) return styles.skillTierMid;
  return styles.skillTierLow;
}

function formatSalary(value: number): string {
  return `${value.toLocaleString("ru-RU")} ₸`;
}

// Игровой год Hattrick — 112 дней. Дробная часть возраста: округляем дни до
// десятых доли года (Y = round(дни/112*10)/10), например 23 года и 22 дня →
// 23.2.
function formatAge(age: number, ageDays: number): string {
  const tenths = Math.round((ageDays / 112) * 10);
  return (age + tenths / 10).toFixed(1);
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

// Обычная SVG вместо эмодзи-символа 👍 — та же причина, что и у иконки
// тренера/сердца: не все эмодзи одинаково рисуются как картинка на Windows.
function ThumbsUpIcon() {
  return (
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
  );
}

// Статус игрока — "в составе"/"в основе" (здоров, ничего особенного)
// показываем иконкой вместо текста, чтобы не занимать место повторяющейся
// надписью в каждой строке; остальные статусы (травмирован, в запасе)
// оставлены текстовой меткой — там сама надпись несёт полезную информацию.
function StatusIndicator({ status }: { status: PlayerStatus }) {
  if (status === "starting" || status === "squad") {
    return <ThumbsUpIcon />;
  }
  return <StatusTag status={status} />;
}

function LevelCell({
  word,
  ratio,
  diff = "none",
  title,
}: {
  word: string;
  ratio: number;
  diff?: DiffDirection;
  title?: string;
}) {
  return (
    <td className={`${styles.skillCell} ${diffClass(diff)}`} title={title}>
      <span className={`${styles.skillWord} ${tierFromRatio(ratio)}`}>{word}</span>
    </td>
  );
}

// Навыки (Вратарь/Защита/.../Стандарты), Опыт и Преданность — числом по
// официальной шкале 0-20; Форма и Выносливость — по короткой шкале 0-8 (см.
// чат). max задаёт диапазон для цветовой раскраски (тира) и подсказки.
function SkillNumberCell({
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
  return (
    <td className={`${styles.skillCell} ${diffClass(diff)}`} title={hoverWord}>
      <span className={`${styles.skillWord} ${tierFromRatio(value / max)}`}>{value}</span>
    </td>
  );
}

// Преданность клубу — числом 0-20 (см. SkillNumberCell), либо сердцем у
// воспитанников родного клуба вместо цифры.
function LoyaltyCell({ player }: { player: SquadPlayer }) {
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

// Рейтинг за последний сыгранный матч (0-10, с десятыми) — реальные данные
// см. src/lib/lastMatchRating.ts. "—", если игрок не выходил на поле в
// последнем матче или данные не удалось получить.
function RatingCell({ rating }: { rating?: number }) {
  if (rating === undefined) {
    return <td className={styles.skillCell}>—</td>;
  }
  return (
    <td className={styles.skillCell} title={`${rating.toFixed(1)} из 10`}>
      <span className={`${styles.skillWord} ${tierFromRatio(rating / 10)}`}>★ {rating.toFixed(1)}</span>
    </td>
  );
}

// Тренер команды в Hattrick — один из собственных игроков (см.
// src/lib/teamDetails.ts, trainerPlayerId) — небольшая нейтральная иконка
// рядом с именем, чтобы выделить его в общем списке. Обычная SVG вместо
// эмодзи — эмодзи-символы на Windows не всегда рисуются как картинка (см.
// историю с флагами стран).
function TrainerIcon() {
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

// Цветовая метка амплуа перед именем игрока — та же акцентная полоска, что и
// на карточках игроков на поле вкладки "Расстановка". Цвет всегда берётся из
// эффективного амплуа (ручное переопределение, если оно задано, иначе
// естественная позиция) — то есть зависит от самого игрока, а не от того,
// где он сейчас числится в составе (основа/запас/список).
function AmpluaAccent({ player, overrides }: { player: SquadPlayer; overrides: PositionOverrides }) {
  const effective = effectivePositionGroup(player, overrides);
  return <span className={styles.ampluaAccent} style={{ background: positionGroupAccentColor[effective] }} />;
}

// Амплуа игрока — цветной бейдж-селект (акцент по эффективному амплуа: ручное
// переопределение, если оно задано, иначе естественная позиция из тестовых
// данных). Клик открывает нативный выбор из 4 амплуа; при выборе значения,
// отличного от естественного, рядом появляется значок "✎" с подсказкой.
function PositionBadge({
  player,
  overrides,
  onChange,
}: {
  player: SquadPlayer;
  overrides: PositionOverrides;
  onChange: (playerId: number, group: PositionGroup | null) => void;
}) {
  const effective = effectivePositionGroup(player, overrides);
  const isOverridden = effective !== player.positionGroup;
  const overrideTitle = `Амплуа изменено вручную — естественная позиция: ${positionGroupLabel[player.positionGroup]}`;

  return (
    <span className={styles.positionWrap} onClick={(e) => e.stopPropagation()}>
      <select
        className={styles.positionBadge}
        style={{ "--position-accent": positionGroupAccentColor[effective] } as React.CSSProperties}
        value={effective}
        title={isOverridden ? overrideTitle : undefined}
        onChange={(e) => {
          const next = e.target.value as PositionGroup;
          onChange(player.id, next === player.positionGroup ? null : next);
        }}
      >
        {positionOptions.map((g) => (
          <option key={g} value={g}>
            {positionGroupLabel[g]}
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

export default function SquadTable({
  players,
  prevByPlayerId,
  trainerPlayerId,
}: {
  players: SquadPlayer[];
  prevByPlayerId: Record<number, PlayerStatSnapshot | undefined>;
  trainerPlayerId?: number;
}) {
  const roster = players;
  const effectiveTrainerPlayerId = trainerPlayerId;
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selectedPlayer, setSelectedPlayer] = useState<SquadPlayer | null>(null);
  const { overrides, setOverride } = usePositionOverrides();
  const resolvedPrevByPlayerId = prevByPlayerId;

  // Прячем столбцы целиком, если ни у одного игрока нет данных, вместо
  // пустых прочерков в каждой строке (реальные "преданность"/"рейтинг" не
  // всегда доступны, см. src/lib/squadPlayers.ts, src/lib/lastMatchRating.ts).
  const hasLoyalty = roster.some((p) => p.loyalty !== undefined || p.isClubProduct);
  const hasRating = roster.some((p) => p.lastMatchRating !== undefined);
  const columns = baseColumns.filter((c) => (c.key === "loyalty" ? hasLoyalty : c.key === "rating" ? hasRating : true));

  const sorted = useMemo(() => {
    const list = [...roster];
    list.sort((a, b) => {
      const va = getValue(a, sortKey, overrides);
      const vb = getValue(b, sortKey, overrides);
      const cmp =
        typeof va === "string" && typeof vb === "string"
          ? va.localeCompare(vb, "ru")
          : (va as number) - (vb as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [roster, sortKey, sortDir, overrides]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(textColumns.has(key) ? "asc" : "desc");
  }

  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>Полный состав ({roster.length} игроков)</div>
      <p className={styles.hint}>
        Нажмите на заголовок столбца, чтобы отсортировать таблицу, или на строку игрока, чтобы увидеть его карточку.
      </p>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} title={col.title}>
                  <button
                    type="button"
                    className={`${styles.th} ${sortKey === col.key ? styles.thActive : ""}`}
                    onClick={() => handleSort(col.key)}
                  >
                    {col.label}
                    {sortKey === col.key && (
                      <span className={styles.sortArrow}>{sortDir === "asc" ? "▲" : "▼"}</span>
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const prev = resolvedPrevByPlayerId[p.id];
              const tsiDiff = diffDirection(p.tsi, prev?.tsi);
              const staminaLevel = staminaToLevel(p.stamina);
              const prevStaminaLevel = prev?.stamina !== undefined ? staminaToLevel(prev.stamina) : undefined;
              const staminaDiff = diffDirection(staminaLevel, prevStaminaLevel);
              return (
              <tr key={p.id} className={styles.rowClickable} onClick={() => setSelectedPlayer(p)}>
                <td>
                  <PositionBadge player={p} overrides={overrides} onChange={setOverride} />
                </td>
                <td className={styles.nameCell}>
                  <AmpluaAccent player={p} overrides={overrides} />
                  {p.name}
                  {p.id === effectiveTrainerPlayerId && <TrainerIcon />}
                </td>
                <td className={styles.numCell}>{formatAge(p.age, p.ageDays)}</td>
                <td className={styles.flagCell}>
                  <FlagIcon country={p.nationality} />
                </td>
                <td title={p.status === "starting" || p.status === "squad" ? statusLabel[p.status] : undefined}>
                  <StatusIndicator status={p.status} />
                </td>
                <td
                  className={`${styles.moneyCell} ${diffClass(tsiDiff)}`}
                  title={diffTitle("TSI", prev?.tsi, p.tsi, (n) => n.toLocaleString("ru-RU"))}
                >
                  {p.tsi.toLocaleString("ru-RU")}
                </td>
                <SkillNumberCell
                  value={p.form}
                  max={8}
                  diff={diffDirection(p.form, prev?.form)}
                  hoverWord={diffTitle("Форма", prev?.form, p.form) ?? formWord(p.form)}
                />
                <SkillNumberCell
                  value={p.experience}
                  diff={diffDirection(p.experience, prev?.experience)}
                  hoverWord={diffTitle("Опыт", prev?.experience, p.experience) ?? skillWord(p.experience)}
                />
                <SkillNumberCell
                  value={staminaLevel}
                  max={8}
                  diff={staminaDiff}
                  hoverWord={diffTitle("Выносливость", prevStaminaLevel, staminaLevel) ?? formWord(staminaLevel)}
                />
                {skillKeys.map((k) => (
                  <SkillNumberCell
                    key={k}
                    value={p.skills[k]}
                    diff={diffDirection(p.skills[k], prev?.skills[k])}
                    hoverWord={diffTitle(skillLabel[k], prev?.skills[k], p.skills[k]) ?? skillWord(p.skills[k])}
                  />
                ))}
                <LevelCell word={leadershipWord(p.leadership)} ratio={p.leadership / 7} />
                <td className={styles.moneyCell}>{formatSalary(p.salary)}</td>
                {hasLoyalty && <LoyaltyCell player={p} />}
                {hasRating && <RatingCell rating={p.lastMatchRating} />}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={styles.cardList}>
        {sorted.map((p) => {
          const prev = resolvedPrevByPlayerId[p.id];
          const staminaLevel = staminaToLevel(p.stamina);
          const prevStaminaLevel = prev?.stamina !== undefined ? staminaToLevel(prev.stamina) : undefined;
          return (
          <div className={`${styles.playerCard} ${styles.playerCardClickable}`} key={p.id} onClick={() => setSelectedPlayer(p)}>
            <div className={styles.playerCardHead}>
              <span className={styles.playerCardName}>
                <AmpluaAccent player={p} overrides={overrides} />
                {p.name}
                {p.id === effectiveTrainerPlayerId && <TrainerIcon />}
              </span>
              <StatusIndicator status={p.status} />
            </div>

            <div className={styles.playerCardMeta}>
              <NationalityTag nationality={p.nationality} />
              <span>
                <b>{formatAge(p.age, p.ageDays)}</b> лет
              </span>
              <PositionBadge player={p} overrides={overrides} onChange={setOverride} />
              <span
                className={diffClass(diffDirection(p.form, prev?.form))}
                title={diffTitle("Форма", prev?.form, p.form) ?? formWord(p.form)}
              >
                Форма <b>{p.form}</b>
              </span>
              <span
                className={diffClass(diffDirection(staminaLevel, prevStaminaLevel))}
                title={diffTitle("Выносливость", prevStaminaLevel, staminaLevel) ?? formWord(staminaLevel)}
              >
                Вын-ть <b>{staminaLevel}</b>
              </span>
              {p.lastMatchRating !== undefined && (
                <span title={`${p.lastMatchRating.toFixed(1)} из 10`}>
                  Рейтинг матча <b>★ {p.lastMatchRating.toFixed(1)}</b>
                </span>
              )}
              <span
                className={diffClass(diffDirection(p.tsi, prev?.tsi))}
                title={diffTitle("TSI", prev?.tsi, p.tsi, (n) => n.toLocaleString("ru-RU"))}
              >
                TSI <b>{p.tsi.toLocaleString("ru-RU")}</b>
              </span>
              <span>
                Зарплата <b>{formatSalary(p.salary)}</b>
              </span>
            </div>

            <div className={styles.playerCardSkills}>
              {skillKeys.map((k) => (
                <div
                  className={`${styles.playerCardSkillRow} ${diffClass(diffDirection(p.skills[k], prev?.skills[k]))}`}
                  key={k}
                  title={diffTitle(skillLabel[k], prev?.skills[k], p.skills[k]) ?? skillWord(p.skills[k])}
                >
                  <span className={styles.playerCardSkillLabel}>{skillLabel[k]}</span>
                  <span className={styles.playerCardSkillValue}>{p.skills[k]}</span>
                </div>
              ))}
              <div
                className={`${styles.playerCardSkillRow} ${diffClass(diffDirection(p.experience, prev?.experience))}`}
                title={diffTitle("Опыт", prev?.experience, p.experience) ?? skillWord(p.experience)}
              >
                <span className={styles.playerCardSkillLabel}>Опыт</span>
                <span className={styles.playerCardSkillValue}>{p.experience}</span>
              </div>
              <div className={styles.playerCardSkillRow}>
                <span className={styles.playerCardSkillLabel}>Лидерство</span>
                <span className={styles.playerCardSkillValue}>{leadershipWord(p.leadership)}</span>
              </div>
              {hasLoyalty && (
                <div
                  className={styles.playerCardSkillRow}
                  title={p.isClubProduct ? "Воспитанник родного клуба" : p.loyalty !== undefined ? skillWord(p.loyalty) : undefined}
                >
                  <span className={styles.playerCardSkillLabel}>Преданность</span>
                  <span className={styles.playerCardSkillValue}>
                    {p.isClubProduct ? <HeartIcon /> : (p.loyalty ?? "—")}
                  </span>
                </div>
              )}
            </div>
          </div>
          );
        })}
      </div>

      {selectedPlayer && (
        <PlayerDetailModal
          player={selectedPlayer}
          prev={resolvedPrevByPlayerId[selectedPlayer.id]}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </div>
  );
}
