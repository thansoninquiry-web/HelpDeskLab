import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { CommandConsole } from '../../../ui/components/CommandConsole'
import { blank, muted, type ConsoleResponse } from '../../shared/console'
import { partById } from '../data/parts'
import { commandFor, runTool, testPart } from '../logic/tools'
import type { DesktopScore } from '../logic/scoring'
import {
  CHECKS,
  CHECKLIST,
  FIX_LABELS,
  type BenchEstate,
  type ChecklistId,
  type FixId,
  type PartId,
} from '../types'
import { DesktopNav } from './DesktopNav'
import { InternalsDiagram } from './InternalsDiagram'
import { useCase } from './useDesktop'
import styles from './desktop.module.css'

const CATEGORY_LABELS: Record<string, string> = {
  hardware: 'Hardware bench',
  windows: 'Windows',
  legacy: 'Legacy mode',
  application: 'Application support',
  quickbooks: 'QuickBooks',
}

const CATEGORY_ORDER = ['diagnosis', 'documentation', 'resolution', 'safety'] as const

const CATEGORY_NAMES: Record<(typeof CATEGORY_ORDER)[number], string> = {
  diagnosis: 'Diagnosis',
  documentation: 'Documentation',
  resolution: 'Resolution',
  safety: 'Safety',
}

/** Which change belongs to which part, for the diagram's Replace buttons. */
const PART_FIXES: Readonly<Partial<Record<PartId, readonly FixId[]>>> = {
  psu: ['replace-psu'],
  motherboard: ['replace-motherboard'],
  cpu: ['replace-cpu'],
  'ram-1': ['reseat-ram', 'replace-ram'],
  'ram-2': ['reseat-ram', 'replace-ram'],
  gpu: ['replace-gpu'],
  cooler: ['clean-cooler', 'replace-fan'],
  cmos: ['replace-cmos'],
  storage: ['replace-disk'],
  battery: ['replace-battery'],
  charger: ['replace-charger'],
  screen: ['replace-screen'],
  keyboard: ['replace-keyboard'],
}

function ScorePanel({
  score,
  busy,
  onRestart,
}: {
  score: DesktopScore
  busy: boolean
  onRestart: () => void
}) {
  return (
    <section className={styles.score} data-passed={score.passed} aria-label="Attempt score">
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
                  : `${Math.round(entry.earned)} / ${entry.possible}`}
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
        <span className={styles.count}>A new attempt starts from the fault as it was seeded.</span>
      </div>
    </section>
  )
}

function machineFacts(estate: BenchEstate): readonly { label: string; value: string }[] {
  return [
    { label: 'Windows', value: `${estate.windows.edition} · ${estate.windows.build}` },
    {
      label: 'Support',
      value: estate.windows.supported ? 'in support' : 'out of support — no security updates',
    },
    {
      label: 'Sign-in',
      value: estate.windows.signIn === 'ok' ? 'working profile' : 'temporary profile',
    },
    { label: 'Last boot', value: `${estate.windows.bootSeconds} seconds` },
    { label: 'Updates', value: estate.windows.updates === 'on' ? 'on' : 'off' },
    {
      label: 'Printer',
      value: estate.printer.installed
        ? `${estate.printer.status} · ${estate.printer.queue} in queue`
        : 'not installed',
    },
    {
      label: 'Outlook',
      value: estate.outlook.profile === 'corrupt' ? 'profile cannot be opened' : 'loads',
    },
    {
      label: 'QuickBooks',
      value:
        estate.quickbooks.license === 'expired'
          ? 'licence expired'
          : estate.quickbooks.multiUser === 'error'
            ? 'multi-user not working'
            : estate.quickbooks.companyFile === 'damaged'
              ? 'company file damaged'
              : 'company file opens',
    },
  ]
}

export function DesktopCasePage() {
  const { caseId = '' } = useParams()
  const { data, error, busy, recordCheck, applyFix, tick, check, restart } = useCase(caseId)
  const [selected, setSelected] = useState<PartId | null>(null)
  const [readout, setReadout] = useState<{ label: string; lines: string[] } | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [hints, setHints] = useState(0)
  /** The case this page's other state belongs to, reset during a route change. */
  const [shown, setShown] = useState(caseId)
  if (shown !== caseId) {
    setShown(caseId)
    setSelected(null)
    setReadout(null)
    setMessage(null)
    setNote('')
    setHints(0)
  }

  const estate = data?.estate ?? null
  const attempt = data?.attempt ?? null
  const entry = data?.entry ?? null
  const score = data?.score ?? null
  const scored = score !== null

  const initialPart = useMemo<PartId | null>(() => {
    if (!entry) {
      return null
    }
    return partById(entry.subject) ? (entry.subject as PartId) : null
  }, [entry])
  const activePart = selected ?? initialPart

  const log = useMemo(() => {
    if (!attempt) {
      return []
    }
    return [
      ...attempt.state.checks.map((record) => ({
        at: record.at,
        kind: 'read' as const,
        label: `Read: ${CHECKS[record.id].label}`,
        meta: record.on,
      })),
      ...attempt.state.changes.map((record) => ({
        at: record.at,
        kind: 'change' as const,
        label: FIX_LABELS[record.fix],
        meta: 'change',
      })),
      ...attempt.state.checklist.map((record) => ({
        at: record.at,
        kind: 'checklist' as const,
        label: `Do the right thing: ${
          CHECKLIST.find((item) => item.id === record.id)?.label ?? record.id
        }`,
        meta: 'checklist',
      })),
    ].sort((left, right) => left.at - right.at)
  }, [attempt])

  const runRead = async (command: string) => {
    if (!estate) {
      return
    }
    const outcome = runTool({ estate, subject: activePart ?? 'os' }, command)
    setReadout({ label: command, lines: outcome.lines.map((entry) => entry.text) })
    if (outcome.check && attempt && !scored) {
      await recordCheck(outcome.check, outcome.on ?? 'os')
      setMessage(`Read recorded: ${CHECKS[outcome.check].label}.`)
    }
  }

  const respond = async (input: string): Promise<ConsoleResponse> => {
    if (!estate) {
      return { lines: [muted('The bench is still opening. Try again in a moment.')] }
    }
    const outcome = runTool({ estate, subject: activePart ?? 'os' }, input)
    if (outcome.check && attempt && !scored) {
      await recordCheck(outcome.check, outcome.on ?? 'os')
      return {
        lines: [...outcome.lines, blank(), muted(`Read recorded: ${CHECKS[outcome.check].label}.`)],
        cleared: outcome.cleared,
      }
    }
    return { lines: outcome.lines, cleared: outcome.cleared }
  }

  const runPartTest = async (part: PartId) => {
    if (!estate) {
      return
    }
    const outcome = testPart(estate, part)
    setReadout({ label: `Test · ${partById(part)?.name ?? part}`, lines: outcome.lines.map((line) => line.text) })
    if (outcome.check && attempt && !scored) {
      await recordCheck(outcome.check, outcome.on ?? part)
      setMessage(`Read recorded: ${CHECKS[outcome.check].label}.`)
    }
  }

  const runFix = async (fix: FixId) => {
    const result = await applyFix(fix)
    setMessage(result?.summary ?? null)
  }

  const partsFixes = activePart ? PART_FIXES[activePart] ?? [] : []
  const offered = entry ? entry.fixOptions.filter((option) => partsFixes.includes(option.id)) : []

  if (error) {
    return (
      <div className={styles.page}>
        <p className={styles.empty} role="alert">
          {error}
        </p>
        <Link className={styles.link} to="/desktop">
          Back to the case list
        </Link>
      </div>
    )
  }

  if (!entry || !estate || !attempt) {
    return (
      <div className={styles.page}>
        <p className={styles.empty}>Opening the bench…</p>
      </div>
    )
  }

  const isHardware = entry.category === 'hardware'
  const backupTick = attempt.state.checklist.find((record) => record.id === 'backup')
  const documentTick = attempt.state.checklist.find((record) => record.id === 'document')

  return (
    <div className={styles.page}>
      <header>
        <p className={styles.count}>
          {CATEGORY_LABELS[entry.category] ?? entry.category} · {entry.edition} ·{' '}
          {entry.platform} · difficulty {entry.difficulty} · attempt{' '}
          {new Date(attempt.startedAt).toLocaleTimeString()}
        </p>
        <h1>{entry.title}</h1>
        <p className={styles.lead}>{entry.symptom}</p>
        <blockquote className={styles.report}>{entry.report}</blockquote>
        <p className={styles.note}>
          On the bench: {entry.platform === 'laptop' ? 'laptop' : 'desktop'} · {estate.windows.edition}{' '}
          · {estate.windows.build}
        </p>
      </header>

      <DesktopNav />

      {message ? (
        <p className={styles.note} role="status">
          {message}
        </p>
      ) : null}

      <div className={styles.layout}>
        <div className={styles.stack}>
          {isHardware ? (
            <section className={styles.panel} aria-labelledby="machine-heading">
              <h2 id="machine-heading" className={styles.panelTitle}>
                The machine
                <span className={styles.count}>
                  {scored ? 'attempt scored' : 'click a part to test it'}
                </span>
              </h2>
              <InternalsDiagram
                platform={entry.platform}
                selected={activePart}
                onSelect={(part) => {
                  setSelected(part)
                  setReadout(null)
                }}
                estate={estate}
              />
              {activePart ? (
                <div className={styles.partPanel}>
                  <h3 className={styles.partHeading}>{partById(activePart)?.name}</h3>
                  <p className={styles.note}>{partById(activePart)?.role}</p>
                  <p className={styles.partFailure}>
                    Failing looks like: {partById(activePart)?.failure}
                  </p>
                  <div className={styles.row}>
                    <button
                      type="button"
                      className={styles.button}
                      disabled={busy}
                      onClick={() => void runPartTest(activePart)}
                    >
                      Test {partById(activePart)?.name.toLowerCase()}
                    </button>
                    {offered.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={option.risk ? styles.buttonDanger : styles.buttonQuiet}
                        disabled={busy || scored || attempt.state.fixes.includes(option.id)}
                        onClick={() => void runFix(option.id)}
                      >
                        {attempt.state.fixes.includes(option.id) ? 'Replaced' : option.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          ) : (
            <section className={styles.panel} aria-labelledby="machine-heading">
              <h2 id="machine-heading" className={styles.panelTitle}>
                The machine
                <span className={styles.count}>{estate.windows.edition}</span>
              </h2>
              <dl className={styles.facts}>
                {machineFacts(estate).map((fact) => (
                  <div key={fact.label}>
                    <dt>{fact.label}</dt>
                    <dd>{fact.value}</dd>
                  </div>
                ))}
              </dl>
              <p className={styles.note}>
                Tools read this machine; the reads below are the ones the reference path uses.
              </p>
            </section>
          )}

          <section className={styles.panel} aria-labelledby="reads-heading">
            <h2 id="reads-heading" className={styles.panelTitle}>
              Reads that isolate it
              <span className={styles.count}>
                {scored ? 'attempt scored' : 'each read is recorded'}
              </span>
            </h2>
            <p className={styles.note}>
              A read before the first change is what the diagnosis is scored on. The console below
              runs the same tools.
            </p>
            <div className={styles.row}>
              {entry.evidence.map((evidence) => (
                <button
                  key={`${evidence.check}-${evidence.on ?? 'os'}`}
                  type="button"
                  className={styles.buttonQuiet}
                  disabled={busy}
                  onClick={() => void runRead(commandFor(evidence.check, evidence.on ?? 'os'))}
                >
                  {CHECKS[evidence.check].label}
                </button>
              ))}
            </div>
            {readout ? (
              <>
                <p className={styles.count}>{readout.label}</p>
                <pre className={styles.readOut}>{readout.lines.join('\n')}</pre>
              </>
            ) : null}
          </section>

          <section className={styles.panel} aria-labelledby="tools-heading">
            <h2 id="tools-heading" className={styles.panelTitle}>
              Tools
              <span className={styles.count}>simulated Windows tools</span>
            </h2>
            <CommandConsole
              title="Bench tools"
              subtitle={`${estate.windows.edition} · ${entry.platform}`}
              prompt="PS C:\\bench>"
              intro={[
                muted(
                  'Every command reads the simulated machine. Type help for the list. Changes are made with the buttons, so the record is kept.',
                ),
              ]}
              suggestions={entry.tools}
              busy={busy}
              run={respond}
            />
          </section>
        </div>

        <div className={styles.stack}>
          <section className={styles.panel} aria-labelledby="checklist-heading">
            <h2 id="checklist-heading" className={styles.panelTitle}>
              Do the right thing
              <span className={styles.count}>
                {attempt.state.checklist.length} of {CHECKLIST.length} done
              </span>
            </h2>
            <p className={styles.note}>
              Scored, and in this order: identify the user, back the data up before anything that
              can lose it, write it down, and book the follow-up.
            </p>
            <ul className={styles.checklist}>
              {CHECKLIST.map((item) => {
                const record = attempt.state.checklist.find((entry) => entry.id === item.id)
                if (item.id === 'document') {
                  return (
                    <li key={item.id} className={styles.checkItem} data-done={record !== undefined}>
                      <span className={styles.checkLabel}>{item.label}</span>
                      <span className={styles.checkDetail}>{item.detail}</span>
                      <label className={styles.field}>
                        <span>Note for the next person</span>
                        <textarea
                          className={styles.textarea}
                          rows={3}
                          value={note || documentTick?.note || ''}
                          disabled={scored || record !== undefined}
                          onChange={(event) => setNote(event.target.value)}
                          placeholder="Symptom, what the evidence showed, what was changed."
                        />
                      </label>
                      {record ? (
                        <span className={styles.done}>Saved</span>
                      ) : (
                        <button
                          type="button"
                          className={styles.button}
                          disabled={busy || scored || (note || '').trim().length < 12}
                          onClick={() => void tick('document', note.trim())}
                        >
                          Save note
                        </button>
                      )}
                    </li>
                  )
                }
                return (
                  <li key={item.id} className={styles.checkItem} data-done={record !== undefined}>
                    <label className={styles.checkRow}>
                      <input
                        type="checkbox"
                        checked={record !== undefined}
                        disabled={scored || record !== undefined}
                        onChange={() => void tick(item.id as ChecklistId)}
                      />
                      <span>
                        <span className={styles.checkLabel}>{item.label}</span>
                        <span className={styles.checkDetail}>{item.detail}</span>
                      </span>
                    </label>
                    {item.id === 'backup' && backupTick ? (
                      <span className={styles.count}>
                        backed up {new Date(backupTick.at).toLocaleTimeString()}
                      </span>
                    ) : null}
                    {item.id === 'backup' && !entry.backupRequired ? (
                      <span className={styles.count}>not scored: nothing can lose data here</span>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </section>

          <section className={styles.panel} aria-labelledby="actions-heading">
            <h2 id="actions-heading" className={styles.panelTitle}>
              Change something
              <span className={styles.count}>{attempt.state.fixes.length} made</span>
            </h2>
            {scored ? (
              <p className={styles.note}>
                This attempt has been scored. Try again below to start from the seeded fault.
              </p>
            ) : null}
            <ul className={styles.actionList}>
              {entry.fixOptions.map((option) => {
                const done = attempt.state.fixes.includes(option.id)
                return (
                  <li key={option.id} className={styles.action} data-risk={option.risk === true}>
                    <span className={styles.actionBody}>
                      <span className={styles.actionLabel}>{option.label}</span>
                      <span className={styles.actionDetail}>{option.detail}</span>
                    </span>
                    {done ? (
                      <span className={styles.done}>Done</span>
                    ) : (
                      <button
                        type="button"
                        className={option.risk ? styles.buttonDanger : styles.button}
                        disabled={busy || scored}
                        onClick={() => void runFix(option.id)}
                      >
                        Apply
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>

          <section className={styles.panel} aria-labelledby="log-heading">
            <h2 id="log-heading" className={styles.panelTitle}>
              What this attempt did
              <span className={styles.count}>{log.length} steps</span>
            </h2>
            {log.length === 0 ? (
              <p className={styles.empty}>Nothing yet. Read something first.</p>
            ) : (
              <ol className={styles.log}>
                {log.map((record, index) => (
                  <li key={`${record.at}-${record.kind}-${index}`} className={styles.logItem} data-kind={record.kind}>
                    <span className={styles.logRead}>{record.label}</span>
                    <span className={styles.logMeta}>{record.meta}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className={styles.panel} aria-labelledby="hints-heading">
            <h2 id="hints-heading" className={styles.panelTitle}>
              Hints
              <span className={styles.count}>{hints} of 3 shown</span>
            </h2>
            {hints > 0 ? (
              <ul className={styles.hintList}>
                {entry.hints.slice(0, hints).map((hint, index) => (
                  <li key={hint} className={styles.hint}>
                    {index + 1}. {hint}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.note}>
                Hints do not change the score, but the reference path does not need them.
              </p>
            )}
            {hints < entry.hints.length ? (
              <div className={styles.row}>
                <button
                  type="button"
                  className={styles.buttonQuiet}
                  onClick={() => setHints((count) => count + 1)}
                >
                  Reveal hint {hints + 1}
                </button>
              </div>
            ) : null}
          </section>

          {scored ? (
            <ScorePanel
              score={score}
              busy={busy}
              onRestart={() => {
                setReadout(null)
                setMessage(null)
                setNote('')
                setHints(0)
                void restart()
              }}
            />
          ) : (
            <section className={styles.panel} aria-labelledby="check-heading">
              <h2 id="check-heading" className={styles.panelTitle}>
                Close the case
              </h2>
              <p className={styles.note}>
                The check reads the machine, not the buttons: the fault has to be actually gone,
                the data has to have been backed up first, and the checklist has to be on the
                record.
              </p>
              <div className={styles.row}>
                <button
                  type="button"
                  className={styles.button}
                  disabled={busy}
                  onClick={() => void check()}
                >
                  {busy ? 'Checking…' : 'Check my work'}
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
