import { Link } from 'react-router'
import { PageHeader } from '../../../ui/components/PageHeader'
import { nextLesson, nextPracticeItem } from '../logic/progress'
import { useLanguageOverview } from './useLanguages'
import styles from './languages.module.css'

/**
 * The picker.
 *
 * It shows all three tracks at once rather than a menu, because the choice
 * between them is usually about the stack in front of the learner, and the
 * progress numbers are what make a part-finished track worth returning to.
 */
export function LanguageTracksPage() {
  const { overview, error } = useLanguageOverview()

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Practice · language tracks"
        title="Language tracks"
        description="Four short lessons and five decision drills per language, written against the runtime rather than the tutorial. Nothing runs here: every snippet is small enough to read, and the question is what the runtime actually does."
      />

      {error ? (
        <p className={styles.empty} role="alert">
          {error}
        </p>
      ) : null}

      {!overview ? (
        <p className={styles.empty} role="status">
          {error ? null : 'Opening the tracks…'}
        </p>
      ) : (
        <>
          <p className={styles.summary} role="status" aria-live="polite">
            <strong>{overview.lessonsRead}</strong> of {overview.lessonsTotal} lessons read ·{' '}
            <strong>{overview.practiceSolved}</strong> of {overview.practiceTotal} drills solved
          </p>

          <ul className={styles.tracks}>
            {overview.tracks.map(({ track, progress }) => (
              <li key={track.id} className={styles.trackCard}>
                <div className={styles.trackTop}>
                  <h2 className={styles.trackName}>
                    <Link to={`/languages/${track.id}`}>{track.name}</Link>
                  </h2>
                  <span className={styles.runtime}>{track.runtime}</span>
                </div>

                <p className={styles.trackBlurb}>{track.blurb}</p>

                <p className={styles.trackCounts}>
                  {progress.lessonsRead}/{progress.lessonsTotal} lessons ·{' '}
                  {progress.practiceSolved}/{progress.practiceTotal} drills solved
                  {progress.practiceAttempted > progress.practiceSolved
                    ? ` · ${progress.practiceAttempted - progress.practiceSolved} tried, not yet right`
                    : ''}
                </p>

                <div className={styles.cardActions}>
                  <Link
                    className={styles.primaryButton}
                    to={`/languages/${track.id}/lessons/${nextLesson(track, []).id}`}
                  >
                    Read the track
                  </Link>
                  <Link
                    className={styles.primaryButton}
                    to={`/languages/${track.id}/practice/${nextPracticeItem(track, []).id}`}
                  >
                    Practice
                  </Link>
                </div>
              </li>
            ))}
          </ul>

          <p className={styles.footnote}>
            Each track keeps its own tallies. A drill counts as solved once it has been answered
            correctly; a lesson counts as read when you mark it, because only you know whether it
            landed.
          </p>
        </>
      )}
    </div>
  )
}
