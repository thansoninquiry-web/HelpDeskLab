import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import {
  loadProgress,
  type HintHabitBand,
  type ProgressView,
  type RewindBand,
  type SimulatorId,
} from '../../app/practiceService'
import { loadProgressSection, saveProgressSection } from '../../app/settingsService'
import { PageHeader } from '../components/PageHeader'
import { useSettledFlush } from '../components/useSettledFlush'
import styles from './practice.module.css'
import { sectionAt } from './sectionSpy'

/** The habit in the learner's words, matching the band the domain assigned. */
const HABIT_LABELS: Record<HintHabitBand, string> = {
  'bought-every-time': 'Always bought',
  'usually-bought': 'Usually bought',
  'sometimes-bought': 'Sometimes bought',
  'worked-alone': 'Worked alone',
}

/** How heavily a family gets rewound, in the learner's words. */
const REWIND_LABELS: Record<RewindBand, string> = {
  heavy: 'Heavy',
  some: 'Sometimes',
  rare: 'Rarely',
}

/** The simulators a scored attempt can come from, in the learner's words. */
const SIMULATOR_LABELS: Record<SimulatorId, string> = {
  'service-desk': 'Service desk',
  intune: 'Intune',
  azure: 'Azure',
  netlab: 'Networking lab',
  desktop: 'Desktop support',
}

const SIMULATOR_FILTERS: ReadonlyArray<{ value: SimulatorId | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'service-desk', label: SIMULATOR_LABELS['service-desk'] },
  { value: 'intune', label: SIMULATOR_LABELS.intune },
  { value: 'azure', label: SIMULATOR_LABELS.azure },
  { value: 'netlab', label: SIMULATOR_LABELS.netlab },
  { value: 'desktop', label: SIMULATOR_LABELS.desktop },
]

/**
 * The filter both merged lists share. It is rendered twice — over the weak
 * topics and over the scenario table — because the two sections sit far apart on
 * the page, and one control at the top would be off screen by the time either is
 * read. Both read the same state, so they cannot disagree.
 */
function SimulatorFilter({
  label,
  value,
  onChange,
}: {
  label: string
  value: SimulatorId | 'all'
  onChange: (next: SimulatorId | 'all') => void
}) {
  return (
    <div className={styles.simulatorFilter} role="group" aria-label={label}>
      {SIMULATOR_FILTERS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={styles.simulatorFilterButton}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
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

/**
 * The page's own sections, in the order they are read, under the ids a stored
 * reading is kept by. The ids are the contract with the settings table: one that
 * is not in this map is a section this build no longer has, and the page opens at
 * the top rather than at nothing.
 */
const PROGRESS_SECTIONS = {
  record: 'progress-record',
  rank: 'progress-rank',
  focus: 'progress-focus',
  hints: 'progress-hints',
  verification: 'progress-verification',
  rewinds: 'progress-rewinds',
  targets: 'progress-targets',
  scenarios: 'progress-scenarios',
} as const

/** Read order, which is document order: the spy walks it from the top. */
const SECTION_ORDER: readonly string[] = Object.values(PROGRESS_SECTIONS)

/**
 * Where the reading line sits, in viewport pixels: below the header, so a section
 * whose heading is just under it counts as the one being read rather than as the
 * one above it.
 */
const READING_LINE = 96

/**
 * How long the page has to hold still before the section is written. A scroll is
 * a journey, and only where it comes to rest is worth a row.
 */
const READ_SETTLE_MS = 400

export function ProgressPage() {
  const [progress, setProgress] = useState<ProgressView | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Which simulator's scenarios the two merged lists show. */
  const [simulator, setSimulator] = useState<SimulatorId | 'all'>('all')
  /** The section the scroll has landed on, as last read. */
  const readingSection = useRef<string | null>(null)
  /** The section this visit was opened on, before anything was read. */
  const storedSection = useRef<string | null>(null)
  /** What the settings table already holds, so a resting scroll costs no write. */
  const savedSection = useRef<string | null>(null)
  /** False until the stored section is back, so arriving cannot overwrite it. */
  const restoredSection = useRef(false)
  /** Counts changes of section, which is what arms the settle timer. */
  const [sectionRevision, setSectionRevision] = useState(0)

  useEffect(() => {
    let cancelled = false
    // The section is read with the history, so the page first paints where it was
    // left rather than at the top. A reading that will not load is no reading: a
    // preference must never keep the history from showing.
    Promise.all([loadProgress(), loadProgressSection().catch(() => null)])
      .then(([view, section]) => {
        if (!cancelled) {
          storedSection.current = section
          savedSection.current = section
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

  /**
   * The page comes back where it was left: once the history is on screen, the
   * section being read is scrolled to. Nothing is written until this has happened,
   * because a page at the top looks exactly like a restore that has not run yet.
   */
  useEffect(() => {
    if (!progress || restoredSection.current) {
      return
    }
    restoredSection.current = true
    const id = storedSection.current
    const target = id === null ? null : document.getElementById(id)
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'start' })
    }
  }, [progress])

  /**
   * What is being read comes from where the sections sit, not from a timer: a
   * scroll that stops between two headings is still on the one above it.
   */
  useEffect(() => {
    if (!progress) {
      return
    }
    const read = () => {
      if (!restoredSection.current) {
        return
      }
      const id = sectionAt(
        SECTION_ORDER.map((sectionId) => ({
          id: sectionId,
          top:
            document.getElementById(sectionId)?.getBoundingClientRect().top ??
            Number.POSITIVE_INFINITY,
        })),
        READING_LINE,
      )
      if (id === null || id === readingSection.current) {
        return
      }
      readingSection.current = id
      setSectionRevision((revision) => revision + 1)
    }
    window.addEventListener('scroll', read, { passive: true })
    return () => window.removeEventListener('scroll', read)
  }, [progress])

  const flushSection = useCallback(() => {
    const id = readingSection.current
    if (id === null || id === savedSection.current) {
      return
    }
    savedSection.current = id
    void saveProgressSection(id).catch(() => {})
  }, [])

  useSettledFlush(flushSection, {
    value: sectionRevision,
    resting: true,
    delayMs: READ_SETTLE_MS,
  })

  if (error) {
    return <p className={styles.error} role="alert">{error}</p>
  }

  if (!progress) {
    return <p className={styles.muted}>Reading your history…</p>
  }

  const visibleTopics =
    simulator === 'all'
      ? progress.weakTopics
      : progress.weakTopics.filter((topic) => topic.simulator === simulator)
  const visibleRows =
    simulator === 'all'
      ? progress.rows
      : progress.rows.filter((row) => row.simulator === simulator)
  const filterNote = simulator === 'all' ? '' : ` · ${SIMULATOR_LABELS[simulator]} only`
  const passRate =
    progress.attempts === 0 ? 0 : Math.round((progress.passes / progress.attempts) * 100)
  const habits = progress.hintHabitSummary
  // What the learner actually paid: the rungs the rows can place, plus the ones
  // the scores charged whose hint the log no longer holds.
  const rungsTaken = habits.rungs + habits.unaccountedRungs
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
      <section
        id={PROGRESS_SECTIONS.record}
        className={styles.progressSummary}
        aria-label="Record"
      >
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

      <section id={PROGRESS_SECTIONS.rank} className={styles.rankPanel} aria-label="Rank">
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

      <section
        id={PROGRESS_SECTIONS.focus}
        className={styles.sectionBlock}
        aria-label="Focus next"
      >
        <div className={styles.sectionHeader}>
          <h2>Focus next</h2>
          <div className={styles.sectionTools}>
            <span className={styles.sectionNote}>
              {visibleTopics.length === 0
                ? 'Nothing below 90'
                : countLabel(visibleTopics.length, 'family', 'families')}
              {filterNote}
            </span>
            <SimulatorFilter
              label="Focus next simulator filter"
              value={simulator}
              onChange={setSimulator}
            />
          </div>
        </div>
        {visibleTopics.length === 0 ? (
          <p className={styles.emptyNote}>
            {simulator === 'all'
              ? 'No weak spots yet. Once a family averages below 90, it appears here with the category that costs you the most marks.'
              : `No ${SIMULATOR_LABELS[simulator]} scenario is below 90 right now.`}
          </p>
        ) : (
          <ul className={styles.focusList}>
            {visibleTopics.map((topic, index) => (
              <li key={topic.scenarioId} className={styles.focusRow}>
                <span className={styles.rowIndex}>{stepNumber(index)}</span>
                <div className={styles.focusMain}>
                  <span className={styles.focusTitle}>
                    {topic.scenarioTitle}{' '}
                    <span className={styles.simulatorTag}>
                      {SIMULATOR_LABELS[topic.simulator]}
                    </span>
                  </span>
                  <span className={styles.focusDetail}>
                    {topic.attempts} attempt{topic.attempts === 1 ? '' : 's'} · average{' '}
                    <span className={styles.focusScore}>{topic.averageScore}</span> · {topic.passRate}% passed
                    {topic.weakestCategory
                      ? ` · weakest: ${topic.weakestCategory.label} (${topic.weakestCategory.earned}/${topic.weakestCategory.possible})`
                      : ''}
                  </span>
                  <span className={styles.focusDetail}>{topic.recommendation}</span>
                </div>
                <Link className={styles.rowAction} to={topic.href}>
                  {topic.actionLabel}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        id={PROGRESS_SECTIONS.hints}
        className={styles.sectionBlock}
        aria-label="Hint habits"
      >
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
              Each hint is logged against the step it unstuck. You have taken {rungsTaken} rung
              {rungsTaken === 1 ? '' : 's'} on {habits.everBought} of {habits.steps} steps in{' '}
              {attemptCount(habits.attempts)}; the other {habits.workedAlone} steps you worked out
              alone.
            </p>
            {habits.unaccountedRungs > 0 ? (
              <p className={styles.emptyNote}>
                {countLabel(habits.unaccountedRungs, 'rung')} of those{' '}
                {habits.unaccountedRungs === 1 ? 'was' : 'were'} charged on{' '}
                {attemptCount(habits.attemptsWithUnaccountedHints)} whose action log no longer holds
                the hint itself, so no row below can place{' '}
                {habits.unaccountedRungs === 1 ? 'it' : 'them'}. The scores are what you paid; the
                log is where each rung landed, and the log is the one that is short.
              </p>
            ) : null}
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

      <section
        id={PROGRESS_SECTIONS.verification}
        className={styles.sectionBlock}
        aria-label="How you verify callers"
      >
        <div className={styles.sectionHeader}>
          <h2>How you verify callers</h2>
          <span className={styles.sectionNote}>
            {progress.verificationHabits.length === 0
              ? 'No checks yet'
              : countLabel(progress.verificationHabits.length, 'method')}
          </span>
        </div>
        {progress.verificationHabits.length === 0 ? (
          <p className={styles.emptyNote}>
            No caller check yet. Send a code, ring someone back, or check a badge at the desk,
            and this shows which proof you reach for and whether it proved who was on the line.
          </p>
        ) : (
          <>
            <p className={styles.sectionCopy}>
              Every caller check in your logs, by the method you chose.{' '}
              {progress.verificationSummary.proved} of{' '}
              {countLabel(progress.verificationSummary.checks, 'check')} proved who was on the
              line
              {progress.verificationSummary.proved === progress.verificationSummary.checks
                ? '.'
                : `; the other ${countLabel(
                    progress.verificationSummary.checks - progress.verificationSummary.proved,
                    'check',
                  )} did not, which is what a failed read-back or a colleague answering a shared line looks like.`}
            </p>
            <ul className={styles.habitList}>
              {progress.verificationHabits.map((row, index) => (
                <li key={row.method} className={styles.habitRow}>
                  <span className={styles.rowIndex}>{stepNumber(index)}</span>
                  <div className={styles.habitMain}>
                    <span className={styles.focusTitle}>{row.label}</span>
                    <span className={styles.focusDetail}>
                      {countLabel(row.checks, 'check')} in {attemptCount(row.attempts)} ·{' '}
                      {row.proved} proved the caller · {row.failed} did not
                    </span>
                    <div className={styles.habitMeter}>
                      <div
                        className={styles.habitMeterFill}
                        style={{ width: `${row.provedPercent}%` }}
                      />
                    </div>
                  </div>
                  <span className={styles.habitBand}>{row.provedPercent}% proved</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section
        id={PROGRESS_SECTIONS.rewinds}
        className={styles.sectionBlock}
        aria-label="Rewinds"
      >
        <div className={styles.sectionHeader}>
          <h2>Where you un-run</h2>
          <span className={styles.sectionNote}>
            {progress.familyRewinds.length === 0
              ? 'No rewinds'
              : countLabel(progress.familyRewinds.length, 'family', 'families')}
          </span>
        </div>
        {progress.familyRewinds.length === 0 ? (
          <p className={styles.emptyNote}>
            No rewinds yet. When you un-run a step, this shows the step you keep backing out of and
            the family you back out of it on.
          </p>
        ) : (
          <>
            <p className={styles.sectionCopy}>
              A rewind un-runs the step you are on and everything after it, so the step a cut starts
              at is the one to look at. Across{' '}
              {countLabel(progress.rewindSummary.rewinds, 'cut')} on{' '}
              {attemptCount(progress.rewindSummary.attemptsWithRewind)} you have un-run{' '}
              {countLabel(progress.rewindSummary.stepsUnrun, 'step')}.
            </p>
            <ul className={styles.habitList}>
              {progress.familyRewinds.map((row, index) => (
                <li key={row.scenarioId} className={styles.habitRow} data-band={row.band}>
                  <span className={styles.rowIndex}>{stepNumber(index)}</span>
                  <div className={styles.habitMain}>
                    <span className={styles.focusTitle}>{row.scenarioTitle}</span>
                    <span className={styles.focusDetail}>
                      {countLabel(row.rewinds, 'rewind')} in{' '}
                      {attemptCount(row.attempts)} ·{' '}
                      {countLabel(row.stepsUnrun, 'step')} un-run
                    </span>
                    <div className={styles.habitMeter}>
                      <div
                        className={styles.habitMeterFill}
                        style={{ width: `${row.rewindPercent}%` }}
                      />
                    </div>
                    <span className={styles.focusDetail}>
                      {row.worstStep
                        ? `Most un-run: ${row.worstStep.label} (${row.worstStep.times} of ${row.rewinds})`
                        : 'No single step stands out yet.'}
                    </span>
                  </div>
                  <div className={styles.rewindAside}>
                    <span className={styles.habitBand}>
                      {REWIND_LABELS[row.band]} · {row.rewindPercent}%
                    </span>
                    <Link
                      className={styles.rowAction}
                      to={`/practice?family=${encodeURIComponent(row.scenarioId)}`}
                    >
                      Practice {row.scenarioId}
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {progress.targetRecommendations.length > 0 ? (
        <section
          id={PROGRESS_SECTIONS.targets}
          className={styles.sectionBlock}
          aria-label="From your job targets"
        >
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
                  Practice {recommendation.scenarioId}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section
        id={PROGRESS_SECTIONS.scenarios}
        className={styles.sectionBlock}
        aria-label="Scenario mastery"
      >
        <div className={styles.sectionHeader}>
          <h2>By scenario</h2>
          <div className={styles.sectionTools}>
            <span className={styles.sectionNote}>
              {visibleRows.length === 0
                ? 'No scored attempts'
                : countLabel(visibleRows.length, 'family', 'families')}
              {filterNote}
            </span>
            <SimulatorFilter
              label="Scenario simulator filter"
              value={simulator}
              onChange={setSimulator}
            />
          </div>
        </div>
        {visibleRows.length === 0 ? (
          <p className={styles.emptyNote}>
            {simulator === 'all'
              ? 'No scored attempts yet. Resolve a ticket to see mastery, best scores, and review scheduling here.'
              : `No ${SIMULATOR_LABELS[simulator]} scenario has been scored yet.`}
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
                {visibleRows.map((row) => (
                  <tr key={row.scenarioId}>
                    <td>
                      {row.href ? (
                        <Link className={styles.rowName} to={row.href}>
                          {row.scenarioTitle}
                        </Link>
                      ) : (
                        <span className={styles.rowName}>{row.scenarioTitle}</span>
                      )}
                      <span className={styles.rowId}>
                        {row.scenarioId}
                        <span className={styles.simulatorTag}>
                          {SIMULATOR_LABELS[row.simulator]}
                        </span>
                      </span>
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
