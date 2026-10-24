import { IntuneNav } from './IntuneNav'
import { useIntune } from './useIntune'
import type { PolicyRule } from '../types'
import styles from './intune.module.css'

function describeRule(rule: PolicyRule): string {
  switch (rule.kind) {
    case 'bitlocker':
      return 'BitLocker disk encryption must be on'
    case 'passcode':
      return 'A device passcode must be set'
    case 'encryption':
      return 'Storage encryption must be on'
    case 'min-os':
      return `Build ${rule.version} or later`
  }
}

export function IntunePoliciesPage() {
  const { state, error } = useIntune()

  return (
    <div className={styles.page}>
      <header>
        <p className={styles.count}>Simulated console · policy is read-only here</p>
        <h1>Compliance policies</h1>
        <p className={styles.note}>
          A device is judged against every policy that matches its platform. The
          rules a console can apply itself are applied on the next check-in; the
          build number is not one of them.
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
        <section className={styles.section} aria-label="Policies">
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Policy</th>
                  <th scope="col">Platform</th>
                  <th scope="col">Rules</th>
                  <th scope="col">Grace</th>
                </tr>
              </thead>
              <tbody>
                {state.policies.map((policy) => (
                  <tr key={policy.id}>
                    <td>
                      <strong>{policy.name}</strong>
                      <p className={styles.note}>{policy.description}</p>
                    </td>
                    <td className={styles.mono}>{policy.platform}</td>
                    <td>
                      <ul className={styles.reasons}>
                        {policy.rules.map((rule) => (
                          <li key={rule.kind}>{describeRule(rule)}</li>
                        ))}
                      </ul>
                    </td>
                    <td>{policy.graceDays === 1 ? '1 day' : `${policy.graceDays} days`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
