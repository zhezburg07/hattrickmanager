"use client";

import { useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import authStyles from "@/app/login/AuthForm.module.css";

// Обязательный экран для legacy-аккаунтов без пароля — заведены
// автоматически при первом OAuth-подключении команды до появления
// обязательной регистрации (см. чат). Новых таких аккаунтов больше не
// появится (см. src/lib/accountsDb.ts, linkOrCreateHattrickConnection), но
// старые записи в базе остались, и данные (включая привязку команды) не
// удаляются — просто требуем довести регистрацию до конца.
//
// В отличие от SetPasswordPrompt.tsx (необязательный баннер поверх уже
// рабочего кабинета, с кнопкой "Не сейчас") — здесь пропустить нельзя:
// dashboard/layout.tsx рендерит этот экран ВМЕСТО {children}, то есть ни
// один раздел /dashboard/* не открывается, пока пароль не установлен.
export default function RequirePasswordGate() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
      // Перезагружаем страницу целиком — dashboard/layout.tsx на сервере
      // заново проверит hasEmailLogin() и в этот раз пропустит в кабинет.
      window.location.reload();
    } catch {
      setError("Не удалось связаться с сервером. Попробуйте ещё раз.");
      setLoading(false);
    }
  }

  return (
    <>
      <Header />
      <div className={authStyles.wrap}>
        <form className={authStyles.card} onSubmit={handleSubmit}>
          <div className={authStyles.title}>Завершите регистрацию</div>
          <p className={authStyles.subtitle}>
            Ваша команда Hattrick уже подключена — осталось установить email и пароль, чтобы продолжить пользоваться
            личным кабинетом. Это разовое действие, подключение команды никак не затрагивается.
          </p>

          {error && <p className={authStyles.error}>{error}</p>}

          <label className={authStyles.label}>
            Email
            <input
              className={authStyles.input}
              type="email"
              required
              autoFocus
              autoComplete="email"
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
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          <button className={authStyles.button} type="submit" disabled={loading}>
            {loading ? "Сохраняем…" : "Установить пароль и продолжить"}
          </button>
        </form>
      </div>
      <Footer />
    </>
  );
}
