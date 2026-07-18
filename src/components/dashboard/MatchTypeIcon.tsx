import type { Competition } from "@/data/matches";

// Небольшие нейтральные значки типа матча слева от строки — свои SVG, не
// эмодзи (на Windows эмодзи рендерятся не всегда одинаково, и вперемешку с
// остальными золотыми/приглушёнными line-art иконками сайта выглядели бы
// чужеродно). Кубок — заметный акцентный цвет (важные матчи), лига и
// товарищеские — приглушённые, вторичные по значимости.
function CupIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        d="M7 4h10v3.5c0 3-2.2 5.2-5 5.5v2h2.5v2h-7v-2H10v-2c-2.8-.3-5-2.5-5-5.5V4h2Z"
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M7 5.5H4.5v1.5a3 3 0 0 0 2.7 3"
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M17 5.5h2.5v1.5a3 3 0 0 1-2.7 3"
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LeagueIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        d="M12 3 4.5 6.5v5c0 5 3.2 8 7.5 9.5 4.3-1.5 7.5-4.5 7.5-9.5v-5L12 3Z"
        fill="none"
        stroke="var(--color-text-muted)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FriendlyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        d="M2.5 12h3.2l2-2 2.6 2.6 2.6-4.6 2 4h6.6"
        fill="none"
        stroke="var(--color-text-muted)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="9" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5" />
    </svg>
  );
}

export default function MatchTypeIcon({ competition }: { competition: Competition }) {
  if (competition === "Кубок") return <CupIcon />;
  if (competition === "Товарищеский") return <FriendlyIcon />;
  return <LeagueIcon />;
}
