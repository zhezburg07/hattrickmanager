// Полный список стран Hattrick (156) — сопоставление английского названия
// (так CHPP отдаёт его в поле EnglishName, см. src/lib/worldCurrency.ts) с
// кодом ISO 3166-1 alpha-2 и русским названием для интерфейса. Флаг
// рисуется библиотекой flag-icons (SVG-спрайт через CSS-класс "fi fi-xx",
// см. src/components/dashboard/FlagIcon.tsx) — эмодзи-флаги не годятся,
// т.к. на Windows они физически показываются как буквы кода страны, а не
// как картинка (ограничение шрифта эмодзи ОС, а не приложения).
export interface Country {
  name: string; // русское название для интерфейса
  englishName: string; // как страна называется в CHPP (EnglishName)
  isoCode: string; // ISO 3166-1 alpha-2, напр. "KZ"; "" — обычного кода нет (см. flagOverride)
  flagOverride?: string; // код класса flag-icons для стран без обычного ISO 3166-1 (Англия/Шотландия/Уэльс/Сев. Ирландия — напр. "gb-eng")
}

export const hattrickCountries: Record<string, Country> = {
  IQ: { name: "Ирак", englishName: "Iraq", isoCode: "IQ" },
  KW: { name: "Кувейт", englishName: "Kuwait", isoCode: "KW" },
  MA: { name: "Марокко", englishName: "Morocco", isoCode: "MA" },
  JO: { name: "Иордания", englishName: "Jordan", isoCode: "JO" },
  YE: { name: "Йемен", englishName: "Yemen", isoCode: "YE" },
  DZ: { name: "Алжир", englishName: "Algeria", isoCode: "DZ" },
  AD: { name: "Андорра", englishName: "Andorra", isoCode: "AD" },
  AO: { name: "Ангола", englishName: "Angola", isoCode: "AO" },
  AR: { name: "Аргентина", englishName: "Argentina", isoCode: "AR" },
  AZ: { name: "Азербайджан", englishName: "Azerbaijan", isoCode: "AZ" },
  BS: { name: "Багамы", englishName: "Bahamas", isoCode: "BS" },
  BH: { name: "Бахрейн", englishName: "Bahrain", isoCode: "BH" },
  BD: { name: "Бангладеш", englishName: "Bangladesh", isoCode: "BD" },
  BB: { name: "Барбадос", englishName: "Barbados", isoCode: "BB" },
  BY: { name: "Беларусь", englishName: "Belarus", isoCode: "BY" },
  BE: { name: "Бельгия", englishName: "Belgium", isoCode: "BE" },
  BZ: { name: "Белиз", englishName: "Belize", isoCode: "BZ" },
  BJ: { name: "Бенин", englishName: "Benin", isoCode: "BJ" },
  BT: { name: "Бутан", englishName: "Bhutan", isoCode: "BT" },
  BO: { name: "Боливия", englishName: "Bolivia", isoCode: "BO" },
  BA: { name: "Босния и Герцеговина", englishName: "Bosnia and Herzegovina", isoCode: "BA" },
  BW: { name: "Ботсвана", englishName: "Botswana", isoCode: "BW" },
  BR: { name: "Бразилия", englishName: "Brazil", isoCode: "BR" },
  BN: { name: "Бруней", englishName: "Brunei", isoCode: "BN" },
  BG: { name: "Болгария", englishName: "Bulgaria", isoCode: "BG" },
  BF: { name: "Буркина-Фасо", englishName: "Burkina Faso", isoCode: "BF" },
  CV: { name: "Кабо-Верде", englishName: "Cape Verde", isoCode: "CV" },
  CM: { name: "Камерун", englishName: "Cameroon", isoCode: "CM" },
  CA: { name: "Канада", englishName: "Canada", isoCode: "CA" },
  CZ: { name: "Чехия", englishName: "Czech Republic", isoCode: "CZ" },
  CL: { name: "Чили", englishName: "Chile", isoCode: "CL" },
  CN: { name: "Китай", englishName: "China", isoCode: "CN" },
  TW: { name: "Тайвань (китайский)", englishName: "Chinese Taipei", isoCode: "TW" },
  CO: { name: "Колумбия", englishName: "Colombia", isoCode: "CO" },
  KM: { name: "Коморские острова", englishName: "Comoros", isoCode: "KM" },
  CR: { name: "Коста-Рика", englishName: "Costa Rica", isoCode: "CR" },
  CI: { name: "Кот-д'Ивуар", englishName: "Ivory Coast", isoCode: "CI" },
  ME: { name: "Черногория", englishName: "Montenegro", isoCode: "ME" },
  CU: { name: "Куба", englishName: "Cuba", isoCode: "CU" },
  CW: { name: "Кюрасао", englishName: "Curacao", isoCode: "CW" },
  WLS: { name: "Уэльс", englishName: "Wales", isoCode: "", flagOverride: "gb-wls" },
  CY: { name: "Кипр", englishName: "Cyprus", isoCode: "CY" },
  DK: { name: "Дания", englishName: "Denmark", isoCode: "DK" },
  QA: { name: "Катар", englishName: "Qatar", isoCode: "QA" },
  DE: { name: "Германия", englishName: "Germany", isoCode: "DE" },
  MV: { name: "Мальдивы", englishName: "Maldives", isoCode: "MV" },
  EC: { name: "Эквадор", englishName: "Ecuador", isoCode: "EC" },
  EE: { name: "Эстония", englishName: "Estonia", isoCode: "EE" },
  SV: { name: "Сальвадор", englishName: "El Salvador", isoCode: "SV" },
  ENG: { name: "Англия", englishName: "England", isoCode: "", flagOverride: "gb-eng" },
  ES: { name: "Испания", englishName: "Spain", isoCode: "ES" },
  FR: { name: "Франция", englishName: "France", isoCode: "FR" },
  FO: { name: "Фарерские острова", englishName: "Faroe Islands", isoCode: "FO" },
  GH: { name: "Гана", englishName: "Ghana", isoCode: "GH" },
  GI: { name: "Гибралтар", englishName: "Gibraltar", isoCode: "GI" },
  GD: { name: "Гренада", englishName: "Grenada", isoCode: "GD" },
  GU: { name: "Гуам", englishName: "Guam", isoCode: "GU" },
  GT: { name: "Гватемала", englishName: "Guatemala", isoCode: "GT" },
  GQ: { name: "Экваториальная Гвинея", englishName: "Equatorial Guinea", isoCode: "GQ" },
  GN: { name: "Гвинея", englishName: "Guinea", isoCode: "GN" },
  GY: { name: "Гайана", englishName: "Guyana", isoCode: "GY" },
  HT: { name: "Гаити", englishName: "Haiti", isoCode: "HT" },
  KR: { name: "Южная Корея", englishName: "South Korea", isoCode: "KR" },
  AM: { name: "Армения", englishName: "Armenia", isoCode: "AM" },
  GR: { name: "Греция", englishName: "Greece", isoCode: "GR" },
  HN: { name: "Гондурас", englishName: "Honduras", isoCode: "HN" },
  HK: { name: "Гонконг", englishName: "Hong Kong", isoCode: "HK" },
  HR: { name: "Хорватия", englishName: "Croatia", isoCode: "HR" },
  IN: { name: "Индия", englishName: "India", isoCode: "IN" },
  ID: { name: "Индонезия", englishName: "Indonesia", isoCode: "ID" },
  IR: { name: "Иран", englishName: "Iran", isoCode: "IR" },
  IE: { name: "Ирландия", englishName: "Ireland", isoCode: "IE" },
  IS: { name: "Исландия", englishName: "Iceland", isoCode: "IS" },
  IL: { name: "Израиль", englishName: "Israel", isoCode: "IL" },
  IT: { name: "Италия", englishName: "Italy", isoCode: "IT" },
  ET: { name: "Эфиопия", englishName: "Ethiopia", isoCode: "ET" },
  JM: { name: "Ямайка", englishName: "Jamaica", isoCode: "JM" },
  KH: { name: "Камбоджа", englishName: "Cambodia", isoCode: "KH" },
  KZ: { name: "Казахстан", englishName: "Kazakhstan", isoCode: "KZ" },
  KE: { name: "Кения", englishName: "Kenya", isoCode: "KE" },
  KG: { name: "Кыргызстан", englishName: "Kyrgyzstan", isoCode: "KG" },
  LV: { name: "Латвия", englishName: "Latvia", isoCode: "LV" },
  LU: { name: "Люксембург", englishName: "Luxembourg", isoCode: "LU" },
  LI: { name: "Лихтенштейн", englishName: "Liechtenstein", isoCode: "LI" },
  LT: { name: "Литва", englishName: "Lithuania", isoCode: "LT" },
  LB: { name: "Ливан", englishName: "Lebanon", isoCode: "LB" },
  MG: { name: "Мадагаскар", englishName: "Madagascar", isoCode: "MG" },
  HU: { name: "Венгрия", englishName: "Hungary", isoCode: "HU" },
  MY: { name: "Малайзия", englishName: "Malaysia", isoCode: "MY" },
  MT: { name: "Мальта", englishName: "Malta", isoCode: "MT" },
  MX: { name: "Мексика", englishName: "Mexico", isoCode: "MX" },
  EG: { name: "Египет", englishName: "Egypt", isoCode: "EG" },
  MZ: { name: "Мозамбик", englishName: "Mozambique", isoCode: "MZ" },
  MD: { name: "Молдавия", englishName: "Moldova", isoCode: "MD" },
  MN: { name: "Монголия", englishName: "Mongolia", isoCode: "MN" },
  MM: { name: "Мьянма", englishName: "Myanmar", isoCode: "MM" },
  NL: { name: "Нидерланды", englishName: "Netherlands", isoCode: "NL" },
  NP: { name: "Непал", englishName: "Nepal", isoCode: "NP" },
  NI: { name: "Никарагуа", englishName: "Nicaragua", isoCode: "NI" },
  NG: { name: "Нигерия", englishName: "Nigeria", isoCode: "NG" },
  JP: { name: "Япония", englishName: "Japan", isoCode: "JP" },
  NO: { name: "Норвегия", englishName: "Norway", isoCode: "NO" },
  NIR: { name: "Северная Ирландия", englishName: "Northern Ireland", isoCode: "", flagOverride: "gb-nir" },
  UZ: { name: "Узбекистан", englishName: "Uzbekistan", isoCode: "UZ" },
  OCE: { name: "Океания", englishName: "Oceania", isoCode: "" },
  OM: { name: "Оман", englishName: "Oman", isoCode: "OM" },
  PK: { name: "Пакистан", englishName: "Pakistan", isoCode: "PK" },
  PS: { name: "Палестина", englishName: "Palestine", isoCode: "PS" },
  PA: { name: "Панама", englishName: "Panama", isoCode: "PA" },
  PY: { name: "Парагвай", englishName: "Paraguay", isoCode: "PY" },
  PE: { name: "Перу", englishName: "Peru", isoCode: "PE" },
  PH: { name: "Филиппины", englishName: "Philippines", isoCode: "PH" },
  PL: { name: "Польша", englishName: "Poland", isoCode: "PL" },
  PT: { name: "Португалия", englishName: "Portugal", isoCode: "PT" },
  TH: { name: "Таиланд", englishName: "Thailand", isoCode: "TH" },
  PR: { name: "Пуэрто-Рико", englishName: "Puerto Rico", isoCode: "PR" },
  CD: { name: "ДР Конго", englishName: "DR Congo", isoCode: "CD" },
  DO: { name: "Доминиканская Республика", englishName: "Dominican Republic", isoCode: "DO" },
  RO: { name: "Румыния", englishName: "Romania", isoCode: "RO" },
  RU: { name: "Россия", englishName: "Russia", isoCode: "RU" },
  RW: { name: "Руанда", englishName: "Rwanda", isoCode: "RW" },
  KN: { name: "Сент-Китс и Невис", englishName: "Saint Kitts and Nevis", isoCode: "KN" },
  VC: { name: "Сент-Винсент и Гренадины", englishName: "Saint Vincent and the Grenadines", isoCode: "VC" },
  GE: { name: "Грузия", englishName: "Georgia", isoCode: "GE" },
  SM: { name: "Сан-Марино", englishName: "San Marino", isoCode: "SM" },
  ST: { name: "Сан-Томе и Принсипи", englishName: "Sao Tome and Principe", isoCode: "ST" },
  SA: { name: "Саудовская Аравия", englishName: "Saudi Arabia", isoCode: "SA" },
  CH: { name: "Швейцария", englishName: "Switzerland", isoCode: "CH" },
  SCT: { name: "Шотландия", englishName: "Scotland", isoCode: "", flagOverride: "gb-sct" },
  SN: { name: "Сенегал", englishName: "Senegal", isoCode: "SN" },
  MK: { name: "Северная Македония", englishName: "North Macedonia", isoCode: "MK" },
  AL: { name: "Албания", englishName: "Albania", isoCode: "AL" },
  SG: { name: "Сингапур", englishName: "Singapore", isoCode: "SG" },
  SI: { name: "Словения", englishName: "Slovenia", isoCode: "SI" },
  SK: { name: "Словакия", englishName: "Slovakia", isoCode: "SK" },
  ZA: { name: "ЮАР", englishName: "South Africa", isoCode: "ZA" },
  RS: { name: "Сербия", englishName: "Serbia", isoCode: "RS" },
  LK: { name: "Шри-Ланка", englishName: "Sri Lanka", isoCode: "LK" },
  FI: { name: "Финляндия", englishName: "Finland", isoCode: "FI" },
  SR: { name: "Суринам", englishName: "Suriname", isoCode: "SR" },
  SY: { name: "Сирия", englishName: "Syria", isoCode: "SY" },
  SE: { name: "Швеция", englishName: "Sweden", isoCode: "SE" },
  PF: { name: "Таити", englishName: "Tahiti", isoCode: "PF" },
  TZ: { name: "Танзания", englishName: "Tanzania", isoCode: "TZ" },
  TN: { name: "Тунис", englishName: "Tunisia", isoCode: "TN" },
  TT: { name: "Тринидад и Тобаго", englishName: "Trinidad and Tobago", isoCode: "TT" },
  TR: { name: "Турция", englishName: "Turkey", isoCode: "TR" },
  UG: { name: "Уганда", englishName: "Uganda", isoCode: "UG" },
  UA: { name: "Украина", englishName: "Ukraine", isoCode: "UA" },
  AE: { name: "ОАЭ", englishName: "United Arab Emirates", isoCode: "AE" },
  UY: { name: "Уругвай", englishName: "Uruguay", isoCode: "UY" },
  US: { name: "США", englishName: "United States", isoCode: "US" },
  VE: { name: "Венесуэла", englishName: "Venezuela", isoCode: "VE" },
  VN: { name: "Вьетнам", englishName: "Vietnam", isoCode: "VN" },
  ZM: { name: "Замбия", englishName: "Zambia", isoCode: "ZM" },
  AT: { name: "Австрия", englishName: "Austria", isoCode: "AT" },
};

// Небольшой список альтернативных английских написаний — на случай, если
// CHPP пришлёт не ровно то название, что стоит здесь ключом в
// hattrickCountries (например, сокращение или устаревшее написание).
const englishNameAliases: Record<string, string> = {
  Czechia: "Czech Republic",
  "Cote d'Ivoire": "Ivory Coast",
  "Côte d'Ivoire": "Ivory Coast",
  "Democratic Republic of the Congo": "DR Congo",
  "Congo DR": "DR Congo",
  "Congo (DRC)": "DR Congo",
  "Korea Republic": "South Korea",
  "Korea, South": "South Korea",
  "Republic of Korea": "South Korea",
  Macedonia: "North Macedonia",
  "FYR Macedonia": "North Macedonia",
  USA: "United States",
  "United States of America": "United States",
  UAE: "United Arab Emirates",
  Bosnia: "Bosnia and Herzegovina",
  "St Kitts and Nevis": "Saint Kitts and Nevis",
  "St. Kitts and Nevis": "Saint Kitts and Nevis",
  "St Vincent and the Grenadines": "Saint Vincent and the Grenadines",
  "São Tomé and Príncipe": "Sao Tome and Principe",
  Curaçao: "Curacao",
  Taiwan: "Chinese Taipei",
  Burma: "Myanmar",
  Holland: "Netherlands",
};

const byEnglishName: Record<string, Country> = Object.fromEntries(
  Object.values(hattrickCountries).map((c) => [c.englishName, c]),
);

// Показывается, когда даже страну самой команды узнать не удалось (сбой в
// данных) — просто нейтральная заглушка, без каких-либо статусов/подписей.
export const unknownCountry: Country = { name: "Неизвестно", englishName: "", isoCode: "" };

// Ищет страну по английскому названию (так, как его отдаёт CHPP в
// EnglishName). Если точного совпадения нет — пробует известные
// альтернативные написания; если и это не помогло, честно показывает
// присланное название текстом вместо того, чтобы угадывать флаг.
export function resolveCountryByEnglishName(englishName: string): Country {
  const direct = byEnglishName[englishName];
  if (direct) return direct;

  const aliased = englishNameAliases[englishName];
  if (aliased && byEnglishName[aliased]) return byEnglishName[aliased];

  return { name: englishName, englishName, isoCode: "" };
}

// Возвращает код класса flag-icons ("kz", "gb-eng", ...) для страны — либо
// через isoCode (обычный случай, приводим к нижнему регистру, как того
// требует библиотека), либо через flagOverride (Англия/Шотландия/Уэльс/Сев.
// Ирландия, у которых нет обычного ISO-кода). Пустая строка — флага нет
// вообще (Океания) или страну не удалось определить.
export function getCountryFlagCode(country: Country): string {
  if (country.flagOverride) return country.flagOverride;
  return country.isoCode ? country.isoCode.toLowerCase() : "";
}
