"use client";

import { useState } from "react";
import { skillLabel, skillWord, type SquadSkills } from "@/data/squad";
import { usePositionOverrides, type PositionOverrideValue } from "@/data/positionOverrides";
import { EditablePositionBadge, currentSelection, naturalSelection } from "./squadCells";
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
  players?: RealYouthPlayer[];
}) {
  const roster = players ?? [];
  const [selectedPlayer, setSelectedPlayer] = useState<RealYouthPlayer | null>(null);
  const { overrides, setOverride } = usePositionOverrides();

  return (
    <>
      <div className={styles.card}>
        <div className={styles.cardTitle}>Сеть спортивных школ</div>
        {youthLevel !== undefined ? (
          <p className={styles.hint} style={{ margin: 0 }}>
            Уровень академии: <b>{youthLevel}</b>
            {youthLevel === 0 && " — инвестиций в академию пока не было"}
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
        {roster.length === 0 && (
          <p className={styles.hint} style={{ marginTop: -8 }}>
            Список игроков академии не удалось загрузить.
          </p>
        )}

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>
                  <span className={styles.th} style={{ cursor: "default" }}>
                    Позиция
                  </span>
                </th>
                <th>
                  <span className={styles.th} style={{ cursor: "default" }}>
                    Имя
                  </span>
                </th>
                <th>
                  <span className={styles.th} style={{ cursor: "default" }}>
                    Нац.
                  </span>
                </th>
                <th>
                  <span className={styles.th} style={{ cursor: "default" }}>
                    Возраст
                  </span>
                </th>
                {skillKeys.map((k) => (
                  <th key={k} title={skillLabel[k]}>
                    <span className={styles.th} style={{ cursor: "default" }}>
                      {skillShortLabel[k]}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roster.map((p) => {
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
          {roster.map((p) => {
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
