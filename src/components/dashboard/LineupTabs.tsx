"use client";

import { useState, type ReactNode } from "react";
import styles from "./Matches.module.css";

type TabKey = "lineup" | "opponent";

// Переключатель "закладками папки" между Расстановкой и Анализом соперника
// — тот же компонент и тот же стиль (Matches.module.css), что уже
// использует MatchesTabs.tsx (Официальные матчи/Арена) и YouthTabs.tsx
// (Состав/Лига), см. чат "Расстановка: разделить на вкладки". Живёт внутри
// LineupBoard.tsx (клиентский компонент), а не на уровне page.tsx, как у
// двух других вкладок — здесь обе вкладки должны делить одно и то же
// состояние assignments/setAssignments ("Рекомендовать состав против
// этого соперника" на вкладке "Анализ соперника" обновляет расстановку на
// поле), так что оба ReactNode собираются в LineupBoard.tsx, где это
// состояние и живёт, а не рендерятся сервером раздельно.
export default function LineupTabs({ lineup, opponent }: { lineup: ReactNode; opponent: ReactNode }) {
  const [tab, setTab] = useState<TabKey>("lineup");

  return (
    <div>
      <div className={styles.folderTabs} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "lineup"}
          className={`${styles.folderTab} ${tab === "lineup" ? styles.folderTabActive : ""}`}
          onClick={() => setTab("lineup")}
        >
          Расстановка
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "opponent"}
          className={`${styles.folderTab} ${tab === "opponent" ? styles.folderTabActive : ""}`}
          onClick={() => setTab("opponent")}
        >
          Анализ соперника
        </button>
      </div>
      <div className={styles.folderTabContent}>
        <div className={styles.arenaStack} style={{ display: tab === "lineup" ? "flex" : "none" }}>
          {lineup}
        </div>
        <div className={styles.arenaStack} style={{ display: tab === "opponent" ? "flex" : "none" }}>
          {opponent}
        </div>
      </div>
    </div>
  );
}
