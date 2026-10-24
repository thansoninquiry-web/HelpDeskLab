import type { ComplianceState, DeviceLifecycle } from '../types'
import styles from './intune.module.css'

const COMPLIANCE_LABELS: Record<ComplianceState, string> = {
  compliant: 'Compliant',
  'non-compliant': 'Non-compliant',
  'in-grace': 'In grace period',
  'not-evaluated': 'Not evaluated',
}

export function ComplianceBadge({ state }: { state: ComplianceState }) {
  return (
    <span className={styles.badge} data-tone={state}>
      {COMPLIANCE_LABELS[state]}
    </span>
  )
}

export function LifecycleBadge({ lifecycle }: { lifecycle: DeviceLifecycle }) {
  if (lifecycle === 'managed') {
    return null
  }
  return (
    <span className={styles.badge} data-tone={lifecycle}>
      {lifecycle === 'retired' ? 'Retired' : 'Wiped'}
    </span>
  )
}
