import styles from "./HowItWorksSection.module.css";

const steps: { text: React.ReactNode }[] = [
  { text: <>Вы нажимаете «Войти через Hattrick» на нашем сайте.</> },
  {
    text: (
      <>
        Вас перенаправляет на официальный сайт <code className={styles.domain}>chpp.hattrick.org</code> — важно
        всегда проверять, что в адресной строке именно этот домен.
      </>
    ),
  },
  {
    text: (
      <>
        Вы вводите свой логин и пароль только там, на сайте Hattrick — HattrickManager{" "}
        <b className={styles.emphasis}>никогда не видит и не получает</b> ваш пароль.
      </>
    ),
  },
  { text: <>Вы нажимаете «Разрешить» — Hattrick возвращает вас обратно к нам, уже авторизованным.</> },
  {
    text: (
      <>
        С этого момента HattrickManager может <b className={styles.emphasis}>читать</b> данные вашей команды, но не
        может действовать от вашего имени без вашего отдельного разрешения на каждое действие.
      </>
    ),
  },
];

export default function HowItWorksSection() {
  return (
    <section className="section">
      <div className="container">
        <h1 className="sectionTitle">Как это работает</h1>
        <p className="sectionSubtitle">Как HattrickManager получает доступ к вашей команде — прозрачно и безопасно.</p>

        <ol className={styles.steps}>
          {steps.map((s, i) => (
            <li className={styles.step} key={i}>
              <span className={styles.stepNumber}>{i + 1}</span>
              <p className={styles.stepText}>{s.text}</p>
            </li>
          ))}
        </ol>

        <div className={styles.revokeCard}>
          <span className={styles.revokeIcon}>🔒</span>
          <div>
            <h2 className={styles.revokeTitle}>Как отозвать доступ</h2>
            <p className={styles.revokeText}>
              В любой момент вы можете отключить HattrickManager от вашего аккаунта — зайдите в настройки на самом
              Hattrick, в раздел «Внешний доступ» (Preferences → External Access Grants), и отзовите разрешение.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
