"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import styles from "../login/AuthForm.module.css";

export default function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Пароли не совпадают.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Не удалось сбросить пароль.");
        setLoading(false);
        return;
      }
      setDone(true);
      setLoading(false);
    } catch {
      setError("Не удалось связаться с сервером. Попробуйте ещё раз.");
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className={styles.wrap}>
        <div className={styles.card}>
          <div className={styles.title}>Ссылка повреждена</div>
          <p className={styles.subtitle}>В адресе не хватает кода сброса. Запросите новую ссылку.</p>
          <p className={styles.footNote}>
            <Link href="/forgot-password">Забыли пароль?</Link>
          </p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className={styles.wrap}>
        <div className={styles.card}>
          <div className={styles.title}>Пароль обновлён</div>
          <p className={styles.success}>Теперь можно войти с новым паролем.</p>
          <p className={styles.footNote}>
            <Link href="/login">Войти</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <form className={styles.card} onSubmit={handleSubmit}>
        <div className={styles.title}>Новый пароль</div>

        {error && <p className={styles.error}>{error}</p>}

        <label className={styles.label}>
          Новый пароль
          <input
            className={styles.input}
            type="password"
            required
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        <label className={styles.label}>
          Повторите пароль
          <input
            className={styles.input}
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </label>

        <button className={styles.button} type="submit" disabled={loading}>
          {loading ? "Сохраняем…" : "Сохранить новый пароль"}
        </button>
      </form>
    </div>
  );
}
