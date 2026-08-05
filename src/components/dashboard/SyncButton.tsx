"use client";

import { useState } from "react";

// Общая кнопка синхронизации — переиспользуется и на "Обновления" ("Обновить
// данные" по требованию), и на Обзоре как кнопка "Повторить" на экране
// неудачной синхронизации (см. dashboard/page.tsx). Оба места вызывают один
// и тот же POST /api/dashboard/sync — единственная точка, которая реально
// обращается к CHPP, см. src/lib/chppSync.ts.
export default function SyncButton({ label = "Обновить данные" }: { label?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/sync", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Не удалось синхронизировать данные.");
        setLoading(false);
        return;
      }
      // Перезагружаем страницу целиком — она сама заново прочитает свежие
      // данные из базы (см. dashboard/page.tsx, getStoredOverviewData).
      window.location.reload();
    } catch {
      setError("Не удалось связаться с сервером. Попробуйте ещё раз.");
      setLoading(false);
    }
  }

  return (
    <div>
      {error && <p style={{ margin: "0 0 8px", fontSize: 13.5, color: "var(--color-bad)" }}>{error}</p>}
      <button type="button" className="btnPrimary" onClick={handleClick} disabled={loading}>
        {loading ? "Синхронизируем…" : label}
      </button>
    </div>
  );
}
