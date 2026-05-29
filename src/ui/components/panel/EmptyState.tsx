import styles from "./EmptyState.module.css";

/** Muted placeholder copy shown in a panel that has no data yet. */
export function EmptyState({ message }: { message: string }) {
  return <p className={styles.empty}>{message}</p>;
}
