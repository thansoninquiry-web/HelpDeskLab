import { IntuneNav } from './IntuneNav'
import { useState } from 'react'
import { groupLabel } from './labels'
import { relativeTime, useIntune } from './useIntune'
import styles from './intune.module.css'

const STATUS_LABELS: Record<string, string> = {
  installed: 'Installed',
  pending: 'Pending',
  failed: 'Failed',
  'not-installed': 'Not installed',
}

export function IntuneAppsPage() {
  const { state, error } = useIntune()
  const [openApp, setOpenApp] = useState<string | null>(null)

  return (
    <div className={styles.page}>
      <header>
        <p className={styles.count}>Simulated console · assignments come from groups</p>
        <h1>Apps</h1>
        <p className={styles.note}>
          Four applications, each required for one or more groups. A device collects
          what its group requires the next time it checks in, which is why an
          assignment on its own does not install anything.
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
        <section className={styles.section} aria-label="Applications">
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">App</th>
                  <th scope="col">Platform</th>
                  <th scope="col">Assignment</th>
                  <th scope="col">Devices</th>
                </tr>
              </thead>
              <tbody>
                {state.apps.map((app) => {
                  const inScope = state.devices.filter(
                    (device) =>
                      device.lifecycle === 'managed' &&
                      device.groupId !== null &&
                      app.assignment.groupIds.includes(device.groupId) &&
                      (app.platform === 'all' || app.platform === device.platform),
                  )
                  const open = openApp === app.id
                  return (
                    <tr key={app.id}>
                      <td>
                        <strong>{app.name}</strong>
                        <p className={styles.note}>{app.publisher}</p>
                      </td>
                      <td className={styles.mono}>{app.platform}</td>
                      <td>
                        {app.assignment.install} ·{' '}
                        {app.assignment.groupIds.map((groupId) => groupLabel(groupId)).join(', ')}
                      </td>
                      <td>
                        <button
                          type="button"
                          className={styles.link}
                          aria-expanded={open}
                          onClick={() => setOpenApp(open ? null : app.id)}
                        >
                          {inScope.length} device{inScope.length === 1 ? '' : 's'}
                        </button>
                        {open ? (
                          <ul className={styles.reasons}>
                            {inScope.map((device) => {
                              const entry = device.apps.find((app_) => app_.appId === app.id)
                              const status = entry?.status ?? 'not-installed'
                              return (
                                <li key={device.id}>
                                  {device.name}: {STATUS_LABELS[status] ?? status}
                                  {entry?.lastAttempt
                                    ? ` (${relativeTime(entry.lastAttempt)})`
                                    : ''}
                                </li>
                              )
                            })}
                          </ul>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
