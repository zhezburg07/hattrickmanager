"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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

export default function Header() {
  const pathname = usePathname();
  const isCabinet = pathname?.startsWith("/dashboard") ?? false;
  const [open, setOpen] = useState(false);
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

  return (
    <header className={styles.header}>
      <div className={`container ${styles.inner}`}>
        <Link href="/" className={styles.logo}>
          <span className={styles.logoMark}>H</span>
          <span className={styles.logoText}>
            Hattrick<strong>Manager</strong>
          </span>
        </Link>

        <div className={styles.actions}>
          <Link href="/how-it-works" className={styles.howItWorksLink}>
            Как это работает
          </Link>
          {!isCabinet && (
            <a href="/api/auth/request-token" className={`btnPrimary ${styles.headerCta}`}>
              Подключить команду
            </a>
          )}
          {isCabinet && (
            <Link
              href="/dashboard/updates"
              className={styles.overviewBall}
              title="Обновления"
              aria-label="Обновления"
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

          <div className={styles.menuWrap} ref={wrapRef}>
            <button
              type="button"
              className={styles.overviewBall}
              title="Меню личного кабинета"
              aria-label="Меню личного кабинета"
              aria-haspopup="true"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              <svg viewBox="0 0 32 32" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="6" y1="10" x2="26" y2="10" />
                <line x1="6" y1="16" x2="26" y2="16" />
                <line x1="6" y1="22" x2="26" y2="22" />
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
        </div>
      </div>
    </header>
  );
}
