import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getStoredHattrickTokens } from "@/lib/hattrickApi";
import SessionUpgrader from "@/components/SessionUpgrader";
import DemoModeBanner from "@/components/dashboard/DemoModeBanner";

// Личный кабинет требует реального подключения к Hattrick — раньше каждая
// страница внутри /dashboard сама проверяла токены и показывала демо-данные
// вместо реальных; теперь демо-режима нет, и вход в раздел без подключённой
// команды просто ведёт на главную с призывом "Подключить команду".
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const tokens = await getStoredHattrickTokens();
  if (!tokens) {
    redirect("/");
  }

  // Если при входе не удалось выдать долгоживущую сессию (см.
  // /api/auth/callback — manager.xml не ответил), там же ставится короткая
  // cookie с точной причиной — показываем её один раз прямо здесь, а
  // SessionUpgrader параллельно пробует "дозаписать" долгоживущую сессию.
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
