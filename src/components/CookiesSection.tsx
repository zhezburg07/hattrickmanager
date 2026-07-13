import styles from "./PrivacySection.module.css";

const CONTACT_EMAIL = "zhezburg2007@gmail.com";

export default function CookiesSection() {
  return (
    <section className="section">
      <div className="container">
        <h1 className="sectionTitle">Политика Cookie HattrickManager</h1>
        <p className={styles.effectiveDate}>Дата вступления в силу: 13 июля 2026</p>

        <div className={styles.card}>
          <div className={styles.block}>
            <h2 className={styles.blockTitle}>Что такое cookies</h2>
            <p className={styles.text}>
              Cookies — это небольшие файлы, которые сайт сохраняет в вашем браузере, чтобы запоминать информацию о
              вашем визите.
            </p>
          </div>

          <div className={styles.block}>
            <h2 className={styles.blockTitle}>Какие cookies мы используем</h2>
            <p className={styles.text}>
              Необходимые cookies — обеспечивают базовую работу сайта: хранят информацию о вашей сессии входа через
              Hattrick, чтобы вам не приходилось авторизовываться заново при каждом переходе между страницами. Без
              них сайт не будет работать корректно.
            </p>
            <p className={styles.text}>Мы не используем:</p>
            <ul className={styles.list}>
              <li>рекламные или маркетинговые cookies</li>
              <li>cookies для отслеживания вас на других сайтах</li>
              <li>cookies, продающие данные третьим лицам</li>
            </ul>
          </div>

          <div className={styles.block}>
            <h2 className={styles.blockTitle}>Управление cookies</h2>
            <p className={styles.text}>
              Вы можете в любой момент удалить или заблокировать cookies через настройки своего браузера. Учтите, что
              блокировка необходимых cookies может помешать корректной работе входа через Hattrick.
            </p>
          </div>

          <div className={styles.block}>
            <h2 className={styles.blockTitle}>Изменения политики</h2>
            <p className={styles.text}>
              Мы можем обновлять эту политику по мере развития проекта. Существенные изменения будут анонсированы на
              сайте.
            </p>
          </div>

          <div className={styles.block}>
            <h2 className={styles.blockTitle}>Контакты</h2>
            <p className={styles.text}>
              По вопросам — пишите на:{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className={styles.contactLink}>
                {CONTACT_EMAIL}
              </a>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
