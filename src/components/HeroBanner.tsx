import styles from "./HeroBanner.module.css";

// Фон — стилизованная иллюстрация стадиона (public/hero-stadium.svg), а не
// буквальная фотография: как и со скриншотами интерфейса (см.
// ProductShowcase.tsx), у нас нет инструмента, чтобы получить настоящий
// снимок, поэтому нарисован мокап в тон тёмно-зелёной/золотой палитры.
// Замените на реальное фото стадиона, просто подложив файл с тем же именем.
export default function HeroBanner() {
  return (
    <div className={styles.banner}>
      <div className={styles.overlay} />
      <div className={`container ${styles.inner}`}>
        <div className={styles.logo}>
          <span className={styles.logoMark}>H</span>
          <span className={styles.logoText}>
            Hattrick<strong>Manager</strong>
          </span>
        </div>
        <p className={styles.tagline}>Ассистент менеджера Hattrick</p>
      </div>
    </div>
  );
}
