import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import TeamSection from "@/components/TeamSection";

export const metadata: Metadata = {
  title: "Наша команда — HattrickManager",
  description: "Кто разрабатывает и поддерживает HattrickManager.",
};

export default function TeamPage() {
  return (
    <>
      <Header />
      <main>
        <TeamSection />
      </main>
      <Footer />
    </>
  );
}
