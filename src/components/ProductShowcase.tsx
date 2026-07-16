import styles from "./ProductShowcase.module.css";

// Скриншоты — временные иллюстративные мокапы интерфейса (не буквальные
// снимки экрана — см. public/screenshots/*.svg), поставлены как заглушки
// вместо интерактивного демо-состава, который раньше жил прямо на главной
// странице. Заменить на финальные скриншоты можно, просто подложив новые
// файлы с теми же именами в public/screenshots/.
const items: { title: string; description: string; image: string }[] = [
  {
    title: "Обзор команды",
    description:
      "Рейтинг силы, турнирная таблица, финансы и настроение болельщиков — главное о команде на одном экране, обновляется при каждом заходе.",
    image: "/screenshots/overview.svg",
  },
  {
    title: "Состав",
    description:
      "Полный список игроков с навыками по официальной шкале Hattrick, флагами стран, рейтингом за последний матч и подсказками при наведении.",
    image: "/screenshots/squad.svg",
  },
  {
    title: "Калькулятор состава",
    description:
      "Перетаскивайте игроков на позиции, сравнивайте показатели линий и получайте рекомендованную расстановку под текущий состав.",
    image: "/screenshots/lineup.svg",
  },
  {
    title: "Финансы",
    description: "Баланс клуба, доходы и расходы по статьям за неделю — сразу видно, на чём клуб зарабатывает и теряет.",
    image: "/screenshots/finance.svg",
  },
  {
    title: "Матчи",
    description: "Календарь сезона с результатами и датами — нажмите на сыгранный матч, чтобы увидеть рейтинги игроков.",
    image: "/screenshots/matches.svg",
  },
];

export default function ProductShowcase() {
  return (
    <section id="product" className="section">
      <div className="container">
        <h2 className="sectionTitle">Как это выглядит</h2>
        <p className="sectionSubtitle">Реальные экраны личного кабинета — то, что вы увидите сразу после подключения команды.</p>

        {items.map((item, i) => (
          <div className={`${styles.row} ${i % 2 === 1 ? styles.rowReverse : ""}`} key={item.title}>
            <div className={styles.shot}>
              {/* eslint-disable-next-line @next/next/no-img-element -- локальные статичные SVG-мокапы, next/image требует dangerouslyAllowSVG для всего сайта ради пяти иконок */}
              <img src={item.image} alt={item.title} width={900} height={560} />
            </div>
            <div>
              <h3 className={styles.title}>{item.title}</h3>
              <p className={styles.desc}>{item.description}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
