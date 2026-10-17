import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import {
  loadDebrief,
  startAttempt,
  type CategoryScoreKeys,
  type DebriefView,
} from '../../app/practiceService'
import { PageHeader } from '../components/PageHeader'
import styles from './practice.module.css'

const BAND_LABELS = {
  strong: 'Strong pass',
  pass: 'Pass',
  fail: 'Needs another attempt',
} as const

const CATEGORY_LABELS: Record<CategoryScoreKeys, string> = {
  diagnosis: 'Diagnostic reasoning',
  documentation: 'Documentation',
  resolution: 'Resolution',
  safety: 'Safety',
}

export function DebriefPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const [debrief, setDebrief] = useState<DebriefView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!sessionId) {
      return
    }
    loadDebrief(sessionId)
      .then((view) => {
        if (cancelled) {
          return
        }
        if (!view) {
          setError('That debrief could not be found. It may have been removed with a database reset.')
        }
        setDebrief(view)
        setLoading(false)
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'The debrief could not be loaded.')
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [sessionId])

  const onRetry = async () => {
    if (!debrief) {
      return
    }
    setRetrying(true)
    try {
      const workspace = await startAttempt(debrief.ticket.id)
      navigate(`/ticket/${workspace.sessionId}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The ticket could not be reopened.')
      setRetrying(false)
    }
  }

  if (loading) {
    return <p className={styles.muted}>Scoring the attempt…</p>
  }

  if (error || !debrief) {
    return (
      <div className={styles.centerPanel}>
        <h1 className={styles.centerTitle}>Debrief unavailable</h1>
        <p className={styles.muted}>{error}</p>
        <Link className={styles.secondaryButton} to="/practice">
          Back to the queue
        </Link>
      </div>
    )
  }

  const categories = Object.entries(debrief.categoryScores) as Array<
    [CategoryScoreKeys, { earned: number; possible: number }]
  >

  return (
    <>
      <PageHeader
        eyebrow={`${debrief.ticket.scenarioTitle} · ${debrief.ticket.variantLabel}`}
        title="Debrief"
        description="The scoring engine read your action log, notes, end state, and closure decision. Every point below is explained."
      />

      <div className={styles.debrief}>
        <section className={styles.scoreHero} aria-label="Score">
          <div>
            <div className={styles.scoreValue}>{debrief.total}</div>
            <span className={styles.scoreBand} data-band={debrief.band}>
              {BAND_LABELS[debrief.band]}
            </span>
          </div>
          <div className={styles.scoreMeta}>
            <span>
              Decision: <strong>{debrief.decision.code}</strong>
            </span>
            <span>
              XP: <strong>{debrief.xp}</strong>
            </span>
            <span>
              Ticket: <strong>{debrief.ticket.subject}</strong>
            </span>
            <span>
              Requester: <strong>{debrief.ticket.requester.name}</strong>
            </span>
          </div>
          <div className={styles.debriefActions}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => void onRetry()}
              disabled={retrying}
            >
              {retrying ? 'Reopening…' : 'Retry this ticket'}
            </button>
            <Link className={styles.secondaryButton} to="/practice">
              Back to the queue
            </Link>
          </div>
        </section>

        {debrief.criticalFailures.length > 0 ? (
          <p className={styles.error} role="alert">
            Critical steps missed: {debrief.criticalFailures.join('; ')}. The attempt cannot pass
            until those are done, even if the final state looked correct.
          </p>
        ) : null}

        <section className={styles.sectionBlock} aria-label="Category scores">
          <h2>By category</h2>
          <div className={styles.categoryGrid}>
            {categories.map(([category, score]) => {
              const percent = score.possible === 0 ? 0 : Math.round((score.earned / score.possible) * 100)
              return (
                <div key={category} className={styles.categoryCard}>
                  <h3>{CATEGORY_LABELS[category]}</h3>
                  <p className={styles.categoryValue}>
                    {score.earned}/{score.possible}
                  </p>
                  <div className={styles.bar}>
                    <div className={styles.barFill} style={{ width: `${percent}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <section className={styles.sectionBlock} aria-label="Rubric items">
          <h2>Rubric</h2>
          <ul className={styles.itemList}>
            {debrief.items.map((item) => (
              <li key={item.id} className={styles.item} data-passed={item.passed}>
                <div className={styles.itemHeader}>
                  <span className={styles.itemTitle}>
                    {item.passed ? '✓' : '✗'} {item.label}
                    {item.critical ? <span className={styles.criticalTag}>Critical</span> : null}
                  </span>
                  <span className={styles.itemWeight}>
                    {item.category} · {item.weight} pts
                  </span>
                </div>
                <p className={styles.itemWhy}>{item.why}</p>
                {!item.passed && item.hint ? (
                  <p className={styles.itemWhy}>Hint: {item.hint}</p>
                ) : null}
                <p className={styles.itemEvidence}>
                  {item.evidence.join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.sectionBlock} aria-label="Feedback">
          <h2>What to take away</h2>
          <ul className={styles.feedbackList}>
            {debrief.feedback.map((line, index) => (
              <li key={`${index}-${line.slice(0, 18)}`}>{line}</li>
            ))}
          </ul>
        </section>

        <section className={styles.sectionBlock} aria-label="Reference path">
          <h2>One clean path through this ticket</h2>
          <ol className={styles.referenceList}>
            {debrief.reference.map((step, index) => (
              <li key={`${index}-${step.label}`}>
                <span className={styles.referenceStep}>{String(index + 1).padStart(2, '0')}</span>
                <span>
                  {step.label}
                  {step.detail ? ` — ${step.detail}` : ''}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  )
}
