import { Link } from 'react-router'
import { AzureNav } from './AzureNav'
import { useAzure } from './useAzure'
import { scopeName } from '../logic/diagnostics'
import styles from './azure.module.css'

const ROLE_NOTES: Record<string, string> = {
  Reader: 'Can look at everything in scope and change nothing.',
  Contributor: 'Can create, change and delete resources in scope. Cannot grant access.',
  Owner: 'Everything Contributor can do, plus granting access to others.',
}

export function AzureAccessPage() {
  const { state, error } = useAzure()

  return (
    <div className={styles.page}>
      <header>
        <p className={styles.count}>Simulated console · assignments are changed from a resource</p>
        <h1>Access control</h1>
        <p className={styles.note}>
          A role is granted over a scope, not over a resource: an assignment on a
          resource group applies to everything inside it, including things created
          tomorrow. Owner is the only role that can hand access on.
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
          <section className={styles.section} aria-label="Role assignments">
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Principal</th>
                    <th scope="col">Role</th>
                    <th scope="col">Scope</th>
                    <th scope="col">What it can do</th>
                  </tr>
                </thead>
                <tbody>
                  {state.roles.map((assignment) => (
                    <tr key={assignment.id}>
                      <td>{assignment.principalLabel}</td>
                      <td className={styles.mono}>{assignment.role}</td>
                      <td>{scopeName(state, assignment.scope)}</td>
                      <td>{ROLE_NOTES[assignment.role]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className={styles.section} aria-label="Where to change an assignment">
            <div className={styles.stack}>
              <p className={styles.note}>
                An assignment is changed from a resource inside the group it covers, so
                the scope is visible while the role is chosen.
              </p>
              <div className={styles.actionButtons}>
                {state.resources
                  .filter((resource) => !resource.deleted)
                  .slice(0, 4)
                  .map((resource) => (
                  <Link
                    key={resource.id}
                    className={styles.button}
                    to={`/azure/resources/${resource.id}`}
                  >
                      {resource.name}
                    </Link>
                  ))}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
