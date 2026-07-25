"use client";

import { useState } from "react";
import Link from "next/link";
import authStyles from "@/app/login/AuthForm.module.css";
import styles from "./HomeSidebar.module.css";

const NAV_ITEMS = [
  { href: "/", label: "На главную" },
  { href: "/login", label: "Зарегистрироваться" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Контакты" },
  { href: "/copyright", label: "Авторские права" },
  { href: "/team", label: "Наша команда" },
];

// Боковая колонка публичной главной страницы: блок навигации + компактная,
// ВСЕГДА развёрнутая (не выпадающая) форма входа — в отличие от
// HeaderLoginDropdown в шапке (та открывается по клику), эта форма видна
// сразу. Логика та же: POST /api/auth/login, та же cookie сессии.
export default function HomeSidebar() {
  const [username, setUsername] = useState("");
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
        body: JSON.stringify({ email: username, password }),
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
    <aside className={styles.sidebar}>
      <div className={styles.block}>
        <div className={styles.blockTitle}>Navigation</div>
        <nav className={styles.nav}>
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className={styles.navLink}>
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className={styles.block}>
        <div className={styles.blockTitle}>Войти</div>
        <form className={styles.form} onSubmit={handleSubmit}>
          {error && (
            <p className={authStyles.error} style={{ margin: 0 }}>
              {error}
            </p>
          )}

          <label className={authStyles.label}>
            Имя пользователя
            <input
              className={authStyles.input}
              type="text"
              required
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
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
            {loading ? "Входим…" : "Login"}
          </button>

          <p className={`${authStyles.footNote} ${styles.footNote}`}>
            <Link href="/forgot-password">Забыли пароль?</Link>
          </p>
        </form>
      </div>
    </aside>
  );
}
