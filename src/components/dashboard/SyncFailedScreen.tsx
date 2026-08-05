import Header from "@/components/Header";
import Footer from "@/components/Footer";
import DemoModeBanner from "./DemoModeBanner";
import SyncButton from "./SyncButton";
import { isChppAuthError } from "@/lib/chppError";
import styles from "./Overview.module.css";

// Показывается ЛЮБОЙ мигрированной страницей (Обзор, Состав, Расстановка,
// ...), если синхронизация ни разу не была успешной для этого аккаунта —
// вместо тихого сбоя или пустой страницы (см. чат, пункт 3 требований).
// Различает протухший/отозванный токен Hattrick (нужен именно повторный
// OAuth, пароль здесь не поможет) от прочих сбоёв (сеть, временная ошибка
// CHPP и т.п.) — та же формулировка, что раньше была только на Обзоре.
export default function SyncFailedScreen({ lastError }: { lastError: string | null }) {
  const isAuthFailure = lastError ? isChppAuthError(new Error(lastError)) : false;

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className="container" style={{ paddingBottom: 48, paddingTop: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <DemoModeBanner
              title={isAuthFailure ? "Нужно заново подключить команду" : "Не удалось синхронизировать данные"}
              reasons={
                isAuthFailure
                  ? [
                      "Сохранённое разрешение от Hattrick перестало действовать — такое бывает редко, например если токен устарел или доступ был отозван на самом Hattrick.",
                      "Это не ошибка сайта и не потеря данных — после повторного подключения всё вернётся как было.",
                    ]
                  : [
                      lastError ?? "Неизвестная ошибка.",
                      "Попробуйте ещё раз — это не повредит уже сохранённые данные, если они были.",
                    ]
              }
              showConnectAction={isAuthFailure}
            />
          </div>
          {!isAuthFailure && <SyncButton label="Повторить синхронизацию" />}
        </div>
      </main>
      <Footer />
    </>
  );
}
