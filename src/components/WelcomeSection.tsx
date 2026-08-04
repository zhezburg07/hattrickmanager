import Link from "next/link";
import { getStoredAccountId } from "@/lib/hattrickApi";
import OpenAuthButton from "./OpenAuthButton";
import styles from "./WelcomeSection.module.css";

// Список возможностей — по образцу референса (короткие пункты с галочкой),
// но под наши реальные функции, а не общие фразы.
const features: string[] = [
  "Drag&Drop интерфейс расстановки — перетаскивайте игроков прямо на поле",
  "Рейтинг силы и потенциал каждого игрока — на основе его реальных навыков и формы",
  "Полный состав с реальными данными Hattrick: навыки, травмы, карточки, специализации",
  "Поддержка молодёжной академии — не пропустите готовых воспитанников",
  "Финансы и стадион под контролем — доходы, расходы и вместимость на одном экране",
  "Подключение напрямую через официальный OAuth Hattrick (CHPP) — без ввода пароля на нашем сайте",
];

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        d="M5 12.5 9.5 17 19 7"
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Кнопка "Подключить команду" ведёт напрямую на OAuth только для тех, у кого
// уже есть сессия сайта (зарегистрирован или вошёл) — /api/auth/request-token
// сам это тоже проверяет и отказывает анонимным (см. чат), но здесь ещё и
// незачем показывать кнопку, ведущую в тупик. Анонимному посетителю вместо
// неё показывается призыв сначала зарегистрироваться/войти, открывающий
// вкладку регистрации в HomeSidebar.tsx (см. OpenAuthButton.tsx).
export default function WelcomeSection() {
  const accountId = getStoredAccountId();

  return (
    <section className="section">
      <div className={`container ${styles.grid}`}>
        <div className={styles.welcome}>
          <h1 className={styles.title}>Добро пожаловать в HattrickManager</h1>
          <p className={styles.desc}>
            Личный кабинет менеджера Hattrick с реальными данными вашей команды: состав, расстановка, финансы и
            матчи — всё в одном месте, обновляется при каждом заходе.
          </p>

          <ul className={styles.list}>
            {features.map((f) => (
              <li key={f} className={styles.listItem}>
                <CheckIcon />
                <span>{f}</span>
              </li>
            ))}
          </ul>

          <div className={styles.ctaRow}>
            {accountId ? (
              <a href="/api/auth/request-token" className={`btnPrimary ${styles.cta}`}>
                Подключить команду
              </a>
            ) : (
              <OpenAuthButton className={`btnPrimary ${styles.cta}`}>
                Зарегистрируйтесь или войдите, чтобы подключить команду
              </OpenAuthButton>
            )}
            <Link href="/login" className={styles.loginLink}>
              Уже подключали? Войти по email
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
