import { useEffect, useState } from 'react'
import { loadProgress, type ProgressView } from '../../app/practiceService'
import { PageHeader } from '../components/PageHeader'
import styles from './practice.module.css'

function formatDate(ms: number | null): string {
  if (ms === null) {
    return '—'
  }
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function ProgressPage() {
  const [progress, setProgress] = useState<ProgressView | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    loadProgress()
      .then((view) => {
        if (!cancelled) {
          setProgress(view)
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'Progress could not be loaded.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return <p className={styles.error} role="alert">{error}</p>
  }

  if (!progress) {
    return <p className={styles.muted}>Reading your history…</p>
  }

  const passRate =
    progress.attempts === 0 ? 0 : Math.round((progress.passes / progress.attempts) * 100)

  return (
    <>
      <PageHeader
        eyebrow="Progress"
        title="Progress"
        description="Every closed session is stored locally. Scores are immutable; a retry is a fresh attempt over the same ticket."
      />

      <div className={styles.statGrid}>
        <div className={styles.statCard}>
          <span>Attempts</span>
          <strong>{progress.attempts}</strong>
        </div>
        <div className={styles.statCard}>
          <span>Pass rate</span>
          <strong>{passRate}%</strong>
        </div>
        <div className={styles.statCard}>
          <span>Best score</span>
          <strong>{progress.bestScore}</strong>
        </div>
        <div className={styles.statCard}>
          <span>Average best</span>
          <strong>{progress.averageBest}</strong>
        </div>
      </div>

      <section className={styles.sectionBlock} aria-label="Scenario mastery">
        <h2>By scenario</h2>
        {progress.rows.length === 0 ? (
          <p className={styles.muted}>
            No scored attempts yet. Resolve a ticket to see mastery, best scores, and review
            scheduling here.
          </p>
        ) : (
          <table className={styles.progressTable}>
            <thead>
              <tr>
                <th scope="col">Scenario</th>
                <th scope="col">Attempts</th>
                <th scope="col">Passes</th>
                <th scope="col">Best</th>
                <th scope="col">Review box</th>
                <th scope="col">Due</th>
              </tr>
            </thead>
            <tbody>
              {progress.rows.map((row) => (
                <tr key={row.scenarioId}>
                  <td>{row.scenarioTitle}</td>
                  <td>{row.attempts}</td>
                  <td>{row.passes}</td>
                  <td>{row.bestScore}</td>
                  <td>{row.leitnerBox} / 5</td>
                  <td className={styles.due}>{formatDate(row.dueAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  )
}
