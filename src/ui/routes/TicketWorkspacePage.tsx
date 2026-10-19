import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, FormEvent, KeyboardEvent, PointerEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import {
  CALLBACK_OVER_CODE_PENALTY,
  CLOSURE_NOTE_LIMIT,
  HintBudgetSpentError,
  NoHintAvailableError,
  abandonAttempt,
  addNote,
  askCaller,
  callerInterjection,
  callerPrompts,
  closureOptions,
  commandCheatSheet,
  denialReasons,
  denyCaller,
  formatSimClock,
  loadConsole,
  openSession,
  placeCallback,
  recordInPersonVisit,
  resolveAttempt,
  revealHint,
  reapplyRewind,
  reviewClosure,
  rewindAttempt,
  runConsoleAction,
  saveClosureDraft,
  scanBadge,
  sendVerificationCode,
  submitCommand,
  submitDesktopTerminalCommand,
  toolCatalog,
  verifyCallerWithCode,
  verifyCallerWithLetterPin,
  weakerVerificationCost,
  type ClosureDraft,
  type ClosureReview,
  type CommandCheatSheetGroup,
  type ConsoleId,
  type ConsoleView,
  type DenialReason,
  type NoteKind,
  type WorkspaceEntry,
  type WorkspaceView,
} from '../../app/practiceService'
import { loadSplitView, saveSplitView } from '../../app/settingsService'
import { commandOriginLabel } from '../components/sourceLabel'
import { ToolConsole } from '../components/ToolConsole'
import { ToolPicker } from '../components/ToolPicker'
import { useFlushOnHide } from '../components/useFlushOnHide'
import practice from './practice.module.css'
import styles from './workspace.module.css'

const SEVERITY_LABELS = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
} as const

/** The code the close form starts on before the learner picks another one. */
const DEFAULT_CLOSURE_CODE = 'resolved-remote'

/**
 * The gate's record of what the caller said and what answered it. Rendered in
 * the open gate and beside a refusal, so the evidence stays with the decision.
 */
function ClaimFindings({
  findings,
}: {
  findings: WorkspaceView['verification']['contradictions']
}) {
  if (findings.length === 0) {
    return null
  }
  return (
    <div aria-label="Contradicted claims" role="status">
      <p className={practice.claimHeading}>
        What the caller claimed does not match the record
      </p>
      <ul className={practice.identityFindings}>
        {findings.map((finding) => (
          <li key={finding.id}>
            <span className={practice.identityClaim}>“{finding.claim}”</span>
            {finding.evidence}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * One block of the cheat sheet: a group label and the commands under it. The
 * same block renders the groups a ticket leads with and the rest of the
 * reference, so the two halves of the panel cannot drift apart.
 */
function CheatSheetGroups({ groups }: { groups: readonly CommandCheatSheetGroup[] }) {
  return (
    <>
      {groups.map((group) => (
        <div key={group.label} className={styles.cheatSheetGroup}>
          <p className={styles.cheatSheetLabel}>{group.label}</p>
          <dl className={practice.cheatSheet}>
            {group.entries.map((entry) => (
              <div key={entry.usage}>
                <dt>{entry.usage}</dt>
                <dd>{entry.summary}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </>
  )
}

/** How long typing in the handoff note waits before it is saved with the attempt. */
const DRAFT_SAVE_DELAY_MS = 500

/**
 * How long a change in the close form waits before the projection is dry-run
 * again. Short enough to read as live while typing, long enough that a sentence
 * of handoff note costs one scoring run rather than one per keystroke.
 */
const PROJECTION_DELAY_MS = 220

/**
 * How often an idle desk asks whether the caller has something to say. The
 * caller's own thresholds are minutes, so this only has to be often enough that
 * a learner who has stopped acting hears from them without waiting long.
 */
const CALLER_TICK_MS = 20_000

/**
 * The last step in the log, used to tell a fresh read from a stale one: a caller
 * line recorded while a command was in flight must never put the log back to
 * what it looked like before the command landed.
 */
function lastSeq(entries: readonly WorkspaceEntry[]): number {
  return entries.at(-1)?.seq ?? 0
}

/**
 * Where the divider between the terminal and a tool sits in a fresh workspace,
 * and where a reset puts it back. Half the card: there is no reason to guess.
 */
const SPLIT_DEFAULT_RATIO = 0.5
/** Neither half may be squeezed past a quarter of the card; below that a console
 *  and a log are both unreadable. */
const SPLIT_MIN_RATIO = 0.25
const SPLIT_MAX_RATIO = 1 - SPLIT_MIN_RATIO
/** One arrow key press: fine enough to aim, coarse enough to be worth pressing. */
const SPLIT_KEY_STEP = 0.02
/** Shift and an arrow move five times as far, for crossing the card in one go. */
const SPLIT_KEY_COARSE_FACTOR = 5

/** A copy of a per-console map without one key, so closing a tool forgets it. */
function withoutConsole<T>(
  record: Partial<Record<ConsoleId, T>>,
  consoleId: ConsoleId,
): Partial<Record<ConsoleId, T>> {
  const next = { ...record }
  delete next[consoleId]
  return next
}

function EntryLog({
  entry,
  home,
  busy,
  onReapply,
}: {
  entry: WorkspaceEntry
  home: string
  busy: boolean
  onReapply: (seq: number) => void
}) {
  if (entry.kind === 'command') {
    // Where it ran, not only where it was typed: a desktop-terminal command
    // names the machine its session reached, so the output above it is read as
    // that machine's rather than the ticket host's.
    const origin = commandOriginLabel(entry.source, entry.machine)
    return (
      <div className={practice.entry}>
        <p className={practice.commandLine}>
          <span className={practice.prompt}>PS C:\Users\{home}&gt;</span> {entry.text}
          {origin ? <span className={practice.consoleOrigin}> · {origin}</span> : null}
        </p>
        {entry.lines.map((line, index) => (
          <p
            key={`${entry.atMs}-${index}`}
            className={practice.outputLine}
            data-tone={line.tone}
          >
            {line.text || '\u00a0'}
          </p>
        ))}
      </div>
    )
  }

  if (entry.kind === 'ask') {
    return (
      <div className={practice.chatEntry}>
        <p className={practice.chatQuestion}>{entry.question}</p>
        <p className={practice.chatAnswer}>{entry.answer}</p>
      </div>
    )
  }

  if (entry.kind === 'interruption') {
    return (
      <div className={practice.interruptionEntry} role="status">
        <span className={practice.interruptionTag}>Caller, unprompted</span>
        <p className={practice.interruptionMessage}>{entry.message}</p>
      </div>
    )
  }

  if (entry.kind === 'verify') {
    return (
      <p className={practice.verifyEntry} data-ok={entry.ok}>
        {entry.ok ? '✓' : '✗'} {entry.summary}
      </p>
    )
  }

  if (entry.kind === 'deny') {
    return (
      <p className={practice.denyEntry}>
        ⊘ {entry.summary}
      </p>
    )
  }

  if (entry.kind === 'hint') {
    return (
      <div className={practice.hintEntry}>
        <span className={practice.hintTag}>
          Hint · {entry.cost > 0 ? `−${entry.cost} pts` : 'free'}
        </span>
        <p>{entry.text}</p>
      </div>
    )
  }

  if (entry.kind === 'code-sent') {
    return (
      <p className={practice.codeSentEntry}>
        ✉ Code sent to {entry.recipientName} · {entry.destination}
      </p>
    )
  }

  if (entry.kind === 'rewind') {
    return (
      <div className={practice.rewindEntry}>
        <p>
          ↺ Un-ran {entry.dropped} step{entry.dropped === 1 ? '' : 's'} from here — the log keeps
          the cut, and the score is read from what is left.
        </p>
        {entry.canReapply ? (
          <div className={styles.rewindRestore}>
            <button
              type="button"
              className={practice.secondaryButton}
              disabled={busy}
              aria-label={`Put back the ${entry.dropped} step${
                entry.dropped === 1 ? '' : 's'
              } this rewind took`}
              onClick={() => onReapply(entry.seq)}
            >
              Put {entry.dropped === 1 ? 'it' : 'them'} back
            </button>
            <span className={styles.rewindRestoreNote}>
              No work has been logged since the cut, so the steps and their score can return.
            </span>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className={practice.noteEntry}>
      <span className={practice.noteTag}>{entry.noteKind} note</span>
      <p>{entry.text}</p>
    </div>
  )
}

export function TicketWorkspacePage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const [workspace, setWorkspace] = useState<WorkspaceView | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [command, setCommand] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [troubleshootingDraft, setTroubleshootingDraft] = useState('')
  const [customerDraft, setCustomerDraft] = useState('')
  const [closureCode, setClosureCode] = useState(DEFAULT_CLOSURE_CODE)
  const [resolutionNote, setResolutionNote] = useState('')
  const [closureReview, setClosureReview] = useState<ClosureReview | null>(null)
  /** The score the close would write as things stand, or null until it is read. */
  const [projected, setProjected] = useState<ClosureReview | null>(null)
  /** Whether the projection's breakdown is showing under the chip. */
  const [projectionOpen, setProjectionOpen] = useState(false)
  const [confirmAbandon, setConfirmAbandon] = useState(false)
  const [showFullReference, setShowFullReference] = useState(false)
  const [hintsExhausted, setHintsExhausted] = useState(false)
  // What the service said when the budget was already gone; it knows the count.
  const [hintBudgetNotice, setHintBudgetNotice] = useState<string | null>(null)
  const [recipientId, setRecipientId] = useState('')
  const [codeDraft, setCodeDraft] = useState('')
  const [letterPinDraft, setLetterPinDraft] = useState('')
  const [denyReason, setDenyReason] = useState<DenialReason>('third-party-request')
  const [confirmDeny, setConfirmDeny] = useState(false)
  const [paneMode, setPaneMode] = useState<'terminal' | 'tools'>('terminal')
  /** Where the divider sits, as the fraction of the card the terminal takes. */
  const [splitRatio, setSplitRatio] = useState(SPLIT_DEFAULT_RATIO)
  const [draggingSplit, setDraggingSplit] = useState(false)
  /**
   * Both halves of the tool card at once: the terminal keeps the log in view
   * while a console does the work, instead of one switching the other away.
   */
  const [splitView, setSplitView] = useState(false)
  /** The step a learner has asked to un-run, waiting on the confirmation. */
  const [rewindTarget, setRewindTarget] = useState<number | null>(null)
  /** The console on screen in the Tools pane, or null for the tool picker. */
  const [openTool, setOpenTool] = useState<ConsoleId | null>(null)
  /**
   * Every console the learner has open, in the order they opened them. Picking a
   * tool that is already here brings it forward instead of replacing what is in
   * the pane, so a learner can keep the directory, the mail admin, and the map
   * to hand and move between them without losing a screen of evidence.
   */
  const [openTools, setOpenTools] = useState<ConsoleId[]>([])
  const [toolMenuOpen, setToolMenuOpen] = useState(false)
  const [consoles, setConsoles] = useState<Partial<Record<ConsoleId, ConsoleView>>>({})
  const [consoleErrors, setConsoleErrors] = useState<Partial<Record<ConsoleId, string>>>({})
  // The shelf the picker renders, read once: it is catalog data, not attempt data.
  const [toolGroups] = useState(() => toolCatalog())
  const logEnd = useRef<HTMLDivElement | null>(null)
  const splitRef = useRef<HTMLDivElement | null>(null)
  const splitHandle = useRef<HTMLDivElement | null>(null)
  // The close form is saved with the attempt, so a reload puts it back as it was.
  const draftRef = useRef<ClosureDraft>({ code: DEFAULT_CLOSURE_CODE, note: '' })
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** The draft as last stored, so unchanged renders cost no snapshot write. */
  const savedDraft = useRef<string | null>(null)
  /** False until the open session has filled the form, so loading never saves. */
  const draftReady = useRef(false)

  const prompts = useMemo(() => callerPrompts(), [])
  const closures = useMemo(() => closureOptions(), [])
  const denialChoices = useMemo(() => denialReasons(), [])
  // Registry data, so it is read once per ticket rather than on every keystroke.
  const cheatSheet = useMemo(
    () => commandCheatSheet(workspace?.ticket.scenarioId),
    [workspace?.ticket.scenarioId],
  )

  useEffect(() => {
    let cancelled = false
    if (!sessionId) {
      return
    }
    // The layout preference is read with the session rather than after it, so
    // the workspace first paints in the shape the learner left it in instead of
    // flashing the other one. A preference that will not read falls back to the
    // tab layout; it must never keep a ticket from opening.
    const preference = loadSplitView().catch(() => false)
    Promise.all([openSession(sessionId), preference])
      .then(([view, split]) => {
        if (!cancelled) {
          const code = view.closureDraft.code ?? DEFAULT_CLOSURE_CODE
          setWorkspace(view)
          setSplitView(split)
          // A resumed attempt reopens the close it was writing.
          setClosureCode(code)
          setResolutionNote(view.closureDraft.note)
          draftRef.current = { code, note: view.closureDraft.note }
          savedDraft.current = JSON.stringify({ code, note: view.closureDraft.note })
          draftReady.current = true
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setLoadError(caught instanceof Error ? caught.message : 'This session could not be opened.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [sessionId])

  useEffect(() => {
    if (!toolMenuOpen) {
      return
    }
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setToolMenuOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toolMenuOpen])

  /**
   * Writes the close form to the attempt. Called when typing pauses and when a
   * close field loses focus, which is also what happens as the learner leaves
   * the page. It skips the write when nothing changed since the last one.
   */
  /**
   * The switch is the control, so it moves at once and the write follows. A save
   * that fails is not worth interrupting the work over: the layout still applies
   * to this visit, and the next toggle stores it again.
   */
  const onToggleSplitView = useCallback(() => {
    const next = !splitView
    setSplitView(next)
    void saveSplitView(next).catch(() => {})
  }, [splitView])

  /** Keeps the divider where both halves are still worth reading. */
  const clampSplitRatio = (ratio: number) =>
    Math.min(SPLIT_MAX_RATIO, Math.max(SPLIT_MIN_RATIO, ratio))

  /**
   * The ratio under the pointer, measured against the width the two panes share —
   * the card minus the handle — because that is what the stylesheet multiplies.
   * A handle jsdom or a display-none handle reports as zero width is no drag.
   */
  const splitRatioAt = (clientX: number): number | null => {
    const card = splitRef.current
    const handle = splitHandle.current
    if (!card || !handle) {
      return null
    }
    const cardBox = card.getBoundingClientRect()
    const handleWidth = handle.getBoundingClientRect().width
    const usable = cardBox.width - handleWidth
    if (usable <= 0) {
      return null
    }
    return clampSplitRatio((clientX - cardBox.left - handleWidth / 2) / usable)
  }

  const onSplitPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const ratio = splitRatioAt(event.clientX)
    if (ratio === null) {
      return
    }
    event.preventDefault()
    // The divider moves before the capture is taken, because capture is an
    // optimisation: it keeps the drag alive over the panes, where a move would
    // otherwise land on a console and stop the resize halfway. If a browser
    // refuses it — a pointer id it does not consider active — the drag still
    // works while the pointer is over the handle.
    setDraggingSplit(true)
    setSplitRatio(ratio)
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Nothing to do: the drag continues without capture.
    }
  }

  const onSplitPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!draggingSplit) {
      return
    }
    const ratio = splitRatioAt(event.clientX)
    if (ratio !== null) {
      setSplitRatio(ratio)
    }
  }

  const onSplitPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!draggingSplit) {
      return
    }
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setDraggingSplit(false)
  }

  /**
   * The divider is a focusable separator, so the split is adjustable without a
   * mouse: arrows nudge it, Shift moves further, Home and End take a half to its
   * narrowest and widest, and Enter puts the default back.
   */
  const onSplitKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? SPLIT_KEY_STEP * SPLIT_KEY_COARSE_FACTOR : SPLIT_KEY_STEP
    const keys: Record<string, number> = {
      ArrowLeft: splitRatio - step,
      ArrowRight: splitRatio + step,
      Home: SPLIT_MIN_RATIO,
      End: SPLIT_MAX_RATIO,
      Enter: SPLIT_DEFAULT_RATIO,
    }
    const next = keys[event.key]
    if (next === undefined) {
      return
    }
    event.preventDefault()
    setSplitRatio(clampSplitRatio(next))
  }

  const flushDraft = useCallback(async () => {
    if (draftTimer.current !== null) {
      clearTimeout(draftTimer.current)
      draftTimer.current = null
    }
    if (!draftReady.current) {
      return
    }
    const signature = JSON.stringify(draftRef.current)
    if (savedDraft.current === signature) {
      return
    }
    savedDraft.current = signature
    try {
      await saveClosureDraft(draftRef.current)
    } catch (caught) {
      // Keep the typed close on screen and let the next edit try again.
      savedDraft.current = null
      setActionError(caught instanceof Error ? caught.message : 'The close could not be saved.')
    }
  }, [])

  useEffect(() => {
    draftRef.current = { code: closureCode, note: resolutionNote }
    if (!draftReady.current) {
      return
    }
    if (draftTimer.current !== null) {
      clearTimeout(draftTimer.current)
    }
    draftTimer.current = setTimeout(() => void flushDraft(), DRAFT_SAVE_DELAY_MS)
    return () => {
      if (draftTimer.current !== null) {
        clearTimeout(draftTimer.current)
        draftTimer.current = null
      }
    }
  }, [closureCode, resolutionNote, flushDraft])

  // The draft above sits in a timer, and the browser gives no warning before a
  // reload or a tab close — so the close written a moment ago is flushed when
  // the page is hidden or unloaded rather than waiting for the pause to pass.
  useFlushOnHide(flushDraft)

  // Leaving the ticket inside the app is the same gap: the route change unmounts
  // this page, and clearing the timer on the way out would drop the edit it had
  // not saved yet.
  useEffect(() => () => void flushDraft(), [flushDraft])

  useEffect(() => {
    const target = logEnd.current
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'nearest' })
    }
  }, [workspace?.entries.length])

  // A review is a snapshot of the evidence when the learner asked for it. Any
  // new step can change what the close would score, so the panel is retired and
  // the next try asks again instead of showing a count that is no longer true.
  useEffect(() => {
    setClosureReview(null)
  }, [workspace])

  /**
   * The score the close would write, read the way the close reads it: the log as
   * it stands, the code chosen, and the handoff note typed. It is the same dry
   * run the button makes, so the total and the charges under it cannot disagree
   * with what closing records. A failed read shows nothing rather than a number
   * nobody would be charged; the button still scores when it is used.
   */
  useEffect(() => {
    if (!workspace) {
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const review = await reviewClosure({ code: closureCode, note: resolutionNote })
          if (!cancelled) {
            setProjected(review)
          }
        } catch {
          if (!cancelled) {
            setProjected(null)
          }
        }
      })()
    }, PROJECTION_DELAY_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [workspace, closureCode, resolutionNote])

  /**
   * A learner who stops acting still gets interrupted: the caller's script has
   * lines about time passing, and nothing the learner does can make a silent
   * minute happen. The service answers with the attempt only when the caller
   * spoke, and the answer is dropped if something newer has already arrived —
   * a command finishing while the tick was in flight must not be undone by it.
   */
  useEffect(() => {
    if (!sessionId) {
      return
    }
    const timer = setInterval(() => {
      callerInterjection()
        .then((view) => {
          if (!view) {
            return
          }
          setWorkspace((current) =>
            current && lastSeq(current.entries) > lastSeq(view.entries) ? current : view,
          )
        })
        .catch(() => {
          // A tick is a background read: the next one retries, and a caller line
          // is never worth interrupting the learner's work over.
        })
    }, CALLER_TICK_MS)
    return () => clearInterval(timer)
  }, [sessionId])

  const run = useCallback(async (operation: () => Promise<WorkspaceView>) => {
    setBusy(true)
    setActionError(null)
    try {
      setWorkspace(await operation())
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'That action failed.')
    } finally {
      setBusy(false)
    }
  }, [])

  /**
   * A console projects machine state read at load time, so any command typed in
   * a terminal has to reread it or the pane would show a machine that no longer
   * exists. Failures here never fail the command that just succeeded.
   */
  const refreshOpenConsoles = useCallback(async () => {
    if (openTools.length === 0) {
      return
    }
    // Every open console is reread, not only the one on screen: the others are
    // still one click away, and a tab that shows the machine as it was before
    // the command would be worse than no tab at all.
    const refreshed = await Promise.all(
      openTools.map(async (consoleId) => {
        try {
          return [consoleId, await loadConsole(consoleId)] as const
        } catch {
          // Keep the view the command produced; a stale console is not an error.
          return [consoleId, null] as const
        }
      }),
    )
    setConsoles((current) => {
      const next = { ...current }
      for (const [consoleId, view] of refreshed) {
        if (view) {
          next[consoleId] = view
        }
      }
      return next
    })
  }, [openTools])

  /**
   * Commands typed in a Remote Desktop terminal. They run the same pipeline as
   * the side terminal — only the recorded source differs.
   */
  const onDesktopCommand = useCallback(
    async (input: string): Promise<WorkspaceView | null> => {
      setBusy(true)
      setActionError(null)
      try {
        const view = await submitDesktopTerminalCommand(input)
        setWorkspace(view)
        await refreshOpenConsoles()
        return view
      } catch (caught) {
        setActionError(
          caught instanceof Error ? caught.message : 'That command could not be run.',
        )
        return null
      } finally {
        setBusy(false)
      }
    },
    [refreshOpenConsoles],
  )

  const onCommand = async (event: FormEvent) => {
    event.preventDefault()
    const input = command.trim()
    if (!input || busy) {
      return
    }
    setHistory((current) => [...current.filter((item) => item !== input), input])
    setHistoryIndex(null)
    setCommand('')
    await run(() => submitCommand(input))
    await refreshOpenConsoles()
  }

  const onHistory = (direction: 'up' | 'down', event: KeyboardEvent<HTMLInputElement>) => {
    if (history.length === 0) {
      return
    }
    event.preventDefault()
    if (direction === 'up') {
      const next = historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1)
      setHistoryIndex(next)
      setCommand(history[next] ?? '')
      return
    }
    if (historyIndex === null) {
      return
    }
    const next = historyIndex + 1
    if (next >= history.length) {
      setHistoryIndex(null)
      setCommand('')
      return
    }
    setHistoryIndex(next)
    setCommand(history[next] ?? '')
  }

  const saveNote = async (noteKind: NoteKind, text: string, clear: () => void) => {
    await run(() => addNote(noteKind, text))
    clear()
  }

  // Un-running a step moves the world backwards, so an open console has to be
  // reread for the same reason a command forces a reread.
  const onRewind = async (fromSeq: number) => {
    setRewindTarget(null)
    await run(() => rewindAttempt(fromSeq))
    await refreshOpenConsoles()
  }

  // Putting a cut back moves the world forward to what it was before the cut,
  // so every open console reads the restored machine, not the rewound one.
  const onReapplyRewind = async (seq: number) => {
    await run(() => reapplyRewind(seq))
    await refreshOpenConsoles()
  }

  const verification = workspace?.verification
  const recipients = verification?.recipients ?? []
  // The caller is listed first, so a fresh attempt defaults to the right person.
  const selectedRecipient =
    recipients.find((recipient) => recipient.id === recipientId) ?? recipients[0]
  // A line takes a code or a call, and a desk phone takes only a call.
  const canSendCode = selectedRecipient?.methods.includes('verification-code') ?? false
  const canCallBack = selectedRecipient?.methods.includes('callback') ?? false
  // The caller's own handset can take a code, so the read-back is the check to
  // make; a callback is the fallback and is priced as one.
  const callerLine = recipients.find((recipient) => recipient.id === verification?.callerId)
  const codeGateAvailable =
    callerLine?.reachable === true && callerLine.methods.includes('verification-code')
  // What the caller can actually offer here, with a code to a dead handset taken
  // out. The panel prices the weaker proofs against this list the same way the
  // scorer will at the close.
  const callerMethods =
    callerLine?.methods.filter(
      (method) => method !== 'verification-code' || callerLine.reachable,
    ) ?? []
  const badgeCost = weakerVerificationCost('badge-scan', callerMethods)
  const letterPinCost = weakerVerificationCost('letter-pin', callerMethods)

  const onSendCode = async () => {
    if (!selectedRecipient || busy) {
      return
    }
    setBusy(true)
    setActionError(null)
    try {
      setWorkspace(await sendVerificationCode(selectedRecipient.id))
      setCodeDraft('')
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'The code could not be sent.')
    } finally {
      setBusy(false)
    }
  }

  const onCallBack = async () => {
    if (!selectedRecipient || busy) {
      return
    }
    setBusy(true)
    setActionError(null)
    try {
      setWorkspace(await placeCallback(selectedRecipient.id))
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'The call could not be placed.')
    } finally {
      setBusy(false)
    }
  }

  const onScanBadge = async () => {
    if (busy) {
      return
    }
    setBusy(true)
    setActionError(null)
    try {
      setWorkspace(await scanBadge())
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'The badge could not be scanned.')
    } finally {
      setBusy(false)
    }
  }

  const onInPerson = async () => {
    if (busy) {
      return
    }
    setBusy(true)
    setActionError(null)
    try {
      setWorkspace(await recordInPersonVisit())
    } catch (caught) {
      setActionError(
        caught instanceof Error ? caught.message : 'The walk-up could not be recorded.',
      )
    } finally {
      setBusy(false)
    }
  }

  const onConfirmLetterPin = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || letterPinDraft.trim().length === 0) {
      return
    }
    setBusy(true)
    setActionError(null)
    try {
      setWorkspace(await verifyCallerWithLetterPin(letterPinDraft))
      setLetterPinDraft('')
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'The PIN could not be checked.')
    } finally {
      setBusy(false)
    }
  }

  const onConfirmCode = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) {
      return
    }
    setBusy(true)
    setActionError(null)
    try {
      setWorkspace(await verifyCallerWithCode(codeDraft))
      setCodeDraft('')
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'The code could not be checked.')
    } finally {
      setBusy(false)
    }
  }

  const onDeny = async () => {
    if (busy) {
      return
    }
    setBusy(true)
    setActionError(null)
    try {
      setWorkspace(await denyCaller(denyReason))
      setConfirmDeny(false)
      // A refusal has a matching close disposition; the learner can still change it.
      setClosureCode('denied-social-engineering')
      setClosureReview(null)
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'The request could not be refused.')
    } finally {
      setBusy(false)
    }
  }

  const onResolve = async (event: FormEvent) => {
    event.preventDefault()
    if (!sessionId || busy) {
      return
    }
    setBusy(true)
    setActionError(null)
    try {
      if (!closureReview) {
        const review = await reviewClosure({ code: closureCode, note: resolutionNote })
        // A close that would pass can still leave the network proof bonus on
        // the table, so the review is shown before the learner commits to it.
        if (review.blocking.length > 0 || review.pendingBonusXp > 0) {
          setClosureReview(review)
          setBusy(false)
          return
        }
      }
      await resolveAttempt({ code: closureCode, note: resolutionNote })
      navigate(`/debrief/${sessionId}`)
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'The ticket could not be resolved.')
      setBusy(false)
    }
  }

  const toolLabel = (consoleId: ConsoleId): string =>
    toolGroups.flatMap((group) => group.tools).find((tool) => tool.id === consoleId)?.label ??
    consoleId

  const onShowConsole = async (consoleId: ConsoleId) => {
    setPaneMode('tools')
    setOpenTool(consoleId)
    // Opening a tool that is already open only brings it forward.
    setOpenTools((current) =>
      current.includes(consoleId) ? current : [...current, consoleId],
    )
    setToolMenuOpen(false)
    try {
      const view = await loadConsole(consoleId)
      if (!view) {
        setConsoleErrors((current) => ({
          ...current,
          [consoleId]: 'Open a ticket before using this console.',
        }))
        return
      }
      setConsoles((current) => ({ ...current, [consoleId]: view }))
      setConsoleErrors((current) => ({ ...current, [consoleId]: undefined }))
    } catch (caught) {
      setConsoleErrors((current) => ({
        ...current,
        [consoleId]:
          caught instanceof Error ? caught.message : 'The console could not be read.',
      }))
    }
  }

  /**
   * Closing a tab drops its view as well as the tab, so reopening the tool reads
   * the machine again rather than putting back what it looked like when it was
   * closed. The pane moves to the neighbour the tab had, or to the shelf when it
   * had none.
   */
  const onCloseConsole = (consoleId: ConsoleId) => {
    const remaining = openTools.filter((id) => id !== consoleId)
    setOpenTools(remaining)
    setConsoles((current) => withoutConsole(current, consoleId))
    setConsoleErrors((current) => withoutConsole(current, consoleId))
    if (openTool === consoleId) {
      const index = openTools.indexOf(consoleId)
      setOpenTool(remaining[Math.min(index, remaining.length - 1)] ?? null)
    }
  }

  const runConsole = useCallback(
    async (consoleId: ConsoleId, entryId: string, actionId: string, inputs?: readonly string[]) => {
      setBusy(true)
      setActionError(null)
      try {
        const view =
          inputs && inputs.length > 0
            ? await runConsoleAction(consoleId, entryId, actionId, inputs)
            : await runConsoleAction(consoleId, entryId, actionId)
        setWorkspace(view)
        // The console map is evidence-driven, so reread it after every check.
        try {
          const refreshed = await loadConsole(consoleId)
          if (refreshed) {
            setConsoles((current) => ({ ...current, [consoleId]: refreshed }))
          }
        } catch {
          // A stale console view must not fail the action that just succeeded.
        }
        return view
      } catch (caught) {
        setActionError(
          caught instanceof Error ? caught.message : 'That console action could not be run.',
        )
        return null
      } finally {
        setBusy(false)
      }
    },
    [],
  )

  const onRevealHint = async () => {
    setBusy(true)
    setActionError(null)
    try {
      setWorkspace(await revealHint())
    } catch (caught) {
      if (caught instanceof NoHintAvailableError) {
        setHintsExhausted(true)
      } else if (caught instanceof HintBudgetSpentError) {
        setHintBudgetNotice(caught.message)
      } else {
        setActionError(caught instanceof Error ? caught.message : 'The hint could not be revealed.')
      }
    } finally {
      setBusy(false)
    }
  }

  const onAbandon = async () => {
    if (busy) {
      return
    }
    setBusy(true)
    setActionError(null)
    try {
      await abandonAttempt()
      navigate('/practice')
    } catch (caught) {
      setActionError(
        caught instanceof Error ? caught.message : 'The ticket could not be abandoned.',
      )
      setBusy(false)
    }
  }

  if (loadError) {
    return (
      <div className={practice.centerPanel}>
        <h1 className={practice.centerTitle}>Session unavailable</h1>
        <p className={practice.muted}>{loadError}</p>
        <Link className={practice.secondaryButton} to="/practice">
          Back to the queue
        </Link>
      </div>
    )
  }

  if (!workspace) {
    return <p className={practice.muted}>Opening the ticket…</p>
  }

  const { ticket } = workspace
  // The attempt's own price, pinned when it started — not the current setting.
  const hintsFree = workspace.hintPolicy.perHint <= 0 || workspace.hintPolicy.cap <= 0
  const hintBudget = workspace.hintPolicy.budget
  const budgetSpent = workspace.hintBudgetSpent || hintBudgetNotice !== null
  // The tools this ticket is worked with come first; the rest waits behind the
  // full-reference toggle rather than making every ticket scroll the whole list.
  const leadingGroups = cheatSheet.filter((group) => group.relevant)
  const foldedGroups = cheatSheet.filter((group) => !group.relevant)
  const caller = ticket.requester
  // The UUID routes the session; the desk refers to a ticket by its short ref.
  const ticketRef = `SD-${ticket.id.replace(/-/g, '').slice(0, 6).toUpperCase()}`
  // The disposition the projection is priced with, named as the form names it.
  const closeLabel = closures.find((entry) => entry.code === closureCode)?.label ?? closureCode

  return (
    <div className={styles.workspace}>
      <div className={styles.stageBar}>
        <Link className={styles.backLink} to="/practice">
          <span aria-hidden="true">←</span> Back to queue
        </Link>
        <div className={styles.stageMeta}>
          <span className={styles.stageId}>{ticketRef}</span>
          <span className={styles.stageDivider} aria-hidden="true" />
          <span className={styles.stageClock}>
            {formatSimClock(workspace.simulatedClock)} · {workspace.minutesElapsed} min elapsed
          </span>

          {/*
            The procedure cost, priced from the log and shown while the learner
            can still act on it. It appears at zero so the mechanic is visible
            before the first mistake, and names each mistake as it is recorded.
          */}
          <details
            className={styles.procedureCost}
            data-recorded={workspace.procedureViolations.length > 0}
          >
            <summary>
              <span className={styles.procedureCostIcon} aria-hidden="true">
                ⚖
              </span>
              <span className={styles.procedureCostLabel}>Process cost</span>
              <span className={styles.procedureCostValue}>
                {workspace.procedurePenalty === 0
                  ? '0 pts'
                  : `−${workspace.procedurePenalty} pts`}
              </span>
            </summary>
            {workspace.procedureViolations.length === 0 ? (
              <p className={styles.procedureCostNote}>
                No process deductions so far. Changing something before the caller is
                verified, or fixing before reading any evidence, is priced here as it
                happens.
              </p>
            ) : (
              <ul className={styles.procedureCostList}>
                {workspace.procedureViolations.map((violation) => (
                  <li key={violation.id}>
                    <span className={styles.procedureCostItem}>
                      <span className={styles.procedureCostViolation}>{violation.label}</span>
                      <span className={styles.procedureCostPoints}>−{violation.points}</span>
                    </span>
                    <span className={styles.procedureCostDetail}>{violation.detail}</span>
                  </li>
                ))}
              </ul>
            )}
          </details>

          {/*
            What closing now would score, with both charges already taken out.
            It is a dry run of the same rubric the close runs, refreshed with
            the log and the close form, so a learner sees the price of a hint or
            a skipped check while there is still time to change the next step.
          */}
          {projected ? (
            <div
              className={styles.projection}
              data-tone={projected.passed ? 'pass' : 'fail'}
              data-charged={projected.procedurePenalty + projected.hintPenalty > 0}
            >
              <button
                type="button"
                className={styles.projectionSummary}
                aria-expanded={projectionOpen}
                aria-controls="projection-breakdown"
                onClick={() => setProjectionOpen((open) => !open)}
              >
                <span className={styles.projectionIcon} aria-hidden="true">
                  ◈
                </span>
                <span className={styles.projectionLabel}>Projected close</span>
                <span className={styles.projectionScore}>
                  {projected.total}
                  <span className={styles.projectionMax}>/100</span>
                </span>
                <span className={styles.projectionCharges}>
                  {projected.procedurePenalty === 0 && projected.hintPenalty === 0
                    ? 'no deductions'
                    : `−${projected.procedurePenalty} process · −${projected.hintPenalty} hints`}
                </span>
              </button>
              {projectionOpen ? (
                <div
                  id="projection-breakdown"
                  className={styles.projectionPanel}
                  aria-label="Projected score"
                  role="group"
                >
                  <p className={styles.projectionVerdict}>
                    {projected.passed
                      ? 'Closing with this form would pass.'
                      : 'Closing with this form would not pass yet.'}
                  </p>
                  <dl className={styles.projectionRows}>
                    <div className={styles.projectionRow}>
                      <dt>Process cost</dt>
                      <dd data-charged={projected.procedurePenalty > 0}>
                        {projected.procedurePenalty > 0
                          ? `−${projected.procedurePenalty} pts`
                          : 'none'}
                      </dd>
                    </div>
                    <div className={styles.projectionRow}>
                      <dt>Hint penalty</dt>
                      <dd data-charged={projected.hintPenalty > 0}>
                        {projected.hintPenalty > 0 ? `−${projected.hintPenalty} pts` : 'none'}
                      </dd>
                    </div>
                  </dl>
                  <p className={styles.projectionScoredWith}>
                    Scored with <strong>{closeLabel}</strong> and the handoff note as it stands.
                  </p>
                  <p className={styles.projectionNote}>
                    Both charges are already taken out of the total, and are the ones the close
                    would record. The score follows the log and this form; the close button is
                    what commits it.
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className={styles.stage}>
        <div className={styles.ticketColumn}>
          <section className={styles.ticketCard} aria-label="Ticket">
            <div className={styles.cardTop}>
              <span className={styles.ticketId}>{ticketRef}</span>
              <span className={styles.severity} data-severity={ticket.severity}>
                {SEVERITY_LABELS[ticket.severity]}
              </span>
              <span className={styles.cardTopLine} aria-hidden="true" />
              <span className={styles.cardStatus}>Open</span>
            </div>

            <h1 className={styles.ticketSubject}>{ticket.subject}</h1>

            <div className={styles.assigneeRow}>
              <span className={styles.avatar} aria-hidden="true">
                YO
              </span>
              <span className={styles.assigneeText}>
                <span className={styles.fieldLabel}>Assignee</span>
                <span className={styles.assigneeName}>You</span>
              </span>
              <span className={styles.statusPill}>In progress</span>
            </div>

            <div className={styles.details}>
              <div className={styles.detailRow}>
                <span className={styles.fieldLabel}>Reported by</span>
                <p className={styles.detailValue}>
                  {caller.name}{' '}
                  <span className={styles.detailMuted}>({caller.email})</span>
                </p>
              </div>
              <div className={styles.detailPairRow}>
                <div className={styles.detailPair}>
                  <span className={styles.fieldLabel}>Department</span>
                  <p className={styles.detailValue}>{caller.department}</p>
                </div>
                <div className={styles.detailPair}>
                  <span className={styles.fieldLabel}>Contact</span>
                  <p className={styles.detailValue}>{caller.samAccountName}</p>
                </div>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.fieldLabel}>Issue description</span>
                <p className={styles.detailValue}>{ticket.body}</p>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.fieldLabel}>Business impact</span>
                <ul className={styles.impactList}>
                  {ticket.symptoms.map((symptom) => (
                    <li key={symptom}>{symptom}</li>
                  ))}
                </ul>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.fieldLabel}>Device</span>
                <p className={styles.detailValue}>
                  {ticket.device.hostname} · {ticket.device.os} · {ticket.device.siteName}
                </p>
              </div>
            </div>

            <div className={styles.hintPanel}>
              <div className={styles.hintHead}>
                <span className={styles.hintIcon} aria-hidden="true">
                  ?
                </span>
                <h2>Hint how to resolve</h2>
                <span className={styles.hintCount}>
                  {workspace.exam ? 'Withheld' : `${workspace.hintsRemaining} left`}
                </span>
              </div>
              {workspace.exam ? (
                <p className={styles.hintBlurb}>
                  This ticket is an <strong>exam attempt</strong>, so every hint stays closed
                  until it is scored and the price is the exam's, not the one in Settings. The
                  debrief opens with the ladders the exam withheld — {workspace.hintPolicy.perHint}{' '}
                  points a rung on this attempt — so the steps you miss are still explained.
                </p>
              ) : (
                <>
                <p className={styles.hintBlurb}>
                  {hintsFree
                    ? 'Hints are free on this device.'
                    : `Each rung costs ${workspace.hintPolicy.perHint} points of diagnostic reasoning, up to ${workspace.hintPolicy.cap} on a ticket; after that they are free.`}{' '}
                  {hintBudget > 0
                    ? `This attempt may take up to ${hintBudget} hint${hintBudget === 1 ? '' : 's'}.`
                    : ''}{' '}
                  <strong>
                    {workspace.hintsRemaining} hint{workspace.hintsRemaining === 1 ? '' : 's'}{' '}
                    remain
                  </strong>{' '}
                  on this ticket.
                </p>
                {workspace.hints.length > 0 ? (
                  <>
                    <ol className={styles.hintList}>
                      {workspace.hints.map((hint, index) => (
                        <li key={hint.id}>
                          <span className={styles.hintStep}>{index + 1}</span>
                          <span>{hint.text}</span>
                        </li>
                      ))}
                    </ol>
                    <p className={styles.hintMeta}>
                      {workspace.hints.length} revealed ·{' '}
                      {workspace.hintPenalty === 0
                        ? 'no points spent'
                        : `−${workspace.hintPenalty} points so far`}
                      {hintsFree || workspace.hintPenalty >= workspace.hintPolicy.cap
                        ? ' (no further charge — the rest are free)'
                        : ''}
                      .
                    </p>
                  </>
                ) : null}
                {hintBudget > 0 ? (
                  <p className={styles.hintMeta}>
                    Hints used: <strong>{workspace.hints.length}</strong> of {hintBudget} for this
                    attempt.
                  </p>
                ) : null}
                {hintsExhausted ? (
                  <p className={styles.hintMeta}>
                    Every hinted step on this ticket has been revealed. The debrief will explain the
                    rest.
                  </p>
                ) : budgetSpent ? (
                  <p className={styles.hintMeta}>
                    {hintBudgetNotice ??
                      `You have used all ${hintBudget} hint${hintBudget === 1 ? '' : 's'} this attempt's budget allows. Carry on unaided, or raise the budget in Settings for the next ticket.`}
                  </p>
                ) : (
                  <button
                    type="button"
                    className={styles.hintReveal}
                    disabled={busy}
                    onClick={() => void onRevealHint()}
                  >
                    {workspace.hints.length === 0 ? 'Reveal the first hint' : 'Reveal the next hint'}
                    <span>
                      {hintsFree || workspace.hintPenalty >= workspace.hintPolicy.cap
                        ? 'free'
                        : `−${workspace.hintPolicy.perHint} points`}{' '}
                      · {workspace.hintsRemaining} left
                    </span>
                  </button>
                )}
                </>
              )}
            </div>
          </section>

          <section className={styles.caseCard} aria-label="Case file">
            <div className={styles.caseHead}>
              <h2>Case file</h2>
              <span className={styles.caseHint}>Your actions and closing paperwork</span>
            </div>

            <div className={practice.actionBlock}>
              <h2>{workspace.denial ? 'Request refused' : 'Verify the caller'}</h2>
              {workspace.denial ? (
                <>
                  <div className={practice.denyState} role="status">
                    <p className={practice.denyHeading}>{workspace.denial.label}</p>
                    <p className={practice.mutedSmall}>
                      {workspace.denial.summary} No account changes were made on the caller’s word.
                      Record what was asked, then close the ticket with the denial outcome.
                    </p>
                  </div>
                  <ClaimFindings findings={workspace.verification.contradictions} />
                </>
              ) : (
                <>
                  {workspace.hasVerifiedCaller ? (
                    <p className={practice.mutedSmall}>
                      Caller verified. Account changes are now defensible.
                    </p>
                  ) : (
                    <>
                      <p className={practice.mutedSmall}>
                        Send one code to the person on the ticket and have them read it back, ring
                        a line on file and confirm the request with them, or use something the
                        caller carries or can do at the desk. Only one code is live at a time, and
                        a code only proves who received it.
                      </p>
                      <label className={practice.fieldLabel} htmlFor="verification-recipient">
                        Contact to reach
                      </label>
                      <select
                        id="verification-recipient"
                        className={practice.select}
                        value={selectedRecipient?.id ?? ''}
                        onChange={(event) => setRecipientId(event.target.value)}
                        disabled={busy}
                      >
                        {recipients.map((recipient) => (
                          <option key={recipient.id} value={recipient.id}>
                            {recipient.name} —{' '}
                            {recipient.role === 'caller' ? 'on the ticket' : 'manager on file'} (
                            {recipient.destination})
                          </option>
                        ))}
                      </select>
                      <div className={practice.buttonRow}>
                        <button
                          type="button"
                          className={practice.secondaryButton}
                          disabled={busy || !selectedRecipient || !canSendCode}
                          onClick={() => void onSendCode()}
                        >
                          Send verification code
                        </button>
                        <button
                          type="button"
                          className={practice.secondaryButton}
                          disabled={busy || !selectedRecipient || !canCallBack}
                          onClick={() => void onCallBack()}
                        >
                          Ring this contact back
                        </button>
                      </div>

                      {selectedRecipient && !canSendCode ? (
                        <p className={practice.mutedSmall}>
                          {selectedRecipient.destination} cannot take a code. Ring it back instead.
                        </p>
                      ) : null}

                      {codeGateAvailable ? (
                        <p className={practice.mutedSmall}>
                          A read-back is the check to make here: the code proves the person on the
                          call holds the handset. A call only reaches whoever answers the line, so
                          ringing back instead costs {CALLBACK_OVER_CODE_PENALTY} safety points.
                        </p>
                      ) : null}

                      {verification?.callback ? (
                        <p
                          className={
                            verification.callback.result === 'verified'
                              ? practice.mutedSmall
                              : practice.warning
                          }
                          role="status"
                        >
                          {verification.callback.message}
                        </p>
                      ) : null}

                      {verification?.active ? (
                        <div className={practice.verificationState}>
                          <p className={practice.mutedSmall}>
                            Code sent to {verification.active.recipientName} —{' '}
                            {verification.active.destination}.
                          </p>
                          {verification.active.forCaller ? (
                            <p className={practice.callerReadBack}>
                              <span>{verification.active.recipientName}</span> “
                              {verification.active.readBack}”
                            </p>
                          ) : verification.active.callerImpersonating ? (
                            <p className={practice.warning} role="alert">
                              The live code went to {verification.active.recipientName} — the person
                              on this ticket. Whoever is on this call is not them, so it cannot be
                              read back.
                            </p>
                          ) : !verification.active.recipientReachable ? (
                            <p className={practice.warning} role="alert">
                              The code went to {verification.active.recipientName} on{' '}
                              {verification.active.destination}, and that line cannot reach them.
                              Nobody can read it back — ring the line they answer.
                            </p>
                          ) : (
                            <p className={practice.warning} role="alert">
                              The active verification code went to{' '}
                              {verification.active.recipientName} — not this ticket.
                            </p>
                          )}
                          <form
                            className={practice.verificationForm}
                            onSubmit={(event) => void onConfirmCode(event)}
                          >
                            <label className={practice.fieldLabel} htmlFor="verification-code">
                              Code the caller read back
                            </label>
                            <input
                              id="verification-code"
                              className={practice.codeInput}
                              inputMode="numeric"
                              autoComplete="off"
                              value={codeDraft}
                              onChange={(event) => setCodeDraft(event.target.value)}
                              disabled={busy}
                              placeholder="000 000"
                            />
                            <button
                              type="submit"
                              className={practice.secondaryButton}
                              disabled={busy}
                            >
                              Confirm code
                            </button>
                          </form>
                        </div>
                      ) : null}

                      {verification?.lastAttempt &&
                      (verification.active?.forCaller ||
                        verification.active?.callerImpersonating ||
                        verification.active?.recipientReachable === false) ? (
                        <p className={practice.error} role="alert">
                          {verification.lastAttempt.message}
                        </p>
                      ) : null}

                      {verification?.methods &&
                      (verification.methods.badge.available ||
                        verification.methods.letterPin.available ||
                        verification.methods.inPerson.available) ? (
                        <section
                          className={practice.proofList}
                          aria-label="Other ways to prove the caller"
                        >
                          <h3 className={practice.proofHeading}>Other ways to prove the caller</h3>

                          <div className={practice.proofRow}>
                            <div className={practice.proofCopy}>
                              <p className={practice.proofName}>Badge at the desk</p>
                              <p className={practice.mutedSmall}>
                                {verification.methods.badge.available
                                  ? `Scan the badge on file (${verification.methods.badge.badgeId}) and check the photo against the directory.`
                                  : 'A badge can only be scanned when the caller is at the desk.'}
                              </p>
                              {badgeCost > 0 ? (
                                <p className={practice.mutedSmall}>
                                  While a live code could reach the caller, this costs {badgeCost}{' '}
                                  safety points.
                                </p>
                              ) : null}
                            </div>
                            <button
                              type="button"
                              className={practice.secondaryButton}
                              disabled={busy || !verification.methods.badge.available}
                              onClick={() => void onScanBadge()}
                            >
                              Scan badge
                            </button>
                          </div>

                          <div className={practice.proofRow}>
                            <div className={practice.proofCopy}>
                              <p className={practice.proofName}>PIN from the letter</p>
                              {!verification.methods.letterPin.available ? (
                                <p className={practice.mutedSmall}>
                                  No onboarding letter was issued to this employee.
                                </p>
                              ) : verification.methods.letterPin.locked ? (
                                <p className={practice.warning}>
                                  Locked after three wrong entries. Use another proof, or retry the
                                  ticket.
                                </p>
                              ) : (
                                <>
                                  <p className={practice.mutedSmall}>
                                    {verification.methods.letterPin.readBack
                                      ? `The caller reads the PIN from the letter: ${verification.methods.letterPin.readBack}.`
                                      : 'The letter is at the employee’s home address, so this caller does not have it.'}{' '}
                                    {verification.methods.letterPin.attemptsLeft} attempts left.
                                  </p>
                                  {letterPinCost > 0 ? (
                                    <p className={practice.mutedSmall}>
                                      A printed PIN is a fixed secret; while a live code could reach
                                      the caller, this costs {letterPinCost} safety points.
                                    </p>
                                  ) : null}
                                  <form
                                    className={practice.verificationForm}
                                    onSubmit={(event) => void onConfirmLetterPin(event)}
                                  >
                                    <label className={practice.fieldLabel} htmlFor="letter-pin">
                                      PIN the caller read out
                                    </label>
                                    <input
                                      id="letter-pin"
                                      className={practice.codeInput}
                                      inputMode="numeric"
                                      autoComplete="off"
                                      value={letterPinDraft}
                                      onChange={(event) => setLetterPinDraft(event.target.value)}
                                      disabled={busy || !verification.methods.letterPin.readBack}
                                      placeholder="000 000"
                                    />
                                    <button
                                      type="submit"
                                      className={practice.secondaryButton}
                                      disabled={busy || !verification.methods.letterPin.readBack}
                                    >
                                      Confirm PIN
                                    </button>
                                  </form>
                                </>
                              )}
                            </div>
                          </div>

                          <div className={practice.proofRow}>
                            <div className={practice.proofCopy}>
                              <p className={practice.proofName}>Walk-up at the desk</p>
                              <p className={practice.mutedSmall}>
                                {verification.methods.inPerson.available
                                  ? 'Record the photo ID check against the directory while the person is in front of you.'
                                  : 'A walk-up can only prove someone who is at the desk.'}
                              </p>
                            </div>
                            <button
                              type="button"
                              className={practice.secondaryButton}
                              disabled={busy || !verification.methods.inPerson.available}
                              onClick={() => void onInPerson()}
                            >
                              Log walk-up
                            </button>
                          </div>

                          {verification.methodAttempt ? (
                            <p
                              className={
                                verification.methodAttempt.result === 'verified'
                                  ? practice.mutedSmall
                                  : practice.warning
                              }
                              role="status"
                            >
                              {verification.methodAttempt.message}
                            </p>
                          ) : null}
                        </section>
                      ) : null}

                      <ClaimFindings findings={verification?.contradictions ?? []} />
                    </>
                  )}

                  {confirmDeny ? (
                    <div
                      className={practice.denyState}
                      role="alertdialog"
                      aria-label="Confirm denial"
                    >
                      <p className={practice.denyHeading}>Refuse this request?</p>
                      <p className={practice.mutedSmall}>
                        This is recorded against the attempt and cannot be undone. Pick what the
                        caller actually did.
                      </p>
                      <label className={practice.fieldLabel} htmlFor="denial-reason">
                        Reason for refusing
                      </label>
                      <select
                        id="denial-reason"
                        className={practice.select}
                        value={denyReason}
                        onChange={(event) => setDenyReason(event.target.value as DenialReason)}
                        disabled={busy}
                      >
                        {denialChoices.map((choice) => (
                          <option key={choice.reason} value={choice.reason}>
                            {choice.label}
                          </option>
                        ))}
                      </select>
                      <p className={practice.mutedSmall}>
                        {denialChoices.find((choice) => choice.reason === denyReason)?.detail}
                      </p>
                      <div className={practice.buttonRow}>
                        <button
                          type="button"
                          className={practice.dangerButton}
                          disabled={busy}
                          onClick={() => void onDeny()}
                        >
                          Confirm denial
                        </button>
                        <button
                          type="button"
                          className={practice.ghostButton}
                          disabled={busy}
                          onClick={() => setConfirmDeny(false)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={practice.dangerButton}
                      disabled={busy}
                      onClick={() => setConfirmDeny(true)}
                    >
                      Deny (social engineering)
                    </button>
                  )}
                </>
              )}
            </div>

            <div className={practice.actionBlock}>
              <h2>Ask the requester</h2>
              <div className={practice.stackedButtons}>
                {prompts.map((prompt) => (
                  <button
                    key={prompt.intent}
                    type="button"
                    className={practice.ghostButton}
                    disabled={busy}
                    onClick={() => void run(() => askCaller(prompt.intent))}
                  >
                    {prompt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={practice.actionBlock}>
              <h2>Troubleshooting notes</h2>
              <ul className={practice.savedNotes}>
                {workspace.troubleshootingNotes.length === 0 ? (
                  <li className={practice.mutedSmall}>
                    Nothing logged yet. Notes are part of the score.
                  </li>
                ) : (
                  workspace.troubleshootingNotes.map((note, index) => (
                    <li key={`${index}-${note.slice(0, 12)}`}>{note}</li>
                  ))
                )}
              </ul>
              <textarea
                className={practice.noteInput}
                placeholder="What did you check, what did you find, and what did you change?"
                value={troubleshootingDraft}
                onChange={(event) => setTroubleshootingDraft(event.target.value)}
                rows={3}
              />
              <button
                type="button"
                className={practice.secondaryButton}
                disabled={busy}
                onClick={() =>
                  void saveNote('troubleshooting', troubleshootingDraft, () =>
                    setTroubleshootingDraft(''),
                  )
                }
              >
                Log troubleshooting note
              </button>
            </div>

            <div className={practice.actionBlock}>
              <h2>Customer notes</h2>
              <ul className={practice.savedNotes}>
                {workspace.customerNotes.length === 0 ? (
                  <li className={practice.mutedSmall}>No customer-facing update yet.</li>
                ) : (
                  workspace.customerNotes.map((note, index) => (
                    <li key={`${index}-${note.slice(0, 12)}`}>{note}</li>
                  ))
                )}
              </ul>
              <textarea
                className={practice.noteInput}
                placeholder="Plain-language update for the requester."
                value={customerDraft}
                onChange={(event) => setCustomerDraft(event.target.value)}
                rows={2}
              />
              <button
                type="button"
                className={practice.secondaryButton}
                disabled={busy}
                onClick={() =>
                  void saveNote('customer', customerDraft, () => setCustomerDraft(''))
                }
              >
                Send customer note
              </button>
            </div>

            <form className={practice.actionBlock} onSubmit={(event) => void onResolve(event)}>
              <h2>Close the ticket</h2>
              <label className={practice.fieldLabel} htmlFor="closure-code">
                Closure code
              </label>
              <select
                id="closure-code"
                className={practice.select}
                value={closureCode}
                onChange={(event) => {
                  setClosureCode(event.target.value)
                  setClosureReview(null)
                }}
                onBlur={() => void flushDraft()}
              >
                {closures.map((entry) => (
                  <option key={entry.code} value={entry.code}>
                    {entry.label}
                  </option>
                ))}
              </select>
              <label className={practice.fieldLabel} htmlFor="resolution-note">
                Handoff note
              </label>
              <textarea
                id="resolution-note"
                className={practice.noteInput}
                rows={3}
                value={resolutionNote}
                onChange={(event) => {
                  setResolutionNote(event.target.value)
                  setClosureReview(null)
                }}
                onBlur={() => void flushDraft()}
                maxLength={CLOSURE_NOTE_LIMIT}
                placeholder="What was reported, what you checked, and what the next team should do"
              />
              <p className={practice.mutedSmall}>
                The code and note are saved with the attempt, so a reload brings this close back
                exactly as you left it.
              </p>
              {closureReview ? (
                <div className={practice.closureNotice} role="alert">
                  <strong>
                    {closureReview.blocking.length > 0 || !closureReview.passed
                      ? 'This attempt would not pass yet'
                      : 'The network proof bonus is still available'}
                  </strong>
                  {closureReview.blocking.length > 0 ? (
                    <>
                      <span>
                        It would score {closureReview.total}/100. These critical steps are still
                        missing:
                      </span>
                      <ul>
                        {closureReview.blocking.map((item) => (
                          <li key={item.id}>
                            {item.label}
                            {item.hint ? ` — ${item.hint}` : ''}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : closureReview.passed ? (
                    <span>
                      It would score {closureReview.total}/100 and pass, but closing now leaves the
                      network proof bonus unclaimed.
                    </span>
                  ) : (
                    <span>
                      It would score {closureReview.total}/100, below the pass mark, and closing now
                      also leaves the network proof bonus unclaimed.
                    </span>
                  )}
                  {closureReview.topology ? (
                    <>
                      <span>
                        Network proof: {closureReview.topology.provedLinks} of{' '}
                        {closureReview.topology.totalLinks} links proved.
                      </span>
                      {closureReview.topology.bonusXp > 0 ? (
                        <span>
                          Every link is proved, so this close includes the network bonus: +
                          {closureReview.topology.bonusXp} XP.
                        </span>
                      ) : (
                        <>
                          <span>
                            Prove the remaining links in the Server Room before you close and this
                            close pays +{closureReview.pendingBonusXp} XP.
                          </span>
                          <ul>
                            {closureReview.topology.untested.map((link) => (
                              <li key={`untested-${link.label}`}>
                                Not tested: <strong>{link.label}</strong> —{' '}
                                <code>{link.command}</code>
                              </li>
                            ))}
                            {closureReview.topology.failed.map((link) => (
                              <li key={`failed-${link.label}`}>
                                Tested and failed: <strong>{link.label}</strong> —{' '}
                                <code>{link.command}</code>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </>
                  ) : null}
                  <span>
                    {closureReview.blocking.length > 0 || !closureReview.passed
                      ? 'Close anyway to record the attempt as it stands, or keep working and close when the steps are done.'
                      : 'Keep working to prove the links, or close now and score what you have.'}
                  </span>
                </div>
              ) : null}
              <button
                type="submit"
                className={practice.primaryButton}
                disabled={busy}
              >
                {closureReview
                  ? closureReview.blocking.length > 0 || !closureReview.passed
                    ? 'Close anyway and score'
                    : 'Close without the bonus'
                  : 'Resolve ticket'}
              </button>
              <p className={practice.mutedSmall}>
                Required when you escalate: name the report, the evidence, and the next action.
                Resolving closes the session and scores your evidence, notes, and decision.
              </p>
            </form>

            <div className={practice.actionBlock}>
              <h2>Abandon the ticket</h2>
              {confirmAbandon ? (
                <>
                  <p className={practice.mutedSmall}>
                    The attempt is recorded as abandoned, not scored, and the ticket returns to the
                    queue. Nothing you have logged is deleted.
                  </p>
                  <div className={practice.buttonRow}>
                    <button
                      type="button"
                      className={practice.dangerButton}
                      disabled={busy}
                      onClick={() => void onAbandon()}
                    >
                      {busy ? 'Abandoning…' : 'Abandon attempt'}
                    </button>
                    <button
                      type="button"
                      className={practice.secondaryButton}
                      disabled={busy}
                      onClick={() => setConfirmAbandon(false)}
                    >
                      Keep working
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  className={practice.secondaryButton}
                  disabled={busy}
                  onClick={() => setConfirmAbandon(true)}
                >
                  Abandon this ticket
                </button>
              )}
            </div>

            <details className={styles.cheatSheet}>
              <summary>Command cheat sheet</summary>
              <p className={practice.mutedSmall}>
                The tools this ticket is worked with, in the groups <code>help</code> prints.
                {foldedGroups.length > 0
                  ? ' The rest of the reference is folded away below.'
                  : ' Every command the simulated terminal takes is listed.'}
              </p>
              <CheatSheetGroups groups={leadingGroups} />
              {foldedGroups.length > 0 && (
                <>
                  <button
                    type="button"
                    className={styles.cheatSheetToggle}
                    aria-expanded={showFullReference}
                    onClick={() => setShowFullReference((expanded) => !expanded)}
                  >
                    {showFullReference
                      ? 'Hide the full reference'
                      : `Full reference · ${foldedGroups.length} more group${foldedGroups.length === 1 ? '' : 's'}`}
                  </button>
                  {showFullReference && <CheatSheetGroups groups={foldedGroups} />}
                </>
              )}
            </details>
          </section>
        </div>

        <section className={styles.toolCard} aria-label="Simulated tools">
          <div className={styles.toolHead}>
            <div className={styles.toolIdentity}>
              <span className={styles.toolGlyph} aria-hidden="true">
                ⌘
              </span>
              <span>
                <span className={styles.toolEyebrow}>Service desk</span>
                <span className={styles.toolTitle}>{openTool ? toolLabel(openTool) : 'Workstation'}</span>
              </span>
            </div>
            <div className={styles.toolHeadActions}>
              <button
                type="button"
                role="switch"
                aria-checked={splitView}
                aria-label="Split screen view"
                className={
                  splitView ? `${styles.splitToggle} ${styles.splitToggleOn}` : styles.splitToggle
                }
                onClick={onToggleSplitView}
              >
                <span className={styles.splitTrack} aria-hidden="true">
                  <span className={styles.splitKnob} />
                </span>
                <span className={styles.splitToggleLabel}>Split screen view</span>
              </button>
              <span className={styles.toolClock}>{formatSimClock(workspace.simulatedClock)}</span>
              <button
                type="button"
                className={styles.toolsMenuButton}
                aria-expanded={toolMenuOpen}
                onClick={() => setToolMenuOpen((open) => !open)}
              >
                Tools <span aria-hidden="true">▾</span>
              </button>
            </div>

            {toolMenuOpen ? (
              <div className={styles.toolsMenu} role="dialog" aria-label="Tools menu">
                <div className={styles.toolsMenuHead}>
                  <span>Tools</span>
                  <button
                    type="button"
                    className={styles.toolsMenuClose}
                    aria-label="Close tools menu"
                    onClick={() => setToolMenuOpen(false)}
                  >
                    ×
                  </button>
                </div>
                <div className={styles.toolsMenuBody}>
                  <ToolPicker
                    groups={toolGroups}
                    compact
                    onOpen={(id) => void onShowConsole(id)}
                  />
                </div>
              </div>
            ) : null}
          </div>

          {/* Split view shows both panes at once, so there is nothing left for the
              tabs to switch between. */}
          <div className={styles.toolTabs} role="tablist" aria-label="Tool" hidden={splitView}>
            <button
              type="button"
              role="tab"
              id="pane-tab-terminal"
              aria-selected={paneMode === 'terminal'}
              aria-controls="pane-terminal"
              className={
                paneMode === 'terminal' ? `${styles.toolTab} ${styles.toolTabActive}` : styles.toolTab
              }
              onClick={() => setPaneMode('terminal')}
            >
              Terminal
            </button>
            <button
              type="button"
              role="tab"
              id="pane-tab-tools"
              aria-selected={paneMode === 'tools'}
              aria-controls="pane-tools"
              className={
                paneMode === 'tools' ? `${styles.toolTab} ${styles.toolTabActive}` : styles.toolTab
              }
              onClick={() => setPaneMode('tools')}
            >
              Tools
            </button>
            <span className={styles.toolTabSpacer} />
            <span className={styles.connection}>
              <span className={styles.connectionDot} aria-hidden="true" />
              {ticket.device.hostname}
            </span>
          </div>

          <div
            className={[
              styles.toolSplit,
              splitView ? styles.toolSplitOn : '',
              draggingSplit ? styles.toolSplitDragging : '',
            ]
              .filter(Boolean)
              .join(' ')}
            data-split={splitView ? 'true' : 'false'}
            ref={splitRef}
            // The stylesheet multiplies the width the two panes share by this,
            // so a dragged divider and the pane it is next to cannot disagree.
            style={{ '--split-ratio': splitRatio } as CSSProperties}
          >
            <div
              className={`${styles.toolBody} ${styles.terminalPane}`}
              id="pane-terminal"
              role={splitView ? 'region' : 'tabpanel'}
              aria-label={splitView ? 'Terminal' : undefined}
              aria-labelledby={splitView ? undefined : 'pane-tab-terminal'}
              hidden={!splitView && paneMode !== 'terminal'}
            >
              <div className={styles.log}>
                <div className={styles.consoleSummary}>
                  <div className={styles.summaryTile}>
                    <span>Host</span>
                    <strong>{ticket.device.hostname}</strong>
                  </div>
                  <div className={styles.summaryTile}>
                    <span>Site</span>
                    <strong>{ticket.device.siteName}</strong>
                  </div>
                  <div className={styles.summaryTile}>
                    <span>Ticket</span>
                    <strong>{ticketRef}</strong>
                  </div>
                </div>
                <p className={styles.logIntro}>
                  Connected to {ticket.device.hostname}. Type <code>help</code> for the available
                  tools. Every command advances the simulated clock by one minute.
                </p>
                {workspace.entries.map((entry, index) => {
                  // Un-running from here drops this step and everything after it.
                  const dropped = workspace.entries.filter(
                    (candidate) => candidate.seq >= entry.seq,
                  ).length
                  return (
                    <div className={styles.step} key={`${entry.kind}-${entry.seq}-${index}`}>
                      <div className={styles.stepGutter}>
                        <span className={styles.stepNumber} aria-hidden="true">
                          {entry.seq}
                        </span>
                        {/* The cut itself is a record, not a step: only the work around it
                            can be un-run. */}
                        {workspace.canRewind && entry.kind !== 'rewind' ? (
                          <button
                            type="button"
                            className={styles.stepRewind}
                            aria-label={`Un-run step ${entry.seq} and everything after it`}
                            title="Un-run from here"
                            disabled={busy}
                            onClick={() => setRewindTarget(entry.seq)}
                          >
                            ↺
                          </button>
                        ) : null}
                      </div>
                      <div className={styles.stepBody}>
                        <EntryLog
                          entry={entry}
                          home={ticket.requester.samAccountName}
                          busy={busy}
                          onReapply={(seq) => void onReapplyRewind(seq)}
                        />
                        {rewindTarget === entry.seq ? (
                          <div
                            className={styles.rewindConfirm}
                            role="alertdialog"
                            aria-label={`Un-run from step ${entry.seq}`}
                          >
                            <p className={styles.rewindHeading}>
                              Un-run {dropped} step{dropped === 1 ? '' : 's'} from step {entry.seq}?
                            </p>
                            <p className={styles.rewindBody}>
                              The world goes back with them: whatever this step and the ones after
                              it changed — accounts, printers, leases, hints you paid for — is
                              undone, and the log keeps one line saying {dropped} step
                              {dropped === 1 ? '' : 's'} went. The score is read from what is left.
                            </p>
                            <div className={practice.buttonRow}>
                              <button
                                type="button"
                                className={practice.secondaryButton}
                                disabled={busy}
                                onClick={() => void onRewind(entry.seq)}
                              >
                                Un-run {dropped} step{dropped === 1 ? '' : 's'}
                              </button>
                              <button
                                type="button"
                                className={practice.ghostButton}
                                disabled={busy}
                                onClick={() => setRewindTarget(null)}
                              >
                                Keep them
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
                <div ref={logEnd} />
              </div>
              <div className={styles.quickRow} aria-label="Quick commands">
                {['ipconfig /all', 'ipconfig /renew', 'ping 10.20.4.1', 'systeminfo', 'help'].map((entry) => (
                  <button
                    key={entry}
                    type="button"
                    className={styles.quickCommand}
                    disabled={busy}
                    onClick={() => setCommand(entry)}
                  >
                    {entry}
                  </button>
                ))}
              </div>
              <form className={styles.commandForm} onSubmit={(event) => void onCommand(event)}>
                <span className={styles.prompt}>PS&gt;</span>
                <input
                  className={styles.commandInput}
                  value={command}
                  onChange={(event) => setCommand(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowUp') {
                      onHistory('up', event)
                    } else if (event.key === 'ArrowDown') {
                      onHistory('down', event)
                    }
                  }}
                  placeholder="ipconfig /all"
                  aria-label="Command"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={busy}
                />
                <button type="submit" className={practice.runButton} disabled={busy}>
                  {busy ? 'Running…' : 'Run'}
                </button>
              </form>
            </div>

            {splitView ? (
              <div
                className={styles.splitHandle}
                ref={splitHandle}
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize the terminal and tools panes"
                aria-valuemin={SPLIT_MIN_RATIO * 100}
                aria-valuemax={SPLIT_MAX_RATIO * 100}
                aria-valuenow={Math.round(splitRatio * 100)}
                title="Drag to resize · arrow keys to adjust · double-click to reset"
                tabIndex={0}
                onKeyDown={onSplitKeyDown}
                onDoubleClick={() => setSplitRatio(SPLIT_DEFAULT_RATIO)}
                onPointerDown={onSplitPointerDown}
                onPointerMove={onSplitPointerMove}
                onPointerUp={onSplitPointerUp}
                onPointerCancel={onSplitPointerUp}
              >
                <span className={styles.splitHandleGrip} aria-hidden="true" />
              </div>
            ) : null}

            <div
              className={styles.toolBody}
              id="pane-tools"
              role={splitView ? 'region' : 'tabpanel'}
              aria-label={splitView ? 'Tools' : undefined}
              aria-labelledby={splitView ? undefined : 'pane-tab-tools'}
              hidden={!splitView && paneMode !== 'tools'}
            >
              {/* One tab per console kept open, so the shelf is a place to go
                  rather than the only way to change tools. */}
              {openTools.length > 0 ? (
                <div className={styles.consoleTabs} role="tablist" aria-label="Open tools">
                  {openTools.map((consoleId) => (
                    <button
                      key={consoleId}
                      type="button"
                      role="tab"
                      id={`console-tab-${consoleId}`}
                      aria-selected={openTool === consoleId}
                      className={
                        openTool === consoleId
                          ? `${styles.consoleTab} ${styles.consoleTabActive}`
                          : styles.consoleTab
                      }
                      onClick={() => void onShowConsole(consoleId)}
                    >
                      {toolLabel(consoleId)}
                    </button>
                  ))}
                </div>
              ) : null}

              {openTool === null ? (
                splitView && openTools.length === 0 ? (
                  <div className={styles.splitEmpty}>
                    <p className={styles.splitEmptyEyebrow}>Split screen view</p>
                    <p className={styles.splitEmptyText}>
                      Open a tool from the Tools menu to work on it beside this ticket.
                    </p>
                    <button
                      type="button"
                      className={styles.toolsMenuButton}
                      onClick={() => setToolMenuOpen(true)}
                    >
                      Open the tools menu
                    </button>
                  </div>
                ) : (
                  <div className={styles.pickerWrap}>
                    <ToolPicker groups={toolGroups} onOpen={(id) => void onShowConsole(id)} />
                  </div>
                )
              ) : (
                <div className={styles.consoleWrap}>
                  <div className={styles.consoleBar}>
                    <button
                      type="button"
                      className={styles.consoleBack}
                      onClick={() => setOpenTool(null)}
                    >
                      ← All tools
                    </button>
                    <span className={styles.consoleBarActions}>
                      <span className={styles.consoleName}>{toolLabel(openTool)}</span>
                      <button
                        type="button"
                        className={styles.consoleClose}
                        aria-label={`Close ${toolLabel(openTool)}`}
                        onClick={() => onCloseConsole(openTool)}
                      >
                        Close
                      </button>
                    </span>
                  </div>
                  <ToolConsole
                    view={consoles[openTool] ?? null}
                    loadError={consoleErrors[openTool] ?? null}
                    busy={busy}
                    onRun={(entryId, actionId, inputs) =>
                      runConsole(openTool, entryId, actionId, inputs)
                    }
                    onSubmitCommand={onDesktopCommand}
                  />
                </div>
              )}
            </div>
          </div>

          {actionError ? (
            <p className={styles.toolError} role="alert">
              {actionError}
            </p>
          ) : null}
        </section>
      </div>
    </div>
  )
}
