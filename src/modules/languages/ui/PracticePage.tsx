import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { findPracticeItem } from '../data/tracks'
import type { PracticeOutcome } from '../types'
import { formatDay, useLanguageTrack } from './useLanguages'
import styles from './languages.module.css'

const LEVEL_LABELS = { 'warm-up': 'Warm-up', core: 'Core', sharp: 'Sharp' } as const

/**
 * One drill.
 *
 * The radios are the answer, and the notes for every option appear only after
 * submitting — a note visible before answering would hand over the reasoning
 * that the question is testing.
 */
export function LanguagePracticePage() {
  const { trackId, itemId } = useParams<{ trackId: string; itemId: string }>()
  const { view, notFound, error, busy, submit } = useLanguageTrack(trackId)

  if (notFound || (view && itemId && !findPracticeItem(view.track, itemId))) {
    return (
      <div className={styles.page}>
        <h1>No such drill</h1>
        <p className={styles.empty}>
          That drill is not in this track.{' '}
          <Link to={trackId ? `/languages/${trackId}` : '/languages'}>Back to the track</Link>.
        </p>
      </div>
    )
  }

  if (!view || !itemId) {
    return (
      <div className={styles.page}>
        <p className={styles.empty} role="status">
          {error ?? 'Opening the drill…'}
        </p>
      </div>
    )
  }

  const item = findPracticeItem(view.track, itemId)
  if (!item) return null

  // Keyed by item so opening another drill starts from that drill's own state.
  return (
    <Drill
      key={`${view.track.id}/${item.id}`}
      trackId={view.track.id}
      trackName={view.track.name}
      item={item}
      lastAttemptAt={
        view.attempts.find((attempt) => attempt.itemId === item.id)?.createdAt ?? null
      }
      solvedBefore={view.attempts.some((attempt) => attempt.itemId === item.id && attempt.correct)}
      busy={busy}
      error={error}
      submit={(choice) => submit(item.id, choice)}
    />
  )
}

interface DrillProps {
  trackId: string
  trackName: string
  item: NonNullable<ReturnType<typeof findPracticeItem>>
  lastAttemptAt: number | null
  solvedBefore: boolean
  busy: boolean
  error: string | null
  submit: (choice: string) => Promise<PracticeOutcome | null>
}

function Drill({
  trackId,
  trackName,
  item,
  lastAttemptAt,
  solvedBefore,
  busy,
  error,
  submit,
}: DrillProps) {
  const [choice, setChoice] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<PracticeOutcome | null>(null)

  const onCheck = async () => {
    if (!choice) return
    const result = await submit(choice)
    if (result) setOutcome(result)
  }

  const onAgain = () => {
    setChoice(null)
    setOutcome(null)
  }

  return (
    <div className={styles.page}>
      <p className={styles.back}>
        <Link to={`/languages/${trackId}`}>← {trackName} track</Link>
      </p>

      <header className={styles.header}>
        <div className={styles.headerTop}>
          <h1>{item.title}</h1>
          <span className={styles.badge}>{LEVEL_LABELS[item.level]}</span>
          {solvedBefore ? <span className={styles.doneChip}>Solved</span> : null}
        </div>
        <p className={styles.runtime}>
          {item.topic}
          {lastAttemptAt ? ` · last tried ${formatDay(lastAttemptAt)}` : ''}
        </p>
      </header>

      {error ? (
        <p className={styles.empty} role="alert">
          {error}
        </p>
      ) : null}

      <figure className={styles.codeFigure}>
        <pre className={styles.code}>
          <code>{item.code}</code>
        </pre>
      </figure>

      <fieldset className={styles.question}>
        <legend>{item.question}</legend>
        <div className={styles.choices}>
          {item.choices.map((entry) => {
            const state = outcome
              ? entry.correct
                ? 'correct'
                : outcome.attempt.choice === entry.id
                  ? 'wrong'
                  : 'quiet'
              : 'idle'
            return (
              <label key={entry.id} className={styles.choice} data-state={state}>
                <input
                  type="radio"
                  name="answer"
                  value={entry.id}
                  checked={choice === entry.id}
                  disabled={outcome !== null}
                  onChange={() => setChoice(entry.id)}
                />
                <span>{entry.label}</span>
                {outcome ? <span className={styles.choiceMark}>{entry.note}</span> : null}
              </label>
            )
          })}
        </div>
      </fieldset>

      {!outcome ? (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.button}
            onClick={() => void onCheck()}
            disabled={!choice || busy}
          >
            {busy ? 'Checking…' : 'Check answer'}
          </button>
          <p className={styles.helpLine}>
            One answer is right. The reasoning for all of them appears after you choose.
          </p>
        </div>
      ) : (
        <section
          className={styles.result}
          data-state={outcome.correct ? 'correct' : 'wrong'}
          aria-labelledby="drill-result"
        >
          <h2 id="drill-result" className={styles.resultTitle}>
            {outcome.correct ? 'Right' : 'Not quite'}
          </h2>
          <p className={styles.resultLine}>{outcome.answer.label}</p>
          <p className={styles.resultNote}>{outcome.answer.note}</p>

          <h3 className={styles.resultHeading}>Rule to remember</h3>
          <p className={styles.resultNote}>{item.rule}</p>

          {item.reference ? (
            <>
              <h3 className={styles.resultHeading}>The corrected form</h3>
              <pre className={styles.code}>
                <code>{item.reference}</code>
              </pre>
            </>
          ) : null}

          <div className={styles.actions}>
            <button type="button" className={styles.button} onClick={onAgain}>
              Try it again
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
