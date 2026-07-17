import styles from "./ProLockOverlay.module.css";

// Тизер Pro-функций: контент под замком показывается размыто, поверх —
// карточка с объяснением, что доступно на платном тарифе. Монетизация пока
// отложена — сейчас в фокусе доведение основного продукта до полностью
// рабочего состояния, поэтому замок временно отключён флагом ниже: все
// функции выглядят полностью доступными, без намёков на платность. Сам
// механизм тизера не удалён — верните SHOW_PRO_LOCK в true, когда будем
// готовы к монетизации (и тогда же добавьте проверку реального статуса
// подписки вместо жёсткого "всегда заблокировано").
const SHOW_PRO_LOCK = false;

export default function ProLockOverlay({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  if (!SHOW_PRO_LOCK) {
    return <>{children}</>;
  }

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
