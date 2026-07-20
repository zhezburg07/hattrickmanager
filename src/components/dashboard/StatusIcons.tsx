import type { PlayerSpecialty } from "@/data/squad";

// Небольшие нейтральные SVG-иконки вместо эмодзи-символов — та же причина,
// что и у иконок тренера/сердца/большого пальца: не все эмодзи одинаково
// рисуются как картинка на Windows, а тонкие однотонные иконки лучше
// сочетаются друг с другом в компактном ряду, чем разноцветные emoji разных
// размеров. Смысл символов сохранён по просьбе (молния — быстрый, гантели —
// мощный и т.д.), просто нарисован в общем минималистичном стиле.

function IconBase({
  children,
  size = 14,
  title,
}: {
  children: React.ReactNode;
  size?: number;
  title: string;
}) {
  return (
    <span title={title} aria-label={title} style={{ display: "inline-flex", flex: "none" }}>
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
        {children}
      </svg>
    </span>
  );
}

// Техничный — шестерёнка (по запросу, вместо гаечного ключа)
function TechnicalGlyph() {
  const teeth = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <>
      {teeth.map((angle) => (
        <rect
          key={angle}
          x="10.8"
          y="1.5"
          width="2.4"
          height="3.2"
          rx="0.6"
          fill="var(--color-accent)"
          transform={`rotate(${angle} 12 12)`}
        />
      ))}
      <circle cx="12" cy="12" r="6" fill="none" stroke="var(--color-accent)" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="2" fill="var(--color-accent)" />
    </>
  );
}

// Быстрый — молния
function QuickGlyph() {
  return <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" fill="var(--color-accent)" />;
}

// Мощный — гантели
function PowerfulGlyph() {
  return (
    <>
      <circle cx="5" cy="12" r="3" fill="var(--color-accent)" />
      <circle cx="19" cy="12" r="3" fill="var(--color-accent)" />
      <rect x="7.5" y="10.5" width="9" height="3" fill="var(--color-accent)" />
    </>
  );
}

// Непредсказуемый — клевер
function UnpredictableGlyph() {
  return (
    <>
      <circle cx="9" cy="9" r="4" fill="var(--color-accent)" />
      <circle cx="15" cy="9" r="4" fill="var(--color-accent)" />
      <circle cx="9" cy="15" r="4" fill="var(--color-accent)" />
      <circle cx="15" cy="15" r="4" fill="var(--color-accent)" />
      <line x1="12" y1="15" x2="12" y2="21" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" />
    </>
  );
}

// Игра головой — мишень
function HeadGlyph() {
  return (
    <>
      <circle cx="12" cy="12" r="9" fill="none" stroke="var(--color-accent)" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="5" fill="none" stroke="var(--color-accent)" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="1.6" fill="var(--color-accent)" />
    </>
  );
}

// Крепкое здоровье — щит
function ResilientGlyph() {
  return (
    <path
      d="M12 3 19 6v6c0 5-3.5 8.5-7 9-3.5-.5-7-4-7-9V6l7-3Z"
      fill="none"
      stroke="var(--color-accent)"
      strokeWidth="1.7"
      strokeLinejoin="round"
    />
  );
}

// Командный игрок — сердце (зелёное, отличается от золотого сердца
// "воспитанника родного клуба" в столбце Преданность)
function SupportGlyph() {
  return (
    <path
      d="M12 20.5 4.6 13c-2.2-2.2-2.2-5.6 0-7.7 2.1-2 5.3-1.8 7.2.4l.2.2.2-.2c1.9-2.2 5.1-2.4 7.2-.4 2.2 2.1 2.2 5.5 0 7.7L12 20.5Z"
      fill="var(--color-good)"
    />
  );
}

const specialtyGlyph: Record<PlayerSpecialty, () => React.JSX.Element> = {
  technical: TechnicalGlyph,
  quick: QuickGlyph,
  powerful: PowerfulGlyph,
  unpredictable: UnpredictableGlyph,
  head: HeadGlyph,
  resilient: ResilientGlyph,
  support: SupportGlyph,
};

export function SpecialtyIcon({ specialty, label }: { specialty: PlayerSpecialty; label: string }) {
  const Glyph = specialtyGlyph[specialty];
  return (
    <IconBase title={label}>
      <Glyph />
    </IconBase>
  );
}

// Травма — 3 ступени по сроку восстановления (InjuryLevel из players.xml,
// см. src/lib/squadPlayers.ts): 0 недель — лёгкая, 1 неделя — среднее
// восстановление, 2+ недель — серьёзная.
//
// НАЙДЕННЫЙ баг предыдущей версии: лёгкая/средняя ступени рисовались emoji
// ("🩹"/"➕") с цветом через CSS style — но это не работает: оба символа
// рисуются шрифтом как многоцветные глиф-картинки (тот же принцип, что и у
// цветных эмодзи вроде 👍/❤, см. комментарий в начале файла), и CSS-свойство
// color на такую картинку не влияет вообще — цвет целиком определяет шрифт
// конкретного устройства/браузера (жалоба: "➕" выходил фиолетовым на одном
// устройстве). Единственный способ гарантировать ОДИНАКОВЫЙ цвет везде —
// нарисовать эти две ступени как обычные SVG-фигуры с явным fill/stroke, а
// не эмодзи-текстом. Серьёзная ступень (🚑) оставлена emoji по запросу — она
// заведомо многоцветная (машина скорой помощи), фиксировать один цвет там
// не имеет смысла.
const LIGHT_INJURY_COLOR = "#F5A623";
const MEDIUM_INJURY_COLOR = "#E53E3E";

// Лёгкая травма — пластырь, наклонённый на 45°, с перфорацией из 4 точек
// (узнаваемый силуэт бытового пластыря).
function PlasterGlyph() {
  return (
    <g transform="rotate(-45 12 12)">
      <rect x="2" y="8" width="20" height="8" rx="4" fill="none" stroke={LIGHT_INJURY_COLOR} strokeWidth="1.8" />
      <circle cx="10" cy="10.5" r="0.7" fill={LIGHT_INJURY_COLOR} />
      <circle cx="14" cy="10.5" r="0.7" fill={LIGHT_INJURY_COLOR} />
      <circle cx="10" cy="13.5" r="0.7" fill={LIGHT_INJURY_COLOR} />
      <circle cx="14" cy="13.5" r="0.7" fill={LIGHT_INJURY_COLOR} />
    </g>
  );
}

// Средняя травма (~1 неделя) — простой медицинский крест/плюс.
function CrossGlyph() {
  return (
    <>
      <line x1="12" y1="5" x2="12" y2="19" stroke={MEDIUM_INJURY_COLOR} strokeWidth="3" strokeLinecap="round" />
      <line x1="5" y1="12" x2="19" y2="12" stroke={MEDIUM_INJURY_COLOR} strokeWidth="3" strokeLinecap="round" />
    </>
  );
}

export function InjuryIcon({ weeksRemaining }: { weeksRemaining: number }) {
  if (weeksRemaining >= 2) {
    const title = `Травма, осталось недель: ${weeksRemaining}`;
    return (
      <span title={title} aria-label={title} style={{ display: "inline-flex", flex: "none", fontSize: 13, lineHeight: 1 }}>
        🚑
      </span>
    );
  }
  if (weeksRemaining === 1) {
    return (
      <IconBase title="Травма, осталось около недели">
        <CrossGlyph />
      </IconBase>
    );
  }
  return (
    <IconBase title="Лёгкая травма — матчей не пропускает">
      <PlasterGlyph />
    </IconBase>
  );
}

// Карточки — жёлтая с числом предупреждений в этом сезоне, красная — при
// дисквалификации (числа рядом не нужно, она значит "не сыграет").
export function CardIcon({ color, count }: { color: "yellow" | "red"; count?: number }) {
  const fill = color === "yellow" ? "var(--color-warn)" : "var(--color-bad)";
  const title = color === "yellow" ? `Жёлтых карточек в сезоне: ${count ?? 0}` : "Дисквалификация";
  return (
    <span title={title} style={{ display: "inline-flex", alignItems: "center", gap: 2, flex: "none" }}>
      <svg viewBox="0 0 24 24" width="12" height="14" aria-hidden="true">
        <rect x="4" y="2" width="16" height="20" rx="2.5" fill={fill} />
      </svg>
      {color === "yellow" && count !== undefined && (
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text)" }}>{count}</span>
      )}
    </span>
  );
}
