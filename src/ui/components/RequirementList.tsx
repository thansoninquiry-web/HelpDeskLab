import type { ModuleRequirementView } from '../../app/curriculumService'
import styles from '../routes/pages.module.css'

/**
 * The exit criteria of one module, with how far the learner has got on each.
 * Shared by the dashboard and the lesson page so the two never describe the same
 * requirement differently.
 */
export function RequirementList({
  requirements,
}: {
  requirements: readonly ModuleRequirementView[]
}) {
  return (
    <ul className={styles.requirementList}>
      {requirements.map((entry) => (
        <li key={entry.id} className={styles.requirement} data-met={entry.met}>
          <span className={styles.requirementTick} aria-hidden="true">
            {entry.met ? '✓' : '·'}
          </span>
          <span className={styles.requirementBody}>
            <span className={styles.requirementLabel}>
              {entry.label}
              <span className={styles.requirementProgress}>{entry.progressLabel}</span>
            </span>
            <span className={styles.requirementDetail}>{entry.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}
