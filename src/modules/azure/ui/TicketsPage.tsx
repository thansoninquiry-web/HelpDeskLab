import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { AzureNav } from './AzureNav'
import { ExposureBadge } from './Badges'
import { ResourceActions } from './ResourceActions'
import { useAzure } from './useAzure'
import { registerAzureTicketTemplates, isAzureTicketComplete } from '../tickets/registry'
import { AZURE_CATEGORIES, AZURE_CATEGORY_LABELS, type AzureScore } from '../tickets/scoring'
import type { AzureTicketTemplate } from '../tickets/templates'
import {
  allFindingsFor,
  exposureOf,
  formatMoney,
  monthlyCost,
  resourceGroupName,
} from '../logic/diagnostics'
import { KIND_LABELS } from './labels'
import styles from './azure.module.css'

/**
 * The queue, filled through the module's registration function rather than by
 * importing the template list. That is the seam a hub would use, so the page
 * exercises it instead of going around it.
 */
function useTicketQueue(): readonly AzureTicketTemplate[] {
  return useMemo(() => {
    const collected: AzureTicketTemplate[] = []
    registerAzureTicketTemplates({ offer: (template) => collected.push(template) })
    return collected
  }, [])
}

export function AzureTicketsPage() {
  const { state, error, busy, act, review, service } = useAzure()
  const templates = useTicketQueue()
  // A lesson deep-links to the ticket it teaches, so the queue can open on the
  // decision the module is about instead of asking the learner to find it.
  const [params] = useSearchParams()
  const [selectedId, setSelectedId] = useState<string | null>(() => params.get('template'))
  const [startedAt, setStartedAt] = useState<number>(() => Date.now())
  const [score, setScore] = useState<AzureScore | null>(null)
  const [scoring, setScoring] = useState(false)
  /** What the console said when the record was read, for this attempt. */
  const [readSummary, setReadSummary] = useState<string | null>(null)

  const selected = templates.find((template) => template.id === selectedId) ?? null
  const resource = selected
    ? state?.resources.find((entry) => entry.id === selected.resourceId && !entry.deleted)
    : undefined

  const check = async () => {
    if (!service || !selected) {
      return
    }
    setScoring(true)
    try {
      const result = await service.score(selected.id, startedAt)
      setScore(result.score)
    } finally {
      setScoring(false)
    }
  }

  const findings = resource && state ? allFindingsFor(resource, state) : []

  return (
    <div className={styles.page}>
      <header>
        <p className={styles.count}>Nine practice tickets · verified against the estate</p>
        <h1>Practice tickets</h1>
        <p className={styles.note}>
          Each ticket names a resource in the console above. Work it from here — the
          actions are the same ones the resource page offers — then check the work
          against the state the subscription is actually in.
        </p>
      </header>

      <AzureNav />

      {error ? (
        <p className={styles.empty} role="alert">
          {error}
        </p>
      ) : null}

      <section className={styles.section} aria-label="Ticket queue">
        <div className={styles.ticketList}>
          {templates.map((template) => {
            const complete = state ? isAzureTicketComplete(template.id, state) : false
            return (
              <button
                key={template.id}
                type="button"
                className={styles.ticketRow}
                aria-pressed={selectedId === template.id}
                onClick={() => {
                  setSelectedId(template.id)
                  setStartedAt(Date.now())
                  setScore(null)
                  setReadSummary(null)
                }}
              >
                <span>{template.title}</span>
                <span className={styles.count}>difficulty {template.difficulty}</span>
                <span className={styles.count}>{template.category}</span>
                <span className={styles.badge} data-tone={complete ? 'low' : 'not-evaluated'}>
                  {complete ? 'Resolved' : 'Open'}
                </span>
              </button>
            )
          })}
        </div>

        {selected && state ? (
          <div className={styles.stack}>
            <h2>{selected.subject}</h2>
            <p className={styles.ticketBody}>{selected.body}</p>

            {resource ? (
              <>
                <div className={styles.card}>
                  <h3>On the console</h3>
                  <p>
                    <Link className={styles.link} to={`/azure/resources/${resource.id}`}>
                      {resource.name}
                    </Link>{' '}
                    <ExposureBadge exposure={exposureOf(findings)} />
                  </p>
                  <dl className={styles.meta}>
                    <div className={styles.metaRow}>
                      <dt>Kind</dt>
                      <dd>{KIND_LABELS[resource.properties.kind] ?? resource.properties.kind}</dd>
                    </div>
                    <div className={styles.metaRow}>
                      <dt>Group</dt>
                      <dd>{resourceGroupName(state, resource.resourceGroupId)}</dd>
                    </div>
                    <div className={styles.metaRow}>
                      <dt>Cost</dt>
                      <dd>{formatMoney(monthlyCost(resource))} a month</dd>
                    </div>
                    <div className={styles.metaRow}>
                      <dt>Findings</dt>
                      <dd>
                        {findings.length === 0
                          ? 'none'
                          : `${findings.length} on the record`}
                      </dd>
                    </div>
                  </dl>
                  {/* The read step: the console records that the findings were
                      looked at, which is what diagnosis is scored from. */}
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
                    {readSummary ? (
                      <p className={styles.note} role="status">
                        {readSummary}
                      </p>
                    ) : null}
                  </div>
                </div>

                <ResourceActions
                  resource={resource}
                  state={state}
                  busy={busy}
                  onRun={(action, options) => act(resource.id, action, options)}
                />
              </>
            ) : (
              <p className={styles.empty}>
                The resource for this ticket is not in the subscription.
              </p>
            )}

            <div>
              <button
                type="button"
                className={styles.button}
                disabled={scoring || busy}
                onClick={() => void check()}
              >
                {scoring ? 'Checking…' : 'Check my work'}
              </button>
            </div>

            {score ? (
              <div className={styles.score} aria-live="polite">
                <div className={styles.scoreTotal}>
                  <strong>{score.total}</strong>
                  <span className={styles.count}>
                    out of 100 · {score.band} {score.passed ? '· passed' : '· not passed'}
                  </span>
                </div>
                {/* The same rubric split the rest of the app keeps, so Progress can
                    say which kind of work costs the marks. */}
                <h3 className={styles.count}>By category</h3>
                <dl className={`${styles.meta} ${styles.categories}`}>
                  {AZURE_CATEGORIES.flatMap((category) => {
                    const entry = score.categoryScores[category]
                    return [
                      <dt key={`${category}-label`}>{AZURE_CATEGORY_LABELS[category]}</dt>,
                      <dd key={`${category}-value`}>
                        {entry.possible === 0
                          ? 'not scored in the console'
                          : `${entry.earned} / ${entry.possible}`}
                      </dd>,
                    ]
                  })}
                </dl>
                <ul className={styles.items}>
                  {score.items.map((item) => (
                    <li key={item.id} data-passed={item.passed}>
                      <span className="mark" aria-hidden="true">
                        {item.passed ? '✓' : '✗'}
                      </span>
                      <span>
                        {item.label}
                        <br />
                        <span className={styles.count}>{item.detail}</span>
                      </span>
                      <span className={styles.mono}>
                        {Math.round(item.earned)}/{Math.round(item.possible)}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className={styles.explain}>
                  {score.explanation.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <p className={styles.empty}>Choose a ticket to open it.</p>
        )}
      </section>
    </div>
  )
}
