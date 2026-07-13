import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import HowItWorksSection from "@/components/HowItWorksSection";

export const metadata: Metadata = {
  title: "Как это работает — HattrickManager",
  description:
    "Как HattrickManager получает доступ к вашей команде через официальную авторизацию Hattrick (CHPP) и как отозвать доступ.",
};

export default function HowItWorksPage() {
  return (
    <>
      <Header />
      <main>
        <HowItWorksSection />
      </main>
      <Footer />
    </>
  );
}
