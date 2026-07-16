import { redirect } from "next/navigation";
import { getStoredHattrickTokens } from "@/lib/hattrickApi";

// Личный кабинет требует реального подключения к Hattrick — раньше каждая
// страница внутри /dashboard сама проверяла токены и показывала демо-данные
// вместо реальных; теперь демо-режима нет, и вход в раздел без подключённой
// команды просто ведёт на главную с призывом "Подключить команду".
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const tokens = await getStoredHattrickTokens();
  if (!tokens) {
    redirect("/");
  }
  return children;
}
