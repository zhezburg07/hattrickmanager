"use client";

import { useState } from "react";
import styles from "./Overview.module.css";

const DISMISS_COOKIE = "password_prompt_dismissed";

function dismissForNow() {
  // Обычная (не httpOnly) cookie на год — достаточно, чтобы не показывать
  // предложение повторно каждый визит; не секрет, поэтому подпись не нужна.
  document.cookie = `${DISMISS_COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 365}`;
}

// Предложение завести email+пароль показывается один раз после первого
// успешного OAuth-подключения (см. dashboard/page.tsx — рендерится, только
// если у пользователя ещё нет пароля и он не нажимал "Не сейчас" раньше).
// Пароль ускоряет только вход НА САЙТ с другого устройства — сам OAuth-токен
// Hattrick это никак не заменяет и не трогает.
export default function SetPasswordPrompt() {
  const [open, setOpen] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  if (success) {
    return (
      <div className={styles.demoBanner}>
        <span className={styles.demoBannerIcon}>✓</span>
        <div className={styles.demoBannerBody}>
          <div className={styles.demoBannerTitle}>Готово — теперь можно входить по email с любого устройства</div>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Не удалось сохранить.");
        setLoading(false);
        return;
      }
      setSuccess(true);
      setLoading(false);
    } catch {
      setError("Не удалось связаться с сервером. Попробуйте ещё раз.");
      setLoading(false);
    }
  }

  return (
    <div className={styles.demoBanner}>
      <span className={styles.demoBannerIcon}>ⓘ</span>
      <div className={styles.demoBannerBody}>
        <div className={styles.demoBannerTitle}>Придумайте email и пароль для быстрого входа с любого устройства</div>
        <p style={{ margin: "4px 0 10px", fontSize: 12.5, color: "var(--color-text-muted)" }}>
          Необязательно — можно пропустить и сделать это позже. Подключение к Hattrick при этом никак не меняется,
          пароль лишь ускоряет вход на сайт.
        </p>
        {error && <p style={{ color: "var(--color-bad)", fontSize: 12.5, margin: "0 0 8px" }}>{error}</p>}
        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
        >
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              background: "var(--color-bg-darker)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              padding: "8px 10px",
              color: "var(--color-text)",
              fontSize: 13,
              minWidth: 180,
            }}
          />
          <input
            type="password"
            required
            placeholder="Пароль (мин. 8 символов)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              background: "var(--color-bg-darker)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              padding: "8px 10px",
              color: "var(--color-text)",
              fontSize: 13,
              minWidth: 180,
            }}
          />
          <button type="submit" className="btnPrimary" disabled={loading} style={{ fontSize: 13 }}>
            {loading ? "Сохраняем…" : "Сохранить"}
          </button>
          <button
            type="button"
            onClick={() => {
              dismissForNow();
              setOpen(false);
            }}
            style={{
              background: "none",
              border: "none",
              color: "var(--color-text-muted)",
              fontSize: 13,
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Не сейчас
          </button>
        </form>
      </div>
    </div>
  );
}
