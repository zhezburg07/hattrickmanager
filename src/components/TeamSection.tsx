import styles from "./PrivacySection.module.css";

const CONTACT_EMAIL = "zhezburg2007@gmail.com";

export default function TeamSection() {
  return (
    <section className="section">
      <div className="container">
        <h1 className="sectionTitle">Наша команда</h1>
        <p className="sectionSubtitle">Кто делает HattrickManager.</p>

        <div className={styles.card}>
          <div className={styles.block}>
            <h2 className={styles.blockTitle}>Один разработчик и ИИ</h2>
            <p className={styles.text}>
              HattrickManager ведёт один разработчик-энтузиаст Hattrick, при активной помощи современных
              ИИ-инструментов для написания и поддержки кода. Это небольшой независимый проект, а не продукт крупной
              компании — отсюда и постепенный, но живой темп развития.
            </p>
          </div>

          <div className={styles.block}>
            <h2 className={styles.blockTitle}>Обратная связь приветствуется</h2>
            <p className={styles.text}>
              Если что-то работает не так, как ожидалось, или не хватает какой-то функции — напишите на{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className={styles.contactLink}>
                {CONTACT_EMAIL}
              </a>
              . Идеи и отчёты об ошибках реально влияют на то, что появится в проекте дальше.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
