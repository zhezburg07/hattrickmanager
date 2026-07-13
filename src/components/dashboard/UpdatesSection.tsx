"use client";

import { useEffect, useState } from "react";
import { lastDataUpdate } from "@/data/dashboard";
import styles from "./Updates.module.css";

type Status = "idle" | "queued" | "done";

function formatNow(): string {
  const now = new Date();
  const date = now.toLocaleDateString("ru-RU");
  const time = now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return `${date}, ${time}`;
}

export default function UpdatesSection() {
  const [status, setStatus] = useState<Status>("idle");
  const [initialPosition, setInitialPosition] = useState<number | null>(null);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [updatedAt, setUpdatedAt] = useState(lastDataUpdate);

  useEffect(() => {
    if (status !== "queued") return;
    const id = setInterval(() => {
      setQueuePosition((prev) => {
        if (prev === null) return prev;
        const next = prev - (Math.floor(Math.random() * 4) + 2);
        if (next <= 0) {
          clearInterval(id);
          setStatus("done");
          setUpdatedAt(formatNow());
          return 0;
        }
        return next;
      });
    }, 900);
    return () => clearInterval(id);
  }, [status]);

  function handleStart() {
    const start = Math.floor(Math.random() * 41) + 20; // тестовая позиция в очереди, 20-60
    setInitialPosition(start);
    setQueuePosition(start);
    setStatus("queued");
  }

  const etaMinutes = initialPosition !== null ? Math.max(1, Math.round(initialPosition / 18)) : 0;
  const progress =
    initialPosition && queuePosition !== null
      ? Math.min(100, Math.round(((initialPosition - queuePosition) / initialPosition) * 100))
      : 0;

  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>Обновления</div>

      <p className={styles.statusLine}>
        Данные обновлены: <b>{updatedAt}</b>
      </p>

      {status === "idle" && (
        <button type="button" className="btnPrimary" onClick={handleStart}>
          Обновить сейчас
        </button>
      )}

      {status === "queued" && (
        <div className={styles.queueBox}>
          <div className={styles.queueHead}>
            <span className={styles.queuePosition}>Вы в очереди — позиция №{queuePosition}</span>
            <span className={styles.queueEta}>Примерное время ожидания: ~{etaMinutes} мин</span>
          </div>
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {status === "done" && (
        <>
          <div className={styles.doneBox}>
            <span className={styles.doneIcon}>✓</span>
            Готово! Данные обновлены
          </div>
          <button type="button" className="btnSecondary" onClick={handleStart}>
            Обновить ещё раз
          </button>
        </>
      )}

      <p className={styles.explainText}>
        Мы получаем данные из Hattrick строго по одному запросу за раз, как того требуют официальные правила CHPP.
        Чтобы обновления работали честно для всех менеджеров, ваш запрос встаёт в общую очередь — обычно это
        занимает не больше нескольких минут.
      </p>

      <div className={styles.autoRow}>
        <span className={styles.autoDot} />
        Финансы и тренировки обновляются автоматически каждую неделю вместе с обновлением Hattrick
      </div>

      <p className={styles.disclaimer}>
        Это демонстрация на тестовых данных — реальная очередь на сервере подключится позже, когда будет готова
        инфраструктура для работы с CHPP на много пользователей.
      </p>
    </div>
  );
}
