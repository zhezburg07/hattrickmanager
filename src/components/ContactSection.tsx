import styles from "./PrivacySection.module.css";

const CONTACT_EMAIL = "zhezburg2007@gmail.com";

export default function ContactSection() {
  return (
    <section className="section">
      <div className="container">
        <h1 className="sectionTitle">Контакты</h1>
        <p className="sectionSubtitle">Вопросы, предложения, отчёты об ошибках — пишите напрямую.</p>

        <div className={styles.card}>
          <div className={styles.block}>
            <h2 className={styles.blockTitle}>Почта</h2>
            <p className={styles.text}>
              По любым вопросам о HattrickManager:{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className={styles.contactLink}>
                {CONTACT_EMAIL}
              </a>
            </p>
          </div>

          <div className={styles.block}>
            <h2 className={styles.blockTitle}>Проблема с подключением или данными команды?</h2>
            <p className={styles.text}>
              Опишите, что произошло — ID вашей команды в Hattrick и раздел, где заметили проблему, помогут разобраться
              быстрее.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
