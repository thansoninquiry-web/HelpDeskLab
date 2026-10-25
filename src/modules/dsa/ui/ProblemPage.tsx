import { useState } from 'react'
import { Link, useParams } from 'react-router'
import type { DsaChoice, DsaDifficulty, DsaOutcome, DsaProblemView } from '../types'
import type { DsaProblemHandle } from './useDsa'
import { formatDay, useDsaProblem } from './useDsa'
import styles from './dsa.module.css'

const DIFFICULTY_LABELS: Record<DsaDifficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
}

/**
 * One problem: the brief on the left, the decision drill on the right.
 *
 * The answers are radio groups rather than a free-text box because the point is
 * the choice — which approach the cue points at, and which edge that approach
 * gets wrong. The editor below them is for writing the answer out by hand; it
 * is persisted as a draft and never executed.
 */
export function DsaProblemPage() {
  const { problemId } = useParams<{ problemId: string }>()
  const handle = useDsaProblem(problemId)

  if (handle.notFound) {
    return (
      <div className={styles.page}>
        <h1>No such problem</h1>
        <p className={styles.empty}>
          That problem is not in the bank. <Link to="/dsa">Back to algorithm practice</Link>.
        </p>
      </div>
    )
  }

  if (!handle.view) {
    return (
      <div className={styles.page}>
        <p className={styles.empty} role="status">
          {handle.error ?? 'Opening the problem…'}
        </p>
      </div>
    )
  }

  // Keyed by problem, so opening another problem starts from that problem's own
  // last attempt rather than carrying this one's answers across.
  return <ProblemWorkspace key={handle.view.problem.id} view={handle.view} handle={handle} />
}

function ProblemWorkspace({ view, handle }: { view: DsaProblemView; handle: DsaProblemHandle }) {
  const { problem, attempts } = view
  const { error, busy, savedAt, saveDraft, submit } = handle

  // The last attempt is where a returning learner starts, so the radios open on
  // the answers they gave rather than blank.
  const [patternChoice, setPatternChoice] = useState<string | null>(
    () => attempts[0]?.patternChoice ?? null,
  )
  const [edgeChoice, setEdgeChoice] = useState<string | null>(
    () => attempts[0]?.edgeChoice ?? null,
  )
  const [draft, setDraft] = useState(() => view.draft ?? problem.starter)
  const [hintsShown, setHintsShown] = useState(0)
  const [outcome, setOutcome] = useState<DsaOutcome | null>(null)
  const [showApproaches, setShowApproaches] = useState(false)
  const [editedAt, setEditedAt] = useState(0)

  // Edited after the last successful save means there is something in flight.
  const dirty = editedAt > (savedAt ?? 0)
  const solvedBefore = attempts.some((attempt) => attempt.solved)
  const correctPattern = problem.patterns.find((choice) => choice.correct)
  const correctEdge = problem.edges.find((choice) => choice.correct)
  const latest = attempts[0] ?? null
  const hintLeft = hintsShown < problem.hints.length

  const onDraft = (value: string) => {
    setDraft(value)
    setEditedAt(Date.now())
    saveDraft(value)
  }

  const onCheck = async () => {
    if (!patternChoice || !edgeChoice) return
    const result = await submit(patternChoice, edgeChoice, hintsShown, draft)
    if (result) {
      setOutcome(result)
      setShowApproaches(result.solved)
    }
  }

  const onStartAgain = () => {
    setPatternChoice(null)
    setEdgeChoice(null)
    setOutcome(null)
    setShowApproaches(false)
    setHintsShown(0)
  }

  return (
    <div className={styles.page}>
      <p className={styles.back}>
        <Link to="/dsa">← All problems</Link>
      </p>

      <header className={styles.header}>
        <div className={styles.headerTop}>
          <h1>{problem.title}</h1>
          <span className={`${styles.badge} ${styles[problem.difficulty]}`}>
            {DIFFICULTY_LABELS[problem.difficulty]}
          </span>
          {solvedBefore ? <span className={styles.solvedChip}>Solved</span> : null}
        </div>
        <p className={styles.summary}>{problem.summary}</p>
        <p className={styles.topics}>{problem.topics.join(' · ')}</p>
      </header>

      {error ? (
        <p className={styles.empty} role="alert">
          {error}
        </p>
      ) : null}

      <div className={styles.workspace}>
        <section className={styles.brief} aria-label="The problem">
          <div className={styles.prose}>
            {problem.statement.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>

          <h2 className={styles.heading}>Examples</h2>
          <ul className={styles.examples}>
            {problem.examples.map((example) => (
              <li className={styles.example} key={example.input}>
                <p className={styles.exampleRow}>
                  <span className={styles.exampleLabel}>Input</span>
                  <code>{example.input}</code>
                </p>
                <p className={styles.exampleRow}>
                  <span className={styles.exampleLabel}>Output</span>
                  <code>{example.output}</code>
                </p>
                {example.explanation ? (
                  <p className={styles.exampleWhy}>{example.explanation}</p>
                ) : null}
              </li>
            ))}
          </ul>

          <h2 className={styles.heading}>Constraints</h2>
          <ul className={styles.constraints}>
            {problem.constraints.map((constraint) => (
              <li key={constraint}>
                <code>{constraint}</code>
              </li>
            ))}
          </ul>

          <h2 className={styles.heading}>What to notice first</h2>
          <ul className={styles.cues}>
            {problem.cues.map((cue) => (
              <li key={cue}>{cue}</li>
            ))}
          </ul>

          {latest ? (
            <p className={styles.lastAttempt}>
              Last attempt {formatDay(latest.createdAt)}:{' '}
              {(latest.patternChoice === correctPattern?.id ? 1 : 0) +
                (latest.edgeChoice === correctEdge?.id ? 1 : 0)}{' '}
              of 2 right.
            </p>
          ) : null}
        </section>

        <section className={styles.drill} aria-label="Your answer">
          <fieldset className={styles.question}>
            <legend>Which approach fits, and at what cost?</legend>
            <div className={styles.choices}>
              {problem.patterns.map((choice) => (
                <label
                  key={choice.id}
                  className={styles.choice}
                  data-state={choiceState(choice, patternChoice, outcome !== null)}
                >
                  <input
                    type="radio"
                    name="approach"
                    value={choice.id}
                    checked={patternChoice === choice.id}
                    onChange={() => setPatternChoice(choice.id)}
                  />
                  <span>{choice.label}</span>
                  {outcome ? (
                    <span className={styles.choiceMark}>
                      {choice.correct ? 'Correct answer' : null}
                      {choice.correct && patternChoice === choice.id ? ' · yours' : null}
                      {!choice.correct && patternChoice === choice.id ? 'Your answer' : null}
                    </span>
                  ) : null}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className={styles.question}>
            <legend>Which case does that approach have to get right?</legend>
            <div className={styles.choices}>
              {problem.edges.map((choice) => (
                <label
                  key={choice.id}
                  className={styles.choice}
                  data-state={choiceState(choice, edgeChoice, outcome !== null)}
                >
                  <input
                    type="radio"
                    name="edge"
                    value={choice.id}
                    checked={edgeChoice === choice.id}
                    onChange={() => setEdgeChoice(choice.id)}
                  />
                  <span>{choice.label}</span>
                  {outcome ? (
                    <span className={styles.choiceMark}>
                      {choice.correct ? 'Correct answer' : null}
                      {choice.correct && edgeChoice === choice.id ? ' · yours' : null}
                      {!choice.correct && edgeChoice === choice.id ? 'Your answer' : null}
                    </span>
                  ) : null}
                </label>
              ))}
            </div>
          </fieldset>

          <div className={styles.hints}>
            {hintLeft ? (
              <>
                <button
                  type="button"
                  className={styles.buttonQuiet}
                  onClick={() => setHintsShown((count) => count + 1)}
                >
                  Show hint {hintsShown + 1} of {problem.hints.length}
                </button>
                {hintsShown > 0 ? (
                  <ol className={styles.hintList}>
                    {problem.hints.slice(0, hintsShown).map((hint) => (
                      <li key={hint}>{hint}</li>
                    ))}
                  </ol>
                ) : null}
              </>
            ) : (
              <ol className={styles.hintList}>
                {problem.hints.map((hint) => (
                  <li key={hint}>{hint}</li>
                ))}
              </ol>
            )}
          </div>

          <label className={styles.editorField}>
            <span className={styles.editorLabel}>Your answer, written out</span>
            <textarea
              className={styles.editor}
              value={draft}
              spellCheck={false}
              rows={12}
              onChange={(event) => onDraft(event.target.value)}
              aria-describedby="draft-state"
            />
          </label>
          <p className={styles.draftState} id="draft-state">
            {dirty ? 'Saving…' : savedAt ? 'Draft saved on this device.' : 'Saved on this device as you type. Nothing is run.'}
          </p>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.button}
              disabled={!patternChoice || !edgeChoice || busy}
              onClick={() => void onCheck()}
            >
              {busy ? 'Checking…' : 'Check answers'}
            </button>
            <button
              type="button"
              className={styles.buttonQuiet}
              onClick={onStartAgain}
              disabled={busy}
            >
              Start again
            </button>
          </div>

          {outcome ? (
            <div className={styles.result} role="status" aria-live="polite">
              <h2 className={styles.heading}>
                {outcome.solved ? 'Solved — both answers match' : 'Not solved yet'}
              </h2>
              <div className={styles.resultRows}>
                <div className={styles.resultRow}>
                  <span>Approach and cost</span>
                  <strong data-ok={outcome.patternCorrect}>
                    {outcome.patternCorrect ? 'Right' : 'Not the best fit'}
                  </strong>
                </div>
                <div className={styles.resultRow}>
                  <span>The edge case</span>
                  <strong data-ok={outcome.edgeCorrect}>
                    {outcome.edgeCorrect ? 'Right' : 'Not the one that bites'}
                  </strong>
                </div>
              </div>
              <p className={styles.resultNote}>
                <strong>{outcome.pattern.label}</strong> — {outcome.pattern.note}
              </p>
              {!outcome.patternCorrect && patternChoice ? (
                <p className={styles.resultNote}>
                  You chose <strong>{choiceLabel(problem.patterns, patternChoice)}</strong> —{' '}
                  {choiceNote(problem.patterns, patternChoice)}
                </p>
              ) : null}
              <p className={styles.resultNote}>
                <strong>{outcome.edge.label}</strong> — {outcome.edge.note}
              </p>
              {!outcome.edgeCorrect && edgeChoice ? (
                <p className={styles.resultNote}>
                  You chose <strong>{choiceLabel(problem.edges, edgeChoice)}</strong> —{' '}
                  {choiceNote(problem.edges, edgeChoice)}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className={styles.approaches}>
            <div className={styles.approachTop}>
              <h2 className={styles.heading}>The approaches</h2>
              {!showApproaches ? (
                <button
                  type="button"
                  className={styles.buttonQuiet}
                  onClick={() => setShowApproaches(true)}
                >
                  Show the reference answers
                </button>
              ) : null}
            </div>
            {showApproaches ? (
              <div className={styles.approachList}>
                {problem.approaches.map((approach) => (
                  <article className={styles.approach} key={approach.name}>
                    <h3>{approach.name}</h3>
                    <p className={styles.cost}>
                      <span>Time {approach.time}</span>
                      <span>Space {approach.space}</span>
                    </p>
                    <p>{approach.idea}</p>
                    <pre className={styles.code}>
                      <code>{approach.code}</code>
                    </pre>
                    <p className={styles.tradeoff}>{approach.tradeoff}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className={styles.empty}>
                Check your answers first, or reveal them now — revealing does not change the
                attempt you already recorded.
              </p>
            )}
          </div>

          {attempts.length > 0 ? (
            <div className={styles.history}>
              <h2 className={styles.heading}>Earlier attempts</h2>
              <ul>
                {attempts.slice(0, 3).map((attempt) => {
                  const right =
                    (attempt.patternChoice === correctPattern?.id ? 1 : 0) +
                    (attempt.edgeChoice === correctEdge?.id ? 1 : 0)
                  return (
                    <li key={attempt.id}>
                      <span>{formatDay(attempt.createdAt)}</span>
                      <span>
                        {right} of 2 right
                        {attempt.hintsUsed > 0
                          ? ` · ${attempt.hintsUsed} hint${attempt.hintsUsed === 1 ? '' : 's'}`
                          : ''}
                      </span>
                      <span data-ok={attempt.solved}>{attempt.solved ? 'Solved' : 'Missed'}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  )
}

/** `correct`, `wrong` or nothing, for the radio card's border and tick. */
function choiceState(
  choice: DsaChoice,
  chosen: string | null,
  answered: boolean,
): 'correct' | 'wrong' | undefined {
  if (!answered) {
    return undefined
  }
  if (choice.correct) {
    return 'correct'
  }
  return choice.id === chosen ? 'wrong' : undefined
}

function choiceLabel(choices: readonly DsaChoice[], id: string): string {
  return choices.find((choice) => choice.id === id)?.label ?? id
}

function choiceNote(choices: readonly DsaChoice[], id: string): string {
  return choices.find((choice) => choice.id === id)?.note ?? ''
}
