import { Link } from 'react-router'
import { AzureNav } from './AzureNav'
import { ExposureBadge } from './Badges'
import { useAzure } from './useAzure'
import { exposureOf, findingsFor, resourceGroupName } from '../logic/diagnostics'
import styles from './azure.module.css'

export function AzureNetworkPage() {
  const { state, error } = useAzure()

  return (
    <div className={styles.page}>
      <header>
        <p className={styles.count}>Simulated console · rules are changed on the group’s page</p>
        <h1>Network rules</h1>
        <p className={styles.note}>
          A network security group is read top to bottom and ends with an implicit
          deny, so a port that has no allow rule is closed even when nothing says so.
          Two of these groups were left a decision short.
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
        <section className={styles.section} aria-label="Network security groups">
          <div className={styles.stack}>
            {state.resources
              .filter((resource) => resource.properties.kind === 'nsg' && !resource.deleted)
              .map((resource) => {
                const findings = findingsFor(resource, state)
                const rules = state.nsgRules
                  .filter((rule) => rule.nsgId === resource.id)
                  .slice()
                  .sort((left, right) => left.priority - right.priority)
                return (
                  <div key={resource.id} className={styles.card}>
                    <div className={styles.sectionHeading}>
                      <h2>
                        <Link className={styles.link} to={`/azure/resources/${resource.id}`}>
                          {resource.name}
                        </Link>
                      </h2>
                      <span className={styles.count}>
                        {resourceGroupName(state, resource.resourceGroupId)} ·{' '}
                        {resource.properties.kind === 'nsg'
                          ? resource.properties.attachedTo
                          : ''}{' '}
                        <ExposureBadge exposure={exposureOf(findings)} />
                      </span>
                    </div>
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th scope="col">Priority</th>
                            <th scope="col">Rule</th>
                            <th scope="col">Direction</th>
                            <th scope="col">Access</th>
                            <th scope="col">Port</th>
                            <th scope="col">Source</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rules.map((rule) => (
                            <tr key={rule.id}>
                              <td className={styles.mono}>{rule.priority}</td>
                              <td>{rule.name}</td>
                              <td>{rule.direction}</td>
                              <td>{rule.access}</td>
                              <td className={styles.mono}>{rule.port ?? 'Any'}</td>
                              <td className={styles.mono}>{rule.source}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
          </div>
        </section>
      )}
    </div>
  )
}
