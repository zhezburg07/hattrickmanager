import Header from "@/components/Header";
import SquadSection from "@/components/SquadSection";
import FeaturesSection from "@/components/FeaturesSection";
import PricingSection from "@/components/PricingSection";
import Footer from "@/components/Footer";

// Временно скрыто на время технической настройки (подключение базы данных
// и т.д.) — не финальное решение. Чтобы вернуть раздел "Тарифы", поставьте
// снова true.
const SHOW_PRICING_SECTION = false;

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <SquadSection />
        <FeaturesSection />
        {SHOW_PRICING_SECTION && <PricingSection />}
      </main>
      <Footer />
    </>
  );
}
