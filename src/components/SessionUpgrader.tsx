"use client";

import { useEffect } from "react";

// Невидимый компонент — при каждом заходе в личный кабинет один раз
// пытается "дозаписать" долгоживущую сессию, если она не была выдана при
// входе (см. /api/auth/session-upgrade). Ничего не рендерит, ошибки сети
// молча игнорируются — это просто попытка, не критичная для страницы.
export default function SessionUpgrader() {
  useEffect(() => {
    fetch("/api/auth/session-upgrade", { method: "POST" }).catch(() => {});
  }, []);
  return null;
}
