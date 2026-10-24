import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ComplianceBadge, LifecycleBadge } from './Badges'
import { DeviceActions } from './DeviceActions'
import { IntuneNav } from './IntuneNav'
import { relativeTime, useIntune } from './useIntune'
import { registerIntuneTicketTemplates } from '../tickets/registry'
import { isIntuneTicketComplete } from '../tickets/registry'
import { INTUNE_CATEGORIES, INTUNE_CATEGORY_LABELS, type IntuneScore } from '../tickets/scoring'
import type { IntuneTicketTemplate } from '../tickets/templates'
import { appName } from '../logic/compliance'
import styles from './intune.module.css'

/**
 * The queue, filled through the module's registration function rather than by
 * importing the template list. That is the seam a future hub would use, so the
 * page exercises it instead of going around it.
 */
function useTicketQueue(): readonly IntuneTicketTemplate[] {
  return useMemo(() => {
    const collected: IntuneTicketTemplate[] = []
    registerIntuneTicketTemplates({ offer: (template) => collected.push(template) })
    return collected
  }, [])
}

export function IntuneTicketsPage() {
  const { state, error, busy, act, review, service } = useIntune()
  const templates = useTicketQueue()
  // A lesson deep-links to the ticket it teaches, so the queue can open on the
  // decision the module is about instead of asking the learner to find it. The
  // query is read when the page opens: from there, choosing a ticket is the
  // queue's own business.
  const [params] = useSearchParams()
  const [selectedId, setSelectedId] = useState<string | null>(() => params.get('template'))
  const [startedAt, setStartedAt] = useState<number>(() => Date.now())
  const [score, setScore] = useState<IntuneScore | null>(null)
  const [scoring, setScoring] = useState(false)
  /** What the console said when the record was read, for this attempt. */
  const [readSummary, setReadSummary] = useState<string | null>(null)

  const selected = templates.find((template) => template.id === selectedId) ?? null
  const device = selected ? state?.devices.find((entry) => entry.id === selected.deviceId) : undefined

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

  return (
    <div className={styles.page}>
      <header>
        <p className={styles.count}>Eight practice tickets · verified against the estate</p>
        <h1>Practice tickets</h1>
        <p className={styles.note}>
          Each ticket names a device in the console above. Work it from here — the
          actions are the same ones the device page offers — then check the work
          against the state the estate is actually in.
        </p>
      </header>

      <IntuneNav />

      {error ? (
        <p className={styles.empty} role="alert">
          {error}
        </p>
      ) : null}

      <section className={styles.section} aria-label="Ticket queue">
        <div className={styles.ticketList}>
          {templates.map((template) => {
            const complete = state ? isIntuneTicketComplete(template.id, state) : false
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
                <span className={styles.badge} data-tone={complete ? 'compliant' : 'not-evaluated'}>
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

            {device ? (
              <>
                <div className={styles.card}>
                  <h3>On the console</h3>
                  <p>
                    <Link className={styles.link} to={`/intune/devices/${device.id}`}>
                      {device.name}
                    </Link>{' '}
                    <ComplianceBadge state={device.compliance} />{' '}
                    <LifecycleBadge lifecycle={device.lifecycle} />
                  </p>
                  <dl className={styles.meta}>
                    <dt>Primary user</dt>
                    <dd>
                      {state.users.find((user) => user.id === device.ownerUserId)?.displayName ??
                        '—'}
                    </dd>
                    <dt>Last check-in</dt>
                    <dd>{relativeTime(device.lastCheckIn)}</dd>
                    <dt>Apps</dt>
                    <dd>
                      {device.apps.length === 0
                        ? 'none assigned'
                        : device.apps
                            .map(
                              (entry) =>
                                `${appName(state.apps, entry.appId)} (${entry.status})`,
                            )
                            .join(', ')}
                    </dd>
                  </dl>
                  {/* The read step: the console records that the reasons were
                      looked at, which is what diagnosis is scored from. */}
                  <div>
                    <button
                      type="button"
                      className={styles.button}
                      disabled={busy}
                      onClick={() => {
                        void review(device.id).then((summary) => {
                          if (summary) {
                            setReadSummary(summary)
                          }
                        })
                      }}
                    >
                      Read the device record
                    </button>
                    {readSummary ? (
                      <p className={styles.note} role="status">
                        {readSummary}
                      </p>
                    ) : null}
                  </div>
                </div>

                <DeviceActions
                  device={device}
                  users={state.users}
                  busy={busy}
                  onRun={(action, options) => act(device.id, action, options)}
                />
              </>
            ) : (
              <p className={styles.empty}>The device for this ticket is not in the estate.</p>
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
                  {INTUNE_CATEGORIES.flatMap((category) => {
                    const entry = score.categoryScores[category]
                    return [
                      <dt key={`${category}-label`}>{INTUNE_CATEGORY_LABELS[category]}</dt>,
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
