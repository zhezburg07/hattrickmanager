import type { Country } from "@/data/squad";
import FlagIcon from "./FlagIcon";
import styles from "./SquadTable.module.css";

// showLabel=false — только флаг, без текстового названия страны рядом (см.
// чат "Юношеская команда: флаг без текстовой подписи") — название всё
// равно остаётся доступно через title (наведение), просто не занимает
// место в самой строке. По умолчанию true — остальные места (Состав,
// Расстановка и т.д.) продолжают показывать флаг с подписью, как раньше.
export default function NationalityTag({
  nationality,
  showLabel = true,
}: {
  nationality: Country;
  showLabel?: boolean;
}) {
  return (
    <span className={styles.nationalityTag} title={nationality.name}>
      <FlagIcon country={nationality} />
      {showLabel && ` ${nationality.name}`}
    </span>
  );
}
