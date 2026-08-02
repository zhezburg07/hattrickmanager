// Иконки для форм входа/регистрации (см. HomeSidebar.tsx) — вместо эмодзи
// 👁️, цвет задаётся через currentColor, тот же стиль однотонных
// нарисованных SVG, что и в src/components/StatusIcons.tsx /
// src/components/dashboard/TimelineIcons.tsx.

export function EyeIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2 12 C5 6.5, 9.5 4, 12 4 C14.5 4, 19 6.5, 22 12 C19 17.5, 14.5 20, 12 20 C9.5 20, 5 17.5, 2 12 Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </svg>
  );
}

export function EyeOffIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2 12 C5 6.5, 9.5 4, 12 4 C14.5 4, 19 6.5, 22 12 C19 17.5, 14.5 20, 12 20 C9.5 20, 5 17.5, 2 12 Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
      <path d="M4 4 L20 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
