import { getCountryFlagCode } from "@/data/hattrickCountries";
import type { Country } from "@/data/squad";

// Показывает флаг страны картинкой (SVG-спрайт из npm-пакета flag-icons,
// класс "fi fi-xx", см. импорт CSS в src/app/layout.tsx) — не эмодзи, т.к.
// эмодзи-флаги на Windows физически не рендерятся как картинка (показывают
// буквы кода страны вместо флага из-за отсутствия лигатур в системном
// шрифте эмодзи). Нет кода — нейтральная заглушка (глобус) вместо пустого
// места.
export default function FlagIcon({ country, title }: { country: Country; title?: string }) {
  const code = getCountryFlagCode(country);
  if (!code) {
    return (
      <span aria-hidden="true" title={title ?? country.name}>
        🌐
      </span>
    );
  }
  return <span className={`fi fi-${code}`} title={title ?? country.name} />;
}
