// Сердце вместо цифры преданности — воспитанник родного клуба (см.
// src/data/squad.ts, isClubProduct). Обычная SVG вместо эмодзи-символа — та
// же причина, что и у иконки тренера (не все эмодзи рисуются как картинка
// на Windows). Общий компонент для "Состава" (SquadTable) и "Расстановки"
// (LineupPlayerList).
export default function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      <path
        d="M12 20.5 4.6 13c-2.2-2.2-2.2-5.6 0-7.7 2.1-2 5.3-1.8 7.2.4l.2.2.2-.2c1.9-2.2 5.1-2.4 7.2-.4 2.2 2.1 2.2 5.5 0 7.7L12 20.5Z"
        fill="var(--color-accent)"
      />
    </svg>
  );
}
