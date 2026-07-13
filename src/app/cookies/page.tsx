import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CookiesSection from "@/components/CookiesSection";

export const metadata: Metadata = {
  title: "Политика Cookie — HattrickManager",
  description: "Какие cookies использует HattrickManager и как ими управлять.",
};

export default function CookiesPage() {
  return (
    <>
      <Header />
      <main>
        <CookiesSection />
      </main>
      <Footer />
    </>
  );
}
