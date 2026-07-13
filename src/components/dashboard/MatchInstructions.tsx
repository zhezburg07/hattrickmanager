"use client";

import { useState } from "react";
import Link from "next/link";
import {
  tacticOrder,
  tacticLabel,
  tacticHint,
  teamTalkOrder,
  teamTalkLabel,
  type Tactic,
  type TeamTalk,
  type SeasonMatch,
} from "@/data/matches";
import styles from "./Matches.module.css";

export default function MatchInstructions({ match }: { match: SeasonMatch }) {
  const [tactic, setTactic] = useState<Tactic>("normal");
  const [teamTalk, setTeamTalk] = useState<TeamTalk>("normal");

  return (
    <div className={styles.card}>
      <div className={styles.instructionsHead}>
        <div>
          <div className={styles.cardTitle} style={{ margin: 0 }}>
            Указания на матч
          </div>
          <div className={styles.instructionsOpponent}>
            {match.home ? "vs" : "@"} {match.opponent}
          </div>
          <div className={styles.instructionsMeta}>
            {match.date} · {match.home ? "Дома" : "В гостях"} ·{" "}
            {match.round !== null ? `Тур ${match.round}` : match.competition}
          </div>
        </div>
      </div>

      <div className={styles.optionGroup}>
        <div className={styles.optionGroupLabel}>Тактика команды</div>
        <div className={styles.optionGrid}>
          {tacticOrder.map((t) => (
            <div key={t} className={styles.optionItem}>
              <button
                type="button"
                className={`${styles.optionBtn} ${tactic === t ? styles.optionBtnActive : ""}`}
                onClick={() => setTactic(t)}
              >
                {tacticLabel[t]}
              </button>
              <span className={styles.optionHint} title={tacticHint[t]}>
                ?
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.optionGroup}>
        <div className={styles.optionGroupLabel}>Настрой команды</div>
        <div className={styles.optionGrid}>
          {teamTalkOrder.map((t) => (
            <button
              key={t}
              type="button"
              className={`${styles.optionBtn} ${teamTalk === t ? styles.optionBtnActive : ""}`}
              onClick={() => setTeamTalk(t)}
            >
              {teamTalkLabel[t]}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.instructionsFooter}>
        <Link href="/dashboard/lineup" className="btnPrimary">
          Перейти к расстановке →
        </Link>
        <span className={styles.deadlineHint}>
          Указания нужно отправить не позднее чем за 20 минут до начала матча
        </span>
      </div>
    </div>
  );
}
