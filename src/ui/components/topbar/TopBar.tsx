import { strings } from "@ui/i18n";
import styles from "./TopBar.module.css";

/**
 * Operations-console status bar: brand on the left, the operator's vital
 * readouts on the right. Values are placeholders until the engine and store
 * land (PR #2+); the layout is the contract those numbers will fill.
 */
export function TopBar() {
  const t = strings.topbar;
  const readouts = [
    { label: t.week, value: t.empty },
    { label: t.quarter, value: t.empty },
    { label: t.actionPoints, value: t.empty },
    { label: t.cash, value: t.empty },
    { label: t.runway, value: t.empty },
    { label: t.exposure, value: t.empty },
    { label: t.reputation, value: t.empty },
  ];

  return (
    <header className={styles.topbar}>
      <div className={styles.brand}>
        <span className={styles.mark} aria-hidden="true" />
        <span className={styles.name}>{strings.app.name}</span>
        <span className={styles.tagline}>{strings.app.tagline}</span>
      </div>
      <dl className={styles.readouts}>
        {readouts.map((readout) => (
          <div key={readout.label} className={styles.readout}>
            <dt className={styles.readoutLabel}>{readout.label}</dt>
            <dd className={styles.readoutValue}>{readout.value}</dd>
          </div>
        ))}
      </dl>
    </header>
  );
}
