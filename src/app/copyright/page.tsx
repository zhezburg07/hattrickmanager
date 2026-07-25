import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CopyrightSection from "@/components/CopyrightSection";

export const metadata: Metadata = {
  title: "Авторские права — HattrickManager",
  description: "Условия использования данных Hattrick и прав на код и дизайн сайта HattrickManager.",
};

export default function CopyrightPage() {
  return (
    <>
      <Header />
      <main>
        <CopyrightSection />
      </main>
      <Footer />
    </>
  );
}
