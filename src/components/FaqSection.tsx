import styles from "./PrivacySection.module.css";

const CONTACT_EMAIL = "zhezburg2007@gmail.com";

const FAQ_ITEMS: { question: string; answer: React.ReactNode }[] = [
  {
    question: "Что такое Hattrick?",
    answer: "Hattrick — онлайн-футбольный менеджер, доступный прямо через браузер, без установки программ на компьютер.",
  },
  {
    question: "Зачем мне нужен HattrickManager?",
    answer:
      "HattrickManager — бесплатный сайт-помощник для менеджеров Hattrick. Полностью работает в браузере, доступен с любого устройства. Мы храним историю ваших данных на сервере, так что вы не потеряете статистику при смене устройства.",
  },
  {
    question: "Есть ли у HattrickManager CHPP?",
    answer: "Да, приложение официально одобрено CHPP.",
  },
  {
    question: "Если я подключу команду, должен ли я давать свой пароль от Hattrick?",
    answer:
      "Нет, никогда. Вход происходит через OAuth напрямую на сайте Hattrick — мы никогда не видим и не запрашиваем ваш пароль. Доступ — только для чтения, и его можно отозвать в любой момент на самом Hattrick.",
  },
  {
    question: "Почему HattrickManager?",
    answer: "Создавался как удобный помощник с расстановкой состава и аналитикой команды. Развивается по запросам сообщества.",
  },
  {
    question: "Откуда появился HattrickManager?",
    answer:
      "Проект родился где-то на границах Центральной Азии — там, где степь встречается с интернетом, а любовь к футбольному менеджменту оказалась сильнее отсутствия опыта в программировании.",
  },
  {
    question: "Будет ли HattrickManager переведён на другие языки?",
    answer: (
      <>
        Сейчас сайт доступен только на русском. Если хотите помочь с переводом — напишите на{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className={styles.contactLink}>
          {CONTACT_EMAIL}
        </a>
        .
      </>
    ),
  },
  {
    question: "Будет ли HattrickManager расширяться?",
    answer: "Да, обновления выходят регулярно.",
  },
  {
    question: "Я уверен, что пароль верный, но не могу войти.",
    answer: "Проверьте, разрешены ли cookie в браузере для нашего сайта, и не блокирует ли антивирус/файрвол сторонние сайты.",
  },
  {
    question: "Я случайно отозвал доступ HattrickManager к данным команды.",
    answer: 'Просто зайдите на сайт заново и нажмите "Подключить команду" — все накопленные данные сохранятся.',
  },
  {
    question: "Я завёл новую команду в Hattrick, но вижу только старую.",
    answer: (
      <>
        Обратитесь на{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className={styles.contactLink}>
          {CONTACT_EMAIL}
        </a>{" "}
        — поможем переключить привязку.
      </>
    ),
  },
];

export default function FaqSection() {
  return (
    <section className="section">
      <div className="container">
        <h1 className="sectionTitle">Часто задаваемые вопросы</h1>

        <div className={styles.card}>
          {FAQ_ITEMS.map((item, i) => (
            <div className={styles.block} key={i}>
              <h2 className={styles.blockTitle}>{item.question}</h2>
              <p className={styles.text}>{item.answer}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
