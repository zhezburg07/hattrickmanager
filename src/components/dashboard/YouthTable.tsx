"use client";

import { useMemo, useState } from "react";
import { skillLabel, skillWord, type SquadSkills } from "@/data/squad";
import { usePositionOverrides, type PositionOverrideValue, type PositionOverrides } from "@/data/positionOverrides";
import { EditablePositionBadge, currentSelection, naturalSelection, positionSortValue } from "./squadCells";
import type { RealYouthPlayer } from "@/lib/youthPlayers";
import NationalityTag from "./NationalityTag";
import YouthPlayerDetailModal from "./YouthPlayerDetailModal";
import styles from "./SquadTable.module.css";

type SkillKey = keyof SquadSkills;

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

// Сортировка таблицы (см. чат "Юношеская команда: сортировка по умолчанию")
// — по умолчанию, пока пользователь не выбрал столбец сам, список
// отсортирован по возрасту по возрастанию (самые молодые сверху — они и
// есть самое интересное пополнение академии). При клике на "Позиция"
// работает тот же порядок GK → CD → CM → W → ST, что и на "Составе"
// (positionSortValue, squadCells.tsx).
type SortKey = "positionGroup" | "name" | "flag" | "age" | SkillKey;
type SortDir = "asc" | "desc";

const baseColumns: { key: SortKey; label: string; title?: string }[] = [
  { key: "positionGroup", label: "Позиция" },
  { key: "name", label: "Имя" },
  { key: "flag", label: "Нац.", title: "Национальность" },
  { key: "age", label: "Возраст" },
  ...skillKeys.map((k) => ({ key: k as SortKey, label: skillShortLabel[k], title: skillLabel[k] })),
];

// Текстовые/позиционные столбцы (и возраст — см. выше) сортируются по
// возрастанию при первом клике, навыки — по убыванию (лучший навык сверху),
// как и на "Составе".
const ascendingByDefault = new Set<SortKey>(["positionGroup", "name", "flag", "age"]);

function getSortValue(player: RealYouthPlayer, key: SortKey, overrides: PositionOverrides): string | number {
  switch (key) {
    case "flag":
      return player.nationality.name;
    case "name":
      return player.name;
    case "age":
      return player.age ?? Number.POSITIVE_INFINITY;
    case "positionGroup":
      return positionSortValue(player, overrides, undefined);
    default:
      return player.skills[key];
  }
}

// Тир (цвет) слова по доле от максимума шкалы 0-20 — как в таблице основного состава
function tierFromRatio(ratio: number): string {
  if (ratio >= 0.65) return styles.skillTierHigh;
  if (ratio >= 0.3) return styles.skillTierMid;
  return styles.skillTierLow;
}

// 19 лет — последний игровой год юношеской лиги Hattrick (игроки уходят из
// академии в 20) — по запросу подсвечиваем таких игроков красным как сигнал
// "скоро перевести в основной состав или потеряется" (см. чат "Юношеская
// команда: подсветка возраста 19+").
const OLD_AGE_THRESHOLD = 19;

// Позиция юниора — та же редактируемая позиция-бейдж, что уже работает на
// "Составе" (EditablePositionBadge, squadCells.tsx) — по запросу пользователя
// ("ручной выбор позиции — так же, как для основного состава"). Значок "?" с
// подсказкой показывается, только пока позиция ЕЩЁ не переопределена вручную
// (то есть остаётся чистым предположением по сильнейшему навыку — у юниоров
// нет сыгранных матчей основной команды, откуда её можно было бы взять
// иначе); как только тренер сам её задал, "?" уступает место обычному "✎" от
// EditablePositionBadge — предположение больше не нужно объяснять.
function YouthPositionCell({
  player,
  overrides,
  onChange,
}: {
  player: RealYouthPlayer;
  overrides: Record<number, PositionOverrideValue>;
  onChange: (playerId: number, value: PositionOverrideValue | null) => void;
}) {
  const isOverridden = currentSelection(player, overrides) !== naturalSelection(player);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <EditablePositionBadge player={player} overrides={overrides} onChange={onChange} />
      {!isOverridden && (
        <span
          className={styles.overrideMark}
          title="Предполагаемая позиция — определена по сильнейшему навыку игрока, а не по реальным сыгранным матчам (у юниоров их нет). Можно поменять вручную."
        >
          ?
        </span>
      )}
    </span>
  );
}

export default function YouthTable({
  youthLevel,
  players,
}: {
  youthLevel?: number;
  players?: RealYouthPlayer[] | null;
}) {
  // ИСПРАВЛЕНО (см. чат "Юношеская команда: противоречивые тексты") —
  // players === null/undefined означает "снимок не загрузился" (см.
  // youthError в chppSync.ts, распространяется через getStoredYouthData),
  // а players === [] означает "запрос успешен, академия реально пуста"
  // (например, youthLevel === 0). Раньше оба случая сливались в один и тот
  // же roster.length === 0, поэтому сообщение "не удалось загрузить"
  // ошибочно показывалось и для нормального пустого состояния — теперь
  // они различаются явно.
  const dataUnavailable = players == null;
  const roster = players ?? [];
  const [selectedPlayer, setSelectedPlayer] = useState<RealYouthPlayer | null>(null);
  const { overrides, setOverride } = usePositionOverrides();
  const [sortKey, setSortKey] = useState<SortKey>("age");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const sorted = useMemo(() => {
    const list = [...roster];
    list.sort((a, b) => {
      const va = getSortValue(a, sortKey, overrides);
      const vb = getSortValue(b, sortKey, overrides);
      let cmp =
        typeof va === "string" && typeof vb === "string" ? va.localeCompare(vb, "ru") : (va as number) - (vb as number);
      // Внутри одной позиции — по возрасту (моложе выше), раз у юниоров нет
      // TSI как у основного состава для тай-брейка.
      if (cmp === 0 && sortKey === "positionGroup") {
        cmp = (a.age ?? Number.POSITIVE_INFINITY) - (b.age ?? Number.POSITIVE_INFINITY);
      }
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
    setSortDir(ascendingByDefault.has(key) ? "asc" : "desc");
  }

  // ИСПРАВЛЕНО (см. чат "Срочная регрессия: юношеская академия ошибочно
  // показана как отсутствующая") — youthLevel приходит из club.xml
  // (YouthSquad.YouthLevel), а roster/players — из СОВСЕМ другого запроса
  // (youthplayerlist.xml). Раньше youthLevel===0 сам по себе прятал ВЕСЬ
  // список игроков, даже когда roster реально не пуст (например, из-за
  // молчаливого "поле не пришло → 0" в clubStaff.ts, см. её же комментарий
  // у youthLevel) — реальные загруженные игроки исчезали с экрана. Теперь
  // короткое сообщение "нет команды" показывается только когда ОБА
  // независимых источника согласны: youthLevel===0 И roster пуст — если
  // хотя бы один из них показывает реальных игроков, они отображаются.
  if (youthLevel === 0 && roster.length === 0) {
    return (
      <div className={styles.card}>
        <div className={styles.cardTitle}>Юношеская команда</div>
        <p className={styles.hint} style={{ margin: 0 }}>
          У вас пока нет юношеской команды.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className={styles.card}>
        <div className={styles.cardTitle}>Сеть спортивных школ</div>
        {youthLevel !== undefined ? (
          <p className={styles.hint} style={{ margin: 0 }}>
            Уровень академии: <b>{youthLevel}</b>
          </p>
        ) : (
          <p className={styles.hint} style={{ margin: 0 }}>
            Не удалось узнать уровень академии.
          </p>
        )}
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>Юношеская команда ({roster.length} игроков)</div>
        <p className={styles.hint}>Все игроки младше 17 лет — потенциальное пополнение основного состава.</p>
        {dataUnavailable && (
          <p className={styles.hint} style={{ marginTop: -8 }}>
            Список игроков академии не удалось загрузить.
          </p>
        )}

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {baseColumns.map((col) => (
                  <th key={col.key} title={col.title}>
                    <button
                      type="button"
                      className={`${styles.th} ${sortKey === col.key ? styles.thActive : ""}`}
                      onClick={() => handleSort(col.key)}
                    >
                      {col.label}
                      {sortKey === col.key && <span className={styles.sortArrow}>{sortDir === "asc" ? "▲" : "▼"}</span>}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => {
                const isOld = p.age !== null && p.age >= OLD_AGE_THRESHOLD;
                return (
                  <tr
                    key={p.id}
                    onClick={() => setSelectedPlayer(p)}
                    style={{
                      cursor: "pointer",
                      ...(isOld ? { background: "color-mix(in srgb, var(--color-bad) 12%, transparent)" } : {}),
                    }}
                  >
                    <td>
                      <YouthPositionCell player={p} overrides={overrides} onChange={setOverride} />
                    </td>
                    <td className={styles.nameCell}>{p.name}</td>
                    <td>
                      <NationalityTag nationality={p.nationality} showLabel={false} />
                    </td>
                    <td className={styles.numCell} style={isOld ? { color: "var(--color-bad)", fontWeight: 700 } : undefined}>
                      {p.age ?? "—"}
                    </td>
                    {skillKeys.map((k) => (
                      <td className={styles.skillCell} key={k}>
                        <span className={`${styles.skillWord} ${tierFromRatio(p.skills[k] / 20)}`}>
                          {skillWord(p.skills[k])}
                        </span>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className={styles.cardList}>
          {sorted.map((p) => {
            const isOld = p.age !== null && p.age >= OLD_AGE_THRESHOLD;
            return (
              <div
                className={styles.playerCard}
                key={p.id}
                onClick={() => setSelectedPlayer(p)}
                style={{
                  cursor: "pointer",
                  ...(isOld ? { background: "color-mix(in srgb, var(--color-bad) 12%, transparent)" } : {}),
                }}
              >
                <div className={styles.playerCardHead}>
                  <YouthPositionCell player={p} overrides={overrides} onChange={setOverride} />
                  <span className={styles.playerCardName}>{p.name}</span>
                </div>

                <div className={styles.playerCardMeta}>
                  <NationalityTag nationality={p.nationality} showLabel={false} />
                  <span style={isOld ? { color: "var(--color-bad)", fontWeight: 700 } : undefined}>
                    <b>{p.age ?? "—"}</b>
                    {p.age !== null && " лет"}
                  </span>
                </div>

                <div className={styles.playerCardSkills}>
                  {skillKeys.map((k) => (
                    <div className={styles.playerCardSkillRow} key={k}>
                      <span className={styles.playerCardSkillLabel}>{skillLabel[k]}</span>
                      <span className={styles.playerCardSkillValue}>{skillWord(p.skills[k])}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedPlayer && <YouthPlayerDetailModal player={selectedPlayer} onClose={() => setSelectedPlayer(null)} />}
    </>
  );
}
