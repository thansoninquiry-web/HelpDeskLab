import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'
import {
  createJobTarget,
  createShareSafeExport,
  deleteJobTarget,
  JOB_STATUSES,
  loadTargetsOverview,
  updateJobTargetStatus,
  type JobStatus,
  type JobTargetInput,
  type JobTargetView,
  type TargetsOverview,
} from '../../app/targetsService'
import { PageHeader } from '../components/PageHeader'
import styles from './targets.module.css'

const STATUS_LABELS: Record<JobStatus, string> = {
  researching: 'Researching',
  applied: 'Applied',
  interviewing: 'Interviewing',
  offer: 'Offer',
  closed: 'Closed',
}

const EMPTY_FORM: JobTargetInput = {
  company: '',
  title: '',
  url: '',
  appliedOn: '',
  status: 'applied',
  rawDescription: '',
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function JobTargetsPage() {
  const [overview, setOverview] = useState<TargetsOverview | null>(null)
  const [form, setForm] = useState<JobTargetInput>({ ...EMPTY_FORM, appliedOn: today() })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [exportNote, setExportNote] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | JobStatus>('all')

  useEffect(() => {
    let cancelled = false
    loadTargetsOverview()
      .then((value) => {
        if (!cancelled) {
          setOverview(value)
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'Your targets could not be loaded.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const reload = async () => {
    setOverview(await loadTargetsOverview())
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setExportNote(null)
    try {
      await createJobTarget(form)
      setForm({ ...EMPTY_FORM, appliedOn: today() })
      await reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That listing could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  const onStatus = async (target: JobTargetView, status: string) => {
    setError(null)
    try {
      await updateJobTargetStatus(target.id, status)
      await reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That status could not be saved.')
    }
  }

  const onDelete = async (target: JobTargetView) => {
    if (!window.confirm(`Delete the ${target.title} listing at ${target.company}?`)) {
      return
    }
    setError(null)
    try {
      await deleteJobTarget(target.id)
      await reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That listing could not be deleted.')
    }
  }

  const onExport = async () => {
    setError(null)
    try {
      const file = await createShareSafeExport()
      const blob = new Blob([file.contents], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = file.filename
      anchor.click()
      URL.revokeObjectURL(url)
      setExportNote(`Exported ${file.listings} listing${file.listings === 1 ? '' : 's'} without any pasted text.`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The export could not be created.')
    }
  }

  const targets = overview?.targets ?? []
  const visible = filter === 'all' ? targets : targets.filter((target) => target.status === filter)
  const requested = overview?.coverage.filter((skill) => skill.listings > 0) ?? []
  const covered = requested.filter((skill) => skill.covered)

  return (
    <>
      <PageHeader
        eyebrow="Job targets"
        title="Job Targets"
        description="Paste the listings you are chasing. The text stays in this browser's database; the skills are extracted locally, with no model and no network call."
      />

      <div className={styles.notice} role="note">
        Listing text is stored only in your local database. Use <strong>Export for sharing</strong> to
        download a copy with every pasted description removed. Never commit a listing to the repo or
        paste it into a public issue.
      </div>

      <form className={styles.form} onSubmit={(event) => void onSubmit(event)}>
        <h2 className={styles.formTitle}>Add a listing</h2>
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span>Company</span>
            <input
              value={form.company}
              onChange={(event) => setForm({ ...form, company: event.target.value })}
              placeholder="Northwind Support"
              required
            />
          </label>
          <label className={styles.field}>
            <span>Job title</span>
            <input
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="Tier 1 Service Desk Analyst"
              required
            />
          </label>
          <label className={styles.field}>
            <span>Listing URL</span>
            <input
              type="url"
              value={form.url}
              onChange={(event) => setForm({ ...form, url: event.target.value })}
              placeholder="https://example.com/jobs/1234"
            />
          </label>
          <label className={styles.field}>
            <span>Date applied</span>
            <input
              type="date"
              value={form.appliedOn}
              onChange={(event) => setForm({ ...form, appliedOn: event.target.value })}
            />
          </label>
          <label className={styles.field}>
            <span>Status</span>
            <select
              value={form.status}
              onChange={(event) => setForm({ ...form, status: event.target.value })}
            >
              {JOB_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className={styles.field}>
          <span>Listing text</span>
          <textarea
            className={styles.descriptionInput}
            rows={6}
            value={form.rawDescription}
            onChange={(event) => setForm({ ...form, rawDescription: event.target.value })}
            placeholder="Paste the responsibilities and requirements here. This text is never included in the sharing export."
            required
          />
        </label>
        <div className={styles.formActions}>
          <button type="submit" className={styles.primaryButton} disabled={busy}>
            {busy ? 'Saving…' : 'Save listing'}
          </button>
          <span className={styles.mutedSmall}>
            Nothing is uploaded. Skills are matched from a fixed list of keywords.
          </span>
        </div>
      </form>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      {overview && overview.targets.length > 0 ? (
        <section className={styles.section} aria-label="Skills coverage">
          <div className={styles.sectionHeader}>
            <h2>Skills coverage</h2>
            <span className={styles.count}>
              {requested.length} requested · {covered.length} practised here
            </span>
          </div>

          {overview.recommendations.length > 0 ? (
            <div className={styles.focusRow}>
              <span className={styles.focusLabel}>Practice focus</span>
              {overview.recommendations.map((recommendation) => (
                <Link
                  key={recommendation.scenarioId}
                  className={styles.focusChip}
                  to={`/practice?family=${encodeURIComponent(recommendation.scenarioId)}`}
                >
                  {recommendation.scenarioId} · {recommendation.reason}
                </Link>
              ))}
            </div>
          ) : null}

          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Skill</th>
                <th scope="col">Listings</th>
                <th scope="col">Practised in</th>
              </tr>
            </thead>
            <tbody>
              {requested.map((skill) => (
                <tr key={skill.skill}>
                  <td>{skill.label}</td>
                  <td>{skill.listings}</td>
                  <td>
                    {skill.covered ? (
                      <span className={styles.covered}>{skill.families.join(', ')}</span>
                    ) : (
                      <span className={styles.uncovered}>Not covered yet</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={styles.mutedSmall}>
            A skill counts as practised when a scenario family exercises its tools or its documentation
            and communication steps.
          </p>
        </section>
      ) : null}

      <section className={styles.section} aria-label="Saved listings">
        <div className={styles.sectionHeader}>
          <h2>Saved listings</h2>
          <div className={styles.sectionActions}>
            <label className={styles.filter}>
              <span>Status</span>
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value as 'all' | JobStatus)}
              >
                <option value="all">All</option>
                {JOB_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => void onExport()}
              disabled={targets.length === 0}
            >
              Export for sharing
            </button>
          </div>
        </div>

        {exportNote ? <p className={styles.success}>{exportNote}</p> : null}

        {targets.length === 0 ? (
          <p className={styles.muted}>
            No listings yet. Paste one above to see which skills it asks for and which families to
            practise next.
          </p>
        ) : visible.length === 0 ? (
          <p className={styles.muted}>No listings with that status.</p>
        ) : (
          <ul className={styles.listings}>
            {visible.map((target) => (
              <li key={target.id} className={styles.listing}>
                <div className={styles.listingHeader}>
                  <div>
                    <h3 className={styles.listingTitle}>{target.title}</h3>
                    <p className={styles.listingMeta}>
                      {target.company}
                      {target.appliedOn ? ` · applied ${target.appliedOn}` : ''}
                    </p>
                  </div>
                  <div className={styles.listingActions}>
                    <select
                      className={styles.statusSelect}
                      aria-label={`Status for ${target.title}`}
                      value={target.status}
                      onChange={(event) => void onStatus(target, event.target.value)}
                    >
                      {JOB_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {STATUS_LABELS[status]}
                        </option>
                      ))}
                    </select>
                    {target.url ? (
                      <a
                        className={styles.secondaryButton}
                        href={target.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open listing
                      </a>
                    ) : null}
                    <button
                      type="button"
                      className={styles.deleteButton}
                      onClick={() => void onDelete(target)}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <p className={styles.preview}>{target.descriptionPreview}</p>

                <div className={styles.chipRow}>
                  {target.skills.length === 0 ? (
                    <span className={styles.mutedSmall}>
                      No known keywords matched. That usually means the listing is very short or uses
                      different vocabulary.
                    </span>
                  ) : (
                    target.skills.map((skill) => (
                      <span key={skill.id} className={styles.chip}>
                        {skill.label}
                        <span className={styles.chipCount}>{skill.mentions}</span>
                      </span>
                    ))
                  )}
                </div>

                {target.families.length > 0 ? (
                  <div className={styles.familyRow}>
                    <span className={styles.familyLabel}>Practise:</span>
                    {target.families.map((family) => (
                      <Link
                        key={family.scenarioId}
                        className={styles.familyLink}
                        to={`/practice?family=${encodeURIComponent(family.scenarioId)}`}
                      >
                        {family.scenarioId}
                      </Link>
                    ))}
                  </div>
                ) : null}

                {target.questions.length > 0 ? (
                  <details className={styles.interview}>
                    <summary>
                      Interview prep · {target.questions.length}{' '}
                      {target.questions.length === 1 ? 'question' : 'questions'}
                    </summary>
                    <ol className={styles.questions}>
                      {target.questions.map((question) => (
                        <li key={question.id}>
                          <p className={styles.question}>{question.question}</p>
                          <p className={styles.tests}>
                            <span>What this tests:</span> {question.tests}
                          </p>
                        </li>
                      ))}
                    </ol>
                    <p className={styles.mutedSmall}>
                      Questions are generated from fixed templates for the skills above. They are
                      practice prompts, not predictions.
                    </p>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
