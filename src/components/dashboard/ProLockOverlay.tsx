import styles from "./ProLockOverlay.module.css";

// Тизер Pro-функций: контент под замком показывается размыто, поверх —
// карточка с объяснением, что доступно на платном тарифе. Ни у одного
// пользователя сейчас нет статуса "Pro" (вкладка "Тарифы" на главной сама по
// себе временно скрыта через SHOW_PRICING_SECTION в src/app/page.tsx, а
// Pro-тариф там же помечен "В разработке") — поэтому пока этот компонент
// всегда показывает замок, без проверки подписки. Как только появится
// реальный статус подписки, сюда достаточно добавить проп isUnlocked.
export default function ProLockOverlay({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.wrap}>
      <div className={styles.blurred} aria-hidden="true">
        {children}
      </div>
      <div className={styles.overlay}>
        <div className={styles.card}>
          <div className={styles.lockIcon}>🔒</div>
          <div className={styles.title}>
            {title}
            <span className={styles.badge}>Pro</span>
          </div>
          <p className={styles.desc}>{description}</p>
        </div>
      </div>
    </div>
  );
}
