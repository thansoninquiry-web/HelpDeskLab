import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ComplianceBadge, LifecycleBadge } from './Badges'
import { IntuneNav } from './IntuneNav'
import { relativeTime, useIntune } from './useIntune'
import styles from './intune.module.css'

const COMPLIANCE_FILTERS = [
  { value: 'all', label: 'Any compliance state' },
  { value: 'compliant', label: 'Compliant' },
  { value: 'non-compliant', label: 'Non-compliant' },
  { value: 'in-grace', label: 'In grace period' },
  { value: 'not-evaluated', label: 'Not evaluated' },
] as const

const PLATFORM_FILTERS = [
  { value: 'all', label: 'Any platform' },
  { value: 'Windows', label: 'Windows' },
  { value: 'iOS', label: 'iOS' },
  { value: 'Android', label: 'Android' },
] as const

export function IntuneDevicesPage() {
  const { state, error, busy, reset } = useIntune()
  const [query, setQuery] = useState('')
  const [platform, setPlatform] = useState<string>('all')
  const [compliance, setCompliance] = useState<string>('all')
  const [confirmReset, setConfirmReset] = useState(false)

  const devices = useMemo(() => {
    if (!state) {
      return []
    }
    const needle = query.trim().toLowerCase()
    return state.devices
      .filter((device) => {
        if (platform !== 'all' && device.platform !== platform) {
          return false
        }
        if (compliance !== 'all' && device.compliance !== compliance) {
          return false
        }
        if (needle.length === 0) {
          return true
        }
        const owner = state.users.find((user) => user.id === device.ownerUserId)
        return (
          device.name.toLowerCase().includes(needle) ||
          (owner?.displayName.toLowerCase().includes(needle) ?? false)
        )
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [state, query, platform, compliance])

  const managed = state?.devices.filter((device) => device.lifecycle === 'managed') ?? []
  const counts = {
    compliant: managed.filter((device) => device.compliance === 'compliant').length,
    'non-compliant': managed.filter((device) => device.compliance === 'non-compliant').length,
    'in-grace': managed.filter((device) => device.compliance === 'in-grace').length,
    'not-evaluated': managed.filter((device) => device.compliance === 'not-evaluated').length,
  }

  return (
    <div className={styles.page}>
      <header>
        <p className={styles.count}>Simulated console · all data is local and fictional</p>
        <h1>Device management</h1>
        <p className={styles.note}>
          Fifteen enrolled devices across Windows, iOS and Android, judged against
          two compliance policies. Every action here changes the simulated estate
          and nothing else.
        </p>
      </header>

      <IntuneNav />

      {error ? (
        <p className={styles.empty} role="alert">
          {error}
        </p>
      ) : null}

      {!state ? (
        <p className={styles.empty}>Opening the estate…</p>
      ) : (
        <>
          <section className={styles.section} aria-label="Compliance summary">
            <div className={styles.filters}>
              <label className={styles.field}>
                <span>Search</span>
                <input
                  type="search"
                  value={query}
                  placeholder="Device or user"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span>Platform</span>
                <select value={platform} onChange={(event) => setPlatform(event.target.value)}>
                  {PLATFORM_FILTERS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>Compliance</span>
                <select value={compliance} onChange={(event) => setCompliance(event.target.value)}>
                  {COMPLIANCE_FILTERS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <span className={styles.count} role="status" aria-live="polite">
                {counts.compliant} compliant · {counts['non-compliant']} non-compliant ·{' '}
                {counts['in-grace']} in grace · {counts['not-evaluated']} not evaluated
              </span>
            </div>

            {devices.length === 0 ? (
              <p className={styles.empty}>No device matches those filters.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <caption className={styles.count}>
                    {devices.length} of {state.devices.length} devices
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Device</th>
                      <th scope="col">Primary user</th>
                      <th scope="col">Platform</th>
                      <th scope="col">Compliance</th>
                      <th scope="col">Last check-in</th>
                    </tr>
                  </thead>
                  <tbody>
                    {devices.map((device) => {
                      const owner = state.users.find((user) => user.id === device.ownerUserId)
                      return (
                        <tr key={device.id}>
                          <td>
                            <Link className={styles.link} to={`/intune/devices/${device.id}`}>
                              {device.name}
                            </Link>{' '}
                            <LifecycleBadge lifecycle={device.lifecycle} />
                          </td>
                          <td>{owner?.displayName ?? '—'}</td>
                          <td className={styles.mono}>
                            {device.platform} {device.osVersion}
                          </td>
                          <td>
                            <ComplianceBadge state={device.compliance} />
                          </td>
                          <td>{relativeTime(device.lastCheckIn)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={styles.section} aria-label="Reset the simulator">
            <div className={styles.stack}>
              <p className={styles.note}>
                Practising changes the estate for good: a retired phone stays retired.
                Resetting puts every device, app and assignment back to the seed.
              </p>
              {confirmReset ? (
                <div className={styles.dialog} role="alertdialog" aria-modal="true">
                  <h2 className={styles.dialogTitle}>Reset the whole estate?</h2>
                  <p className={styles.dialogBody}>
                    Device states, app installs and the activity log all return to a
                    fresh install. Practice attempts are cleared too.
                  </p>
                  <div className={styles.dialogButtons}>
                    <button
                      type="button"
                      className={`${styles.button} ${styles.danger}`}
                      disabled={busy}
                      onClick={() => {
                        void reset()
                        setConfirmReset(false)
                      }}
                    >
                      Reset everything
                    </button>
                    <button
                      type="button"
                      className={styles.buttonQuiet}
                      onClick={() => setConfirmReset(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <button
                    type="button"
                    className={styles.button}
                    onClick={() => setConfirmReset(true)}
                  >
                    Reset the simulator
                  </button>
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
