"use client";

import { useState } from "react";
import Link from "next/link";
import authStyles from "@/app/login/AuthForm.module.css";
import styles from "./HomeLoginForm.module.css";

// Та же форма входа по email+паролю, что и на отдельной странице /login (см.
// src/app/login/LoginForm.tsx, тот же эндпоинт POST /api/auth/login и та же
// cookie сессии сайта) — здесь только компактная вёрстка без заголовка и
// пояснений, чтобы разместить прямо на главной странице сразу под шапкой.
export default function HomeLoginForm() {
  const [email, setEmail] = useState("");
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
        body: JSON.stringify({ email, password }),
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
    <section className={styles.section}>
      <div className={`container ${styles.inner}`}>
        <form className={`${authStyles.card} ${styles.card}`} onSubmit={handleSubmit}>
          {error && <p className={authStyles.error}>{error}</p>}

          <label className={authStyles.label}>
            Email или логин
            <input
              className={authStyles.input}
              type="text"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label className={authStyles.label}>
            Пароль
            <input
              className={authStyles.input}
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          <button className={authStyles.button} type="submit" disabled={loading}>
            {loading ? "Входим…" : "Войти"}
          </button>

          <p className={`${authStyles.footNote} ${styles.footNote}`}>
            <Link href="/forgot-password">Восстановить пароль</Link>
          </p>
        </form>
      </div>
    </section>
  );
}
