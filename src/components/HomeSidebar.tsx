"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import authStyles from "@/app/login/AuthForm.module.css";
import { EyeIcon, EyeOffIcon } from "./AuthIcons";
import styles from "./HomeSidebar.module.css";

// Держим в синхроне с src/lib/passwordAuth.ts (MIN_USERNAME_LENGTH,
// MIN_PASSWORD_LENGTH) — тот модуль не импортируем напрямую, т.к. он тянет
// bcryptjs/crypto (серверные зависимости) в клиентский бандл.
const MIN_USERNAME_LENGTH = 3;
const MIN_PASSWORD_LENGTH = 6;

const NAV_ITEMS = [
  { href: "/", label: "На главную" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Контакты" },
  { href: "/copyright", label: "Авторские права" },
  { href: "/team", label: "Наша команда" },
];

function LoginForm() {
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
        body: JSON.stringify({ identifier: username, password }),
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
    <form className={styles.form} onSubmit={handleSubmit}>
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
  );
}

// Регистрация БЕЗ подключённой команды Hattrick — создаёт только аккаунт
// сайта (логин/email/пароль), команда подключается позже отдельным шагом
// ("Подключить команду" в урезанном личном кабинете, см. чат). Подтверждение
// email проверяется на лету на клиенте (кнопка отправки заблокирована, пока
// поля не совпадут) — и повторно на сервере (см. /api/auth/register), т.к.
// клиентскому JS доверять нельзя.
function RegisterForm() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isEmailFormatValid = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

  const usernameTooShort = username.length > 0 && username.trim().length < MIN_USERNAME_LENGTH;
  const emailFormatInvalid = email.length > 0 && !isEmailFormatValid(email);
  const emailMismatch = confirmEmail.length > 0 && email.trim().toLowerCase() !== confirmEmail.trim().toLowerCase();
  const passwordTooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;

  const canSubmit =
    username.trim().length >= MIN_USERNAME_LENGTH &&
    isEmailFormatValid(email) &&
    email.trim().toLowerCase() === confirmEmail.trim().toLowerCase() &&
    password.length >= MIN_PASSWORD_LENGTH &&
    !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!canSubmit) return;
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, confirmEmail, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Не удалось зарегистрироваться.");
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
    <form className={styles.form} onSubmit={handleSubmit}>
      {error && (
        <p className={authStyles.error} style={{ margin: 0 }}>
          {error}
        </p>
      )}

      <label className={authStyles.label}>
        Логин
        <input
          className={authStyles.input}
          type="text"
          required
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </label>
      {usernameTooShort && (
        <p className={authStyles.error} style={{ margin: 0, fontSize: 12 }}>
          Логин должен быть не короче {MIN_USERNAME_LENGTH} символов
        </p>
      )}

      <label className={authStyles.label}>
        Email
        <input
          className={authStyles.input}
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      {emailFormatInvalid && (
        <p className={authStyles.error} style={{ margin: 0, fontSize: 12 }}>
          Введите корректный email
        </p>
      )}

      <label className={authStyles.label}>
        Подтвердите email
        <input
          className={authStyles.input}
          type="email"
          required
          autoComplete="off"
          value={confirmEmail}
          onChange={(e) => setConfirmEmail(e.target.value)}
        />
      </label>
      {emailMismatch && (
        <p className={authStyles.error} style={{ margin: 0, fontSize: 12 }}>
          Email не совпадает
        </p>
      )}

      <label className={authStyles.label}>
        Пароль
        <div className={styles.passwordField}>
          <input
            className={authStyles.input}
            type={showPassword ? "text" : "password"}
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            className={styles.passwordToggle}
            aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
            onClick={() => setShowPassword((v) => !v)}
          >
            {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
          </button>
        </div>
      </label>
      {passwordTooShort && (
        <p className={authStyles.error} style={{ margin: 0, fontSize: 12 }}>
          Пароль должен быть не короче {MIN_PASSWORD_LENGTH} символов
        </p>
      )}

      <button className={authStyles.button} type="submit" disabled={!canSubmit}>
        {loading ? "Регистрируем…" : "Зарегистрироваться"}
      </button>
    </form>
  );
}

// Боковая колонка публичной главной страницы: блок навигации + компактный
// блок "Войти"/"Регистрация" с переключателем вкладок — обе формы всегда
// развёрнуты (не выпадающие, в отличие от HeaderLoginDropdown в шапке).
export default function HomeSidebar() {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [authRequiredNotice, setAuthRequiredNotice] = useState<"none" | "auth-required" | "session-expired">("none");
  const authBlockRef = useRef<HTMLDivElement>(null);

  function openRegisterTab() {
    setTab("register");
    authBlockRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // Прямой заход на /api/auth/request-token без сессии — сервер (см.
  // /api/auth/request-token/route.ts) редиректит на "/?connectAuthRequired=1",
  // отсюда читаем query-параметры при монтировании и сразу открываем вкладку
  // регистрации с пояснением. window.location.search вместо useSearchParams()
  // — тот требует Suspense-границу при статической генерации, а здесь это
  // лишняя сложность ради пары флагов.
  //
  // sessionExpired=1 — отдельный случай (см. /api/auth/callback): короткая
  // сессия исчезла посреди OAuth-похода на Hattrick (например, закрыли
  // браузер на странице авторизации) — сообщение для него точнее, чем общее
  // "сначала войдите или зарегистрируйтесь".
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connectAuthRequired") === "1") {
      setAuthRequiredNotice(params.get("sessionExpired") === "1" ? "session-expired" : "auth-required");
      openRegisterTab();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          <button type="button" className={styles.navLink} onClick={openRegisterTab}>
            Зарегистрироваться
          </button>
        </nav>
      </div>

      <div className={styles.block} ref={authBlockRef}>
        {authRequiredNotice !== "none" && (
          <p className={authStyles.error} style={{ margin: 0, fontSize: 12.5 }}>
            {authRequiredNotice === "session-expired"
              ? "Сессия истекла, пожалуйста, зарегистрируйтесь заново, чтобы подключить команду."
              : "Чтобы подключить команду, сначала войдите или зарегистрируйтесь."}
          </p>
        )}
        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tab} ${tab === "login" ? styles.tabActive : ""}`}
            onClick={() => setTab("login")}
          >
            Войти
          </button>
          <button
            type="button"
            className={`${styles.tab} ${tab === "register" ? styles.tabActive : ""}`}
            onClick={() => setTab("register")}
          >
            Регистрация
          </button>
        </div>
        {tab === "login" ? <LoginForm /> : <RegisterForm />}
      </div>
    </aside>
  );
}
