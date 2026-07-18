import type { SupporterTeamEntry } from "@/lib/supporters";
import styles from "./Overview.module.css";

function TeamList({ teams }: { teams: SupporterTeamEntry[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {teams.map((t) => (
        <div key={t.teamId} style={{ fontSize: 12.5 }}>
          <b>{t.teamName}</b>
          {t.leagueName ? <span style={{ color: "var(--color-text-muted)" }}> · {t.leagueName}</span> : null}
          {t.lastMatchScore && (
            <div style={{ color: "var(--color-text-muted)", fontSize: 11.5 }}>Последний матч: {t.lastMatchScore}</div>
          )}
        </div>
      ))}
    </div>
  );
}

// Реальные данные поддержки команд (supporters.xml) — кого поддерживает
// наша команда и кто поддерживает нас. Обе стороны запрашиваются и
// показываются независимо: если одна из сторон не подключилась, другая
// всё равно отображается.
export default function SupportersSection({
  weSupport,
  weSupportError,
  ourSupporters,
  ourSupportersError,
}: {
  weSupport: SupporterTeamEntry[] | null;
  weSupportError: string | null;
  ourSupporters: SupporterTeamEntry[] | null;
  ourSupportersError: string | null;
}) {
  return (
    <div className={styles.panel}>
      <div className={styles.panelHeadRow}>
        <div className={styles.panelTitle} style={{ margin: 0 }}>
          Поддержка команд
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div>
          <div className={styles.panelHint} style={{ marginBottom: 8 }}>
            Кого поддерживаем мы
          </div>
          {weSupportError ? (
            <p className={styles.highlightNote}>{weSupportError}</p>
          ) : weSupport && weSupport.length > 0 ? (
            <TeamList teams={weSupport} />
          ) : (
            <p className={styles.highlightNote}>Мы пока никого не поддерживаем.</p>
          )}
        </div>
        <div>
          <div className={styles.panelHint} style={{ marginBottom: 8 }}>
            Кто поддерживает нас
          </div>
          {ourSupportersError ? (
            <p className={styles.highlightNote}>{ourSupportersError}</p>
          ) : ourSupporters && ourSupporters.length > 0 ? (
            <TeamList teams={ourSupporters} />
          ) : (
            <p className={styles.highlightNote}>Нашу команду пока никто не поддерживает.</p>
          )}
        </div>
      </div>
    </div>
  );
}
