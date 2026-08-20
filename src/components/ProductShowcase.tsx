import Image from "next/image";
import styles from "./ProductShowcase.module.css";

// Реальные скриншоты интерфейса (см. public/screenshots/*.png) — сняты с
// живых production-компонентов на реалистичных тестовых данных (не боевой
// аккаунт), см. чат "Обнови скриншоты на главной публичной странице".
// Заменить на новые можно, просто подложив файлы с теми же именами в
// public/screenshots/.
const items: { title: string; description: string; image: string }[] = [
  {
    title: "Обзор команды",
    description:
      "Рейтинг силы, турнирная таблица, финансы и настроение болельщиков — главное о команде на одном экране, обновляется при каждом заходе.",
    image: "/screenshots/overview.png",
  },
  {
    title: "Состав",
    description:
      "Полный список игроков с навыками по официальной шкале Hattrick, флагами стран, рейтингом за последний матч и подсказками при наведении.",
    image: "/screenshots/squad.png",
  },
  {
    title: "Калькулятор состава",
    description:
      "Перетаскивайте игроков на позиции, сравнивайте показатели линий и получайте рекомендованную расстановку под текущий состав.",
    image: "/screenshots/lineup.png",
  },
  {
    title: "Финансы",
    description: "Баланс клуба, доходы и расходы по статьям за неделю — сразу видно, на чём клуб зарабатывает и теряет.",
    image: "/screenshots/finance.png",
  },
  {
    title: "Матчи",
    description: "Календарь сезона с результатами и датами — нажмите на сыгранный матч, чтобы увидеть рейтинги игроков.",
    image: "/screenshots/matches.png",
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
              <Image src={item.image} alt={item.title} width={1600} height={1000} sizes="(max-width: 860px) 100vw, 50vw" />
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
