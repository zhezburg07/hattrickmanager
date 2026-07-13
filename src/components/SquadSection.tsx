import FootballPitch from "./FootballPitch";

export default function SquadSection() {
  return (
    <section id="squad" className="section">
      <div className="container">
        <h2 className="sectionTitle">Состав на поле</h2>
        <p className="sectionSubtitle">
          Формация 4-4-2. Нажмите на любого игрока, чтобы увидеть его форму и выносливость.
        </p>
        <div style={{ marginTop: 40 }}>
          <FootballPitch />
        </div>
      </div>
    </section>
  );
}
