import { Link } from 'react-router'
import { CASES } from '../data/cases'
import type { CaseCategory, DesktopCase } from '../types'
import { DesktopNav } from './DesktopNav'
import { useCaseList } from './useDesktop'
import styles from './desktop.module.css'

const GROUPS: readonly { category: CaseCategory; label: string; note: string }[] = [
  {
    category: 'hardware',
    label: 'Hardware bench',
    note: 'No POST, beeps, memory, drives, heat, power and the parts on a laptop.',
  },
  {
    category: 'windows',
    label: 'Windows 10 and 11',
    note: 'Sign-in, drivers, startup, disks — with the tools a desk actually opens.',
  },
  {
    category: 'legacy',
    label: 'Legacy mode',
    note: 'Windows 7 and XP-era quirks: missing drivers, compatibility, and machines out of support.',
  },
  {
    category: 'application',
    label: 'Application support',
    note: 'Outlook, Office and the print queue.',
  },
  {
    category: 'quickbooks',
    label: 'QuickBooks',
    note: 'The company file, multi-user hosting, licensing and the backup.',
  },
]

function badge(entry: DesktopCase): string {
  return entry.platform === 'laptop' ? 'Laptop' : 'Desktop'
}

/**
 * The bench queue.
 *
 * Each row names the symptom and the Windows the machine runs, so the learner
 * reads a report the way the desk receives one. The best score is this browser's
 * own record; nothing is compared with anyone else.
 */
export function DesktopCasesPage() {
  const { best, error, loading } = useCaseList()

  return (
    <div className={styles.page}>
      <header>
        <p className={styles.count}>
          {CASES.length} cases · {GROUPS.length} benches · verified against the machine
        </p>
        <h1>Desktop support and PC repair</h1>
        <p className={styles.lead}>
          A bench, a machine and the software on it. Work a case the way the desk does: read the
          evidence, back up the data, make one change, and write down what happened.
        </p>
      </header>

      <DesktopNav />

      {error ? (
        <p className={styles.empty} role="alert">
          {error}
        </p>
      ) : null}

      {GROUPS.map((group) => {
        const entries = CASES.filter((entry) => entry.category === group.category)
        return (
          <section key={group.category} className={styles.section} aria-labelledby={`group-${group.category}`}>
            <div className={styles.sectionHeading}>
              <h2 id={`group-${group.category}`}>{group.label}</h2>
              <span className={styles.count}>{entries.length} cases</span>
            </div>
            <p className={styles.note}>{group.note}</p>
            <ul className={styles.caseList}>
              {entries.map((entry) => {
                const record = best[entry.id]
                return (
                  <li key={entry.id} className={styles.caseRow}>
                    <span className={styles.caseBody}>
                      <Link className={styles.caseTitle} to={`/desktop/cases/${entry.id}`}>
                        {entry.title}
                      </Link>
                      <span className={styles.caseSymptom}>{entry.symptom}</span>
                    </span>
                    <span className={styles.caseMeta}>
                      <span className={styles.badge} data-tone="quiet">
                        {badge(entry)}
                      </span>
                      <span className={styles.badge} data-tone="quiet">
                        {entry.edition}
                      </span>
                      <span className={styles.badge} data-tone="quiet">
                        difficulty {entry.difficulty}
                      </span>
                      {record ? (
                        <span
                          className={styles.badge}
                          data-tone={record.passed ? 'low' : 'high'}
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
          </section>
        )
      })}
    </div>
  )
}
