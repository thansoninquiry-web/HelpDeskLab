import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import {
  loadProgress,
  type HintHabitBand,
  type ProgressView,
} from '../../app/practiceService'
import { PageHeader } from '../components/PageHeader'
import styles from './practice.module.css'

/** The habit in the learner's words, matching the band the domain assigned. */
const HABIT_LABELS: Record<HintHabitBand, string> = {
  'bought-every-time': 'Always bought',
  'usually-bought': 'Usually bought',
  'sometimes-bought': 'Sometimes bought',
  'worked-alone': 'Worked alone',
}

function attemptCount(count: number): string {
  return `${count} attempt${count === 1 ? '' : 's'}`
}

function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

/** A step number as the debrief writes it, so mixed lists read in order. */
function stepNumber(index: number): string {
  return String(index + 1).padStart(2, '0')
}

function formatDate(ms: number | null): string {
  if (ms === null) {
    return '—'
  }
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function ProgressPage() {
  const [progress, setProgress] = useState<ProgressView | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    loadProgress()
      .then((view) => {
        if (!cancelled) {
          setProgress(view)
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'Progress could not be loaded.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return <p className={styles.error} role="alert">{error}</p>
  }

  if (!progress) {
    return <p className={styles.muted}>Reading your history…</p>
  }

  const passRate =
    progress.attempts === 0 ? 0 : Math.round((progress.passes / progress.attempts) * 100)
  const rankLine =
    progress.rank.nextTitle && progress.rank.nextAt !== null
      ? `${progress.rank.nextAt - progress.rank.xp} XP to ${progress.rank.nextTitle}`
      : 'Top rank reached'

  return (
    <>
      <PageHeader
        eyebrow="Progress"
        title="Progress"
        description="Every closed session is stored locally. Scores are immutable; a retry is a fresh attempt over the same ticket."
      />

      <div className={styles.progressStack}>
      {/* The record, read like a receipt: one figure, then the facts beside it. */}
      <section className={styles.progressSummary} aria-label="Record">
        <div className={styles.progressHero}>
          <span className={styles.progressHeroLabel}>Lifetime XP</span>
          <span className={styles.progressHeroValue}>{progress.totalXp}</span>
          <span className={styles.progressHeroNote}>
            Across {attemptCount(progress.attempts)}
          </span>
        </div>
        <dl className={styles.progressReceipt}>
          <div className={styles.progressRow}>
            <dt>Attempts</dt>
            <dd>{progress.attempts}</dd>
          </div>
          <div className={styles.progressRow}>
            <dt>Pass rate</dt>
            <dd>{passRate}%</dd>
          </div>
          <div className={styles.progressRow}>
            <dt>Best score</dt>
            <dd>{progress.bestScore}</dd>
          </div>
          <div className={styles.progressRow}>
            <dt>Average best</dt>
            <dd>{progress.averageBest}</dd>
          </div>
          <div className={styles.progressRow}>
            <dt>Streak</dt>
            <dd>
              {progress.streakDays} {progress.streakDays === 1 ? 'day' : 'days'}
            </dd>
          </div>
        </dl>
      </section>

      <section className={styles.rankPanel} aria-label="Rank">
        <div className={styles.sectionHeader}>
          <h2>Rank</h2>
          <span className={styles.sectionNote}>{progress.rank.percent}% through</span>
        </div>
        <div className={styles.rankHeading}>
          <span className={styles.rankTitle}>{progress.rank.title}</span>
          <span className={styles.rankMeta}>{rankLine}</span>
        </div>
        <div className={styles.rankMeter}>
          <div className={styles.rankMeterFill} style={{ width: `${progress.rank.percent}%` }} />
        </div>
      </section>

      <section className={styles.sectionBlock} aria-label="Focus next">
        <div className={styles.sectionHeader}>
          <h2>Focus next</h2>
          <span className={styles.sectionNote}>
            {progress.weakTopics.length === 0
              ? 'Nothing below 90'
              : countLabel(progress.weakTopics.length, 'family', 'families')}
          </span>
        </div>
        {progress.weakTopics.length === 0 ? (
          <p className={styles.emptyNote}>
            No weak spots yet. Once a family averages below 90, it appears here with the category
            that costs you the most marks.
          </p>
        ) : (
          <ul className={styles.focusList}>
            {progress.weakTopics.map((topic, index) => (
              <li key={topic.scenarioId} className={styles.focusRow}>
                <span className={styles.rowIndex}>{stepNumber(index)}</span>
                <div className={styles.focusMain}>
                  <span className={styles.focusTitle}>{topic.scenarioTitle}</span>
                  <span className={styles.focusDetail}>
                    {topic.attempts} attempt{topic.attempts === 1 ? '' : 's'} · average{' '}
                    <span className={styles.focusScore}>{topic.averageScore}</span> · {topic.passRate}% passed
                    {topic.weakestCategory
                      ? ` · weakest: ${topic.weakestCategory.label} (${topic.weakestCategory.earned}/${topic.weakestCategory.possible})`
                      : ''}
                  </span>
                  <span className={styles.focusDetail}>{topic.recommendation}</span>
                </div>
                <Link
                  className={styles.rowAction}
                  to={`/practice?family=${encodeURIComponent(topic.scenarioId)}`}
                >
                  Practise {topic.scenarioId}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.sectionBlock} aria-label="Hint habits">
        <div className={styles.sectionHeader}>
          <h2>Where you buy hints</h2>
          <span className={styles.sectionNote}>
            {progress.hintHabits.length === 0
              ? 'No scored steps'
              : countLabel(progress.hintHabits.length, 'step')}
          </span>
        </div>
        {progress.hintHabits.length === 0 ? (
          <p className={styles.emptyNote}>
            No scored step yet. Once a ticket is closed and scored, this shows which steps you
            bought hints for and which you worked out alone.
          </p>
        ) : (
          <>
            <p className={styles.sectionCopy}>
              Each hint is logged against the step it unstuck. You have taken{' '}
              {progress.hintHabitSummary.rungs} rung
              {progress.hintHabitSummary.rungs === 1 ? '' : 's'} on{' '}
              {progress.hintHabitSummary.everBought} of {progress.hintHabitSummary.steps} steps in{' '}
              {attemptCount(progress.hintHabitSummary.attempts)}; the other{' '}
              {progress.hintHabitSummary.workedAlone} steps you worked out alone.
            </p>
            <ul className={styles.habitList}>
              {progress.hintHabits.map((habit, index) => (
                <li key={habit.itemId} className={styles.habitRow} data-band={habit.band}>
                  <span className={styles.rowIndex}>{stepNumber(index)}</span>
                  <div className={styles.habitMain}>
                    <span className={styles.focusTitle}>{habit.label}</span>
                    <span className={styles.focusDetail}>
                      Bought in {habit.bought} of {attemptCount(habit.attempts)} ·{' '}
                      {habit.rungs} rung{habit.rungs === 1 ? '' : 's'} taken
                    </span>
                    <div className={styles.habitMeter}>
                      <div
                        className={styles.habitMeterFill}
                        style={{ width: `${habit.boughtPercent}%` }}
                      />
                    </div>
                  </div>
                  <span className={styles.habitBand}>{HABIT_LABELS[habit.band]}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {progress.targetRecommendations.length > 0 ? (
        <section className={styles.sectionBlock} aria-label="From your job targets">
          <div className={styles.sectionHeader}>
            <h2>From your job targets</h2>
            <span className={styles.sectionNote}>
              {countLabel(progress.targetRecommendations.length, 'recommendation')}
            </span>
          </div>
          <p className={styles.sectionCopy}>
            Weighted by how often your listings ask for a family and how much room you have to
            improve. Manage the listings on <Link to="/targets">Job targets</Link>.
          </p>
          <ul className={styles.focusList}>
            {progress.targetRecommendations.map((recommendation, index) => (
              <li key={recommendation.scenarioId} className={styles.focusRow}>
                <span className={styles.rowIndex}>{stepNumber(index)}</span>
                <div className={styles.focusMain}>
                  <span className={styles.focusTitle}>{recommendation.title}</span>
                  <span className={styles.focusDetail}>{recommendation.reason}</span>
                </div>
                <Link
                  className={styles.rowAction}
                  to={`/practice?family=${encodeURIComponent(recommendation.scenarioId)}`}
                >
                  Practise {recommendation.scenarioId}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className={styles.sectionBlock} aria-label="Scenario mastery">
        <div className={styles.sectionHeader}>
          <h2>By scenario</h2>
          <span className={styles.sectionNote}>
            {progress.rows.length === 0
              ? 'No scored attempts'
              : countLabel(progress.rows.length, 'family', 'families')}
          </span>
        </div>
        {progress.rows.length === 0 ? (
          <p className={styles.emptyNote}>
            No scored attempts yet. Resolve a ticket to see mastery, best scores, and review
            scheduling here.
          </p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.progressTable}>
              <thead>
                <tr>
                  <th scope="col">Scenario</th>
                  <th scope="col">Attempts</th>
                  <th scope="col">Passes</th>
                  <th scope="col">Best</th>
                  <th scope="col">Review box</th>
                  <th scope="col">Due</th>
                </tr>
              </thead>
              <tbody>
                {progress.rows.map((row) => (
                  <tr key={row.scenarioId}>
                    <td>
                      <span className={styles.rowName}>{row.scenarioTitle}</span>
                      <span className={styles.rowId}>{row.scenarioId}</span>
                    </td>
                    <td className={styles.numeric}>{row.attempts}</td>
                    <td className={styles.numeric}>{row.passes}</td>
                    <td className={styles.numeric}>{row.bestScore}</td>
                    <td className={styles.numeric}>{row.leitnerBox} / 5</td>
                    <td className={styles.due}>{formatDate(row.dueAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      </div>
    </>
  )
}
