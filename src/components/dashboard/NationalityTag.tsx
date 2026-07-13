import type { Country } from "@/data/squad";
import FlagIcon from "./FlagIcon";
import styles from "./SquadTable.module.css";

export default function NationalityTag({ nationality }: { nationality: Country }) {
  return (
    <span className={styles.nationalityTag} title={nationality.name}>
      <FlagIcon country={nationality} /> {nationality.name}
    </span>
  );
}
