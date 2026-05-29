import { TopBar } from "@ui/components/topbar/TopBar";
import { BoardPlaceholder } from "@ui/components/board/BoardPlaceholder";
import { SidePanel } from "@ui/components/panel/SidePanel";
import { EmptyState } from "@ui/components/panel/EmptyState";
import { strings } from "@ui/i18n";
import styles from "./App.module.css";

/**
 * Application shell: a fixed status bar over a three-column workspace —
 * dossier (left), sociogram board (center), company + event log (right).
 * Every region is a placeholder; real content arrives in later milestones.
 */
function App() {
  return (
    <div className={styles.app}>
      <TopBar />
      <main className={styles.main}>
        <div className={styles.left}>
          <SidePanel title={strings.dossier.title}>
            <EmptyState message={strings.dossier.empty} />
          </SidePanel>
        </div>
        <div className={styles.center}>
          <BoardPlaceholder />
        </div>
        <div className={styles.right}>
          <SidePanel title={strings.company.title}>
            <EmptyState message={strings.company.empty} />
          </SidePanel>
          <SidePanel title={strings.log.title}>
            <EmptyState message={strings.log.empty} />
          </SidePanel>
        </div>
      </main>
    </div>
  );
}

export default App;
