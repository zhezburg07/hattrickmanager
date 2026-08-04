"use client";

// Кнопка "Подключить команду" для анонимного посетителя (см. WelcomeSection.tsx
// на главной и HeaderClient.tsx в шапке на остальных публичных страницах) —
// вместо прямой ссылки на /api/auth/request-token открывает вкладку
// регистрации в HomeSidebar.tsx. На самой главной странице HomeSidebar уже
// смонтирован — хватает кастомного DOM-события. С любой ДРУГОЙ публичной
// страницы (FAQ, Контакты и т.д.) HomeSidebar ещё не существует в DOM, так
// что событие слушать некому — вместо этого переходим на
// "/?connectAuthRequired=1" (тот же параметр, что уже понимает HomeSidebar.tsx
// после редиректа из /api/auth/request-token для анонимных).
export default function OpenAuthButton({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  function handleClick() {
    if (window.location.pathname === "/") {
      window.dispatchEvent(new Event("hm:open-register"));
    } else {
      window.location.href = "/?connectAuthRequired=1";
    }
  }

  return (
    <button type="button" className={className} onClick={handleClick}>
      {children}
    </button>
  );
}
