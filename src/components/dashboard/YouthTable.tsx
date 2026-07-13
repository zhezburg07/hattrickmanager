import { positionGroupLabel, skillLabel, skillWord, type SquadSkills } from "@/data/squad";
import { youthPlayers, academyLevel } from "@/data/youth";
import NationalityTag from "./NationalityTag";
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

function PromoteButton() {
  return (
    <button type="button" className="btnSecondary" disabled title="Переводы в основной состав скоро появятся">
      Перевести в основу
    </button>
  );
}

export default function YouthTable({ realYouthLevel }: { realYouthLevel?: number } = {}) {
  return (
    <>
      <div className={styles.card}>
        <div className={styles.cardTitle}>Сеть спортивных школ</div>
        {realYouthLevel !== undefined ? (
          <p className={styles.hint} style={{ margin: 0 }}>
            Уровень академии (реальные данные Hattrick): <b>{realYouthLevel}</b>
            {realYouthLevel === 0 && " — инвестиций в академию пока не было"}
          </p>
        ) : (
          <p className={styles.hint} style={{ margin: 0 }}>
            Общий уровень академии: <b>{skillWord(academyLevel)}</b>
          </p>
        )}
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>Юношеская команда ({youthPlayers.length} игроков)</div>
        <p className={styles.hint}>Все игроки младше 17 лет — потенциальное пополнение основного состава.</p>
        {realYouthLevel !== undefined && (
          <p className={styles.hint} style={{ marginTop: -8 }}>
            Список игроков академии CHPP не отдаёт этому приложению (доступ ограничен) — ниже тестовые игроки для
            примера.
          </p>
        )}

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
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
                <th>
                  <span className={styles.th} style={{ cursor: "default" }}>
                    Позиция
                  </span>
                </th>
                {skillKeys.map((k) => (
                  <th key={k} title={skillLabel[k]}>
                    <span className={styles.th} style={{ cursor: "default" }}>
                      {skillShortLabel[k]}
                    </span>
                  </th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {youthPlayers.map((p) => (
                <tr key={p.id}>
                  <td className={styles.nameCell}>{p.name}</td>
                  <td>
                    <NationalityTag nationality={p.nationality} />
                  </td>
                  <td className={styles.numCell}>{p.age}</td>
                  <td>{positionGroupLabel[p.positionGroup]}</td>
                  {skillKeys.map((k) => (
                    <td className={styles.skillCell} key={k}>
                      <span className={`${styles.skillWord} ${tierFromRatio(p.skills[k] / 20)}`}>
                        {skillWord(p.skills[k])}
                      </span>
                    </td>
                  ))}
                  <td>
                    <PromoteButton />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={styles.cardList}>
          {youthPlayers.map((p) => (
            <div className={styles.playerCard} key={p.id}>
              <div className={styles.playerCardHead}>
                <span className={styles.playerCardName}>{p.name}</span>
              </div>

              <div className={styles.playerCardMeta}>
                <NationalityTag nationality={p.nationality} />
                <span>
                  <b>{p.age}</b> лет
                </span>
                <span>{positionGroupLabel[p.positionGroup]}</span>
              </div>

              <div className={styles.playerCardSkills}>
                {skillKeys.map((k) => (
                  <div className={styles.playerCardSkillRow} key={k}>
                    <span className={styles.playerCardSkillLabel}>{skillLabel[k]}</span>
                    <span className={styles.playerCardSkillValue}>{skillWord(p.skills[k])}</span>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 12 }}>
                <PromoteButton />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
