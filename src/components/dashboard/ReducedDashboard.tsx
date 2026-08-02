import Header from "@/components/Header";
import Footer from "@/components/Footer";
import DemoModeBanner from "./DemoModeBanner";
import styles from "./Overview.module.css";

// Показывается вместо полного Обзора, когда аккаунт залогинен (по логину/
// паролю или предыдущей OAuth-сессии), но ни одна команда Hattrick к нему
// ещё не привязана — например, сразу после регистрации на главной странице
// (см. чат: "Реализуй новую форму регистрации..."). Никаких запросов к CHPP
// здесь не делается вовсе.
export default function ReducedDashboard({ connectError }: { connectError?: string }) {
  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className="container" style={{ paddingBottom: 48, paddingTop: 24 }}>
          {connectError === "already-linked" && (
            <div style={{ marginBottom: 16 }}>
              <DemoModeBanner
                title="Эта команда Hattrick уже привязана к другому аккаунту"
                reasons={[
                  "Попробуйте подключить другую команду, либо обратитесь в поддержку, если считаете это ошибкой.",
                ]}
                showConnectAction={false}
              />
            </div>
          )}
          <DemoModeBanner
            title="Команда ещё не подключена"
            reasons={[
              "Подключите команду через официальный OAuth Hattrick (CHPP), чтобы видеть состав, расстановку, финансы, матчи и остальные разделы личного кабинета.",
            ]}
          />
        </div>
      </main>
      <Footer />
    </>
  );
}
