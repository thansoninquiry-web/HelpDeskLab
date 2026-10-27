import { Link, useParams } from 'react-router'
import {
  lessonEntries,
  nextLesson,
  nextPracticeItem,
  practiceEntries,
} from '../logic/progress'
import type { PracticeLevel } from '../types'
import { formatDay, useLanguageTrack } from './useLanguages'
import styles from './languages.module.css'

const LEVEL_LABELS: Record<PracticeLevel, string> = {
  'warm-up': 'Warm-up',
  core: 'Core',
  sharp: 'Sharp',
}

/**
 * One track: its lessons in reading order, its drills in the order they build.
 *
 * Both lists are ordered by the content rather than by progress — a lesson
 * marked read stays where it is, so the shape of the course does not move while
 * the learner works through it.
 */
export function LanguageTrackPage() {
  const { trackId } = useParams<{ trackId: string }>()
  const { view, notFound, error } = useLanguageTrack(trackId)

  if (notFound) {
    return (
      <div className={styles.page}>
        <h1>No such track</h1>
        <p className={styles.empty}>
          That language is not in the lab. <Link to="/languages">Back to the tracks</Link>.
        </p>
      </div>
    )
  }

  if (!view) {
    return (
      <div className={styles.page}>
        <p className={styles.empty} role="status">
          {error ?? 'Opening the track…'}
        </p>
      </div>
    )
  }

  const { track, progress, reads, attempts } = view
  const lessons = lessonEntries(track, reads)
  const practice = practiceEntries(track, attempts)
  const readingTarget = nextLesson(track, reads)
  const practiceTarget = nextPracticeItem(track, attempts)
  const readingLabel =
    progress.lessonsRead === 0
      ? 'Start reading'
      : progress.lessonsRead === progress.lessonsTotal
        ? 'Read it again'
        : 'Continue reading'
  const practiceLabel =
    progress.practiceSolved === 0
      ? 'Start practicing'
      : progress.practiceSolved === progress.practiceTotal
        ? 'Practice again'
        : 'Continue practicing'

  return (
    <div className={styles.page}>
      <p className={styles.back}>
        <Link to="/languages">← All tracks</Link>
      </p>

      <header className={styles.header}>
        <h1>{track.name}</h1>
        <p className={styles.runtime}>{track.runtime}</p>
        <p className={styles.summary}>{track.blurb}</p>
      </header>

      {error ? (
        <p className={styles.empty} role="alert">
          {error}
        </p>
      ) : null}

      <p className={styles.progressLine} role="status" aria-live="polite">
        {progress.lessonsRead}/{progress.lessonsTotal} lessons read ·{' '}
        {progress.practiceSolved}/{progress.practiceTotal} drills solved
      </p>

      <div className={styles.startActions}>
        <Link
          className={styles.primaryButton}
          to={`/languages/${track.id}/lessons/${readingTarget.id}`}
        >
          {readingLabel}
        </Link>
        <Link
          className={styles.primaryButton}
          to={`/languages/${track.id}/practice/${practiceTarget.id}`}
        >
          {practiceLabel}
        </Link>
        {/* One drill is a single decision; a run is the whole track's drills in
            order, with a tally at the end — the way the material is rehearsed. */}
        <Link className={styles.primaryButton} to={`/languages/${track.id}/run`}>
          Run the drills
        </Link>
      </div>

      <section className={styles.section} aria-labelledby="track-goals">
        <h2 id="track-goals" className={styles.heading}>
          What this track leaves you able to do
        </h2>
        <ul className={styles.goals}>
          {track.canDo.map((goal) => (
            <li key={goal}>{goal}</li>
          ))}
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="track-lessons">
        <h2 id="track-lessons" className={styles.heading}>
          Lessons
        </h2>
        <ol className={styles.rows}>
          {lessons.map(({ lesson, readAt }, index) => (
            <li key={lesson.id} className={styles.row}>
              <div className={styles.rowTop}>
                <h3 className={styles.rowTitle}>
                  <Link to={`/languages/${track.id}/lessons/${lesson.id}`}>
                    {index + 1}. {lesson.title}
                  </Link>
                </h3>
                <span className={styles.rowMeta}>
                  {lesson.minutes} min{readAt ? ` · read ${formatDay(readAt)}` : ''}
                </span>
              </div>
              <p className={styles.rowSummary}>{lesson.summary}</p>
              <p className={styles.rowState} data-state={readAt ? 'done' : 'open'}>
                {readAt ? 'Read' : 'Not read yet'}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.section} aria-labelledby="track-practice">
        <h2 id="track-practice" className={styles.heading}>
          Practice
        </h2>
        <p className={styles.sectionNote}>
          Each drill shows one snippet and asks what the runtime does with it. The answer is a
          fact, and every wrong option is explained after you answer.
        </p>
        <ul className={styles.rows}>
          {practice.map(({ item, attempts: tries, solved, lastAttemptAt }) => (
            <li key={item.id} className={styles.row}>
              <div className={styles.rowTop}>
                <h3 className={styles.rowTitle}>
                  <Link to={`/languages/${track.id}/practice/${item.id}`}>{item.title}</Link>
                </h3>
                <span className={styles.rowMeta}>
                  {LEVEL_LABELS[item.level]} · {item.topic}
                </span>
              </div>
              <p className={styles.rowSummary}>{item.question}</p>
              <p className={styles.rowState} data-state={solved ? 'done' : tries > 0 ? 'tried' : 'open'}>
                {solved
                  ? `Solved${lastAttemptAt ? ` ${formatDay(lastAttemptAt)}` : ''}`
                  : tries > 0
                    ? `Tried ${tries} ${tries === 1 ? 'time' : 'times'}`
                    : 'Not tried yet'}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
