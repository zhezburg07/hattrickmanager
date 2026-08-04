"use client";

// Кнопка "Подключить команду" для анонимного посетителя (см. WelcomeSection.tsx)
// — вместо прямой ссылки на /api/auth/request-token просто открывает вкладку
// регистрации в HomeSidebar.tsx (тот слушает это же событие). Отдельный
// маленький клиентский компонент, а не вся WelcomeSection целиком, потому что
// WelcomeSection остаётся серверным компонентом (ей нужно читать cookie
// сессии через getStoredAccountId()).
export default function OpenAuthButton({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  function handleClick() {
    window.dispatchEvent(new Event("hm:open-register"));
  }

  return (
    <button type="button" className={className} onClick={handleClick}>
      {children}
    </button>
  );
}
