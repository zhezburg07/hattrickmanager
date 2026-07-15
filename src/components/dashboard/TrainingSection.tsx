"use client";

import { useState } from "react";
import { trainingTypes, trainingDefaults, recentSkillChanges } from "@/data/training";
import { coach, tacticalPreferenceLabel } from "@/data/dashboard";
import { skillWord, skillLabel, leadershipWord } from "@/data/squad";
import styles from "./Training.module.css";

export default function TrainingSection({
  coachName,
  coachLeadership,
  realTypeKey,
  realIntensity,
  realStaminaShare,
}: {
  coachName?: string;
  coachLeadership?: number;
  realTypeKey?: string;
  realIntensity?: number;
  realStaminaShare?: number;
} = {}) {
  const hasRealTraining = realTypeKey !== undefined || realIntensity !== undefined || realStaminaShare !== undefined;
  const [typeKey, setTypeKey] = useState(realTypeKey ?? trainingDefaults.typeKey);
  const [intensity, setIntensity] = useState(realIntensity ?? trainingDefaults.intensity);
  const [staminaShare, setStaminaShare] = useState(realStaminaShare ?? trainingDefaults.staminaShare);

  return (
    <>
      {coachName && (
        <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "0 0 12px" }}>
          {hasRealTraining
            ? "Тип тренировки, интенсивность и процент выносливости ниже выставлены по реальным настройкам команды (Hattrick) — можно менять как план, это не влияет на настоящую тренировку."
            : "Тип тренировки, интенсивность и навык тренера как таковой CHPP не отдаёт (доступ только на чтение) — эта часть остаётся плановым инструментом, не связанным с настоящими настройками команды."}{" "}
          Ниже — реальное имя и лидерство тренера.
        </p>
      )}
      <div className={styles.card}>
        <div className={styles.cardTitle}>Тип тренировки</div>
        <div className={styles.typeGrid}>
          {trainingTypes.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`${styles.typeBtn} ${typeKey === t.key ? styles.typeBtnActive : ""}`}
              onClick={() => setTypeKey(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.sliderBlock}>
          <div className={styles.sliderHead}>
            <span>Интенсивность тренировки</span>
            <b>{intensity}</b>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={intensity}
            onChange={(e) => setIntensity(Number(e.target.value))}
            className={styles.slider}
          />
        </div>

        <div className={styles.sliderBlock}>
          <div className={styles.sliderHead}>
            <span>Процент тренировки выносливости</span>
            <b>{staminaShare}</b>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={staminaShare}
            onChange={(e) => setStaminaShare(Number(e.target.value))}
            className={styles.slider}
          />
          <p className={styles.sliderHint}>
            Чем выше процент тренировки выносливости, тем хуже растёт (или быстрее падает) форма игроков —
            это ресурс, который забирается у основной тренировки.
          </p>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>Последние изменения навыков</div>
        <p className={styles.sliderHint} style={{ marginTop: 0 }}>
          Игроки, у которых за последнюю неделю тренировки изменился хотя бы один навык.
        </p>
        <div className={styles.skillChangeList}>
          {recentSkillChanges.map((c, i) => {
            const isUp = c.newLevel >= c.oldLevel;
            return (
              <div className={styles.skillChangeRow} key={i}>
                <span className={styles.skillChangeName}>{c.playerName}</span>
                <span className={styles.skillChangeDetail}>
                  {skillLabel[c.skillKey]}: {skillWord(c.oldLevel)} → {skillWord(c.newLevel)}
                </span>
                <span className={isUp ? styles.skillChangeUp : styles.skillChangeDown}>
                  {isUp ? "▲" : "▼"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>Тренер</div>
        <div className={styles.coachMetaRow}>
          <span>
            {coachName ?? coach.name}
            {!coachName && (
              <>
                {" "}
                — навык <b>{skillWord(coach.skillLevel)}</b>
              </>
            )}
          </span>
          <span>
            Лидерство <b>{leadershipWord(coachLeadership ?? coach.leadership)}</b>
          </span>
          {!coachName && (
            <span>
              Тактика <b>{tacticalPreferenceLabel[coach.preference]}</b>
            </span>
          )}
        </div>
      </div>

      <p className={styles.footerHint}>
        Эффект тренировки применяется каждую неделю. Молодые игроки и низкие текущие навыки тренируются быстрее.
      </p>
    </>
  );
}
