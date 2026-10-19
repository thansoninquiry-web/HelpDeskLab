import { useEffect, useState } from 'react'
import { loadProgressSummary, type ProgressSummary } from '../../app/practiceService'
import styles from './AppShell.module.css'

/**
 * Rank and streak in the header. It stays silent when the database is not
 * ready, so a storage error never blocks navigation.
 */
export function ProgressChip() {
  const [summary, setSummary] = useState<ProgressSummary | null>(null)

  useEffect(() => {
    let active = true
    loadProgressSummary().then(
      (value) => {
        if (active) {
          setSummary(value)
        }
      },
      () => {
        // The header is decorative; the failure is reported where it matters.
      },
    )
    return () => {
      active = false
    }
  }, [])

  if (!summary) {
    return null
  }

  return (
    <span
      className={styles.progressChip}
      title={`${summary.totalXp} lifetime XP · ${summary.rank.title}`}
    >
      <span className={styles.pointsBlock}>
        <span className={styles.xp}>{summary.totalXp} XP</span>
        <span className={styles.rankName}>{summary.rank.title}</span>
      </span>
      <span className={styles.streak}>
        {summary.streakDays === 0 ? 'No streak' : `${summary.streakDays}-day streak`}
      </span>
    </span>
  )
}
