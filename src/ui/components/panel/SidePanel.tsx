import type { ReactNode } from "react";
import styles from "./SidePanel.module.css";

interface SidePanelProps {
  title: string;
  children: ReactNode;
}

/** A titled console panel: an uppercase header label over a scrollable body. */
export function SidePanel({ title, children }: SidePanelProps) {
  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <h2 className={styles.title}>{title}</h2>
      </header>
      <div className={styles.body}>{children}</div>
    </section>
  );
}
