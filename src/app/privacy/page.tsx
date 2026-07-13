import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PrivacySection from "@/components/PrivacySection";

export const metadata: Metadata = {
  title: "Политика конфиденциальности — HattrickManager",
  description: "Какие данные собирает HattrickManager, как они используются и как их удалить.",
};

export default function PrivacyPage() {
  return (
    <>
      <Header />
      <main>
        <PrivacySection />
      </main>
      <Footer />
    </>
  );
}
