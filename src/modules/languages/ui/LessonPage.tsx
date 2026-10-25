import { Link, useParams } from 'react-router'
import { findLesson } from '../data/tracks'
import { formatDay, useLanguageTrack } from './useLanguages'
import styles from './languages.module.css'

/**
 * One lesson.
 *
 * The read mark is the learner's own statement, not a scroll position: a lesson
 * skimmed in ten seconds and one worked through carefully look the same to the
 * page, so the page asks rather than guesses.
 */
export function LanguageLessonPage() {
  const { trackId, lessonId } = useParams<{ trackId: string; lessonId: string }>()
  const { view, notFound, error, markRead } = useLanguageTrack(trackId)

  if (notFound || (view && lessonId && !findLesson(view.track, lessonId))) {
    return (
      <div className={styles.page}>
        <h1>No such lesson</h1>
        <p className={styles.empty}>
          That lesson is not in this track.{' '}
          <Link to={trackId ? `/languages/${trackId}` : '/languages'}>Back to the track</Link>.
        </p>
      </div>
    )
  }

  if (!view || !lessonId) {
    return (
      <div className={styles.page}>
        <p className={styles.empty} role="status">
          {error ?? 'Opening the lesson…'}
        </p>
      </div>
    )
  }

  const lesson = findLesson(view.track, lessonId)
  if (!lesson) return null

  const index = view.track.lessons.findIndex((entry) => entry.id === lesson.id)
  const previous = index > 0 ? view.track.lessons[index - 1] : null
  const next = index >= 0 ? (view.track.lessons[index + 1] ?? null) : null
  const read = view.reads.find((entry) => entry.lessonId === lesson.id) ?? null

  return (
    <div className={styles.page}>
      <p className={styles.back}>
        <Link to={`/languages/${view.track.id}`}>← {view.track.name} track</Link>
      </p>

      <header className={styles.header}>
        <div className={styles.headerTop}>
          <h1>{lesson.title}</h1>
          {read ? <span className={styles.doneChip}>Read {formatDay(read.readAt)}</span> : null}
        </div>
        <p className={styles.summary}>{lesson.summary}</p>
        <p className={styles.runtime}>
          Lesson {index + 1} of {view.track.lessons.length} · {lesson.minutes} min ·{' '}
          {view.track.runtime}
        </p>
      </header>

      {error ? (
        <p className={styles.empty} role="alert">
          {error}
        </p>
      ) : null}

      <article className={styles.lesson}>
        {lesson.sections.map((section, sectionIndex) => (
          <section className={styles.lessonSection} key={section.heading ?? sectionIndex}>
            {section.heading ? <h2 className={styles.heading}>{section.heading}</h2> : null}
            {section.body.map((paragraph) => (
              <p className={styles.prose} key={paragraph}>
                {paragraph}
              </p>
            ))}
            {section.code ? (
              <figure className={styles.codeFigure}>
                <pre className={styles.code}>
                  <code>{section.code.source}</code>
                </pre>
                {section.code.caption ? (
                  <figcaption className={styles.caption}>{section.code.caption}</figcaption>
                ) : null}
              </figure>
            ) : null}
            {section.note ? (
              <aside className={styles.note} aria-label="Worth remembering">
                <p>{section.note}</p>
              </aside>
            ) : null}
          </section>
        ))}
      </article>

      <section className={styles.takeaway} aria-labelledby="lesson-takeaway">
        <h2 id="lesson-takeaway" className={styles.takeawayLabel}>
          Remember this
        </h2>
        <p>{lesson.takeaway}</p>
      </section>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.button}
          aria-pressed={read !== null}
          onClick={() => void markRead(lesson.id, read === null)}
        >
          {read ? 'Marked read — undo' : 'Mark as read'}
        </button>
      </div>

      <nav className={styles.lessonNav} aria-label="Lessons in this track">
        {previous ? (
          <Link to={`/languages/${view.track.id}/lessons/${previous.id}`}>
            ← {previous.title}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link to={`/languages/${view.track.id}/lessons/${next.id}`}>{next.title} →</Link>
        ) : (
          <Link to={`/languages/${view.track.id}`}>Back to the track →</Link>
        )}
      </nav>
    </div>
  )
}
