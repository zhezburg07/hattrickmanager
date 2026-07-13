import type { Metadata } from "next";
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
      <body>{children}</body>
    </html>
  );
}
