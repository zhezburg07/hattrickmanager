import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getStoredAccountId } from "@/lib/hattrickApi";
import SessionUpgrader from "@/components/SessionUpgrader";
import DemoModeBanner from "@/components/dashboard/DemoModeBanner";

// Личный кабинет требует ЛЮБОЙ валидной сессии — аккаунта (см.
// src/lib/accountsDb.ts), НЕ обязательно уже подключённой к Hattrick
// команды. Раньше этот гейт требовал реальных Hattrick-токенов, из-за чего
// зарегистрированный, но ещё не подключивший команду аккаунт не мог попасть
// в кабинет вовсе — теперь /dashboard (Обзор) сам решает, показать полный
// дашборд или урезанную версию с призывом "Подключить команду" (см.
// src/app/dashboard/page.tsx), а этот layout лишь отсеивает полностью
// анонимных посетителей.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const accountId = getStoredAccountId();
  const hasLegacySoftLogin =
    !!cookies().get("hattrick_access_token")?.value && !!cookies().get("hattrick_access_token_secret")?.value;
  if (!accountId && !hasLegacySoftLogin) {
    redirect("/");
  }

  // Если при входе не удалось выдать долгоживущую сессию (см.
  // /api/auth/callback — managercompendium.xml не ответил), там же ставится
  // короткая cookie с точной причиной — показываем её один раз прямо здесь,
  // а SessionUpgrader параллельно пробует "дозаписать" долгоживущую сессию.
  const warningRaw = cookies().get("session_warning")?.value;
  const warning = warningRaw ? decodeURIComponent(warningRaw) : null;

  return (
    <>
      <SessionUpgrader />
      {warning && (
        <div className="container" style={{ paddingTop: 16 }}>
          <DemoModeBanner
            title="Вход выполнен без долгоживущей сессии — после закрытия браузера потребуется войти заново"
            reasons={[warning]}
            showConnectAction={false}
          />
        </div>
      )}
      {children}
    </>
  );
}
