import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getStoredAccountId } from "@/lib/hattrickApi";
import { hasEmailLogin } from "@/lib/accountsDb";
import SessionUpgrader from "@/components/SessionUpgrader";
import DemoModeBanner from "@/components/dashboard/DemoModeBanner";
import RequirePasswordGate from "@/components/dashboard/RequirePasswordGate";

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

  // Legacy-аккаунты без пароля (заведены автоматически при первом OAuth-
  // подключении команды до появления обязательной регистрации, см. чат) —
  // новых таких больше не появится, но старые записи в базе остались.
  // Данные (включая привязку команды) не трогаем — просто требуем довести
  // регистрацию до конца, прежде чем пускать в ЛЮБОЙ раздел /dashboard/*
  // (см. RequirePasswordGate.tsx — рендерится вместо {children} целиком).
  if (accountId && !(await hasEmailLogin(accountId))) {
    return <RequirePasswordGate />;
  }

  // Если при входе не удалось сразу выдать cookie сессии сайта (см.
  // /api/auth/callback — managercompendium.xml не ответил), там же ставится
  // короткая cookie с точной причиной — показываем её один раз прямо здесь,
  // а SessionUpgrader параллельно пробует "дозаписать" cookie сессии сайта.
  const warningRaw = cookies().get("session_warning")?.value;
  const warning = warningRaw ? decodeURIComponent(warningRaw) : null;

  return (
    <>
      <SessionUpgrader />
      {warning && (
        <div className="container" style={{ paddingTop: 16 }}>
          <DemoModeBanner
            title="Вход выполнен без cookie сессии сайта — после закрытия браузера потребуется войти заново"
            reasons={[warning]}
            showConnectAction={false}
          />
        </div>
      )}
      {children}
    </>
  );
}
