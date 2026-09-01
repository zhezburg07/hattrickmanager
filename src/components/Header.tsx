"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import HeaderLoginDropdown from "./HeaderLoginDropdown";
import styles from "./Header.module.css";

const cabinetTabs = [
  { href: "/dashboard", label: "Обзор" },
  { href: "/dashboard/squad", label: "Состав" },
  { href: "/dashboard/lineup", label: "Расстановка" },
  { href: "/dashboard/matches", label: "Матчи" },
  { href: "/dashboard/cup", label: "Кубки" },
  { href: "/dashboard/finance", label: "Финансы" },
  { href: "/dashboard/stadium", label: "Стадион" },
  { href: "/dashboard/training", label: "Тренировка" },
  { href: "/dashboard/youth", label: "Юношеская команда" },
  { href: "/dashboard/transfers", label: "Трансферы" },
  { href: "/dashboard/updates", label: "Обновления" },
];

// Временно скрыты из меню личного кабинета по запросу — целесообразность
// этих разделов ещё нужно обдумать. Сами страницы и код не удалены и
// по-прежнему доступны напрямую по ссылке — просто убраны из выпадающего
// меню. Уберите href отсюда, чтобы вернуть пункт меню.
const HIDDEN_NAV_HREFS = new Set(["/dashboard/finance", "/dashboard/stadium", "/dashboard/training"]);
const visibleCabinetTabs = cabinetTabs.filter((tab) => !HIDDEN_NAV_HREFS.has(tab.href));

const STALE_SYNC_MS = 7 * 24 * 60 * 60 * 1000; // неделя

export default function Header() {
  const pathname = usePathname();
  const isCabinet = pathname?.startsWith("/dashboard") ?? false;
  const [open, setOpen] = useState(false);
  const [showUpdatesReminder, setShowUpdatesReminder] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Иконка "Обновления" — не постоянный элемент, а напоминание: видна,
  // только когда данные не синхронизировались больше недели (или вообще ни
  // разу), см. чат. Header.tsx остаётся клиентским компонентом (без этого
  // публичные страницы снова стали бы динамическими только ради одной
  // иконки внутри кабинета) — вместо этого клиентский fetch по требованию,
  // только когда мы вообще внутри кабинета, к уже существующему
  // GET /api/dashboard/sync (тот же роут, что и ручная синхронизация, но
  // GET там ничего не трогает в CHPP, только читает статус).
  useEffect(() => {
    if (!isCabinet) return;
    let cancelled = false;
    fetch("/api/dashboard/sync", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { lastSyncedAt?: string | null } | null) => {
        if (cancelled || !json) return;
        const lastSyncedAt = json.lastSyncedAt ?? null;
        const isStale = !lastSyncedAt || Date.now() - new Date(lastSyncedAt).getTime() > STALE_SYNC_MS;
        setShowUpdatesReminder(isStale);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isCabinet]);

  return (
    <header className={styles.header}>
      <div className={`container ${styles.inner}`}>
        {/* Внутри личного кабинета логотип ведёт на /dashboard, а не на
            публичную главную — единственный намеренный способ покинуть
            кабинет обратно на публичный сайт должен быть явный "Выйти" ниже,
            а не случайный клик по логотипу (см. чат про поведение после
            входа). */}
        {/* Финальный утверждённый логотип (см. чат "Логотип шапки: точный
            SVG") — вставлен как есть, а не собственная интерпретация:
            кольцо-рамка + тёмный фон + мяч + подпись "Hm" + значок "A", всё
            одним SVG. Единственные два отличия от присланного кода: (1) ID
            градиентов переименованы в hmLogo* вместо голых a3/b3/c3/d3/e3/f3
            — короткие généric-ID рискуют столкнуться с любым другим SVG на
            странице (ID уникальны на весь документ, не только внутри своего
            <svg>), у остальных мячей на сайте уже есть свои hmBallBody/
            hmLogoBallBody и т.п. (2) вращение при наведении применено не
            прямо на <g className={styles.logoBallGroup}> (как в присланной
            разметке), а на ДОПОЛНИТЕЛЬНО вложенную <g className=
            {styles.logoBallSpin}> внутри неё — см. подробное объяснение
            прямо у .logoBallGroup в Header.module.css: CSS-transform на
            SVG-элементе ЗАМЕНЯЕТ, а не дополняет, его собственный
            transform-атрибут (translate/scale), так что вращение прямо на
            .logoBallGroup сбрасывало бы позицию/масштаб мяча при наведении
            вместо плавного вращения на месте. Визуально результат тот же —
            вращается только сам мяч, рамка/буквы/значок неподвижны. */}
        <Link
          href={isCabinet ? "/dashboard" : "/"}
          className={styles.logo}
          title="Hattrick Manager Assistant"
          aria-label="Hattrick Manager Assistant"
        >
          <svg className={styles.logoMark} viewBox="0 0 300 300" width="45" height="45" aria-hidden="true">
            <circle cx="150" cy="150" r="140" fill="none" stroke="#C9A227" strokeWidth="6" />
            <circle cx="150" cy="150" r="131" fill="#152C26" />
            <g className={styles.logoBallGroup} transform="translate(95,59) scale(0.2444)">
              <g className={styles.logoBallSpin}>
                <defs>
                  <linearGradient id="hmLogoA3">
                    <stop offset="0" />
                    <stop stopOpacity="0" offset="1" />
                  </linearGradient>
                  <linearGradient id="hmLogoF3" x1=".23348" x2=".37601" y1=".35517" y2="-.47343">
                    <stop stopColor="#333" offset="0" />
                    <stop stopOpacity="0" offset="1" />
                  </linearGradient>
                  <linearGradient id="hmLogoE3" x1="1.0197" x2=".13875" y1=".42728" y2=".14519" xlinkHref="#hmLogoA3" />
                  <linearGradient id="hmLogoD3" x1=".11003" x2="1.0193" y1=".35019" y2=".49577" xlinkHref="#hmLogoA3" />
                  <radialGradient id="hmLogoC3" cx="478.61" cy="550.29" r="225.06" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#fff" offset="0" />
                    <stop stopColor="#fff" offset=".4702" />
                    <stop stopColor="#d6d6d6" offset="1" />
                  </radialGradient>
                  <radialGradient id="hmLogoB3" cx="477.49" cy="544.3" r="206.09" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#6a6a6a" offset="0" />
                    <stop offset="1" />
                  </radialGradient>
                </defs>
                <path
                  transform="translate(-236.97 -361.7)"
                  d="m687.14 591.56c0 124.25-100.84 225.08-225.08 225.08s-225.08-100.84-225.08-225.08 100.84-225.08 225.08-225.08 225.08 100.84 225.08 225.08z"
                  fill="url(#hmLogoB3)"
                  fillRule="evenodd"
                />
                <path
                  transform="translate(-236.97 -361.7)"
                  d="m462.05 366.48c-49.128 0-94.576 15.785-131.59 42.531-16.116 19.49-27.406 39-27.406 39l-20.562 7.875c-28.559 37.736-45.5 84.748-45.5 135.69 0 4.7581 0.14613 9.4712 0.4375 14.156 5.1158 9.1397 8.9375 14.969 8.9375 14.969l-2.625 25.688c14.701 58.68 52.455 108.24 103.06 138.5 3.6158 2.3383 6.6361 3.7538 9.9542 5.6308-1.7605-1.6631-2.3028-2.108-3.4542-3.162-13.247-13.702-24.406-29.719-24.406-29.719l32.031-29.469c3e-5 0 20.594 15.565 43.719 23.625s48.781 8.6249 48.781 8.6249l15.875 40.75s-14.028 7.1945-33.938 10.719c-3.5652 0.6311-7.333 1.1444-11.094 1.5625 12.288 2.0813 24.903 3.1875 37.781 3.1875 52.043 0 99.99-17.684 138.12-47.375 11.93-15.985 19.75-29.719 19.75-29.719l17.375-6.8125c30.833-38.223 49.436-86.719 49.812-139.53-6.1241-18.158-12.812-28.812-12.812-28.812s1.7072-16.582-0.69061-34.848c-0.37628-2.866 1.5495-1.846 3.8673-3.4022-0.68744-2.5948-3.185-10.306-4.445-13.988-4.9603-14.496-9.8394-21.412-13.044-27.824 6.2433 3.4876-0.02453-0.01889-0.03125-0.03125-38.13-70.163-112.49-117.81-197.91-117.81zm27.219 8.5625c18.704 0.25577 38.219 6.3125 38.219 6.3125s22.173 8.5206 38 20.562 25.312 27.594 25.312 27.594l-40.25 27.812c0-3e-5 -21.666-14.842-44.312-22.844s-46.281-9.1562-46.281-9.1562l-11.406-41.531s17.263-8.1103 37-8.7188c1.2336-0.03803 2.4718-0.04831 3.7188-0.03125zm-131.53 111.19c13.82 0.06347 25.312 1.7188 25.312 1.7188l20.812 88.438-66.812 63.625s-20.863-13.237-35.906-26.188-24.281-25.625-24.281-25.625 2.7158-25.654 8.8438-47.719 15.688-40.531 15.688-40.531 16.519-9.5067 36.938-12.5c6.3809-0.93543 13.124-1.2476 19.406-1.2188zm216.53 63.156s18.838 8.2533 34.031 20.406 26.75 28.219 26.75 28.219-1.0777 22.001-8.3438 44.875-20.719 46.625-20.719 46.625-18.778 6.8908-38.594 8.75-40.688-1.3125-40.688-1.3125l-10.344-43.281-10.656-44.5s14.142-17.052 31.281-32 37.281-27.781 37.281-27.781z"
                  fill="url(#hmLogoC3)"
                  fillRule="evenodd"
                />
                <path
                  transform="translate(-236.97 -361.7)"
                  d="m633.37 598.68s-1.0585 21.443-8.1364 43.725-20.175 45.403-20.175 45.403-18.297 6.7242-37.6 8.5353-39.612-1.291-39.612-1.291l-10.088-42.15-10.371-43.333s13.772-16.632 30.468-31.193 36.315-27.05 36.315-27.05 18.347 8.052 33.147 19.89 26.053 27.463 26.053 27.463z"
                  fill="none"
                  stroke="url(#hmLogoD3)"
                  strokeLinejoin="round"
                  strokeWidth="4.8705"
                />
                <path
                  transform="translate(-236.97 -361.7)"
                  d="m337.13 638.06s-20.337-12.906-35.001-25.53-23.655-24.968-23.655-24.968 2.6368-24.996 8.6103-46.505 15.284-39.53 15.284-39.53 16.098-9.255 36.003-12.173 43.615 0.50134 43.615 0.50134l20.279 86.211-65.135 61.995z"
                  fill="none"
                  stroke="url(#hmLogoE3)"
                  strokeLinejoin="round"
                  strokeWidth="4.874"
                />
                <path
                  transform="translate(-236.97 -361.7)"
                  d="m526.54 385.59s19.464 7.4963 33.366 18.073 22.24 24.235 22.24 24.235l-35.357 24.431s-19.031-13.054-38.923-20.082-47.713-9.7974-47.713-9.7974l-9.3194-36.843s19.395-6.769 36.731-7.3034 38.976 7.2868 38.976 7.2868z"
                  fill="none"
                  stroke="url(#hmLogoF3)"
                  strokeWidth="5.0158"
                />
                <path transform="translate(-236.97 -361.7)" d="m382.01 489.15s36.187-48.081 78.437-64.331" fill="none" stroke="#666" />
                <path transform="translate(-236.97 -361.7)" d="m552.78 456.1s26.985 42.926 23.485 91.926" fill="none" stroke="#ececec" strokeWidth="3" />
                <path transform="translate(-236.97 -361.7)" d="m550.37 456.61s27.576 44.376 24.076 93.376" fill="none" stroke="#666" />
                <path transform="translate(-236.97 -361.7)" d="m587.8 429.25s59.783 23.6 86.033 98.35" fill="none" stroke="#666" />
                <path transform="translate(-236.97 -361.7)" d="m635.42 597.89s21.044-1.6348 39.429-32.747" fill="none" stroke="#666" />
                <path transform="translate(-236.97 -361.7)" d="m620.39 739.32s2.9208-18.129-14.521-50.953" fill="none" stroke="#666" />
                <path transform="translate(-236.97 -361.7)" d="m453.67 760.93s32.35-8.5737 73.362-65.142" fill="none" stroke="#666" />
                <path transform="translate(-236.97 -361.7)" d="m336.82 639.22s-1.9446 50.381 23.158 89.979" fill="none" stroke="#666" />
                <path transform="translate(-236.97 -361.7)" d="m328.88 757.9s-7.4296 0.09235-35.545-16.858" fill="none" stroke="#666" />
                <path transform="translate(-236.97 -361.7)" d="m277.33 588.14s-20.149 8.4634-31.002 31.911" fill="none" stroke="#666" />
                <path transform="translate(-236.97 -361.7)" d="m302.7 448.25s-7.2316 27.912-0.94794 51.363" fill="none" stroke="#666" />
                <path transform="translate(-236.97 -361.7)" d="m326.92 412.6s60.054-50.895 121.22-28.268" fill="none" stroke="#666" />
                <path transform="translate(-236.97 -361.7)" d="m469.15 801.22s52.386 13.451 133.19-34.233" fill="none" stroke="#666" />
                <path
                  transform="translate(-236.97 -361.7)"
                  d="m382.2 485.55s30.091-41.441 74.341-61.316"
                  fill="none"
                  stroke="#f2f2f2"
                  strokeLinecap="square"
                  strokeWidth="3"
                />
                <path transform="translate(-236.97 -361.7)" d="m454.49 762.67s30.822-5.9461 71.835-62.515" fill="none" stroke="#fff" strokeWidth="3" />
                <path transform="translate(-236.97 -361.7)" d="m334.79 640.34s-1.9446 50.396 23.158 89.994" fill="none" stroke="#fff" strokeWidth="3" />
                <path transform="translate(-236.97 -361.7)" d="m404.35 576.56s26.34 6.1872 101.29 32.704" fill="none" stroke="#999" />
                <path transform="translate(-236.97 -361.7)" d="m404.35 575.28s26.34 6.1872 101.29 32.704" fill="none" stroke="#ececec" />
              </g>
            </g>
            <text x="150" y="236" textAnchor="middle" fontFamily="sans-serif" fontWeight="700" fontSize="68" fill="#C9A227">
              Hm
            </text>
            <circle cx="205" cy="196" r="15" fill="#C9A227" stroke="#152C26" strokeWidth="1.5" />
            <text x="205" y="201" textAnchor="middle" fontFamily="sans-serif" fontWeight="700" fontSize="16" fill="#152C26">
              A
            </text>
          </svg>
        </Link>

        <div className={styles.actions}>
          {/* На публичных страницах справа теперь только один элемент —
              иконка мяча (см. HeaderLoginDropdown.tsx), открывающая форму
              входа. "Как это работает" и "Подключить команду" убраны
              отсюда по запросу (см. чат) — подключить команду по-прежнему
              можно с самой главной страницы (WelcomeSection.tsx) или уже
              будучи залогиненным. */}
          {!isCabinet && <HeaderLoginDropdown />}
          {isCabinet && showUpdatesReminder && (
            <Link
              href="/dashboard/updates"
              className={styles.overviewBall}
              title="Данные не обновлялись больше недели — обновить?"
              aria-label="Данные не обновлялись больше недели — обновить?"
            >
              <svg viewBox="0 0 32 32" width="20" height="20" aria-hidden="true">
                <circle cx="16" cy="16" r="15" fill="none" stroke="currentColor" strokeWidth="1.6" />
                <polygon points="16,10 21.71,14.15 19.53,20.85 12.47,20.85 10.29,14.15" fill="currentColor" />
                <line x1="16" y1="10" x2="16" y2="3" stroke="currentColor" strokeWidth="1.4" />
                <line x1="21.71" y1="14.15" x2="28.36" y2="11.98" stroke="currentColor" strokeWidth="1.4" />
                <line x1="19.53" y1="20.85" x2="23.64" y2="26.52" stroke="currentColor" strokeWidth="1.4" />
                <line x1="12.47" y1="20.85" x2="8.36" y2="26.52" stroke="currentColor" strokeWidth="1.4" />
                <line x1="10.29" y1="14.15" x2="3.64" y2="11.98" stroke="currentColor" strokeWidth="1.4" />
              </svg>
            </Link>
          )}

          {/* ИСПРАВЛЕНО: это меню со списком вкладок личного кабинета
              (Обзор/Состав/Расстановка и т.д.) раньше рендерилось БЕЗ
              условия isCabinet — то есть показывалось даже на публичных
              страницах (главная, /faq, /contact и т.д.) до того, как
              пользователь вообще подключил команду или вошёл. Теперь оно
              появляется только внутри личного кабинета (isCabinet
              гарантированно означает "уже авторизован" — неавторизованных
              туда перенаправляет src/app/dashboard/layout.tsx). */}
          {isCabinet && (
            <div className={styles.menuWrap} ref={wrapRef}>
              <button
                type="button"
                className={styles.menuBallButton}
                title="Меню личного кабинета"
                aria-label="Меню личного кабинета"
                aria-haspopup="true"
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
              >
                {/* Реалистичный SVG-мяч (Pixabay License — свободно для
                    коммерческого использования, изменения и встраивания без
                    указания авторства). Из исходника оставлены только два
                    основных заполненных контура (серая тень-подложка и
                    основное тело мяча с вырезанными пятиугольниками через
                    fill-rule="evenodd") — остальные ~17 декоративных
                    штрихов-росчерков убраны по просьбе пользователя: на
                    маленьком размере они всё равно неразличимы и только
                    "замыливали" иконку. Кнопка намеренно без рамки/фона
                    (.menuBallButton, не .overviewBall) — просьба пользователя
                    оставить только сам мяч. */}
                <svg viewBox="0 0 450 483" width="45" height="45" aria-hidden="true">
                  <defs>
                    <radialGradient id="hmBallBody" cx="478.61" cy="550.29" r="225.06" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#fff" offset="0" />
                      <stop stopColor="#fff" offset=".4702" />
                      <stop stopColor="#d6d6d6" offset="1" />
                    </radialGradient>
                    <radialGradient id="hmBallShadow" cx="477.49" cy="544.3" r="206.09" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#6a6a6a" offset="0" />
                      <stop offset="1" />
                    </radialGradient>
                  </defs>
                  <path
                    transform="translate(-236.97 -361.7)"
                    d="m687.14 591.56c0 124.25-100.84 225.08-225.08 225.08s-225.08-100.84-225.08-225.08 100.84-225.08 225.08-225.08 225.08 100.84 225.08 225.08z"
                    fill="url(#hmBallShadow)"
                    fillRule="evenodd"
                  />
                  <path
                    transform="translate(-236.97 -361.7)"
                    d="m462.05 366.48c-49.128 0-94.576 15.785-131.59 42.531-16.116 19.49-27.406 39-27.406 39l-20.562 7.875c-28.559 37.736-45.5 84.748-45.5 135.69 0 4.7581 0.14613 9.4712 0.4375 14.156 5.1158 9.1397 8.9375 14.969 8.9375 14.969l-2.625 25.688c14.701 58.68 52.455 108.24 103.06 138.5 3.6158 2.3383 6.6361 3.7538 9.9542 5.6308-1.7605-1.6631-2.3028-2.108-3.4542-3.162-13.247-13.702-24.406-29.719-24.406-29.719l32.031-29.469c3e-5 0 20.594 15.565 43.719 23.625s48.781 8.6249 48.781 8.6249l15.875 40.75s-14.028 7.1945-33.938 10.719c-3.5652 0.6311-7.333 1.1444-11.094 1.5625 12.288 2.0813 24.903 3.1875 37.781 3.1875 52.043 0 99.99-17.684 138.12-47.375 11.93-15.985 19.75-29.719 19.75-29.719l17.375-6.8125c30.833-38.223 49.436-86.719 49.812-139.53-6.1241-18.158-12.812-28.812-12.812-28.812s1.7072-16.582-0.69061-34.848c-0.37628-2.866 1.5495-1.846 3.8673-3.4022-0.68744-2.5948-3.185-10.306-4.445-13.988-4.9603-14.496-9.8394-21.412-13.044-27.824 6.2433 3.4876-0.02453-0.01889-0.03125-0.03125-38.13-70.163-112.49-117.81-197.91-117.81zm27.219 8.5625c18.704 0.25577 38.219 6.3125 38.219 6.3125s22.173 8.5206 38 20.562 25.312 27.594 25.312 27.594l-40.25 27.812c0-3e-5 -21.666-14.842-44.312-22.844s-46.281-9.1562-46.281-9.1562l-11.406-41.531s17.263-8.1103 37-8.7188c1.2336-0.03803 2.4718-0.04831 3.7188-0.03125zm-131.53 111.19c13.82 0.06347 25.312 1.7188 25.312 1.7188l20.812 88.438-66.812 63.625s-20.863-13.237-35.906-26.188-24.281-25.625-24.281-25.625 2.7158-25.654 8.8438-47.719 15.688-40.531 15.688-40.531 16.519-9.5067 36.938-12.5c6.3809-0.93543 13.124-1.2476 19.406-1.2188zm216.53 63.156s18.838 8.2533 34.031 20.406 26.75 28.219 26.75 28.219-1.0777 22.001-8.3438 44.875-20.719 46.625-20.719 46.625-18.778 6.8908-38.594 8.75-40.688-1.3125-40.688-1.3125l-10.344-43.281-10.656-44.5s14.142-17.052 31.281-32 37.281-27.781 37.281-27.781z"
                    fill="url(#hmBallBody)"
                    fillRule="evenodd"
                  />
                </svg>
              </button>

              {open && (
                <div className={styles.dropdown} role="menu">
                  {visibleCabinetTabs.map((tab) => {
                    const isActive = tab.href === pathname;
                    return (
                      <Link
                        key={tab.href}
                        href={tab.href}
                        role="menuitem"
                        className={`${styles.dropdownItem} ${isActive ? styles.dropdownItemActive : ""}`}
                        onClick={() => setOpen(false)}
                      >
                        <span className={styles.dropdownDot} style={{ opacity: isActive ? 1 : 0 }} />
                        {tab.label}
                      </Link>
                    );
                  })}
                  <a href="/api/auth/logout" role="menuitem" className={styles.dropdownItem}>
                    <span className={styles.dropdownDot} style={{ opacity: 0 }} />
                    Выйти
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
