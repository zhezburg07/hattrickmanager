import Link from "next/link";
import styles from "./Footer.module.css";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.inner}`}>
        <div className={styles.brand}>HattrickManager</div>
        <nav className={styles.links}>
          <Link href="/how-it-works" className={styles.link}>
            Как это работает
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
