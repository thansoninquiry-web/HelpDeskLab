import type { Reachability, TopologyCheck, TopologyView } from '../../app/practiceService'
import styles from './TopologyMap.module.css'

interface TopologyMapProps {
  topology: TopologyView
  /**
   * Present only where the map can run a check of its own: the live Server Room
   * pane. The debrief draws the map as it closed, so it passes neither and the
   * rows arrive read-only.
   */
  busy?: boolean
  onRun?: (entryId: string, actionId: string) => Promise<unknown>
}

const STATE_MARKS: Record<Reachability, string> = {
  proved: '●',
  failed: '✕',
  unknown: '○',
}

const STATE_LABELS: Record<Reachability, string> = {
  proved: 'Proved',
  failed: 'Failed',
  unknown: 'Not checked',
}

function checkSummary(check: TopologyCheck): string {
  if (check.state === 'unknown') {
    return `Not checked yet — run ${check.command}`
  }
  return `${STATE_LABELS[check.state]} — ${check.evidence ?? check.command}`
}

/**
 * The Server Room map.
 *
 * Every link starts dark and lights up only when a recorded check proved it, so
 * the picture can never claim reachability the attempt has not established. In
 * the pane, each row can run its own check through the same audited command
 * pipeline the terminal uses; in the debrief the same map is read alone, with
 * every state and the line that settled it.
 */
export function TopologyMap({ topology, busy = false, onRun }: TopologyMapProps) {
  const unchecked = topology.total - topology.proved - topology.failed
  const originState = topology.groups.find((group) => group.kind === 'origin')?.checks[0]?.state

  return (
    <section className={styles.map} aria-label="Network topology">
      <div className={styles.origin}>
        <span className={styles.originMark} data-state={originState ?? 'unknown'}>
          ◇
        </span>
        <span className={styles.originText}>
          <span className={styles.originName}>{topology.originHostname}</span>
          <span className={styles.originMeta}>
            {topology.originSiteName ? `${topology.originSiteName} · ` : ''}
            {topology.proved} of {topology.total} links proved
            {topology.failed > 0 ? ` · ${topology.failed} failed` : ''}
            {unchecked > 0 ? ` · ${unchecked} unchecked` : ''}
          </span>
        </span>
      </div>

      <div className={styles.groups}>
        {topology.groups.map((group) => (
          <section key={group.id} className={styles.group} data-kind={group.kind}>
            <header className={styles.groupHeader}>
              <h3 className={styles.groupTitle}>{group.title}</h3>
              <span className={styles.groupMeta}>{group.subtitle}</span>
            </header>
            <ul className={styles.checkList}>
              {group.checks.map((check) => (
                <li key={check.id} className={styles.check} data-state={check.state}>
                  <span className={styles.checkMark} aria-hidden="true">
                    {STATE_MARKS[check.state]}
                  </span>
                  <span className={styles.checkBody}>
                    <span className={styles.checkLabel}>{check.label}</span>
                    <span className={styles.checkState} data-state={check.state}>
                      {checkSummary(check)}
                    </span>
                  </span>
                  {onRun ? (
                    <button
                      type="button"
                      className={styles.checkRun}
                      aria-label={`Run check: ${check.command}`}
                      disabled={busy}
                      onClick={() => void onRun(check.entryId, check.actionId)}
                    >
                      Run check
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  )
}
