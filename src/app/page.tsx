import Header from "@/components/Header";
import TopInfoBar from "@/components/TopInfoBar";
import HeroBanner from "@/components/HeroBanner";
import WelcomeSection from "@/components/WelcomeSection";
import FeaturesSection from "@/components/FeaturesSection";
import ProductShowcase from "@/components/ProductShowcase";
import PricingSection from "@/components/PricingSection";
import Footer from "@/components/Footer";

// Временно скрыто на время технической настройки (подключение базы данных
// и т.д.) — не финальное решение. Чтобы вернуть раздел "Тарифы", поставьте
// снова true.
const SHOW_PRICING_SECTION = false;

// Главная — иначе полностью статическая страница, но счётчик посещений в
// TopInfoBar ходит за реальными данными (см. src/lib/vercelAnalytics.ts) —
// без этого Next.js вшил бы числа один раз при сборке и больше не обновлял
// их. Пока VERCEL_ANALYTICS_TOKEN не задан, этот запрос не выполняется
// вовсе — явный revalidate здесь гарантирует, что счётчик начнёт
// обновляться сам, как только переменные окружения появятся, без нового
// деплоя ради этого.
export const revalidate = 60;

export default function Home() {
  return (
    <>
      <TopInfoBar />
      <Header />
      <main>
        <HeroBanner />
        <WelcomeSection />
        <FeaturesSection />
        <ProductShowcase />
        {SHOW_PRICING_SECTION && <PricingSection />}
      </main>
      <Footer />
    </>
  );
}
