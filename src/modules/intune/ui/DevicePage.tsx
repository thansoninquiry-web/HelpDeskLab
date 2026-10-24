import { Link, useParams } from 'react-router'
import { ComplianceBadge, LifecycleBadge } from './Badges'
import { DeviceActions } from './DeviceActions'
import { IntuneNav } from './IntuneNav'
import { relativeTime, useIntune } from './useIntune'
import { appName, policyAppliesTo, requiredAppsFor } from '../logic/compliance'
import styles from './intune.module.css'

const STATUS_LABELS: Record<string, string> = {
  installed: 'Installed',
  pending: 'Pending',
  failed: 'Failed',
  'not-installed': 'Not installed',
}

export function IntuneDevicePage() {
  const { deviceId } = useParams()
  const { state, error, busy, act } = useIntune()

  const device = state?.devices.find((entry) => entry.id === deviceId)

  if (error) {
    return (
      <div className={styles.page}>
        <IntuneNav />
        <p className={styles.empty} role="alert">
          {error}
        </p>
      </div>
    )
  }

  if (!state) {
    return (
      <div className={styles.page}>
        <IntuneNav />
        <p className={styles.empty}>Opening the estate…</p>
      </div>
    )
  }

  if (!device) {
    return (
      <div className={styles.page}>
        <IntuneNav />
        <p className={styles.empty}>
          No device with that id. <Link className={styles.link} to="/intune">Back to devices</Link>.
        </p>
      </div>
    )
  }

  const owner = state.users.find((user) => user.id === device.ownerUserId)
  const policies = state.policies.filter((policy) => policyAppliesTo(policy, device))
  const required = requiredAppsFor(device, state.apps)
  const rows = [
    ...device.apps,
    ...required
      .filter((app) => !device.apps.some((entry) => entry.appId === app.id))
      .map((app) => ({ appId: app.id, status: 'not-installed' as const, lastAttempt: null })),
  ].sort((a, b) => appName(state.apps, a.appId).localeCompare(appName(state.apps, b.appId)))
  const events = state.events
    .filter((event) => event.deviceId === device.id)
    .slice()
    .reverse()
    .slice(0, 10)

  return (
    <div className={styles.page}>
      <Link className={styles.backLink} to="/intune">
        ← All devices
      </Link>

      <div className={styles.deviceHead}>
        <h1>{device.name}</h1>
        <ComplianceBadge state={device.compliance} />
        <LifecycleBadge lifecycle={device.lifecycle} />
      </div>
      <p className={styles.note}>
        {device.platform} {device.osVersion} · {owner?.displayName ?? 'no primary user'} ·{' '}
        {device.lifecycle}
      </p>

      <IntuneNav />

      <DeviceActions device={device} users={state.users} busy={busy} onRun={(action, options) => act(device.id, action, options)} />

      <div className={styles.cards}>
        <section className={styles.card} aria-label="Compliance">
          <h2>Compliance</h2>
          <dl className={styles.meta}>
            <dt>State</dt>
            <dd>{device.compliance}</dd>
            <dt>Last check-in</dt>
            <dd>{relativeTime(device.lastCheckIn)}</dd>
            <dt>Failing since</dt>
            <dd>{device.nonComplianceSince ? relativeTime(device.nonComplianceSince) : '—'}</dd>
          </dl>
          {device.complianceReasons.length === 0 ? (
            <p className={styles.note}>Every applicable rule passes.</p>
          ) : (
            <ul className={styles.reasons}>
              {device.complianceReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.card} aria-label="Enrolment">
          <h2>Enrolment</h2>
          <dl className={styles.meta}>
            <dt>Primary user</dt>
            <dd>{owner?.displayName ?? '—'}</dd>
            <dt>Group</dt>
            <dd className={styles.mono}>{device.groupId ?? 'none'}</dd>
            <dt>Enrolled</dt>
            <dd>{relativeTime(device.enrolledAt)}</dd>
            <dt>Lost mode</dt>
            <dd>{device.lost ? 'Reported lost' : 'No'}</dd>
            <dt>Policies</dt>
            <dd>{policies.map((policy) => policy.name).join(', ') || 'none apply'}</dd>
          </dl>
        </section>
      </div>

      <section className={styles.section} aria-label="Apps">
        <div className={styles.sectionHeading}>
          <h2>Apps</h2>
          <span className={styles.count}>{rows.length} in the device's catalogue</span>
        </div>
        {rows.length === 0 ? (
          <p className={styles.empty}>
            Nothing is assigned here. The device's group carries the app assignments.
          </p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">App</th>
                  <th scope="col">Status</th>
                  <th scope="col">Last attempt</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((entry) => (
                  <tr key={entry.appId}>
                    <td>{appName(state.apps, entry.appId)}</td>
                    <td>{STATUS_LABELS[entry.status] ?? entry.status}</td>
                    <td>{relativeTime(entry.lastAttempt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.section} aria-label="Activity">
        <div className={styles.sectionHeading}>
          <h2>Activity</h2>
          <span className={styles.count}>Newest first</span>
        </div>
        {events.length === 0 ? (
          <p className={styles.empty}>No action has been taken on this device yet.</p>
        ) : (
          <div className={styles.stack}>
            {events.map((event) => (
              <div key={event.id} className={styles.card}>
                <h3>
                  {event.action} · {relativeTime(event.at)} · {event.outcome}
                </h3>
                <p>{event.summary}</p>
                {event.notes.length > 0 ? (
                  <ul className={styles.reasons}>
                    {event.notes.map((note, index) => (
                      <li key={`${event.id}-${index}`}>{note}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
