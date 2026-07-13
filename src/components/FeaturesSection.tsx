import styles from "./FeaturesSection.module.css";

const features = [
  {
    icon: "⚙️",
    title: "Калькулятор состава",
    description:
      "Подбирайте оптимальный стартовый состав и тактику под соперника — на основе позиций, формы и специальностей игроков.",
  },
  {
    icon: "📊",
    title: "Статистика и прогноз",
    description:
      "Следите за динамикой формы команды и получайте прогноз результата предстоящего матча.",
  },
  {
    icon: "🌱",
    title: "Молодёжная академия",
    description:
      "Отслеживайте прогресс молодых игроков и вовремя переводите лучших воспитанников в основной состав.",
  },
];

export default function FeaturesSection() {
  return (
    <section id="features" className="section">
      <div className="container">
        <h2 className="sectionTitle">Функции</h2>
        <p className="sectionSubtitle">
          Всё, что нужно менеджеру Hattrick, чтобы принимать решения быстрее и увереннее.
        </p>

        <div className={styles.grid}>
          {features.map((f) => (
            <div className={styles.card} key={f.title}>
              <span className={styles.icon}>{f.icon}</span>
              <div className={styles.title}>{f.title}</div>
              <p className={styles.desc}>{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
