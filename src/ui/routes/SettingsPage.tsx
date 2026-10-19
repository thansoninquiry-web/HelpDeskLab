import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import {
  exportBackupFile,
  importBackupBytes,
  resetLocalDatabase,
} from '../../app/maintenanceService'
import { getLocalDatabaseStatus, type LocalDatabaseStatus } from '../../app/persistenceService'
import {
  clearFamilyHintPolicy,
  defaultHintPolicy,
  describeHintPolicy,
  examHintPolicy,
  hintPolicyLimits,
  loadExamMode,
  loadHintTargets,
  saveExamMode,
  saveFamilyHintPolicy,
  saveHintPolicy,
  validateHintPolicy,
  type HintPolicy,
  type HintTarget,
} from '../../app/settingsService'
import {
  applyTheme,
  defaultThemeSchedule,
  describeCurrentTerminal,
  describeCurrentTheme,
  loadTerminalSurface,
  loadThemePreference,
  loadThemeSchedule,
  saveTerminalSurface,
  saveThemePreference,
  saveThemeSchedule,
  subscribeToTheme,
  terminalSurfaceChoices,
  themeChoices,
  validateThemeSchedule,
  type TerminalSurface,
  type ThemePreference,
  type ThemeSchedule,
} from '../../app/themeService'
import { familyLabel } from '../components/familyLabels'
import { PageHeader } from '../components/PageHeader'
import { ThemeSchedulePreview } from '../components/ThemeSchedulePreview'
import styles from './pages.module.css'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; status: LocalDatabaseStatus }
  | { kind: 'error'; message: string }

type ActionState =
  | { kind: 'idle' }
  | { kind: 'working'; label: string }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string }

/** What the hint form holds while the learner is typing; every value is a whole number. */
interface HintForm {
  perHint: string
  cap: string
  budget: string
  free: boolean
}

/** An empty box is not zero: it is missing, and the validator should say so. */
function toPoints(value: string): number {
  return value.trim().length === 0 ? Number.NaN : Number(value)
}

/** Fills the form boxes from a price, whichever family is being priced. */
function toHintForm(policy: HintPolicy): HintForm {
  return {
    perHint: String(policy.perHint),
    cap: String(policy.cap),
    budget: String(policy.budget),
    free: policy.perHint <= 0,
  }
}

/** What the price list calls the row every unpriced family plays at. */
const DEFAULT_PRICE_LABEL = 'Default — every family without its own price'

/** One line in the price list, saying where that price came from. */
function describeHintTarget(target: HintTarget): string {
  if (target.id === null) {
    return DEFAULT_PRICE_LABEL
  }
  const name = familyLabel(target.id)
  return target.own ? `${name} — its own price` : `${name} — the default price`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function describePersistence(persistent: boolean | null): string {
  if (persistent === null) {
    return 'Unknown'
  }
  return persistent ? 'Granted' : 'Not granted (the browser may evict data)'
}

function downloadBytes(filename: string, bytes: Uint8Array): void {
  if (typeof URL.createObjectURL !== 'function') {
    return
  }

  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], {
    type: 'application/vnd.sqlite3',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function SettingsPage() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [action, setAction] = useState<ActionState>({ kind: 'idle' })
  const [confirmReset, setConfirmReset] = useState(false)
  const [statusToken, setStatusToken] = useState(0)
  const [hintForm, setHintForm] = useState<HintForm | null>(null)
  // Every price the page can edit, default first; null until they are read.
  const [hintTargets, setHintTargets] = useState<HintTarget[] | null>(null)
  // Null is the default price; a family id is that family's own price.
  const [hintTarget, setHintTarget] = useState<string | null>(null)
  const [hintAction, setHintAction] = useState<ActionState>({ kind: 'idle' })
  // Null while the stored mode is still being read.
  const [examMode, setExamMode] = useState<boolean | null>(null)
  const [examAction, setExamAction] = useState<ActionState>({ kind: 'idle' })
  const [theme, setTheme] = useState<ThemePreference | null>(null)
  const [terminal, setTerminal] = useState<TerminalSurface | null>(null)
  const [terminalAction, setTerminalAction] = useState<ActionState>({ kind: 'idle' })
  // The sentence under the choices names the resolved theme, and Schedule can
  // change it at dawn or dusk while this page sits open, so it is re-rendered
  // when the workspace changes rather than only when a control is touched.
  const [, setThemeVersion] = useState(0)
  const [themeAction, setThemeAction] = useState<ActionState>({ kind: 'idle' })
  const [scheduleForm, setScheduleForm] = useState<ThemeSchedule | null>(null)
  const [scheduleAction, setScheduleAction] = useState<ActionState>({ kind: 'idle' })

  useEffect(() => {
    let active = true

    // The stored choice wins over the cached one used for first paint, and the
    // boundaries and terminal choice are read with it so Schedule resolves
    // against the real times and the pane paints out of the stored surface.
    Promise.all([loadThemePreference(), loadThemeSchedule(), loadTerminalSurface()]).then(
      ([storedPreference, storedSchedule, storedTerminal]) => {
        if (active) {
          applyTheme(storedPreference)
          setTheme(storedPreference)
          setScheduleForm(storedSchedule)
          setTerminal(storedTerminal)
        }
      },
      (error: unknown) => {
        if (active) {
          setThemeAction({
            kind: 'error',
            message: error instanceof Error ? error.message : 'Your theme could not be read.',
          })
        }
      },
    )

    return () => {
      active = false
    }
  }, [])

  useEffect(
    () => subscribeToTheme(() => setThemeVersion((version) => version + 1)),
    [],
  )

  useEffect(() => {
    let active = true

    loadHintTargets().then(
      (targets) => {
        if (active) {
          setHintTargets(targets)
          const fallback = targets[0]
          if (fallback) {
            setHintForm(toHintForm(fallback.policy))
          }
        }
      },
      (error: unknown) => {
        if (active) {
          setHintAction({
            kind: 'error',
            message: error instanceof Error ? error.message : 'Your hint price could not be read.',
          })
        }
      },
    )

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true

    loadExamMode().then(
      (stored) => {
        if (active) {
          setExamMode(stored)
        }
      },
      (error: unknown) => {
        if (active) {
          setExamAction({
            kind: 'error',
            message: error instanceof Error ? error.message : 'Exam mode could not be read.',
          })
        }
      },
    )

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true

    getLocalDatabaseStatus().then(
      (status) => {
        if (active) {
          setState({ kind: 'ready', status })
        }
      },
      (error: unknown) => {
        if (active) {
          setState({
            kind: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      },
    )

    return () => {
      active = false
    }
  }, [statusToken])

  const busy =
    action.kind === 'working' ||
    hintAction.kind === 'working' ||
    scheduleAction.kind === 'working' ||
    examAction.kind === 'working'
  const limits = hintPolicyLimits()
  const standard = defaultHintPolicy()
  const examRate = examHintPolicy()
  const scheduleDefaults = defaultThemeSchedule()
  const scheduleError = scheduleForm === null ? null : validateThemeSchedule(scheduleForm)
  const hintChoice = hintForm
    ? {
        perHint: hintForm.free ? 0 : toPoints(hintForm.perHint),
        cap: hintForm.free ? 0 : toPoints(hintForm.cap),
        // Free hints are still rationed: the budget is a count, not a price.
        budget: toPoints(hintForm.budget),
      }
    : null
  const hintError = hintChoice ? validateHintPolicy(hintChoice) : null
  const chosenTarget = hintTargets?.find((target) => target.id === hintTarget) ?? null

  /** Reloads the list and puts the boxes back on the target just saved. */
  const reloadHintTargets = async (target: string | null): Promise<HintTarget | null> => {
    const targets = await loadHintTargets()
    setHintTargets(targets)
    const row = targets.find((candidate) => candidate.id === target) ?? targets[0] ?? null
    if (row) {
      setHintForm(toHintForm(row.policy))
    }
    return row
  }

  const onChooseHintTarget = (target: string | null) => {
    const row = hintTargets?.find((candidate) => candidate.id === target)
    if (!row) {
      return
    }

    setHintTarget(target)
    setHintForm(toHintForm(row.policy))
    setHintAction({ kind: 'idle' })
  }

  const onSaveHints = async () => {
    if (!hintChoice) {
      return
    }

    const familyId = hintTarget
    setHintAction({
      kind: 'working',
      label: familyId ? 'Saving this family’s price…' : 'Saving the hint price…',
    })
    try {
      const saved = familyId
        ? await saveFamilyHintPolicy(familyId, hintChoice)
        : await saveHintPolicy(hintChoice)
      await reloadHintTargets(familyId)
      setHintAction({ kind: 'success', message: `Saved. ${describeHintPolicy(saved)}` })
    } catch (caught) {
      setHintAction({
        kind: 'error',
        message: caught instanceof Error ? caught.message : 'The hint price could not be saved.',
      })
    }
  }

  /** Hands a family back to the default, dropping the price it had of its own. */
  const onClearHintOverride = async () => {
    const familyId = hintTarget
    if (!familyId || !chosenTarget) {
      return
    }

    setHintAction({
      kind: 'working',
      label: `Handing ${familyLabel(familyId)} back to the default…`,
    })
    try {
      const inherited = await clearFamilyHintPolicy(familyId)
      await reloadHintTargets(familyId)
      setHintAction({
        kind: 'success',
        message: `${familyLabel(familyId)} plays at the default again. ${describeHintPolicy(inherited)}`,
      })
    } catch (caught) {
      setHintAction({
        kind: 'error',
        message: caught instanceof Error ? caught.message : 'The hint price could not be saved.',
      })
    }
  }

  const onToggleExamMode = async (on: boolean) => {
    // The switch moves first so the page does not lag behind the click; a failed
    // write puts it back and says why.
    setExamMode(on)
    setExamAction({ kind: 'working', label: on ? 'Sitting new attempts as exams…' : 'Handing hints back…' })
    try {
      await saveExamMode(on)
      setExamAction({
        kind: 'success',
        message: on
          ? `Exam mode is on. The next ticket you open withholds its hints and is priced at ${examRate.perHint} points a rung.`
          : 'Exam mode is off. New tickets can use hints again at your own price.',
      })
    } catch (caught) {
      setExamMode(!on)
      setExamAction({
        kind: 'error',
        message: caught instanceof Error ? caught.message : 'Exam mode could not be saved.',
      })
    }
  }

  const onChooseTheme = async (value: ThemePreference) => {
    setTheme(value)
    setThemeAction({ kind: 'working', label: 'Saving the theme…' })
    try {
      const saved = await saveThemePreference(value)
      setTheme(saved)
      setThemeAction({ kind: 'idle' })
    } catch (caught) {
      setThemeAction({
        kind: 'error',
        message: caught instanceof Error ? caught.message : 'The theme could not be saved.',
      })
    }
  }

  const onChooseTerminal = async (value: TerminalSurface) => {
    const previous = terminal
    setTerminal(value)
    setTerminalAction({ kind: 'working', label: 'Saving the terminal surface…' })
    try {
      const saved = await saveTerminalSurface(value)
      setTerminal(saved)
      setTerminalAction({ kind: 'idle' })
    } catch (caught) {
      setTerminal(previous)
      setTerminalAction({
        kind: 'error',
        message:
          caught instanceof Error ? caught.message : 'The terminal surface could not be saved.',
      })
    }
  }

  const onSaveSchedule = async () => {
    if (!scheduleForm) {
      return
    }

    setScheduleAction({ kind: 'working', label: 'Saving the schedule…' })
    try {
      const saved = await saveThemeSchedule(scheduleForm)
      setScheduleForm(saved)
      // The window, not the current look: the look can change at the next
      // boundary, and this line has to stay true afterwards.
      setScheduleAction({
        kind: 'success',
        message: `Saved. Light from ${saved.dawn} to ${saved.dusk}, dark for the rest of the day.`,
      })
    } catch (caught) {
      setScheduleAction({
        kind: 'error',
        message: caught instanceof Error ? caught.message : 'The schedule could not be saved.',
      })
    }
  }

  const onResetSchedule = () => {
    setScheduleForm(scheduleDefaults)
    setScheduleAction({ kind: 'idle' })
  }

  const onExport = async () => {
    setAction({ kind: 'working', label: 'Preparing the backup…' })
    try {
      const file = await exportBackupFile()
      downloadBytes(file.filename, file.bytes)
      setAction({
        kind: 'success',
        message: `Saved ${file.filename} (${formatBytes(file.bytes.byteLength)}).`,
      })
    } catch (caught) {
      setAction({
        kind: 'error',
        message: caught instanceof Error ? caught.message : 'The backup could not be created.',
      })
    }
  }

  const onImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) {
      return
    }

    setAction({ kind: 'working', label: `Reading ${file.name}…` })
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      await importBackupBytes(bytes)
      setAction({
        kind: 'success',
        message: `Imported ${file.name}. The previous database is kept in the browser backup slot.`,
      })
      setStatusToken((token) => token + 1)
    } catch (caught) {
      setAction({
        kind: 'error',
        message: caught instanceof Error ? caught.message : 'The backup could not be imported.',
      })
    }
  }

  const onReset = async () => {
    setAction({ kind: 'working', label: 'Resetting the local database…' })
    setConfirmReset(false)
    try {
      await resetLocalDatabase()
      setAction({
        kind: 'success',
        message:
          'Local history reset. A fresh queue will be generated the next time you open Practice.',
      })
      setStatusToken((token) => token + 1)
    } catch (caught) {
      setAction({
        kind: 'error',
        message: caught instanceof Error ? caught.message : 'The database could not be reset.',
      })
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Release 1"
        title="Settings"
        description="Your practice history lives in a local SQLite database. Nothing is uploaded, and no account is required."
      />

      <section
        className={`${styles.section} ${styles.settingsSection}`}
        aria-labelledby="appearance-heading"
      >
        <div className={styles.sectionHeading}>
          <h2 id="appearance-heading">Appearance</h2>
          <span className={styles.count}>Applies immediately</span>
        </div>

        <div className={styles.backupPanel}>
          <p className={styles.sectionText}>
            The workspace theme swaps the same colour tokens the interface already reads. The
            shell, the type scale, and the density do not change with it; only the paper does.
          </p>

          {theme === null ? (
            <p className={styles.statusMessage}>Reading your theme…</p>
          ) : (
            <>
              <div className={styles.themeRow} role="radiogroup" aria-label="Workspace theme">
                {themeChoices().map((choice) => (
                  <label
                    key={choice.value}
                    className={styles.themeChoice}
                    data-selected={String(theme === choice.value)}
                  >
                    <input
                      type="radio"
                      name="theme"
                      value={choice.value}
                      aria-label={choice.label}
                      checked={theme === choice.value}
                      disabled={themeAction.kind === 'working'}
                      onChange={() => void onChooseTheme(choice.value)}
                    />
                    <span className={styles.themeChoiceLabel}>{choice.label}</span>
                    <span className={styles.themeChoiceDetail}>{choice.detail}</span>
                  </label>
                ))}
              </div>

              {theme === 'schedule' ? (
                <>
                  <div className={styles.fieldRow}>
                    <label className={styles.field}>
                      Dawn
                      <input
                        type="time"
                        aria-label="Dawn"
                        value={scheduleForm?.dawn ?? ''}
                        disabled={busy}
                        onChange={(event) =>
                          setScheduleForm({
                            dawn: event.target.value,
                            dusk: scheduleForm?.dusk ?? scheduleDefaults.dusk,
                          })
                        }
                      />
                      <span className={styles.fieldHint}>The light workspace starts here</span>
                    </label>
                    <label className={styles.field}>
                      Dusk
                      <input
                        type="time"
                        aria-label="Dusk"
                        value={scheduleForm?.dusk ?? ''}
                        disabled={busy}
                        onChange={(event) =>
                          setScheduleForm({
                            dawn: scheduleForm?.dawn ?? scheduleDefaults.dawn,
                            dusk: event.target.value,
                          })
                        }
                      />
                      <span className={styles.fieldHint}>The dark workspace starts here</span>
                    </label>
                  </div>

                  {/* Reads the form, not the stored schedule: dragging the time
                      or moving a boundary previews the change before it is saved. */}
                  <ThemeSchedulePreview schedule={scheduleForm ?? scheduleDefaults} />

                  <div className={styles.buttonRow}>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      disabled={busy || scheduleError !== null}
                      onClick={() => void onSaveSchedule()}
                    >
                      Save schedule
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      disabled={busy}
                      onClick={onResetSchedule}
                    >
                      Reset to {scheduleDefaults.dawn} / {scheduleDefaults.dusk}
                    </button>
                  </div>

                  {scheduleError ? (
                    <p className={styles.statusError} role="alert">
                      {scheduleError}
                    </p>
                  ) : null}
                  {scheduleAction.kind === 'working' ? (
                    <p className={styles.statusMessage} role="status">
                      {scheduleAction.label}
                    </p>
                  ) : null}
                  {scheduleAction.kind === 'success' ? (
                    <p className={styles.actionSuccess} role="status">
                      {scheduleAction.message}
                    </p>
                  ) : null}
                  {scheduleAction.kind === 'error' ? (
                    <p className={styles.statusError} role="alert">
                      {scheduleAction.message}
                    </p>
                  ) : null}
                </>
              ) : null}

              <p className={styles.hintEffect} role="status">
                {describeCurrentTheme()}
              </p>

              {themeAction.kind === 'error' ? (
                <p className={styles.statusError} role="alert">
                  {themeAction.message}
                </p>
              ) : null}

              <div className={styles.subgroup}>
                <h3 className={styles.subgroupHeading}>Terminal</h3>
                <p className={styles.sectionText}>
                  The terminal is its own surface. It can keep the night-shift colours while
                  the workspace is light, or take the same paper as everything else.
                </p>

                {terminal === null ? (
                  <p className={styles.statusMessage}>Reading your terminal setting…</p>
                ) : (
                  <>
                    <div
                      className={`${styles.themeRow} ${styles.themeRowTwo}`}
                      role="radiogroup"
                      aria-label="Terminal surface"
                    >
                      {terminalSurfaceChoices().map((choice) => (
                        <label
                          key={choice.value}
                          className={styles.themeChoice}
                          data-selected={String(terminal === choice.value)}
                        >
                          <input
                            type="radio"
                            name="terminal"
                            value={choice.value}
                            aria-label={choice.label}
                            checked={terminal === choice.value}
                            disabled={terminalAction.kind === 'working'}
                            onChange={() => void onChooseTerminal(choice.value)}
                          />
                          <span className={styles.themeChoiceLabel}>{choice.label}</span>
                          <span className={styles.themeChoiceDetail}>{choice.detail}</span>
                        </label>
                      ))}
                    </div>

                    <p className={styles.hintEffect} role="status">
                      {describeCurrentTerminal()}
                    </p>
                  </>
                )}

                {terminalAction.kind === 'error' ? (
                  <p className={styles.statusError} role="alert">
                    {terminalAction.message}
                  </p>
                ) : null}
              </div>
            </>
          )}
        </div>
      </section>

      <section
        className={`${styles.section} ${styles.settingsSection}`}
        aria-labelledby="storage-heading"
      >
        <div className={styles.sectionHeading}>
          <h2 id="storage-heading">Local database</h2>
          <span className={styles.count}>Milestone 1</span>
        </div>

        {state.kind === 'loading' && (
          <p className={styles.statusMessage}>Opening the local database…</p>
        )}

        {state.kind === 'error' && (
          <p className={styles.statusError}>
            The local database could not be opened: {state.message}
          </p>
        )}

        {state.kind === 'ready' && (
          <dl className={styles.statusList}>
            <div className={styles.statusRow}>
              <dt>Status</dt>
              <dd>Ready</dd>
            </div>
            <div className={styles.statusRow}>
              <dt>Engine</dt>
              <dd>SQLite (WebAssembly) · schema v{state.status.schemaVersion}</dd>
            </div>
            <div className={styles.statusRow}>
              <dt>Storage</dt>
              <dd>IndexedDB snapshot</dd>
            </div>
            <div className={styles.statusRow}>
              <dt>Database size</dt>
              <dd>{formatBytes(state.status.storedBytes)}</dd>
            </div>
            <div className={styles.statusRow}>
              <dt>Persistent storage</dt>
              <dd>{describePersistence(state.status.persistentStorage)}</dd>
            </div>
          </dl>
        )}
      </section>

      <section
        className={`${styles.section} ${styles.settingsSection}`}
        aria-labelledby="hints-heading"
      >
        <div className={styles.sectionHeading}>
          <h2 id="hints-heading">Hints</h2>
          <span className={styles.count}>Applies to new attempts</span>
        </div>

        <div className={styles.backupPanel}>
          <p className={styles.sectionText}>
            A hint names the next step an attempt has not met yet. The price is fixed when a
            ticket starts, so changing it here never re-prices a ticket already in flight. The
            budget rations hints without charging for them: it caps how many one attempt may
            take, even when they are free.
          </p>

          <label className={styles.freeRow}>
            <input
              type="checkbox"
              checked={examMode === true}
              disabled={busy || examMode === null}
              onChange={(event) => void onToggleExamMode(event.target.checked)}
            />
            Exam mode — withdraw hints until the ticket is scored
          </label>
          <p className={styles.sectionText}>
            An exam attempt hides every hint while the ticket is open and pins the standard rate
            ({examRate.perHint} points a rung, capped at {examRate.cap}) instead of the price
            below, so two people who sit the same ticket are scored the same way. The debrief
            opens with the ladders the exam withheld, so you still see what each missed step
            would have told you.
          </p>
          {examAction.kind === 'working' ? (
            <p className={styles.statusMessage} role="status">
              {examAction.label}
            </p>
          ) : null}
          {examAction.kind === 'success' ? (
            <p className={styles.actionSuccess} role="status">
              {examAction.message}
            </p>
          ) : null}
          {examAction.kind === 'error' ? (
            <p className={styles.statusError} role="alert">
              {examAction.message}
            </p>
          ) : null}

          <label className={styles.field}>
            Price for
            <select
              value={hintTarget ?? 'default'}
              disabled={busy || hintTargets === null}
              onChange={(event) =>
                onChooseHintTarget(event.target.value === 'default' ? null : event.target.value)
              }
            >
              {hintTargets === null ? (
                <option value="default">Reading your prices…</option>
              ) : (
                hintTargets.map((target) => (
                  <option key={target.id ?? 'default'} value={target.id ?? 'default'}>
                    {describeHintTarget(target)}
                  </option>
                ))
              )}
            </select>
          </label>
          <p className={styles.fieldHint}>
            A ticket plays at its own family's price when you set one here, and at the default
            otherwise, so a family added in a later update starts on the default.
          </p>

          {hintForm === null ? (
            <p className={styles.statusMessage}>Reading your hint price…</p>
          ) : (
            <>
              <div className={styles.fieldRow}>
                <label className={styles.field}>
                  Points per hint
                  <input
                    type="number"
                    min={0}
                    max={limits.perHint}
                    step={1}
                    inputMode="numeric"
                    value={hintForm.perHint}
                    disabled={busy || hintForm.free}
                    onChange={(event) =>
                      setHintForm({ ...hintForm, perHint: event.target.value })
                    }
                  />
                </label>
                <label className={styles.field}>
                  Cap per ticket
                  <input
                    type="number"
                    min={0}
                    max={limits.cap}
                    step={1}
                    inputMode="numeric"
                    value={hintForm.cap}
                    disabled={busy || hintForm.free}
                    onChange={(event) => setHintForm({ ...hintForm, cap: event.target.value })}
                  />
                </label>
                <label className={styles.field}>
                  Hints per attempt
                  <input
                    type="number"
                    min={0}
                    max={limits.budget}
                    step={1}
                    inputMode="numeric"
                    value={hintForm.budget}
                    disabled={busy}
                    onChange={(event) => setHintForm({ ...hintForm, budget: event.target.value })}
                    aria-label="Hints per attempt"
                  />
                  <span className={styles.fieldHint}>0 means no limit</span>
                </label>
              </div>

              <label className={styles.freeRow}>
                <input
                  type="checkbox"
                  checked={hintForm.free}
                  disabled={busy}
                  onChange={(event) => setHintForm({ ...hintForm, free: event.target.checked })}
                />
                Hints are free
              </label>

              <p className={styles.hintEffect} role="status">
                {hintError ??
                  describeHintPolicy({
                    perHint: hintChoice?.perHint ?? 0,
                    cap: hintChoice?.cap ?? 0,
                    budget: hintChoice?.budget ?? 0,
                  })}
              </p>

              <div className={styles.buttonRow}>
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={busy || hintError !== null}
                  onClick={() => void onSaveHints()}
                >
                  {hintTarget === null ? 'Save hint price' : 'Save this family’s price'}
                </button>
                {hintTarget !== null && chosenTarget?.own ? (
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    disabled={busy}
                    onClick={() => void onClearHintOverride()}
                  >
                    Use the default
                  </button>
                ) : null}
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={busy}
                  onClick={() => {
                    setHintForm({
                      perHint: String(standard.perHint),
                      cap: String(standard.cap),
                      budget: String(standard.budget),
                      free: false,
                    })
                    setHintAction({ kind: 'idle' })
                  }}
                >
                  Reset to {standard.perHint} / {standard.cap}
                  {standard.budget === 0 ? '' : ` / ${standard.budget}`}
                </button>
              </div>

              {hintAction.kind === 'working' ? (
                <p className={styles.statusMessage} role="status">
                  {hintAction.label}
                </p>
              ) : null}
              {hintAction.kind === 'success' ? (
                <p className={styles.actionSuccess} role="status">
                  {hintAction.message}
                </p>
              ) : null}
              {hintAction.kind === 'error' ? (
                <p className={styles.statusError} role="alert">
                  {hintAction.message}
                </p>
              ) : null}
            </>
          )}
        </div>
      </section>

      <section
        className={`${styles.section} ${styles.settingsSection}`}
        aria-labelledby="backup-heading"
      >
        <div className={styles.sectionHeading}>
          <h2 id="backup-heading">Backup and reset</h2>
          <span className={styles.count}>Local only</span>
        </div>

        <div className={styles.backupPanel}>
          <p className={styles.sectionText}>
            A backup is a single SQLite file containing your tickets, attempts, scores, and
            progress. Importing replaces the current database; the previous one is kept in the
            browser backup slot. Import or reset closes any open ticket without scoring it.
          </p>

          <div className={styles.buttonRow}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => void onExport()}
              disabled={busy || state.kind !== 'ready'}
            >
              {action.kind === 'working' && action.label.startsWith('Preparing')
                ? 'Preparing…'
                : 'Export backup'}
            </button>

            <label className={styles.fileLabel}>
              Import a backup
              <input
                className={styles.fileInput}
                type="file"
                accept=".sqlite,application/vnd.sqlite3,application/x-sqlite3"
                onChange={(event) => void onImport(event)}
                disabled={busy || state.kind !== 'ready'}
              />
            </label>
          </div>

          <div className={styles.resetRow} data-confirming={String(confirmReset)}>
            {confirmReset ? (
              <>
                <span className={styles.resetWarning}>
                  This replaces your queue, scores, and progress with an empty database.
                </span>
                <div className={styles.buttonRow}>
                  <button
                    type="button"
                    className={styles.dangerButton}
                    onClick={() => void onReset()}
                    disabled={busy}
                  >
                    Yes, reset local history
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => setConfirmReset(false)}
                    disabled={busy}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setConfirmReset(true)}
                disabled={busy || state.kind !== 'ready'}
              >
                Reset local history…
              </button>
            )}
          </div>

          {action.kind === 'working' ? (
            <p className={styles.statusMessage} role="status">
              {action.label}
            </p>
          ) : null}
          {action.kind === 'success' ? (
            <p className={styles.actionSuccess} role="status">
              {action.message}
            </p>
          ) : null}
          {action.kind === 'error' ? (
            <p className={styles.statusError} role="alert">
              {action.message}
            </p>
          ) : null}
        </div>
      </section>
    </>
  )
}
