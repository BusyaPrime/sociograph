import { strings } from "@ui/i18n";
import styles from "./BoardPlaceholder.module.css";

/**
 * Placeholder for the sociogram board (built in PR #4). The concentric rings
 * stand in for the four influence zones — white (outer) through red (inner) —
 * with the operator's core at the center.
 */
export function BoardPlaceholder() {
  const t = strings.board;
  return (
    <section className={styles.board} aria-label={t.title}>
      <div className={styles.rings} aria-hidden="true">
        <span className={styles.ringWhite} />
        <span className={styles.ringBlue} />
        <span className={styles.ringYellow} />
        <span className={styles.ringRed} />
        <span className={styles.core} />
      </div>
      <h1 className={styles.title}>{t.title}</h1>
      <p className={styles.hint}>{t.hint}</p>
    </section>
  );
}
