import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { CHANGES, READS } from '../data/catalog'
import { AREA_LABELS } from '../data/scenarios'
import type { AcademyScore } from '../logic/scoring'
import { clockLabel, clockReading, modeLabel, startMinute } from '../logic/clock'
import {
  ACADEMY_MODES,
  VISIT_CHECKLIST,
  WALK_UP_AFTER,
  type AcademyMode,
  type SchoolScenario,
} from '../types'
import { AcademyNav } from './AcademyNav'
import { useVisit } from './useAcademy'
import styles from './academy.module.css'

const CATEGORY_ORDER = ['diagnosis', 'documentation', 'resolution', 'safety'] as const

const CATEGORY_NAMES: Record<(typeof CATEGORY_ORDER)[number], string> = {
  diagnosis: 'Diagnosis',
  documentation: 'Communication and notes',
  resolution: 'Resolution',
  safety: 'Safety',
}

function ScorePanel({
  score,
  busy,
  onRestart,
}: {
  score: AcademyScore
  busy: boolean
  onRestart: () => void
}) {
  return (
    <section className={styles.score} data-passed={score.passed} aria-label="Visit score">
      <div className={styles.scoreTotal}>
        <strong>{score.total}</strong>
        <span className={styles.count}>
          out of 100 · {score.band} {score.passed ? '· passed' : '· not passed'}
        </span>
      </div>

      <h3 className={styles.panelTitle}>By category</h3>
      <dl className={styles.categories}>
        {CATEGORY_ORDER.map((category) => {
          const entry = score.categoryScores[category]
          return (
            <div key={category}>
              <dt>{CATEGORY_NAMES[category]}</dt>
              <dd>
                {entry.possible === 0
                  ? 'not scored here'
                  : `${Math.round(entry.earned)} / ${Math.round(entry.possible)}`}
              </dd>
            </div>
          )
        })}
      </dl>

      <h3 className={styles.panelTitle}>What made the score</h3>
      <ul className={styles.items}>
        {score.items.map((item) => (
          <li key={item.id} data-passed={item.passed}>
            <span>
              <span className={styles.mark} aria-hidden="true">
                {item.passed ? '✓' : '✗'}
              </span>{' '}
              {item.label}
              <br />
              <span className={styles.caseSymptom}>{item.detail}</span>
            </span>
            <span className={styles.mono}>
              {Math.round(item.earned)}/{Math.round(item.possible)}
            </span>
          </li>
        ))}
      </ul>

      <div className={styles.explain}>
        {score.explanation.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>

      <div className={styles.row}>
        <button type="button" className={styles.button} disabled={busy} onClick={onRestart}>
          Try again
        </button>
        <span className={styles.count}>A new visit starts from the scene as it was seeded.</span>
      </div>
    </section>
  )
}

function clockText(scenario: SchoolScenario, minute: number, late: boolean): string {
  const until = scenario.bell.at - minute
  if (late) {
    return `${Math.abs(until)} minutes after the bell`
  }
  return until === 0 ? 'the bell is now' : `${until} minutes to the bell`
}

/**
 * One school visit.
 *
 * The room is the action surface: every read prints its own finding, every
 * change is listed with what it does, the caller is answered one step at a time,
 * and the walk-up arrives when the ticket is already under way.
 */
export function AcademyCasePage() {
  const { scenarioId = '' } = useParams()
  const [params] = useSearchParams()
  const initialMode: AcademyMode = params.get('mode') === 'rush' ? 'rush' : 'standard'
  const {
    data,
    error,
    busy,
    message,
    read,
    change,
    answer,
    triage,
    tick,
    setMode,
    check,
    restart,
  } = useVisit(scenarioId, initialMode)
  const [note, setNote] = useState('')
  const [gloss, setGloss] = useState(false)
  const [shown, setShown] = useState(scenarioId)
  if (shown !== scenarioId) {
    setShown(scenarioId)
    setNote('')
    setGloss(false)
  }

  const entry = data?.entry ?? null
  const attempt = data?.attempt ?? null
  const score = data?.score ?? null
  const scored = score !== null || attempt?.finishedAt !== null

  const log = useMemo(() => {
    if (!attempt) {
      return []
    }
    return [
      ...attempt.state.reads.map((record) => ({
        at: record.at,
        minute: record.minute,
        label: `Read: ${READS[record.id].label}`,
        kind: 'read' as const,
      })),
      ...attempt.state.changes.map((record) => ({
        at: record.at,
        minute: record.minute,
        label: CHANGES[record.id].label,
        kind: 'change' as const,
      })),
      ...attempt.state.dialog.map((record) => ({
        at: record.at,
        minute: record.minute,
        label: `Said: ${record.optionId === 'plain' ? 'a plain answer' : 'a weak answer'}`,
        kind: 'talk' as const,
      })),
      ...(attempt.state.triage
        ? [
            {
              at: attempt.state.triage.at,
              minute: attempt.state.triage.minute,
              label: 'Triaged the walk-up',
              kind: 'talk' as const,
            },
          ]
        : []),
      ...attempt.state.checklist.map((record) => ({
        at: record.at,
        minute: record.minute,
        label: `Onsite: ${VISIT_CHECKLIST.find((item) => item.id === record.id)?.label ?? record.id}`,
        kind: 'checklist' as const,
      })),
    ].sort((left, right) => left.at - right.at)
  }, [attempt])

  if (error) {
    return (
      <div className={styles.page}>
        <p className={styles.empty} role="alert">
          {error}
        </p>
        <Link className={styles.link} to="/academy">
          Back to the desk
        </Link>
      </div>
    )
  }

  if (!entry || !attempt) {
    return (
      <div className={styles.page}>
        <p className={styles.empty}>Opening the school desk…</p>
      </div>
    )
  }

  const started =
    attempt.state.reads.length +
      attempt.state.changes.length +
      attempt.state.dialog.length +
      attempt.state.checklist.length >
    0
  const reading = clockReading(attempt.state, entry)
  const actions = attempt.state.reads.length + attempt.state.changes.length
  const walkUp = entry.walkUp
  const showWalkUp = walkUp !== undefined && attempt.state.triage === null && actions >= WALK_UP_AFTER && !scored
  const answered = (nodeId: string) =>
    attempt.state.dialog.find((record) => record.nodeId === nodeId)
  const currentIndex = entry.dialog.findIndex((node) => !answered(node.id))
  const visibleNodes = currentIndex === -1 ? entry.dialog : entry.dialog.slice(0, currentIndex + 1)

  return (
    <div className={styles.page}>
      <header>
        <p className={styles.count}>
          {AREA_LABELS[entry.area].label} · difficulty {entry.difficulty} · {entry.bell.label} ·{' '}
          {modeLabel(attempt.state.mode)}
        </p>
        <h1>{entry.title}</h1>
        <p className={styles.lead}>{entry.symptom}</p>
        <blockquote className={styles.report}>{entry.report}</blockquote>
        <p className={styles.note}>
          Caller: {entry.caller.name} · {entry.caller.role}
          {entry.caller.language === 'es' ? ' · Spanish-first' : ''} · {entry.subject}
        </p>
      </header>

      <AcademyNav />

      {message ? (
        <p className={styles.note} role="status">
          {message}
        </p>
      ) : null}

      <div className={styles.layout}>
        <div className={styles.stack}>
          <section className={styles.panel} aria-labelledby="clock-heading">
            <h2 id="clock-heading" className={styles.panelTitle}>
              The bell
              <span className={styles.count}>
                {clockLabel(startMinute(entry))} · started the visit
              </span>
            </h2>
            <div className={styles.clockRow}>
              <div>
                <strong className={styles.clockTime}>{reading.label}</strong>
                <p className={styles.itemMeta}>{clockText(entry, reading.minute, reading.late)}</p>
              </div>
              <div className={styles.modeButtons}>
                {ACADEMY_MODES.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    className={
                      attempt.state.mode === mode.id ? styles.button : styles.buttonQuiet
                    }
                    aria-pressed={attempt.state.mode === mode.id}
                    disabled={busy || started || scored}
                    onClick={() => void setMode(mode.id)}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>
            <p className={styles.itemMeta}>
              {started
                ? 'The clock is running; the mode is fixed for this visit.'
                : 'Choose the mode before the first action. Time pressure costs more minutes and loses points faster after the bell.'}
            </p>
          </section>

          <section className={styles.panel} aria-labelledby="reads-heading">
            <h2 id="reads-heading" className={styles.panelTitle}>
              Read the room
              <span className={styles.count}>{entry.reads.length} reads available</span>
            </h2>
            <ul className={styles.actionList}>
              {entry.reads.map((option) => {
                const taken = attempt.state.reads.find((record) => record.id === option.id)
                return (
                  <li key={option.id} data-done={taken !== undefined}>
                    <span className={styles.actionBody}>
                      <span className={styles.itemTitle}>{READS[option.id].label}</span>
                      <span className={styles.itemMeta}>{READS[option.id].detail}</span>
                      {taken ? (
                        <span className={styles.finding}>{option.finding}</span>
                      ) : null}
                    </span>
                    <button
                      type="button"
                      className={styles.buttonQuiet}
                      disabled={busy || scored || taken !== undefined}
                      onClick={() => void read(option.id)}
                    >
                      Read
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>

          <section className={styles.panel} aria-labelledby="talk-heading">
            <h2 id="talk-heading" className={styles.panelTitle}>
              Talk to the caller
              <span className={styles.count}>
                {entry.caller.language === 'es' ? 'Spanish-first' : 'English'}
              </span>
            </h2>
            {entry.caller.language === 'es' ? (
              <div className={styles.row}>
                <button
                  type="button"
                  className={styles.buttonQuiet}
                  aria-pressed={gloss}
                  onClick={() => setGloss((current) => !current)}
                >
                  {gloss ? 'Hide English gloss' : 'Show English gloss'}
                </button>
                <Link className={styles.link} to="/academy/phrases">
                  Spanish phrasebook
                </Link>
              </div>
            ) : null}
            <ol className={styles.dialog}>
              {visibleNodes.map((node) => {
                const reply = answered(node.id)
                return (
                  <li key={node.id}>
                    <p className={styles.callerLine}>{node.prompt}</p>
                    {gloss && node.gloss ? <p className={styles.gloss}>{node.gloss}</p> : null}
                    {reply ? (
                      <p className={styles.replyLine}>
                        <span className={styles.itemMeta}>You said</span>{' '}
                        {node.options.find((option) => option.id === reply.optionId)?.say}
                      </p>
                    ) : (
                      <div className={styles.replies}>
                        {node.options.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            className={styles.buttonQuiet}
                            disabled={busy || scored}
                            onClick={() => void answer(node.id, option.id)}
                          >
                            {option.say}
                            {gloss && option.gloss ? (
                              <span className={styles.glossInline}>{option.gloss}</span>
                            ) : null}
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                )
              })}
            </ol>
          </section>

          {showWalkUp && walkUp ? (
            <section className={styles.walkUp} aria-labelledby="walkup-heading">
              <h2 id="walkup-heading" className={styles.panelTitle}>
                Someone is at the door
                <span className={styles.count}>walk-up · mid-ticket</span>
              </h2>
              <p className={styles.note}>{walkUp.who}</p>
              <p className={styles.callerLine}>{walkUp.ask}</p>
              <div className={styles.replies}>
                {walkUp.options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={styles.buttonQuiet}
                    disabled={busy || scored}
                    onClick={() => void triage(option.id)}
                  >
                    {option.label}
                    <span className={styles.glossInline}>{option.detail}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section className={styles.panel} aria-labelledby="changes-heading">
            <h2 id="changes-heading" className={styles.panelTitle}>
              Make a change
              <span className={styles.count}>Every change is on the record</span>
            </h2>
            <ul className={styles.actionList}>
              {entry.changes.map((id) => {
                const applied = attempt.state.changes.some((record) => record.id === id)
                const harmful = CHANGES[id].kind === 'harmful'
                return (
                  <li key={id} data-done={applied}>
                    <span className={styles.actionBody}>
                      <span className={styles.itemTitle}>{CHANGES[id].label}</span>
                      <span className={styles.itemMeta}>{CHANGES[id].detail}</span>
                    </span>
                    <button
                      type="button"
                      className={harmful ? styles.buttonDanger : styles.buttonQuiet}
                      disabled={busy || scored || applied}
                      onClick={() => void change(id)}
                    >
                      {applied ? 'Done' : 'Apply'}
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        </div>

        <div className={styles.stack}>
          <section className={styles.panel} aria-labelledby="checklist-heading">
            <h2 id="checklist-heading" className={styles.panelTitle}>
              Onsite checklist
              <span className={styles.count}>Scored</span>
            </h2>
            <ul className={styles.checklist}>
              {VISIT_CHECKLIST.filter((item) => item.id !== 'document').map((item) => {
                const tickRecord = attempt.state.checklist.find((record) => record.id === item.id)
                return (
                  <li key={item.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={tickRecord !== undefined}
                        disabled={busy || scored}
                        onChange={() => void tick(item.id)}
                      />{' '}
                      <span className={styles.itemTitle}>{item.label}</span>
                    </label>
                    <p className={styles.itemMeta}>{item.detail}</p>
                  </li>
                )
              })}
            </ul>
            <label className={styles.fieldLabel} htmlFor="visit-note">
              Visit note for the next person
            </label>
            <textarea
              id="visit-note"
              className={styles.textarea}
              value={note}
              rows={4}
              disabled={scored}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Room, fault, evidence, change, and what the teacher should watch for."
            />
            <div className={styles.row}>
              <button
                type="button"
                className={styles.buttonQuiet}
                disabled={busy || scored || note.trim().length === 0}
                onClick={() => void tick('document', note)}
              >
                Save note
              </button>
              <span className={styles.count}>
                {attempt.state.checklist.find((record) => record.id === 'document')
                  ? 'Note on the record'
                  : 'Not yet saved'}
              </span>
            </div>
          </section>

          <section className={styles.panel} aria-labelledby="log-heading">
            <h2 id="log-heading" className={styles.panelTitle}>
              The visit so far
              <span className={styles.count}>{log.length} steps</span>
            </h2>
            {log.length === 0 ? (
              <p className={styles.itemMeta}>Nothing yet. Start with a read.</p>
            ) : (
              <ol className={styles.log}>
                {log.map((step, index) => (
                  <li key={`${step.at}-${index}`}>
                    <span className={styles.mono}>{clockLabel(step.minute)}</span>{' '}
                    <span data-kind={step.kind}>{step.label}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className={styles.panel} aria-labelledby="hints-heading">
            <h2 id="hints-heading" className={styles.panelTitle}>
              Hints
              <span className={styles.count}>When you are stuck</span>
            </h2>
            <ul className={styles.hints}>
              {entry.hints.map((hint) => (
                <li key={hint}>{hint}</li>
              ))}
            </ul>
          </section>

          {scored && score ? (
            <ScorePanel
              score={score}
              busy={busy}
              onRestart={() => void restart(attempt.state.mode)}
            />
          ) : (
            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>Close the visit</h2>
              <p className={styles.itemMeta}>
                The scorer reads the room, the conversation, the clock and the checklist. The bell
                does not wait while you decide.
              </p>
              <button
                type="button"
                className={styles.button}
                disabled={busy}
                onClick={() => void check()}
              >
                Check my work
              </button>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
