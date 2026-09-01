"use client";

import { useState, type ReactNode } from "react";
import styles from "./Matches.module.css";

type TabKey = "squad" | "league";

// Переключатель "закладками папки" между Составом академии и Лигой — тот же
// компонент и тот же стиль (Matches.module.css), что уже использует
// MatchesTabs.tsx для Официальных матчей/Арены (см. чат "Юношеская лига:
// разделить на вкладки"). Оба раздела уже отрендерены родителем (Server
// Component) — переключение чисто визуальное, без повторных запросов данных.
export default function YouthTabs({ squad, league }: { squad: ReactNode; league: ReactNode }) {
  const [tab, setTab] = useState<TabKey>("squad");

  return (
    <div>
      <div className={styles.folderTabs} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "squad"}
          className={`${styles.folderTab} ${tab === "squad" ? styles.folderTabActive : ""}`}
          onClick={() => setTab("squad")}
        >
          Состав
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "league"}
          className={`${styles.folderTab} ${tab === "league" ? styles.folderTabActive : ""}`}
          onClick={() => setTab("league")}
        >
          Лига
        </button>
      </div>
      <div className={styles.folderTabContent}>
        <div className={styles.arenaStack} style={{ display: tab === "squad" ? "flex" : "none" }}>
          {squad}
        </div>
        <div className={styles.arenaStack} style={{ display: tab === "league" ? "flex" : "none" }}>
          {league}
        </div>
      </div>
    </div>
  );
}
