import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "flag-icons/css/flag-icons.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "HattrickManager — ассистент менеджера Hattrick",
  description:
    "HattrickManager помогает менеджерам Hattrick управлять составом, следить за статистикой и развивать молодёжную академию.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body>
        {children}
        {/* Собирает сами посещения (Vercel Web Analytics) — без этого
            компонента счётчик на главной (src/lib/vercelAnalytics.ts,
            запрашивает уже собранную статистику через Web Analytics API)
            всегда получал бы пустые данные, даже с настроенными
            VERCEL_ANALYTICS_TOKEN/VERCEL_PROJECT_ID: одно читает, другое
            собирает — нужны оба. */}
        <Analytics />
      </body>
    </html>
  );
}
