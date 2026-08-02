"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "./AuthForm.module.css";

// Вход по логину/email+паролю — быстрая альтернатива повторному OAuth-
// походу на Hattrick с нового устройства. Работает и для тех, кто
// зарегистрировался напрямую (см. HomeSidebar.tsx на главной), и для тех,
// кто подключил команду через Hattrick и завёл себе пароль позже (см.
// SetPasswordPrompt.tsx) — само подключение команды по-прежнему возможно
// только через OAuth, эта форма его не заменяет.
export default function LoginForm() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Не удалось войти.");
        setLoading(false);
        return;
      }
      window.location.href = "/dashboard";
    } catch {
      setError("Не удалось связаться с сервером. Попробуйте ещё раз.");
      setLoading(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <form className={styles.card} onSubmit={handleSubmit}>
        <div className={styles.title}>Войти по email</div>
        <p className={styles.subtitle}>
          Подходит и для аккаунта, зарегистрированного напрямую, и для аккаунта, подключённого через Hattrick с уже
          заведённым паролем.
        </p>

        {error && <p className={styles.error}>{error}</p>}

        <label className={styles.label}>
          Email или логин
          <input
            className={styles.input}
            type="text"
            required
            autoFocus
            autoComplete="username"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
          />
        </label>

        <label className={styles.label}>
          Пароль
          <input
            className={styles.input}
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        <button className={styles.button} type="submit" disabled={loading}>
          {loading ? "Входим…" : "Войти"}
        </button>

        <p className={styles.footNote}>
          <Link href="/forgot-password">Забыли пароль?</Link>
        </p>
        <p className={styles.footNote}>
          Ещё не подключали команду?{" "}
          <a href="/api/auth/request-token">Подключить команду через Hattrick</a>
        </p>
      </form>
    </div>
  );
}
