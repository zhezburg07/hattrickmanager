import Link from "next/link";
import styles from "./WelcomeSection.module.css";

// Пункт "Тарифы" скрыт вместе с самой секцией тарифов (см.
// SHOW_PRICING_SECTION в src/app/page.tsx) — монетизация пока отложена,
// ссылка вела бы в никуда. Верните true, когда вернёте секцию тарифов.
const SHOW_PRICING_NAV_LINK = false;

const navLinks: { href: string; label: string }[] = [
  { href: "/how-it-works", label: "Как это работает" },
  ...(SHOW_PRICING_NAV_LINK ? [{ href: "/#pricing", label: "Тарифы" }] : []),
  { href: "/contact", label: "Контакты" },
];

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

export default function WelcomeSection() {
  return (
    <section className="section">
      <div className={`container ${styles.grid}`}>
        <nav className={styles.nav}>
          {navLinks.map((l) => (
            <Link key={l.href} href={l.href} className={styles.navLink}>
              {l.label}
            </Link>
          ))}
        </nav>

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

          <a href="/api/auth/request-token" className={`btnPrimary ${styles.cta}`}>
            Подключить команду
          </a>
        </div>
      </div>
    </section>
  );
}
