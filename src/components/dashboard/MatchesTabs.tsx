"use client";

import { useState, type ReactNode } from "react";
import styles from "./Matches.module.css";

type TabKey = "official" | "arena";

// Переключатель "закладками папки" между Официальными матчами (лига/кубок/
// товарищеские, влияющие на тренировку) и Ареной (турниры Hattrick Arena) —
// по запросу (см. чат "Матчи: разделить на Официальные/Арена"). Оба раздела
// уже отрендерены родителем (Server Component) — переключение чисто
// визуальное, без повторных запросов данных.
export default function MatchesTabs({ official, arena }: { official: ReactNode; arena: ReactNode }) {
  const [tab, setTab] = useState<TabKey>("official");

  return (
    <div>
      <div className={styles.folderTabs} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "official"}
          className={`${styles.folderTab} ${tab === "official" ? styles.folderTabActive : ""}`}
          onClick={() => setTab("official")}
        >
          Официальные матчи
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "arena"}
          className={`${styles.folderTab} ${tab === "arena" ? styles.folderTabActive : ""}`}
          onClick={() => setTab("arena")}
        >
          Арена
        </button>
      </div>
      <div className={styles.folderTabContent}>
        <div className={styles.arenaStack} style={{ display: tab === "official" ? "flex" : "none" }}>
          {official}
        </div>
        <div className={styles.arenaStack} style={{ display: tab === "arena" ? "flex" : "none" }}>
          {arena}
        </div>
      </div>
    </div>
  );
}
