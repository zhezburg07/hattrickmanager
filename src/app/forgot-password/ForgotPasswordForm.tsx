"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "../login/AuthForm.module.css";

// Ссылка для сброса пароля реально отправляется письмом через Resend (см.
// src/lib/email.ts, /api/auth/forgot-password) — на экране показывается
// только нейтральное подтверждение, без самой ссылки.
export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Не удалось отправить запрос.");
        setLoading(false);
        return;
      }
      setMessage(json.message);
      setLoading(false);
    } catch {
      setError("Не удалось связаться с сервером. Попробуйте ещё раз.");
      setLoading(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <form className={styles.card} onSubmit={handleSubmit}>
        <div className={styles.title}>Забыли пароль?</div>
        <p className={styles.subtitle}>Введите email, который вы указывали при настройке входа.</p>

        {error && <p className={styles.error}>{error}</p>}
        {message && <p className={styles.success}>{message}</p>}

        <label className={styles.label}>
          Email
          <input
            className={styles.input}
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <button className={styles.button} type="submit" disabled={loading}>
          {loading ? "Отправляем…" : "Получить ссылку для сброса"}
        </button>

        <p className={styles.footNote}>
          <Link href="/login">Назад ко входу</Link>
        </p>
      </form>
    </div>
  );
}
