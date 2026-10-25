import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { PageHeader } from '../../../ui/components/PageHeader'
import { listTopics, filterProblems } from '../logic/progress'
import type { DsaDifficulty } from '../types'
import { useDsaOverview } from './useDsa'
import styles from './dsa.module.css'

const DIFFICULTY_LABELS: Record<DsaDifficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
}

const DIFFICULTY_FILTERS = [
  { value: 'all', label: 'Every difficulty' },
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
] as const

/**
 * The library.
 *
 * The counts come from the attempts table rather than from a flag on a problem,
 * so clearing an attempt — or importing an older backup — moves the number.
 */
export function DsaProblemsPage() {
  const { overview, error } = useDsaOverview()
  const [query, setQuery] = useState('')
  const [difficulty, setDifficulty] = useState<string>('all')
  const [topic, setTopic] = useState<string>('all')
  const [unsolvedOnly, setUnsolvedOnly] = useState(false)

  const topics = useMemo(
    () => (overview ? listTopics(overview.problems) : []),
    [overview],
  )

  const shown = useMemo(() => {
    if (!overview) return []
    return filterProblems(overview, { query, difficulty, topic, unsolvedOnly })
  }, [overview, query, difficulty, topic, unsolvedOnly])

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Practice · algorithm drills"
        title="Algorithm practice"
        description="Read the cue, choose the approach and its cost, name the edge case that breaks it, then write the answer out. This is a decision drill: nothing is executed, and the two reference solutions are what you check against."
      />

      {error ? (
        <p className={styles.empty} role="alert">
          {error}
        </p>
      ) : null}

      {!overview ? (
        <p className={styles.empty}>Opening the problem bank…</p>
      ) : (
        <>
          <p className={styles.summary} role="status" aria-live="polite">
            <strong>{overview.solved}</strong> of {overview.total} solved ·{' '}
            {overview.attempted} attempted · {overview.total - overview.attempted} untouched
          </p>

          <p className={styles.helpLine}>
            New to a cue? <Link to="/dsa/patterns">The pattern sheet</Link> lists what each
            one licenses and what it costs.
          </p>

          <div className={styles.filters}>
            <label className={styles.field}>
              <span>Search</span>
              <input
                type="search"
                value={query}
                placeholder="Title, topic or idea"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>Difficulty</span>
              <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
                {DIFFICULTY_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Topic</span>
              <select value={topic} onChange={(event) => setTopic(event.target.value)}>
                <option value="all">Every topic</option>
                {topics.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={unsolvedOnly}
                onChange={(event) => setUnsolvedOnly(event.target.checked)}
              />
              Unsolved only
            </label>
          </div>

          {shown.length === 0 ? (
            <p className={styles.empty}>No problem matches those filters.</p>
          ) : (
            <ul className={styles.list} aria-label="Problems">
              {shown.map((problem) => {
                const progress = overview.progress[problem.id]
                const status = progress?.solved
                  ? 'Solved'
                  : progress
                    ? 'Attempted'
                    : 'Not started'
                return (
                  <li className={styles.card} key={problem.id}>
                    <div className={styles.cardTop}>
                      <Link className={styles.cardTitle} to={`/dsa/${problem.id}`}>
                        {problem.title}
                      </Link>
                      <span
                        className={`${styles.badge} ${styles[problem.difficulty]}`}
                      >
                        {DIFFICULTY_LABELS[problem.difficulty]}
                      </span>
                    </div>
                    <p className={styles.cardSummary}>{problem.summary}</p>
                    <div className={styles.cardMeta}>
                      <span
                        className={styles.status}
                        data-status={status.toLowerCase().replace(' ', '-')}
                      >
                        {status}
                      </span>
                      <span className={styles.topics}>{problem.topics.join(' · ')}</span>
                      {progress ? (
                        <span className={styles.attempts}>
                          {progress.attempts}{' '}
                          {progress.attempts === 1 ? 'attempt' : 'attempts'}
                        </span>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
