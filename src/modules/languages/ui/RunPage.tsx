import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import type { PracticeOutcome } from '../types'
import { useLanguageTrack } from './useLanguages'
import styles from './languages.module.css'

interface Result {
  itemId: string
  title: string
  correct: boolean
}

const KEY_LABELS = ['1', '2', '3', '4', '5', '6']

/**
 * A run through a track's drills.
 *
 * The drill page asks one question and stops; a run asks them all in order and
 * keeps the tally, which is how the material is actually rehearsed — answer,
 * read the reason, move on, and see at the end which decisions are still wrong.
 * It is the same service call per answer as the single drill, so the attempts
 * table and the track's progress are the ones the rest of the module reads.
 *
 * The keys are the point: a number picks an answer and Enter checks or moves on,
 * so a run can be worked without reaching for the mouse. Nothing runs anywhere —
 * the answer is a fact about the runtime, and the note under each option is where
 * the fact is explained.
 */
export function LanguageRunPage() {
  const { trackId } = useParams<{ trackId: string }>()
  const { view, notFound, error, busy, submit } = useLanguageTrack(trackId)

  const [step, setStep] = useState(0)
  const [choice, setChoice] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<PracticeOutcome | null>(null)
  const [results, setResults] = useState<readonly Result[]>([])
  const [finished, setFinished] = useState(false)

  const queue = view?.track.practice ?? []
  const item = queue[step]

  const check = async () => {
    if (!item || !choice || outcome) {
      return
    }
    const result = await submit(item.id, choice)
    if (!result) {
      return
    }
    setOutcome(result)
    setResults((current) => [
      ...current,
      { itemId: item.id, title: item.title, correct: result.correct },
    ])
  }

  const advance = () => {
    setChoice(null)
    setOutcome(null)
    if (step + 1 >= queue.length) {
      setFinished(true)
      return
    }
    setStep(step + 1)
  }

  const restart = () => {
    setStep(0)
    setChoice(null)
    setOutcome(null)
    setResults([])
    setFinished(false)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const tag = target?.tagName ?? ''
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      const index = Number.parseInt(event.key, 10)
      if (Number.isInteger(index) && index >= 1 && index <= KEY_LABELS.length) {
        const option = item?.choices[index - 1]
        if (option && !outcome && !finished) {
          event.preventDefault()
          setChoice(option.id)
        }
        return
      }

      // Enter is left to the control that has focus: a button already answers to
      // it, and handling it here too would move on twice.
      if (event.key === 'Enter' && tag !== 'BUTTON' && tag !== 'A') {
        if (finished) {
          return
        }
        event.preventDefault()
        if (outcome) {
          advance()
        } else {
          void check()
        }
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

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
          {error ?? 'Opening the run…'}
        </p>
      </div>
    )
  }

  if (queue.length === 0) {
    return (
      <div className={styles.page}>
        <p className={styles.back}>
          <Link to={`/languages/${view.track.id}`}>← {view.track.name} track</Link>
        </p>
        <h1>Nothing to run yet</h1>
        <p className={styles.empty}>
          This track has no drills. The lessons are on{' '}
          <Link to={`/languages/${view.track.id}`}>the track page</Link>.
        </p>
      </div>
    )
  }

  const right = results.filter((result) => result.correct).length

  if (finished) {
    return (
      <div className={styles.page}>
        <p className={styles.back}>
          <Link to={`/languages/${view.track.id}`}>← {view.track.name} track</Link>
        </p>

        <header className={styles.header}>
          <div className={styles.headerTop}>
            <h1>Run finished</h1>
            <span className={styles.badge}>
              {right} of {results.length}
            </span>
          </div>
          <p className={styles.runtime}>
            {right === results.length
              ? 'Every question in this run was answered right.'
              : `${results.length - right} ${
                  results.length - right === 1 ? 'question is' : 'questions are'
                } still wrong. Open one to read its reasoning again.`}
          </p>
        </header>

        <section className={styles.section} aria-labelledby="run-results">
          <h2 id="run-results" className={styles.heading}>
            This run
          </h2>
          <ul className={styles.rows}>
            {results.map((result, index) => (
              <li key={result.itemId} className={styles.row}>
                <div className={styles.rowTop}>
                  <h3 className={styles.rowTitle}>
                    <Link to={`/languages/${view.track.id}/practice/${result.itemId}`}>
                      {index + 1}. {result.title}
                    </Link>
                  </h3>
                  <span className={styles.rowState} data-state={result.correct ? 'done' : 'open'}>
                    {result.correct ? 'Right' : 'Wrong'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <div className={styles.actions}>
          <button type="button" className={styles.primaryButton} onClick={restart}>
            Run it again
          </button>
          <Link className={styles.primaryButton} to={`/languages/${view.track.id}`}>
            Back to the track
          </Link>
        </div>
      </div>
    )
  }

  const position = results.length + (outcome ? 0 : 1)

  return (
    <div className={styles.page}>
      <p className={styles.back}>
        <Link to={`/languages/${view.track.id}`}>← {view.track.name} track</Link>
      </p>

      <header className={styles.header}>
        <div className={styles.headerTop}>
          <h1>{item?.title}</h1>
          <span className={styles.badge}>
            {position} of {queue.length}
          </span>
        </div>
        <p className={styles.runtime}>
          {right} right so far · number keys pick an answer, Enter checks it
        </p>
      </header>

      {error ? (
        <p className={styles.empty} role="alert">
          {error}
        </p>
      ) : null}

      <figure className={styles.codeFigure}>
        <pre className={styles.code}>
          <code>{item?.code}</code>
        </pre>
      </figure>

      <fieldset className={styles.question}>
        <legend>{item?.question}</legend>
        <div className={styles.choices}>
          {item?.choices.map((option, index) => {
            const state = outcome
              ? option.correct
                ? 'correct'
                : outcome.attempt.choice === option.id
                  ? 'wrong'
                  : 'quiet'
              : choice === option.id
                ? 'chosen'
                : 'idle'
            return (
              <button
                key={option.id}
                type="button"
                className={styles.choice}
                data-state={state}
                aria-pressed={choice === option.id}
                disabled={outcome !== null}
                onClick={() => setChoice(option.id)}
              >
                <span className={styles.choiceKey} aria-hidden="true">
                  {KEY_LABELS[index] ?? index + 1}
                </span>
                <span>
                  {option.label}
                  {outcome ? <span className={styles.choiceMark}>{option.note}</span> : null}
                </span>
              </button>
            )
          })}
        </div>
      </fieldset>

      {!outcome ? (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => void check()}
            disabled={!choice || busy}
          >
            {busy ? 'Checking…' : 'Check answer'}
          </button>
          <p className={styles.helpLine}>
            {choice
              ? 'Enter checks the answer you picked.'
              : 'Press 1 to ' +
                String(item?.choices.length ?? 0) +
                ' to pick an answer, or click one.'}
          </p>
        </div>
      ) : (
        <section
          className={styles.result}
          data-state={outcome.correct ? 'correct' : 'wrong'}
          aria-labelledby="run-result"
        >
          <h2 id="run-result" className={styles.resultTitle}>
            {outcome.correct ? 'Right' : 'Not quite'}
          </h2>
          <p className={styles.resultLine}>{outcome.answer.label}</p>
          <p className={styles.resultNote}>{outcome.answer.note}</p>

          <h3 className={styles.resultHeading}>Rule to remember</h3>
          <p className={styles.resultNote}>{outcome.item.rule}</p>

          {outcome.item.reference ? (
            <>
              <h3 className={styles.resultHeading}>The corrected form</h3>
              <pre className={styles.code}>
                <code>{outcome.item.reference}</code>
              </pre>
            </>
          ) : null}

          <div className={styles.actions}>
            <button type="button" className={styles.primaryButton} onClick={advance}>
              {step + 1 >= queue.length ? 'See the results' : 'Next question'}
            </button>
            <p className={styles.helpLine}>Enter moves on.</p>
          </div>
        </section>
      )}
    </div>
  )
}
