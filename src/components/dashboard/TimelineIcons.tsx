// Переиспользуемые SVG-иконки для горизонтального таймлайна матча (см.
// MatchDetailAnalysis.tsx) — вместо эмодзи ⚽/🔄, цвет задаётся через CSS
// (currentColor/var), а не встроен в растровый эмодзи-глиф.

export function GoalBallIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" stroke="var(--goal-icon-color, var(--color-good))" strokeWidth="1.6" />
      <path
        d="M12 6.2 L15.6 8.8 L14.3 13 L9.7 13 L8.4 8.8 Z"
        stroke="var(--goal-icon-color, var(--color-good))"
        strokeWidth="1.2"
        strokeLinejoin="round"
        fill="var(--goal-icon-color, var(--color-good))"
        fillOpacity="0.25"
      />
      <path
        d="M12 6.2 V3.3 M15.6 8.8 L18.4 7 M14.3 13 L16.2 16.3 M9.7 13 L7.8 16.3 M8.4 8.8 L5.6 7"
        stroke="var(--goal-icon-color, var(--color-good))"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SubstitutionIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* Зелёная стрелка — выход на замену */}
      <path
        d="M7.5 20 V9.5 M7.5 9.5 L4 13.5 M7.5 9.5 L11 13.5"
        stroke="var(--sub-in-color, var(--color-good))"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Красная стрелка — уход с поля */}
      <path
        d="M16.5 4 V14.5 M16.5 14.5 L13 10.5 M16.5 14.5 L20 10.5"
        stroke="var(--sub-out-color, var(--color-bad))"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
