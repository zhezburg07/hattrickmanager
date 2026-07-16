import type { Metadata } from "next";
import { isAdminAuthenticated, isAdminPasswordConfigured } from "@/lib/adminAuth";
import { getAllConnectedUsers, type ConnectedUser } from "@/lib/connectedUsersDb";
import styles from "./Admin.module.css";

// Не индексируется поисковиками — реальная защита всё равно только через
// пароль (ADMIN_PASSWORD), это лишь дополнительная гигиена.
export const metadata: Metadata = { robots: { index: false, follow: false } };

function formatDate(value: string): string {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function LoginForm({ wrongPassword }: { wrongPassword: boolean }) {
  const configured = isAdminPasswordConfigured();

  return (
    <div className={styles.page}>
      <form className={styles.loginCard} method="POST" action="/api/admin/login">
        <div className={styles.title}>Админ-панель</div>
        {!configured ? (
          <p className={styles.error}>
            На сервере не задана переменная окружения ADMIN_PASSWORD — вход невозможен, пока она не настроена.
          </p>
        ) : (
          <>
            <p className={styles.subtitle}>Эта страница видна только владельцу сайта. Введите пароль.</p>
            {wrongPassword && <p className={styles.error}>Неверный пароль.</p>}
            <input className={styles.input} type="password" name="password" placeholder="Пароль" autoFocus required />
            <button className={styles.button} type="submit">
              Войти
            </button>
          </>
        )}
      </form>
    </div>
  );
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  if (!isAdminAuthenticated()) {
    return <LoginForm wrongPassword={searchParams?.error === "1"} />;
  }

  let users: ConnectedUser[] = [];
  let loadError: string | null = null;
  try {
    users = await getAllConnectedUsers();
  } catch (err) {
    loadError = err instanceof Error ? err.message : "неизвестная ошибка";
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.title}>Подключённые пользователи</div>
          <form method="POST" action="/api/admin/logout">
            <button className={styles.logoutButton} type="submit">
              Выйти
            </button>
          </form>
        </div>

        {loadError && <p className={styles.error}>Не удалось загрузить список: {loadError}</p>}

        {!loadError &&
          (users.length === 0 ? (
            <p className={styles.subtitle}>Пока никто не подключал команду через Hattrick.</p>
          ) : (
            <>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Hattrick UserID</th>
                      <th>Команда</th>
                      <th>Первое подключение</th>
                      <th>Последний визит</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.hattrickUserId}>
                        <td>{u.hattrickUserId}</td>
                        <td>{u.teamName ?? "—"}</td>
                        <td>{formatDate(u.firstConnectedAt)}</td>
                        <td>{formatDate(u.lastSeenAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className={styles.count}>Всего: {users.length}</p>
            </>
          ))}
      </div>
    </div>
  );
}
