"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import authStyles from "@/app/login/AuthForm.module.css";
import styles from "./Header.module.css";

// Компактная выпадающая форма входа по email+паролю — та же логика и тот же
// эндпоинт (POST /api/auth/login, та же cookie сессии), что и на отдельной
// странице /login (см. src/app/login/LoginForm.tsx), просто в виде
// сворачиваемого блока в шапке, а не постоянно развёрнутой формы на всю
// ширину страницы (была раньше на главной под баннером — убрана по
// запросу, чтобы не перегружать страницу).
export default function HeaderLoginDropdown() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: email, password }),
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
    <div className={styles.loginWrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.loginTrigger}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Войти
      </button>

      {open && (
        <div className={styles.loginDropdown}>
          <form className={styles.loginForm} onSubmit={handleSubmit}>
            {error && (
              <p className={authStyles.error} style={{ margin: 0 }}>
                {error}
              </p>
            )}

            <label className={authStyles.label}>
              Email или логин
              <input
                className={authStyles.input}
                type="text"
                required
                autoFocus
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

            <p className={authStyles.footNote} style={{ margin: 0, textAlign: "center" }}>
              <Link href="/forgot-password">Восстановить пароль</Link>
            </p>
          </form>
        </div>
      )}
    </div>
  );
}
