import { Link } from 'react-router'
import { INCIDENTS } from '../data/incidents'
import { NetlabNav } from './NetlabNav'
import { useIncidentList } from './useNetlab'
import styles from './netlab.module.css'

const CATEGORY_LABELS: Record<string, string> = {
  physical: 'Physical and link',
  switching: 'Switching and VLANs',
  addressing: 'Addressing and DHCP',
  wireless: 'Wireless',
  services: 'Services',
  routing: 'Routing',
  wan: 'Circuit and WAN',
}

/**
 * The incident queue.
 *
 * Each row names the symptom rather than the fix, so the learner reads a report
 * the way the desk receives one. The best score is the lab's own record of the
 * attempts made in this browser; nothing is compared with anyone else.
 */
export function NetlabIncidentsPage() {
  const { best, error, loading } = useIncidentList()

  return (
    <div className={styles.page}>
      <header>
        <p className={styles.count}>
          {INCIDENTS.length} incidents · verified against the estate
        </p>
        <h1>Incidents</h1>
        <p className={styles.lead}>
          A school network, one fault at a time. Open an incident, read the equipment
          before you change it, and let the attempt show whether the layer was isolated
          or the fix was a guess.
        </p>
      </header>

      <NetlabNav />

      {error ? (
        <p className={styles.empty} role="alert">
          {error}
        </p>
      ) : null}

      <ul className={styles.incidentList}>
        {INCIDENTS.map((incident) => {
          const record = best[incident.id]
          return (
            <li key={incident.id} className={styles.incidentRow}>
              <span className={styles.incidentBody}>
                <Link className={styles.incidentTitle} to={`/networking/incidents/${incident.id}`}>
                  {incident.title}
                </Link>
                <span className={styles.incidentSymptom}>{incident.symptom}</span>
              </span>
              <span className={styles.incidentMeta}>
                <span className={styles.badge} data-tone="quiet">
                  {CATEGORY_LABELS[incident.category] ?? incident.category}
                </span>
                <span className={styles.badge} data-tone="quiet">
                  difficulty {incident.difficulty}
                </span>
                {record ? (
                  <span
                    className={styles.badge}
                    data-tone={record.bestScore >= 75 ? 'low' : 'high'}
                  >
                    best {record.bestScore} · {record.attempts} attempt
                    {record.attempts === 1 ? '' : 's'}
                  </span>
                ) : (
                  <span className={styles.badge} data-tone="quiet">
                    {loading ? 'loading…' : 'not attempted'}
                  </span>
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
