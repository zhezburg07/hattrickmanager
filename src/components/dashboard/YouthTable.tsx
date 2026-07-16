import { positionGroupLabel, skillLabel, skillWord, type Country, type PositionGroup, type SquadSkills } from "@/data/squad";
import NationalityTag from "./NationalityTag";
import styles from "./SquadTable.module.css";

interface RealYouthPlayerRow {
  id: number;
  name: string;
  age: number;
  nationality: Country;
  positionGroup: PositionGroup;
  skills: SquadSkills;
}

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

export default function YouthTable({
  youthLevel,
  players,
}: {
  youthLevel?: number;
  players?: RealYouthPlayerRow[];
}) {
  const roster = players ?? [];

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
              {roster.map((p) => (
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
          {roster.map((p) => (
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
