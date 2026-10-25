import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { AzureNav } from './AzureNav'
import { ExposureBadge, StateBadge } from './Badges'
import { useAzure } from './useAzure'
import { KIND_LABELS } from './labels'
import {
  exposureOf,
  findingsFor,
  formatMoney,
  monthlyCost,
  resourceGroupName,
  totalMonthlyCost,
} from '../logic/diagnostics'
import styles from './azure.module.css'

const KIND_FILTERS = [
  { value: 'all', label: 'Every kind' },
  { value: 'vm', label: 'Virtual machines' },
  { value: 'storage', label: 'Storage accounts' },
  { value: 'nsg', label: 'Network groups' },
  { value: 'webapp', label: 'App Services' },
] as const

const EXPOSURE_FILTERS = [
  { value: 'all', label: 'Any exposure' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
] as const

export function AzureInventoryPage() {
  const { state, error, busy, reset } = useAzure()
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<string>('all')
  const [group, setGroup] = useState<string>('all')
  const [exposure, setExposure] = useState<string>('all')
  const [confirmReset, setConfirmReset] = useState(false)

  const rows = useMemo(() => {
    if (!state) {
      return []
    }
    const needle = query.trim().toLowerCase()
    return state.resources
      .filter((resource) => !resource.deleted)
      .map((resource) => ({
        resource,
        findings: findingsFor(resource, state),
      }))
      .filter(({ resource, findings }) => {
        if (kind !== 'all' && resource.properties.kind !== kind) {
          return false
        }
        if (group !== 'all' && resource.resourceGroupId !== group) {
          return false
        }
        if (exposure !== 'all' && exposureOf(findings) !== exposure) {
          return false
        }
        if (needle.length === 0) {
          return true
        }
        return (
          resource.name.toLowerCase().includes(needle) ||
          resourceGroupName(state, resource.resourceGroupId).toLowerCase().includes(needle)
        )
      })
      .sort((left, right) => left.resource.name.localeCompare(right.resource.name))
  }, [state, query, kind, group, exposure])

  const counts = useMemo(() => {
    if (!state) {
      return { high: 0, medium: 0, low: 0 }
    }
    let high = 0
    let medium = 0
    let low = 0
    for (const resource of state.resources) {
      if (resource.deleted) {
        continue
      }
      const graded = exposureOf(findingsFor(resource, state))
      if (graded === 'high') high += 1
      else if (graded === 'medium') medium += 1
      else low += 1
    }
    return { high, medium, low }
  }, [state])

  return (
    <div className={styles.page}>
      <header>
        <p className={styles.count}>Simulated console · all data is local and fictional</p>
        <h1>Azure resources</h1>
        <p className={styles.note}>
          Four resource groups and thirteen resources across compute, storage,
          networking and App Service. Every action here changes the simulated
          subscription and nothing else.
        </p>
      </header>

      <AzureNav />

      {error ? (
        <p className={styles.empty} role="alert">
          {error}
        </p>
      ) : null}

      {!state ? (
        <p className={styles.empty}>Opening the subscription…</p>
      ) : (
        <>
          <section className={styles.section} aria-label="Resources">
            <div className={styles.filters}>
              <label className={styles.field}>
                <span>Search</span>
                <input
                  type="search"
                  value={query}
                  placeholder="Resource or group"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span>Kind</span>
                <select value={kind} onChange={(event) => setKind(event.target.value)}>
                  {KIND_FILTERS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>Resource group</span>
                <select value={group} onChange={(event) => setGroup(event.target.value)}>
                  <option value="all">Every group</option>
                  {state.resourceGroups.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>Exposure</span>
                <select value={exposure} onChange={(event) => setExposure(event.target.value)}>
                  {EXPOSURE_FILTERS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <span className={styles.count} role="status" aria-live="polite">
                {counts.high} high · {counts.medium} medium · {counts.low} low ·{' '}
                {formatMoney(totalMonthlyCost(state))} a month
              </span>
            </div>

            {rows.length === 0 ? (
              <p className={styles.empty}>No resource matches those filters.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <caption className={styles.count}>
                    {rows.length} of {state.resources.filter((entry) => !entry.deleted).length}{' '}
                    resources
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Resource</th>
                      <th scope="col">Kind</th>
                      <th scope="col">Group</th>
                      <th scope="col">State</th>
                      <th scope="col">Exposure</th>
                      <th scope="col">Cost / month</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ resource, findings }) => (
                      <tr key={resource.id}>
                        <td>
                          <Link className={styles.link} to={`/azure/resources/${resource.id}`}>
                            {resource.name}
                          </Link>
                        </td>
                        <td>{KIND_LABELS[resource.properties.kind] ?? resource.properties.kind}</td>
                        <td className={styles.mono}>
                          {resourceGroupName(state, resource.resourceGroupId)}
                        </td>
                        <td>
                          <StateBadge resource={resource} />
                        </td>
                        <td>
                          <ExposureBadge exposure={exposureOf(findings)} />
                        </td>
                        <td className={styles.mono}>{formatMoney(monthlyCost(resource))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={styles.section} aria-label="Reset the simulator">
            <div className={styles.stack}>
              <p className={styles.note}>
                Practising changes the subscription for good: a deleted resource stays
                deleted. Resetting puts every resource, rule and assignment back to the
                seed.
              </p>
              {confirmReset ? (
                <div className={styles.dialog} role="alertdialog" aria-modal="true">
                  <h2 className={styles.dialogTitle}>Reset the whole subscription?</h2>
                  <p className={styles.dialogBody}>
                    Resource states, network rules and role assignments all return to a
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
