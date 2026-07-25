import styles from "./PrivacySection.module.css";

const CONTACT_EMAIL = "zhezburg2007@gmail.com";

export default function CopyrightSection() {
  return (
    <section className="section">
      <div className="container">
        <h1 className="sectionTitle">Авторские права</h1>

        <div className={styles.card}>
          <div className={styles.block}>
            <h2 className={styles.blockTitle}>Данные Hattrick</h2>
            <p className={styles.text}>
              Данные о вашей команде (состав, навыки игроков, матчи, финансы и т.д.) используются на этом сайте с
              одобрения CHPP (Community Hattrick Project) — официальной программы Hattrick.org для сторонних
              разработчиков. HattrickManager не является официальным продуктом Hattrick.org и не аффилирован с ним.
            </p>
          </div>

          <div className={styles.block}>
            <h2 className={styles.blockTitle}>Код и дизайн сайта</h2>
            <p className={styles.text}>
              Программный код, дизайн, логотип и оформление сайта HattrickManager являются собственностью проекта
              HattrickManager. Копирование или использование без разрешения не допускается.
            </p>
          </div>

          <div className={styles.block}>
            <h2 className={styles.blockTitle}>Контакты</h2>
            <p className={styles.text}>
              По вопросам, связанным с авторскими правами, пишите на:{" "}
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
