import styles from "./PrivacySection.module.css";

const CONTACT_EMAIL = "zhezburg2007@gmail.com";

export default function PrivacySection() {
  return (
    <section className="section">
      <div className="container">
        <h1 className="sectionTitle">Политика конфиденциальности HattrickManager</h1>
        <p className={styles.effectiveDate}>Дата вступления в силу: 30 июля 2026</p>

        <div className={styles.card}>
          <div className={styles.block}>
            <h2 className={styles.blockTitle}>1. Какие данные мы собираем</h2>
            <ul className={styles.list}>
              <li>
                Данные вашей команды Hattrick (состав, навыки игроков, финансы, матчи и т.д.) — только на чтение,
                через официальный OAuth-доступ Hattrick CHPP
              </li>
              <li>Ваш email — только если вы добровольно оставили его для новостей о проекте; необязательно</li>
              <li>Технические данные (IP-адрес, тип браузера) — автоматически, для работы сайта и защиты от злоупотреблений</li>
            </ul>
          </div>

          <div className={styles.block}>
            <h2 className={styles.blockTitle}>2. Чего мы никогда не делаем</h2>
            <ul className={styles.list}>
              <li>
                Мы никогда не запрашиваем и не храним ваш логин и пароль от Hattrick — авторизация происходит
                напрямую на сайте Hattrick через протокол OAuth
              </li>
              <li>Мы не продаём и не передаём ваши данные третьим лицам</li>
              <li>Мы не используем ваши данные для рекламы</li>
            </ul>
          </div>

          <div className={styles.block}>
            <h2 className={styles.blockTitle}>3. Как долго мы храним данные</h2>
            <p className={styles.text}>
              Данные вашей команды хранятся, пока ваш аккаунт подключён к HattrickManager. Вы можете в любой момент
              отозвать доступ на самом Hattrick (Preferences → External Access Grants) — после этого мы прекращаем
              получать новые данные о вашей команде.
            </p>
          </div>

          <div className={styles.block}>
            <h2 className={styles.blockTitle}>4. С кем мы делимся данными</h2>
            <p className={styles.text}>
              Мы используем сторонние технические сервисы для работы сайта (хостинг, обработка платежей для донатов,
              если применимо). Эти сервисы не получают доступ к данным вашей команды Hattrick напрямую.
            </p>
          </div>

          <div className={styles.block}>
            <h2 className={styles.blockTitle}>5. Cookies</h2>
            <p className={styles.text}>
              Мы используем минимально необходимые cookies для работы сайта (сохранение сессии входа). Подробности —
              в отдельной Cookie Policy.
            </p>
          </div>

          <div className={styles.block}>
            <h2 className={styles.blockTitle}>6. Ваши права</h2>
            <p className={styles.text}>
              Вы можете запросить удаление своих данных (включая email для новостей), написав нам на{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className={styles.contactLink}>
                {CONTACT_EMAIL}
              </a>
              . Отозвать доступ к данным Hattrick можно в любой момент на самом Hattrick.
            </p>
          </div>

          <div className={styles.block}>
            <h2 className={styles.blockTitle}>7. Изменения политики</h2>
            <p className={styles.text}>
              Мы можем обновлять эту политику по мере развития проекта. Существенные изменения будут анонсированы на
              сайте.
            </p>
          </div>

          <div className={styles.block}>
            <h2 className={styles.blockTitle}>8. Контакты</h2>
            <p className={styles.text}>
              По вопросам конфиденциальности пишите на:{" "}
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
