"use client";

import { useMemo, useState } from "react";
import {
  squadPlayers,
  demoTrainerPlayerId,
  positionGroupLabel,
  positionGroupAccentColor,
  statusLabel,
  skillLabel,
  skillWord,
  formWord,
  leadershipWord,
  levelWord,
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
  | "loyalty"
  | "tsi"
  | "salary"
  | "status";

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
  { key: "flag", label: "Флаг", title: "Национальность" },
  { key: "name", label: "Имя" },
  { key: "age", label: "Возраст" },
  { key: "positionGroup", label: "Позиция" },
  { key: "experience", label: "Опыт" },
  { key: "form", label: "Форма" },
  { key: "stamina", label: "Вынос-ть" },
  ...skillKeys.map((k) => ({ key: k as SortKey, label: skillShortLabel[k], title: skillLabel[k] })),
  { key: "leadership", label: "Лидер", title: "Лидерство" },
  { key: "loyalty", label: "Предан.", title: "Преданность клубу" },
  { key: "tsi", label: "TSI" },
  { key: "salary", label: "Зарплата" },
  { key: "status", label: "Статус" },
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
      return player.age;
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
      return player.loyalty ?? -1;
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

// Навыки (Вратарь/Защита/.../Стандарты) — числом по официальной шкале 0-20
// вместо слова, с подсказкой-словом при наведении (см. чат). Опыт/Форма/
// Лидерство/Преданность по-прежнему словом — этой ячейки не касаются.
function SkillNumberCell({
  value,
  diff = "none",
  hoverWord,
}: {
  value: number;
  diff?: DiffDirection;
  hoverWord: string;
}) {
  return (
    <td className={`${styles.skillCell} ${diffClass(diff)}`} title={hoverWord}>
      <span className={`${styles.skillWord} ${tierFromRatio(value / 20)}`}>{value}</span>
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
  players?: SquadPlayer[];
  prevByPlayerId?: Record<number, PlayerStatSnapshot | undefined>;
  trainerPlayerId?: number;
} = {}) {
  const roster = players ?? squadPlayers;
  // В демо-режиме (нет players — используется встроенный тестовый состав)
  // нет реального тренера, привязанного к конкретному игроку (coach в
  // src/data/dashboard.ts — отдельный персонаж не из этого списка) — берём
  // иллюстративный demoTrainerPlayerId, чтобы иконку было видно и на демо.
  const effectiveTrainerPlayerId = trainerPlayerId ?? (players ? undefined : demoTrainerPlayerId);
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selectedPlayer, setSelectedPlayer] = useState<SquadPlayer | null>(null);
  const { overrides, setOverride } = usePositionOverrides();
  // В демо-режиме сравнение "было → стало" уже встроено в тестовые данные
  // (player.prev, см. src/data/squad.ts); для реальных данных прошлый снимок
  // приходит с сервера (см. src/lib/playerHistoryDb.ts) — там, где данные
  // сервер не запрашивал (например, свой список <SquadTable /> без пропсов),
  // просто берём player.prev напрямую.
  const resolvedPrevByPlayerId =
    prevByPlayerId ?? Object.fromEntries(roster.map((p) => [p.id, p.prev]));

  // CHPP не отдаёт "преданность клубу" — прячем столбец целиком, если он не
  // заполнен ни у одного игрока, вместо пустых прочерков в каждой строке.
  const hasLoyalty = roster.some((p) => p.loyalty !== undefined);
  const columns = hasLoyalty ? baseColumns : baseColumns.filter((c) => c.key !== "loyalty");

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
                <td className={styles.flagCell}>
                  <FlagIcon country={p.nationality} />
                </td>
                <td className={styles.nameCell}>
                  <AmpluaAccent player={p} overrides={overrides} />
                  {p.name}
                  {p.id === effectiveTrainerPlayerId && <TrainerIcon />}
                </td>
                <td className={styles.numCell}>{p.age}</td>
                <td>
                  <PositionBadge player={p} overrides={overrides} onChange={setOverride} />
                </td>
                <LevelCell
                  word={levelWord(p.experience)}
                  ratio={(p.experience - 1) / 7}
                  diff={diffDirection(p.experience, prev?.experience)}
                  title={diffTitle("Опыт", prev?.experience, p.experience)}
                />
                <LevelCell
                  word={formWord(p.form)}
                  ratio={p.form / 8}
                  diff={diffDirection(p.form, prev?.form)}
                  title={diffTitle("Форма", prev?.form, p.form)}
                />
                <SkillNumberCell
                  value={staminaLevel}
                  diff={staminaDiff}
                  hoverWord={diffTitle("Выносливость", prevStaminaLevel, staminaLevel) ?? skillWord(staminaLevel)}
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
                {hasLoyalty && (
                  <LevelCell word={levelWord(p.loyalty ?? 1)} ratio={((p.loyalty ?? 1) - 1) / 7} />
                )}
                <td
                  className={`${styles.moneyCell} ${diffClass(tsiDiff)}`}
                  title={diffTitle("TSI", prev?.tsi, p.tsi, (n) => n.toLocaleString("ru-RU"))}
                >
                  {p.tsi.toLocaleString("ru-RU")}
                </td>
                <td className={styles.moneyCell}>{formatSalary(p.salary)}</td>
                <td>
                  <StatusTag status={p.status} />
                </td>
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
              <StatusTag status={p.status} />
            </div>

            <div className={styles.playerCardMeta}>
              <NationalityTag nationality={p.nationality} />
              <span>
                <b>{p.age}</b> лет
              </span>
              <PositionBadge player={p} overrides={overrides} onChange={setOverride} />
              <span
                className={diffClass(diffDirection(p.form, prev?.form))}
                title={diffTitle("Форма", prev?.form, p.form)}
              >
                Форма <b>{formWord(p.form)}</b>
              </span>
              <span
                className={diffClass(diffDirection(staminaLevel, prevStaminaLevel))}
                title={diffTitle("Выносливость", prevStaminaLevel, staminaLevel) ?? skillWord(staminaLevel)}
              >
                Вын-ть <b>{staminaLevel}</b>
              </span>
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
                title={diffTitle("Опыт", prev?.experience, p.experience)}
              >
                <span className={styles.playerCardSkillLabel}>Опыт</span>
                <span className={styles.playerCardSkillValue}>{levelWord(p.experience)}</span>
              </div>
              <div className={styles.playerCardSkillRow}>
                <span className={styles.playerCardSkillLabel}>Лидерство</span>
                <span className={styles.playerCardSkillValue}>{leadershipWord(p.leadership)}</span>
              </div>
              {hasLoyalty && (
                <div className={styles.playerCardSkillRow}>
                  <span className={styles.playerCardSkillLabel}>Преданность</span>
                  <span className={styles.playerCardSkillValue}>{levelWord(p.loyalty ?? 1)}</span>
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
