import { useEffect, useState } from 'react'
import { getLocalDatabaseStatus, type LocalDatabaseStatus } from '../../app/persistenceService'
import { PageHeader } from '../components/PageHeader'
import styles from './pages.module.css'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; status: LocalDatabaseStatus }
  | { kind: 'error'; message: string }

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function describePersistence(persistent: boolean | null): string {
  if (persistent === null) {
    return 'Unknown'
  }
  return persistent ? 'Granted' : 'Not granted (the browser may evict data)'
}

export function SettingsPage() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  useEffect(() => {
    let active = true

    getLocalDatabaseStatus().then(
      (status) => {
        if (active) {
          setState({ kind: 'ready', status })
        }
      },
      (error: unknown) => {
        if (active) {
          setState({
            kind: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      },
    )

    return () => {
      active = false
    }
  }, [])

  return (
    <>
      <PageHeader
        eyebrow="Release 1"
        title="Settings"
        description="Your practice history lives in a local SQLite database. Nothing is uploaded, and no account is required."
      />

      <section className={styles.section} aria-labelledby="storage-heading">
        <div className={styles.sectionHeading}>
          <h2 id="storage-heading">Local database</h2>
          <span className={styles.count}>Milestone 1</span>
        </div>

        {state.kind === 'loading' && (
          <p className={styles.statusMessage}>Opening the local database…</p>
        )}

        {state.kind === 'error' && (
          <p className={styles.statusError}>
            The local database could not be opened: {state.message}
          </p>
        )}

        {state.kind === 'ready' && (
          <dl className={styles.statusList}>
            <div className={styles.statusRow}>
              <dt>Status</dt>
              <dd>Ready</dd>
            </div>
            <div className={styles.statusRow}>
              <dt>Engine</dt>
              <dd>SQLite (WebAssembly) · schema v{state.status.schemaVersion}</dd>
            </div>
            <div className={styles.statusRow}>
              <dt>Storage</dt>
              <dd>IndexedDB snapshot</dd>
            </div>
            <div className={styles.statusRow}>
              <dt>Database size</dt>
              <dd>{formatBytes(state.status.storedBytes)}</dd>
            </div>
            <div className={styles.statusRow}>
              <dt>Persistent storage</dt>
              <dd>{describePersistence(state.status.persistentStorage)}</dd>
            </div>
          </dl>
        )}
      </section>

      <div className={styles.placeholder}>
        <span className={styles.placeholderTitle}>Reserved for later milestones</span>
        <p>Backup export and import, database reset, and accessibility preferences will live here.</p>
      </div>
    </>
  )
}
