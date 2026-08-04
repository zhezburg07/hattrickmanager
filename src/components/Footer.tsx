"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Footer.module.css";

// Внутри личного кабинета футер с публичными ссылками (FAQ, Контакты и
// т.д.) не показывается вовсе — единственный намеренный способ покинуть
// кабинет обратно на публичный сайт должен быть явный "Выйти" в Header.tsx
// (см. чат про поведение после входа). Определяем это по pathname (тот же
// приём, что уже использует Header.tsx через isCabinet), а не правкой всех
// ~15 страниц, которые рендерят <Footer /> по отдельности.
export default function Footer() {
  const pathname = usePathname();
  const isCabinet = pathname?.startsWith("/dashboard") ?? false;
  const year = new Date().getFullYear();

  if (isCabinet) return null;

  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.inner}`}>
        <div className={styles.brand}>HattrickManager</div>
        <nav className={styles.links}>
          <Link href="/how-it-works" className={styles.link}>
            Как это работает
          </Link>
          <Link href="/faq" className={styles.link}>
            Частые вопросы
          </Link>
          <Link href="/contact" className={styles.link}>
            Контакты
          </Link>
          <Link href="/privacy" className={styles.link}>
            Политика конфиденциальности
          </Link>
          <Link href="/cookies" className={styles.link}>
            Политика Cookie
          </Link>
        </nav>
        <p className={styles.disclaimer}>
          Приложение использует данные Hattrick.org с одобрения правообладателей. HattrickManager не
          является официальным продуктом Hattrick.org.
        </p>
        <div className={styles.copyright}>© {year} HattrickManager. Все права защищены.</div>
      </div>
    </footer>
  );
}
