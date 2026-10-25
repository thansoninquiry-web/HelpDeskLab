import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { AzureNav } from './AzureNav'
import { ExposureBadge } from './Badges'
import { ResourceActions } from './ResourceActions'
import { EVENT_ACTION_LABELS, KIND_LABELS } from './labels'
import { relativeTime, useAzure } from './useAzure'
import {
  allFindingsFor,
  exposureOf,
  formatMoney,
  monthlyCost,
  resourceGroupName,
} from '../logic/diagnostics'
import styles from './azure.module.css'

function propertyRows(name: string, kind: string, month: number): Array<[string, string]> {
  return [
    ['Kind', KIND_LABELS[kind] ?? kind],
    ['Resource group', name],
    ['Cost', `${formatMoney(month)} a month`],
  ]
}

export function AzureResourcePage() {
  const { resourceId } = useParams()
  const { state, error, busy, act, review } = useAzure()
  const [readSummary, setReadSummary] = useState<string | null>(null)

  if (error) {
    return (
      <div className={styles.page}>
        <AzureNav />
        <p className={styles.empty} role="alert">
          {error}
        </p>
      </div>
    )
  }

  if (!state) {
    return (
      <div className={styles.page}>
        <AzureNav />
        <p className={styles.empty}>Opening the subscription…</p>
      </div>
    )
  }

  const resource = state.resources.find((entry) => entry.id === resourceId)

  if (!resource || resource.deleted) {
    return (
      <div className={styles.page}>
        <AzureNav />
        <p className={styles.empty}>
          That resource is not in the subscription — it has been deleted.{' '}
          <Link className={styles.link} to="/azure">
            Back to the inventory
          </Link>
          .
        </p>
      </div>
    )
  }

  const findings = allFindingsFor(resource, state)
  const properties = resource.properties
  const groupName = resourceGroupName(state, resource.resourceGroupId)
  const events = state.events
    .filter((event) => event.resourceId === resource.id)
    .slice()
    .reverse()
    .slice(0, 10)
  const rules =
    properties.kind === 'nsg'
      ? state.nsgRules
          .filter((rule) => rule.nsgId === resource.id)
          .slice()
          .sort((left, right) => left.priority - right.priority)
      : []

  return (
    <div className={styles.page}>
      <Link className={styles.backLink} to="/azure">
        ← All resources
      </Link>

      <div className={styles.deviceHead}>
        <h1>{resource.name}</h1>
        <ExposureBadge exposure={exposureOf(findings)} />
      </div>
      <p className={styles.note}>
        {KIND_LABELS[properties.kind] ?? properties.kind} · {groupName} · {resource.region}
      </p>

      <AzureNav />

      <section className={styles.section} aria-label="Read the record">
        <div className={styles.stack}>
          <p className={styles.note}>
            The record is where a portal warning becomes a reason. Reading it is
            recorded, and it is what the diagnosis category is scored from.
          </p>
          <div>
            <button
              type="button"
              className={styles.button}
              disabled={busy}
              onClick={() => {
                void review(resource.id).then((summary) => {
                  if (summary) {
                    setReadSummary(summary)
                  }
                })
              }}
            >
              Read the resource record
            </button>
          </div>
          {readSummary ? (
            <p className={styles.note} role="status">
              {readSummary}
            </p>
          ) : null}
        </div>
      </section>

      <ResourceActions
        resource={resource}
        state={state}
        busy={busy}
        onRun={(action, options) => act(resource.id, action, options)}
      />

      <div className={styles.cards}>
        <section className={styles.card} aria-label="Settings">
          <h2>Settings</h2>
          <dl className={styles.meta}>
            {propertyRows(groupName, properties.kind, monthlyCost(resource)).map(([term, value]) => (
              <div key={term} className={styles.metaRow}>
                <dt>{term}</dt>
                <dd>{value}</dd>
              </div>
            ))}
            {properties.kind === 'vm' ? (
              <>
                <div className={styles.metaRow}>
                  <dt>Size</dt>
                  <dd className={styles.mono}>{properties.size}</dd>
                </div>
                <div className={styles.metaRow}>
                  <dt>Power</dt>
                  <dd>{properties.power}</dd>
                </div>
                <div className={styles.metaRow}>
                  <dt>Image</dt>
                  <dd>{properties.os}</dd>
                </div>
                <div className={styles.metaRow}>
                  <dt>Schedule tag</dt>
                  <dd>{properties.schedule}</dd>
                </div>
              </>
            ) : null}
            {properties.kind === 'storage' ? (
              <>
                <div className={styles.metaRow}>
                  <dt>Public blob access</dt>
                  <dd>{properties.publicBlobAccess ? 'On' : 'Off'}</dd>
                </div>
                <div className={styles.metaRow}>
                  <dt>Soft delete</dt>
                  <dd>
                    {properties.softDeleteDays === 0
                      ? 'Off'
                      : `${properties.softDeleteDays} days`}
                  </dd>
                </div>
                <div className={styles.metaRow}>
                  <dt>Minimum TLS</dt>
                  <dd>{properties.tlsMin}</dd>
                </div>
                <div className={styles.metaRow}>
                  <dt>Replication</dt>
                  <dd>{properties.replication}</dd>
                </div>
              </>
            ) : null}
            {properties.kind === 'nsg' ? (
              <>
                <div className={styles.metaRow}>
                  <dt>Attached to</dt>
                  <dd className={styles.mono}>{properties.attachedTo}</dd>
                </div>
                <div className={styles.metaRow}>
                  <dt>Rules</dt>
                  <dd>{rules.length}</dd>
                </div>
              </>
            ) : null}
            {properties.kind === 'webapp' ? (
              <>
                <div className={styles.metaRow}>
                  <dt>Plan</dt>
                  <dd>{properties.planSku}</dd>
                </div>
                <div className={styles.metaRow}>
                  <dt>Runtime</dt>
                  <dd>{properties.runtime}</dd>
                </div>
                <div className={styles.metaRow}>
                  <dt>HTTPS only</dt>
                  <dd>{properties.httpsOnly ? 'On' : 'Off'}</dd>
                </div>
              </>
            ) : null}
          </dl>
        </section>

        <section className={styles.card} aria-label="Findings">
          <h2>Findings</h2>
          {findings.length === 0 ? (
            <p className={styles.note}>Nothing on this record is outside the baseline.</p>
          ) : (
            <ul className={styles.reasons}>
              {findings.map((finding) => (
                <li key={finding.text} data-severity={finding.severity}>
                  {finding.text}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {properties.kind === 'nsg' ? (
        <section className={styles.section} aria-label="Network rules">
          <div className={styles.sectionHeading}>
            <h2>Rules</h2>
            <span className={styles.count}>Lowest priority number wins</span>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Priority</th>
                  <th scope="col">Name</th>
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
        </section>
      ) : null}

      <section className={styles.section} aria-label="Activity">
        <div className={styles.sectionHeading}>
          <h2>Activity</h2>
          <span className={styles.count}>Newest first</span>
        </div>
        {events.length === 0 ? (
          <p className={styles.empty}>No action has been taken on this resource yet.</p>
        ) : (
          <div className={styles.stack}>
            {events.map((event) => (
              <div key={event.id} className={styles.card}>
                <h3>
                  {EVENT_ACTION_LABELS[event.action]} · {relativeTime(event.at)} · {event.outcome}
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
