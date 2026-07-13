import styles from "./PricingSection.module.css";

export default function PricingSection() {
  return (
    <section id="pricing" className="section">
      <div className="container">
        <h2 className="sectionTitle">Тарифы</h2>
        <p className="sectionSubtitle">
          Сейчас HattrickManager бесплатен для всех. Pro-тариф с расширенными возможностями скоро появится.
        </p>

        <div className={styles.grid}>
          <div className={`${styles.plan} ${styles.planFeatured}`}>
            <span className={styles.badge}>Доступно сейчас</span>
            <div className={styles.planName}>Бесплатный</div>
            <div className={styles.planPrice}>
              0 ₽ <span>/ навсегда</span>
            </div>
            <ul className={styles.planList}>
              <li>Интерактивная схема состава</li>
              <li>Калькулятор состава</li>
              <li>Базовая статистика и прогноз</li>
              <li>Молодёжная академия</li>
            </ul>
            <a href="/api/auth/request-token" className={`btnPrimary ${styles.planAction}`}>
              Подключить команду
            </a>
            <a
              href="https://ko-fi.com/hattrickmanager"
              target="_blank"
              rel="noopener noreferrer"
              className={`btnSecondary ${styles.planAction}`}
              style={{ marginTop: 10 }}
            >
              Поддержать проект донатом
            </a>
          </div>

          <div className={styles.plan}>
            <span className={styles.badgeMuted}>В разработке</span>
            <div className={styles.planName}>Pro</div>
            <div className={styles.planPrice}>
              Скоро <span>/ цена уточняется</span>
            </div>
            <ul className={styles.planList}>
              <li>Расширенная аналитика соперников</li>
              <li>Автоматические уведомления о форме и травмах</li>
              <li>Продвинутый прогноз результатов</li>
              <li>Приоритетная поддержка</li>
            </ul>
            <button className={`btnSecondary ${styles.planAction}`} disabled>
              Пока недоступно
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
