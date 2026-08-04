import { getStoredAccountId } from "@/lib/hattrickApi";
import HeaderClient from "./HeaderClient";

// Серверная обёртка — единственная причина существования этого файла:
// getStoredAccountId() читает httpOnly cookie сессии (см. src/lib/siteSession.ts)
// и такое чтение недоступно клиентскому компоненту напрямую. Вся остальная
// логика (usePathname, выпадающее меню и т.д.) осталась в HeaderClient.tsx —
// импорт "@/components/Header" не поменялся ни в одной из ~15 страниц,
// которые уже рендерят <Header />.
export default function Header() {
  const accountId = getStoredAccountId();
  return <HeaderClient accountId={accountId} />;
}
