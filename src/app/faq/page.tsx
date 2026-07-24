import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FaqSection from "@/components/FaqSection";

export const metadata: Metadata = {
  title: "Часто задаваемые вопросы — HattrickManager",
  description: "Ответы на частые вопросы о Hattrick и HattrickManager.",
};

export default function FaqPage() {
  return (
    <>
      <Header />
      <main>
        <FaqSection />
      </main>
      <Footer />
    </>
  );
}
