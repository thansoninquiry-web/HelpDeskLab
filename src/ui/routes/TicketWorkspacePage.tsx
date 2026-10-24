import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, DragEvent, FormEvent, KeyboardEvent, PointerEvent, ReactNode } from 'react'
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
  consoleDigest,
  consoleHasNews,
  denialReasons,
  denyCaller,
  formatSimClock,
  insertWorkspaceTool,
  loadConsole,
  nextConsoleWithNews,
  noteConsoleRead,
  openSession,
  pinWorkspaceTool,
  placeCallback,
  recordInPersonVisit,
  reorderWorkspaceTools,
  resolveAttempt,
  recordConsoleRead,
  revealHint,
  reapplyRewind,
  reviewClosure,
  rewindAttempt,
  runConsoleAction,
  saveClosureDraft,
  saveConsoleFocus,
  saveWorkspaceLayout,
  focusConsole,
  scanBadge,
  sendVerificationCode,
  submitCommand,
  submitDesktopTerminalCommand,
  toolCatalog,
  verifyCallerWithCode,
  workspaceInsertIndex,
  verifyCallerWithLetterPin,
  weakerVerificationCost,
  type ClosureDraft,
  type ClosureReview,
  type CommandCheatSheetGroup,
  type ConsoleFocus,
  type ConsoleFocusMap,
  type ConsoleId,
  type ConsoleReads,
  type ConsoleView,
  type DenialReason,
  type NoteKind,
  type WorkspaceEntry,
  type WorkspaceLayout,
  type WorkspaceView,
} from '../../app/practiceService'
import {
  DOCK_SHARE_DEFAULT,
  DOCK_SHARE_MAX,
  DOCK_SHARE_MIN,
  DOCK_SHARE_WITH_DESKTOP,
  LAYOUT_PRESETS,
  SPLIT_DEFAULT_RATIO,
  SPLIT_MAX_RATIO,
  SPLIT_MIN_RATIO,
  SPLIT_STOPS,
  STAGE_DEFAULT_RATIO,
  STAGE_MAX_RATIO,
  STAGE_MIN_RATIO,
  dockShareWithin,
  loadDockShare,
  loadSplitRatio,
  loadSplitView,
  loadStageRatio,
  saveDockShare,
  saveSplitRatio,
  saveSplitView,
  saveStageRatio,
  layoutPresetAt,
  snapSplitRatio,
  splitRatioWithin,
  stageRatioWithin,
  stepSplitStop,
  type LayoutPreset,
  type LayoutPresetId,
} from '../../app/settingsService'
import { commandOriginLabel } from '../components/sourceLabel'
import {
  dropIndexAt,
  fadeClearance,
  scrollLeftToShow,
  tabInStrip,
  visibleEnds,
  type StripEnds,
} from './toolStrip'
import { stepSwitcherIndex, switcherMatches } from './toolSwitcher'
import { ToolConsole } from '../components/ToolConsole'
import { ToolPicker } from '../components/ToolPicker'
import { toolDragId } from '../components/toolDrag'
import { useFlushOnHide } from '../components/useFlushOnHide'
import { useSettledFlush } from '../components/useSettledFlush'
import { useFoldedCaseFile } from '../components/useFoldedCaseFile'
import { useKeyboardInsetRef } from '../components/useKeyboardInset'
import practice from './practice.module.css'
import styles from './workspace.module.css'

const SEVERITY_LABELS = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
} as const

/** A recording's length, counted the way a handset counts it. */
function voicemailLength(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

/** The code the close form starts on before the learner picks another one. */
const DEFAULT_CLOSURE_CODE = 'resolved-remote'

/**
 * The commands a refusal stops, named as the reference names them.
 *
 * Rendered where the decision was recorded and where the next one would be
 * typed, from the same list, so the case file and the terminal cannot disagree
 * about what is off the table. The names come from the command registry, so a
 * command that starts changing an account is named here the day it is added.
 */
function BlockedCommands({ commands }: { commands: readonly string[] }) {
  if (commands.length === 0) {
    return null
  }
  return (
    <ul className={practice.blockedCommands} aria-label="Commands off the table">
      {commands.map((name) => (
        <li key={name} className={practice.blockedCommand}>
          <code>{name}</code>
        </li>
      ))}
    </ul>
  )
}

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
      <p className={practice.claimHeading}>What the caller claimed does not match the record</p>
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

/**
 * One section of the case file.
 *
 * On a window with room it is the block it has always been: a heading and its
 * fields, side by side with the machine. Where the window folds — a phone, or a
 * short landscape window whose case file keeps a 361px column beside the dock —
 * it is a disclosure instead, closed until the learner opens it: the paperwork is
 * several screens the learner has to get past to reach the terminal, and a list
 * of what is in it is the shorter road to the tool card. The heading text is the
 * same either way, including the sections whose names change with the attempt (a
 * refusal renames the gate and the close), so nothing is learned twice.
 */
function CaseSection({
  title,
  headingId,
  folded,
  children,
}: {
  title: string
  headingId?: string
  folded: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)

  if (!folded) {
    return (
      <div className={practice.actionBlock}>
        <h2 id={headingId}>{title}</h2>
        {children}
      </div>
    )
  }

  return (
    <details
      className={practice.actionBlock}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className={practice.sectionSummary}>
        <h2 id={headingId}>{title}</h2>
      </summary>
      {children}
    </details>
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
 * A measurement from a computed style, in px. A browser omits properties it has
 * not been given, and a missing padding is no padding rather than a `NaN` that
 * would quietly stop every snap.
 */
function pxOf(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/** True when the keyboard belongs to a field rather than to the page. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  if (target.isContentEditable) {
    return true
  }
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
}

/**
 * One arrow key press on either divider: fine enough to aim, coarse enough to be
 * worth pressing.
 */
const DIVIDER_KEY_STEP = 0.02
/** Shift and an arrow move five times as far, for crossing the stage in one go. */
const DIVIDER_KEY_COARSE_FACTOR = 5
/**
 * How long a divider waits before its position is written. A drag makes a new ratio
 * per pointer move and a held arrow key one per repeat, so the write waits for the
 * divider to come to rest instead of filling the table with the journey.
 */
const DIVIDER_SAVE_DELAY_MS = 250

/**
 * How long a console's focus — its search and the record it has open — waits
 * before it is written. A search is typed a letter at a time and the row only has
 * to know where the box came to rest, so the write waits for the typing to pause.
 */
const FOCUS_SAVE_DELAY_MS = 500

/** A console with nothing typed and no record open: how a cleared search is written. */
const EMPTY_FOCUS: ConsoleFocus = { query: '', selectedId: null }

/**
 * The divider's stops as the header offers them, in the order the divider travels
 * across the card: the console's side, the middle, the log's side. The names are
 * the interface's — the domain knows only the ratios — and each carries the key
 * that reaches it, because a shortcut nobody is told about is nobody's shortcut.
 */
const SPLIT_STOP_BUTTONS = [
  {
    id: 'terminal-min',
    ratio: SPLIT_STOPS[0],
    name: 'Tool',
    label: 'Tool-heavy split',
    hint: 'The console takes three quarters · press [',
  },
  {
    id: 'even',
    ratio: SPLIT_STOPS[1],
    name: 'Even',
    label: 'Even split',
    hint: 'Half each · press Enter on the divider',
  },
  {
    id: 'terminal-max',
    ratio: SPLIT_STOPS[2],
    name: 'Log',
    label: 'Log-heavy split',
    hint: 'The log takes three quarters · press ]',
  },
] as const

/**
 * The keys that take the divider to the next stop. Brackets read as the direction
 * the divider moves, and they are not characters anything in the workspace waits
 * for — the command line and the consoles take the keyboard as a field, and the
 * shortcut stands aside for them.
 */
const SPLIT_STOP_KEYS: Record<string, -1 | 1> = { '[': -1, ']': 1 }

/**
 * The key that steps to the next tab with something unread.
 *
 * `n` is for news, and it is a bare letter because nothing else in the workspace
 * claims one — the brackets step the divider, the digits pick a layout, and a
 * field keeps every character typed into it, which is as true of this key as of
 * the others. Shift is not refused, so a learner who happens to have it down
 * still gets the step.
 */
const NEWS_KEY = 'n'

/**
 * The key that opens the switcher over the open tools.
 *
 * `t` is for tools — the word on the card's own button — and it is a bare letter
 * for the same reason `n` is: nothing else in the workspace claims one, and a
 * field keeps every character typed into it. Once the switcher is open the key
 * is inside its input, which is a field, so pressing it again types a letter
 * into the query rather than opening a second switcher.
 */
const SWITCHER_KEY = 't'

/**
 * What each preset is called, and the key that reaches it. The ratios are the
 * domain's; the words are the interface's, and the key is on the button's title
 * because a shortcut nobody is told about is nobody's shortcut.
 *
 * The names go the way the workspace widens — the case file, the shipped desk,
 * the machine — so the number keys read as an order rather than a list.
 */
const LAYOUT_PRESET_COPY: Record<
  LayoutPresetId,
  { name: string; label: string; hint: string }
> = {
  'case-file': {
    name: 'Paperwork',
    label: 'Paperwork layout',
    hint: 'The case file takes most of the width, and the log most of the card · press 1',
  },
  balanced: {
    name: 'Balanced',
    label: 'Balanced layout',
    hint: 'The fractions the workspace shipped with · press 2',
  },
  machine: {
    name: 'Machine',
    label: 'Machine layout',
    hint: 'The card takes most of the width, and the console most of the card · press 3',
  },
}

/**
 * One number key per preset, in the order `LAYOUT_PRESETS` declares them. Digits
 * rather than letters: they are the order, and they are not characters anything
 * in the workspace acts on — a command being typed keeps them, as it keeps the
 * brackets.
 */
const LAYOUT_PRESET_KEYS: Record<string, LayoutPreset> = Object.fromEntries(
  LAYOUT_PRESETS.map((preset, index) => [String(index + 1), preset]),
)

/**
 * The tools this build can open, read from the catalog the picker is built from.
 * A remembered workspace names its consoles as plain strings, and this set is
 * what tells a tool that exists from a name a later build retired. It is read
 * when it is first needed rather than at import, so loading this page never
 * depends on the catalogue being there — a page opens for a test the same way it
 * opens for a learner.
 */
let knownToolIds: ReadonlySet<string> | null = null

function toolIds(): ReadonlySet<string> {
  knownToolIds ??= new Set(toolCatalog().flatMap((group) => group.tools.map((tool) => tool.id)))
  return knownToolIds
}

/** The console a remembered layout names, when this build still has it. */
function toConsoleId(id: string | null): ConsoleId | null {
  return id !== null && toolIds().has(id) ? (id as ConsoleId) : null
}

function toConsoleIds(ids: readonly string[]): ConsoleId[] {
  return ids.filter((id) => toolIds().has(id)) as ConsoleId[]
}

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
          <p key={`${entry.atMs}-${index}`} className={practice.outputLine} data-tone={line.tone}>
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
    return <p className={practice.denyEntry}>⊘ {entry.summary}</p>
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
  /** The ratio the learner last left the divider at, for the settling write. */
  const splitRatioRef = useRef(SPLIT_DEFAULT_RATIO)
  /** The whole layout, kept current for the divider's write (see `workspaceLayout`). */
  const layoutForSave = useRef<WorkspaceLayout | null>(null)
  /**
   * Whether the divider has been moved on this attempt. A width nobody chose is
   * not a width this ticket owns — the ticket opens at the device's width and
   * stores none, so opening a ticket still writes nothing.
   */
  const splitTouched = useRef(false)
  /** The ratio as last stored, so a divider that has not moved writes nothing. */
  const savedSplitRatio = useRef<number | null>(null)
  /** False until the stored divider has been read, so opening never writes one. */
  const splitReady = useRef(false)
  const [draggingSplit, setDraggingSplit] = useState(false)
  /** True while a drag is resting on a width the console's layout turns on. */
  const [splitSnapped, setSplitSnapped] = useState(false)
  /** What the console inside the tool pane takes from it, measured per drag. */
  const splitSnap = useRef<{ gutter: number; rem: number } | null>(null)
  /**
   * Where the divider between the case file and the tool card sits, as the share
   * of the stage the case file takes. The split above is the *inside* of the card;
   * this is the trade between the two columns of the workspace.
   */
  const [stageRatio, setStageRatio] = useState(STAGE_DEFAULT_RATIO)
  const stageRatioRef = useRef(STAGE_DEFAULT_RATIO)
  /** The ratio as last stored, so a divider that has not moved writes nothing. */
  const savedStageRatio = useRef<number | null>(null)
  /** False until the stored trade has been read, so opening never writes one. */
  const stageReady = useRef(false)
  const [draggingStage, setDraggingStage] = useState(false)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const stageHandle = useRef<HTMLDivElement | null>(null)
  /**
   * How much of a phone's screen the docked card takes — the same trade as the
   * two dividers, made against the bottom edge instead of a column. Null is not
   * "no card": it is the untouched state, where the stylesheet's own share
   * applies (a log's, or a machine desktop's). Only a moved edge puts a number
   * here, and only then is one stored.
   */
  const [dockShare, setDockShare] = useState<number | null>(null)
  const dockShareRef = useRef<number | null>(null)
  /** The share as last stored, so an edge that has not moved writes nothing. */
  const savedDockShare = useRef<number | null>(null)
  /** False until the stored share has been read, so opening never writes one. */
  const dockReady = useRef(false)
  const [draggingDock, setDraggingDock] = useState(false)
  const dockHandle = useRef<HTMLDivElement | null>(null)
  /**
   * Where the window folds, the case file folds: on a phone the machine is a
   * thumb away rather than a glance away, and in a short landscape window the
   * column beside the dock is narrow enough that the sections read better as a
   * list than as one long scroll. Both are decided in one hook, because a folded
   * section is a different document tree and not a different style.
   */
  const folded = useFoldedCaseFile()
  /**
   * How much of the window the phone's keyboard is covering. The docked console
   * is fixed to the layout viewport, which the keyboard floats over rather than
   * shrinks, so the card climbs by this much and its command line stays above
   * the keys instead of under them. Written onto the workspace as
   * `--keyboard-inset` rather than into state: the viewport moves with every
   * pixel of the keyboard's animation, and this page is too big to re-render for
   * each one.
   */
  const workspaceRef = useKeyboardInsetRef<HTMLDivElement>()
  /**
   * Both halves of the tool card at once: the terminal keeps the log in view
   * while a console does the work, instead of one switching the other away.
   */
  const [splitView, setSplitView] = useState(false)
  /** The step a learner has asked to un-run, waiting on the confirmation. */
  const [rewindTarget, setRewindTarget] = useState<number | null>(null)
  /** The console on screen in the Tools pane, or null for the tool picker. */
  const [openTool, setOpenTool] = useState<ConsoleId | null>(null)
  /** The one tab held at the left of the strip, or null when none is pinned. */
  /**
   * The consoles held as a group at the left of the strip, in the order they
   * were pinned. The group is the front of `openTools`, and the domain keeps it
   * that way on every move.
   */
  const [pinnedTools, setPinnedTools] = useState<ConsoleId[]>([])
  /** Where a dragged tab is, and which tab it would land on. */
  const [draggingTool, setDraggingTool] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState<number | null>(null)
  /**
   * A tool being carried out of the picker, and the place in the strip it would
   * land at. Kept apart from the tab drag above: that one moves a tab that is
   * already open, this one opens a console that is not — and a caret between two
   * tabs is what says where, because a tab cannot be highlighted for a place it
   * does not occupy yet.
   */
  const [draggingNewTool, setDraggingNewTool] = useState<ConsoleId | null>(null)
  const [stripDropIndex, setStripDropIndex] = useState<number | null>(null)
  /** The tab strip, so the console in front can be kept in view. */
  const stripRef = useRef<HTMLDivElement | null>(null)
  /** Which ends of the strip have tabs behind them: none, start, end or both. */
  const [stripOverflow, setStripOverflow] = useState<StripEnds>('none')
  /**
   * Every console the learner has open, in the order they opened them. Picking a
   * tool that is already here brings it forward instead of replacing what is in
   * the pane, so a learner can keep the directory, the mail admin, and the map
   * to hand and move between them without losing a screen of evidence.
   */
  const [openTools, setOpenTools] = useState<ConsoleId[]>([])
  const [toolMenuOpen, setToolMenuOpen] = useState(false)
  /**
   * The keyboard's way past the strip: a name-typed switcher over the open tools.
   * `switcherQuery` is what has been typed, `switcherIndex` which row the arrows
   * are on. The element the switcher was opened from is remembered so Escape can
   * put the keyboard back where it was.
   */
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [switcherQuery, setSwitcherQuery] = useState('')
  const [switcherIndex, setSwitcherIndex] = useState(0)
  const switcherInput = useRef<HTMLInputElement | null>(null)
  const switcherReturn = useRef<HTMLElement | null>(null)
  const [consoles, setConsoles] = useState<Partial<Record<ConsoleId, ConsoleView>>>({})
  const [consoleErrors, setConsoleErrors] = useState<Partial<Record<ConsoleId, string>>>({})
  /**
   * What each console looked like the last time the learner had it in front, so a
   * tab can say that it has something the learner has not read yet. Per visit,
   * not per attempt: see `consoleNews`.
   */
  const [consoleReads, setConsoleReads] = useState<ConsoleReads>({})
  // The shelf the picker renders, read once: it is catalog data, not attempt data.
  const [toolGroups] = useState(() => toolCatalog())
  const logEnd = useRef<HTMLDivElement | null>(null)
  const splitRef = useRef<HTMLDivElement | null>(null)
  const splitHandle = useRef<HTMLDivElement | null>(null)
  // The close form is saved with the attempt, so a reload puts it back as it was.
  const draftRef = useRef<ClosureDraft>({
    code: DEFAULT_CLOSURE_CODE,
    note: '',
  })
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** The draft as last stored, so unchanged renders cost no snapshot write. */
  const savedDraft = useRef<string | null>(null)
  /** False until the open session has filled the form, so loading never saves. */
  const draftReady = useRef(false)
  /**
   * False until the open session has put the workspace back where it was, so
   * arriving on the page never saves over the layout being restored.
   */
  const layoutReady = useRef(false)
  /**
   * Where each console was left: the search typed in it and the record it had
   * open. Kept beside the layout rather than inside it, because a console's own
   * view is not the shape of the desk, and written through a short pause.
   */
  const [consoleFocus, setConsoleFocus] = useState<ConsoleFocusMap>({})
  /** The same map, for the write: the flush must see the latest focus, not the
   * one the render it was created in saw. */
  const focusRef = useRef<ConsoleFocusMap>({})
  /** The consoles whose focus has moved since the last write. */
  const dirtyFocus = useRef<Set<ConsoleId>>(new Set())
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    // The divider is read with the session too, so the first paint is the split
    // the learner left rather than half a card that jumps once it loads.
    const divider = loadSplitRatio().catch(() => null)
    // ...and so is the trade between the case file and the card, so the whole
    // workspace first paints in the shape it was left in.
    const stage = loadStageRatio().catch(() => null)
    // ...and the docked card's height, so a phone reopens with the console the
    // size it was given rather than falling back to the default between paints.
    const dock = loadDockShare().catch(() => null)
    Promise.all([openSession(sessionId), preference, divider, stage, dock])
      .then(async ([view, split, storedRatio, storedStage, storedDock]) => {
        if (!cancelled) {
          // A refused attempt opens on the report to Security, so a close resumed
          // after a refusal lands on the path it belongs to rather than the
          // default disposition. A chosen code still wins over it.
          const code = view.closureDraft.code ?? view.denial?.closingCode ?? DEFAULT_CLOSURE_CODE
          setWorkspace(view)
          setSplitView(split)
          // The divider reopens at the width this ticket was worked at. A ticket
          // that has never been sized here starts at the device's last width, and
          // one with neither keeps the default half.
          const ratio = view.layout.ratio ?? storedRatio ?? SPLIT_DEFAULT_RATIO
          splitRatioRef.current = ratio
          // The width in force is the width nothing has moved away from: arriving
          // on a ticket is not a move, so the resting divider writes nothing back
          // — not even the device's own width it opened at.
          savedSplitRatio.current = ratio
          // A ticket carrying its own width has been sized; one opened at the
          // device's width is still unsized here until the divider is moved.
          splitTouched.current = view.layout.ratio !== null
          splitReady.current = true
          if (ratio !== SPLIT_DEFAULT_RATIO) {
            setSplitRatio(ratio)
          }
          // The case file and the card reopen in the trade they were left in, and
          // one that will not read keeps the fractions the grid shipped with.
          stageRatioRef.current = storedStage ?? STAGE_DEFAULT_RATIO
          savedStageRatio.current = storedStage
          stageReady.current = true
          if (storedStage !== null) {
            setStageRatio(storedStage)
          }
          // The card reopens at the height it was left, where a phone has been
          // given one; a phone that never moved the edge keeps the stylesheet's.
          dockShareRef.current = storedDock
          savedDockShare.current = storedDock
          dockReady.current = true
          if (storedDock !== null) {
            setDockShare(storedDock)
          }
          // A resumed attempt reopens the close it was writing.
          setClosureCode(code)
          setResolutionNote(view.closureDraft.note)
          draftRef.current = { code, note: view.closureDraft.note }
          savedDraft.current = JSON.stringify({
            code,
            note: view.closureDraft.note,
          })
          draftReady.current = true
          // ...and it reopens where the learner was working: the pane that was
          // in front, the console showing, and the tabs left open beside it.
          setPaneMode(view.layout.pane)
          setOpenTool(toConsoleId(view.layout.tool))
          setOpenTools(toConsoleIds(view.layout.tabs))
          setPinnedTools(toConsoleIds(view.layout.pinned))
          layoutReady.current = true
          // The consoles reopen on the machine each of them was left on: the
          // search typed there and the record left open. This is read with the
          // session, so a console that is not open yet has its focus waiting.
          focusRef.current = view.consoleFocus
          setConsoleFocus(view.consoleFocus)
          // The restored tools are read again rather than put back as they were:
          // a console projects the machines, and the ticket may have moved on
          // since the tab was left open. A console that will not read shows its
          // error when it is opened, and never keeps the ticket from opening.
          for (const consoleId of toConsoleIds(view.layout.tabs)) {
            try {
              const consoleView = await loadConsole(consoleId)
              if (!cancelled && consoleView) {
                setConsoles((current) => ({
                  ...current,
                  [consoleId]: consoleView,
                }))
              }
            } catch {
              // Nothing to say here: the tab is there, and opening it says why.
            }
          }
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setLoadError(
            caught instanceof Error ? caught.message : 'This session could not be opened.',
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [sessionId])

  /**
   * Where the learner is working is written as it changes, so a ticket reopened
   * tomorrow lands back in the tool it was left in. It is written on the click
   * that changed it rather than on the way out — closing a tab is a decision that
   * has already happened — and the service skips a click that changed nothing.
   * A save that fails is not worth interrupting the work over: the workspace
   * still looks the way it was asked to, and the next change stores it again.
   */
  useEffect(() => {
    if (!layoutReady.current) {
      return
    }
    void saveWorkspaceLayout({
      pane: paneMode,
      tool: openTool,
      tabs: openTools,
      pinned: pinnedTools,
      // The width is written by the divider's own settle flush, which is the only
      // thing that moves it; it rides along here so a tab click cannot wipe the
      // width the ticket was worked at. A ticket nobody has sized keeps null,
      // which is why opening one still stores no layout at all.
      ratio: splitTouched.current ? splitRatioRef.current : null,
    }).catch(() => {})
  }, [paneMode, openTool, openTools, pinnedTools])

  /**
   * The workspace as the attempt stores it, so the pin and the drag can be the
   * domain's own rules rather than a second copy of them here.
   */
  const workspaceLayout = useCallback(
    (): WorkspaceLayout => ({
      pane: paneMode,
      tool: openTool,
      tabs: openTools,
      pinned: pinnedTools,
      ratio: splitTouched.current ? splitRatio : null,
    }),
    [paneMode, openTool, openTools, pinnedTools, splitRatio],
  )

  /**
   * The layout as the last render left it, for the divider's own write. The
   * divider comes to rest without touching the tab state the layout effect
   * watches, so it needs the rest of the layout at the moment it writes — and it
   * must not write on every pointer move, which is why it is not a dependency of
   * that effect.
   */
  useEffect(() => {
    layoutForSave.current = workspaceLayout()
  }, [workspaceLayout])

  /**
   * Pinning holds the console in front in the group at the left of the strip, so
   * a working set stays where the hand expects it while other tabs come and go.
   * Pinning again takes that console out of the group; the tabs are the domain's
   * to arrange, so a pin joins the end of the group and an unpin leaves the tab
   * at the front of what is free to drag — the place it already had.
   */
  const onTogglePin = useCallback(() => {
    if (openTool === null) {
      return
    }
    const next = pinWorkspaceTool(workspaceLayout(), openTool)
    setPinnedTools(toConsoleIds(next.pinned))
    setOpenTools(toConsoleIds(next.tabs))
  }, [openTool, workspaceLayout])

  /**
   * What each open console would print, as one string per console. A console
   * projects machine state at the moment it is read, so this moves whenever a
   * command anywhere — the terminal, another console, a desktop shell — changes
   * what a tab would show.
   */
  const consoleDigests = useMemo(() => {
    const digests: Partial<Record<ConsoleId, string>> = {}
    for (const consoleId of openTools) {
      const view = consoles[consoleId]
      if (view) {
        digests[consoleId] = consoleDigest(view)
      }
    }
    return digests
  }, [consoles, openTools])

  /**
   * The tab being looked at, or `null` when nothing is on screen to look at: with
   * the split off and the terminal in front, or the shelf showing, no console is
   * being read. It is named once because two things need the same answer — the
   * effect that files a read, and the render that decides whether a tab has a dot
   * — and a dot on the tab you are looking at is wrong even for the frame before
   * the read is filed.
   */
  const lookedConsole = splitView || paneMode === 'tools' ? openTool : null

  /**
   * Whether a machine's desktop is on the card right now — the same question the
   * stylesheet asks with `:has([data-desktop])`, needed here only so that resetting
   * the card's height puts back the share that card would have had untouched.
   */
  const desktopShowing =
    lookedConsole !== null && consoles[lookedConsole]?.desktop != null

  /**
   * The tab in front is the one being looked at, so it counts as read as it
   * changes; a tab standing behind another one does not, so it keeps what it had
   * and can say that it has something new.
   */
  useEffect(() => {
    setConsoleReads((current) => {
      let next = current
      for (const consoleId of openTools) {
        const digest = consoleDigests[consoleId]
        if (digest === undefined) {
          continue
        }
        next = noteConsoleRead(next, { id: consoleId, digest }, consoleId === lookedConsole)
      }
      return next
    })
  }, [consoleDigests, lookedConsole, openTools])

  /**
   * Keeps the strip honest about what is in it. With every tool open the strip is
   * wider than the card, and it scrolls without a scrollbar; so the tab in front
   * is brought into view whenever it changes — otherwise the console showing can
   * be one nothing on screen points at — and each end with tabs still behind it
   * is marked, which is what the fade in the stylesheet reads.
   */
  const showToolInStrip = useCallback(() => {
    const strip = stripRef.current
    if (!strip) {
      return
    }

    const tab =
      openTool === null ? null : strip.querySelector<HTMLElement>(`#console-tab-${openTool}`)
    if (tab) {
      // Measured as boxes on the page rather than `offsetLeft`, which is offset
      // from whichever ancestor is positioned — not from the strip. Both the
      // padding and the fade come off the view, so the tab in front lands where
      // its name can be read rather than under the fade at an end.
      const style = getComputedStyle(strip)
      const paddingStart = Number.parseFloat(style.paddingLeft) || 0
      const paddingEnd = Number.parseFloat(style.paddingRight) || 0
      const stripBox = strip.getBoundingClientRect()
      const tabBox = tab.getBoundingClientRect()
      const box = tabInStrip(
        { left: tabBox.left, width: tabBox.width },
        { left: stripBox.left, scrollLeft: strip.scrollLeft },
        paddingStart,
      )
      strip.scrollLeft = scrollLeftToShow(
        box,
        {
          scrollLeft: strip.scrollLeft,
          clientWidth: strip.clientWidth - paddingStart - paddingEnd,
        },
        fadeClearance(
          style.getPropertyValue('--strip-fade'),
          Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
        ),
      )
    }

    setStripOverflow(
      visibleEnds({
        scrollLeft: strip.scrollLeft,
        clientWidth: strip.clientWidth,
        scrollWidth: strip.scrollWidth,
      }),
    )
  }, [openTool])

  useEffect(() => {
    showToolInStrip()
  }, [showToolInStrip, openTools, paneMode, pinnedTools])

  /** The strip is only as wide as the card, and the card is as wide as the window. */
  useEffect(() => {
    window.addEventListener('resize', showToolInStrip)
    return () => window.removeEventListener('resize', showToolInStrip)
  }, [showToolInStrip])

  /**
   * A dragged tab lands where it was dropped, except that nothing goes ahead of
   * the pinned tab — the rule is the domain's, so the strip on screen and the row
   * in storage cannot disagree about the order.
   */
  const onReorderTool = useCallback(
    (from: number, to: number) => {
      setOpenTools(toConsoleIds(reorderWorkspaceTools(workspaceLayout(), from, to).tabs))
    },
    [workspaceLayout],
  )

  /**
   * Where a pointer over the strip asks for something to go: a place between
   * tabs, counted from the tabs' own boxes. Those boxes are already in page
   * coordinates, which is the space a pointer speaks in, so there is no strip
   * offset to add — the mistake that once put the tab in front under the fade.
   */
  const stripDropPlace = (clientX: number): number => {
    const strip = stripRef.current
    const tabs = strip ? Array.from(strip.querySelectorAll<HTMLElement>('[role="tab"]')) : []
    return dropIndexAt(
      tabs.map((tab) => {
        const box = tab.getBoundingClientRect()
        return { left: box.left, right: box.right }
      }),
      clientX,
    )
  }

  /**
   * The tool a drag is carrying, if it is one this strip can take. The id comes
   * off the drag itself where the environment hands one back, and out of the
   * picker's own state otherwise; either way it is checked against the consoles
   * the desk has, so a drag of anything else opens nothing.
   */
  const carriedTool = (event: DragEvent<HTMLElement>): ConsoleId | null =>
    toConsoleId(toolDragId(event.dataTransfer, draggingNewTool))

  /**
   * A tool let go over the strip opens at the place it was dropped, and every
   * tool already open keeps its order around it. Opening is the same move a
   * click makes — the console is read and recorded — because a drop is a way to
   * reach the tool, not a second kind of opening.
   */
  const onDropTool = (consoleId: ConsoleId, index: number) => {
    setOpenTools((current) =>
      toConsoleIds(
        insertWorkspaceTool({ ...workspaceLayout(), tabs: current }, consoleId, index).tabs,
      ),
    )
    void onShowConsole(consoleId)
  }

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


  /**
   * The width the two panes share — the card minus the handle — and where it
   * starts, because that is what the stylesheet multiplies. A card or a handle
   * jsdom reports as zero width is no drag.
   */
  const splitGeometry = (): { usable: number; left: number; handleWidth: number } | null => {
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
    return { usable, left: cardBox.left, handleWidth }
  }

  /** The ratio under the pointer, before anything gets a say about it. */
  const splitRatioAt = (clientX: number, geometry = splitGeometry()): number | null => {
    if (!geometry) {
      return null
    }
    return splitRatioWithin(
      (clientX - geometry.left - geometry.handleWidth / 2) / geometry.usable,
    )
  }

  /**
   * What the console inside the tool pane costs the pane's width, and how large a
   * rem is here — what a snap needs, measured once when a drag starts, because
   * neither the console's padding nor the text size moves under the pointer.
   *
   * The console is measured through the box its own container query sees, and the
   * gutter between that box and the pane falls out of the difference: padding and
   * borders are then whatever the stylesheet says they are, rather than a second
   * copy of those numbers living in JavaScript.
   *
   * An empty tool half has no console to measure, and the geometry still comes
   * back — with a `NaN` gutter — because the terminal's own widths are still
   * worth catching on.
   */
  const measureSplitSnap = (usable: number): { gutter: number; rem: number } => {
    const rem = pxOf(window.getComputedStyle(document.documentElement).fontSize) || 16
    const frame = splitRef.current?.querySelector<HTMLElement>('[data-console-frame]')
    if (!frame) {
      return { gutter: Number.NaN, rem }
    }
    const style = window.getComputedStyle(frame)
    const inset =
      pxOf(style.paddingLeft) +
      pxOf(style.paddingRight) +
      pxOf(style.borderLeftWidth) +
      pxOf(style.borderRightWidth)
    const pane = usable * (1 - splitRatioRef.current)
    return { gutter: pane - (frame.getBoundingClientRect().width - inset), rem }
  }

  /**
   * The ratio a drag should settle on: the pointer's, unless a console width is
   * within reach — then the size the console's content actually wants, so a
   * learner lands on it without aiming for a pixel.
   */
  const snappedSplitRatio = (
    clientX: number,
  ): { ratio: number; snapped: boolean } | null => {
    const geometry = splitGeometry()
    const asked = splitRatioAt(clientX, geometry)
    if (!geometry || asked === null) {
      return null
    }
    const snap = splitSnap.current
    if (!snap) {
      return { ratio: asked, snapped: false }
    }
    const ratio = snapSplitRatio(asked, { ...snap, usable: geometry.usable })
    return { ratio, snapped: ratio !== asked }
  }

  const onSplitPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const geometry = splitGeometry()
    if (!geometry) {
      return
    }
    splitSnap.current = measureSplitSnap(geometry.usable)
    const landed = snappedSplitRatio(event.clientX)
    if (landed === null) {
      return
    }
    const ratio = landed.ratio
    event.preventDefault()
    // The divider moves before the capture is taken, because capture is an
    // optimisation: it keeps the drag alive over the panes, where a move would
    // otherwise land on a console and stop the resize halfway. If a browser
    // refuses it — a pointer id it does not consider active — the drag still
    // works while the pointer is over the handle.
    setDraggingSplit(true)
    setSplitSnapped(landed.snapped)
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
    const landed = snappedSplitRatio(event.clientX)
    if (landed !== null) {
      setSplitSnapped(landed.snapped)
      setSplitRatio(landed.ratio)
    }
  }

  const onSplitPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!draggingSplit) {
      return
    }
    setSplitSnapped(false)
    splitSnap.current = null
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
    const step = event.shiftKey
      ? DIVIDER_KEY_STEP * DIVIDER_KEY_COARSE_FACTOR
      : DIVIDER_KEY_STEP
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
    setSplitRatio(splitRatioWithin(next))
  }

  /**
   * The header's three positions, and the same move the bracket keys make: the
   * divider jumps to a place the learner aims at often instead of being nudged
   * there a press at a time. The write is the settle timer's — a jump is a move
   * like any other, and a learner who lands on a stop and then leaves never
   * writes two rows for one decision.
   */
  const onSplitStop = useCallback((ratio: number) => {
    setSplitRatio(ratio)
  }, [])

  /**
   * The keys that step the divider between its stops.
   *
   * They only mean anything while the halves are side by side and the divider is
   * on screen: below the widest layout the card stacks the two, so a key that
   * moved an invisible divider would do nothing the learner could see. The
   * divider's own computed display is the test rather than a breakpoint copied
   * out of the stylesheet, so the shortcut and the handle can never disagree
   * about whether there is a divider to move.
   */
  useEffect(() => {
    if (!splitView) {
      return
    }
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || isTypingTarget(event.target)) {
        return
      }
      const direction = SPLIT_STOP_KEYS[event.key]
      const handle = splitHandle.current
      if (direction === undefined || !handle) {
        return
      }
      if (window.getComputedStyle(handle).display === 'none') {
        return
      }
      event.preventDefault()
      setSplitRatio((current) => stepSplitStop(current, direction))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [splitView])

  /**
   * Writes the divider where it came to rest. It skips the write when nothing
   * moved, and it never runs before the stored position has been read — arriving
   * on a ticket must not store the default over the learner's own split.
   */
  const flushSplitRatio = useCallback(async () => {
    if (!splitReady.current) {
      return
    }
    const ratio = splitRatioRef.current
    if (savedSplitRatio.current === ratio) {
      return
    }
    savedSplitRatio.current = ratio
    splitTouched.current = true
    try {
      await saveSplitRatio(ratio)
      // The width belongs to this ticket as well as to the device: a ticket
      // reopened tomorrow lands at the width it was worked at, rather than at
      // whatever another ticket was last sized to.
      const layout = layoutForSave.current
      if (layout !== null) {
        await saveWorkspaceLayout({ ...layout, ratio })
      }
    } catch {
      // The divider is where the learner put it either way; the next move, or
      // leaving the page, tries the write again.
      savedSplitRatio.current = null
    }
  }, [])

  useEffect(() => {
    splitRatioRef.current = splitRatio
  }, [splitRatio])

  // Only where the divider comes to rest is worth a row: the hook holds the timer
  // off while the handle is under the pointer, and writes on a pause, when the page
  // is hidden or unloaded, and when the route takes the page away.
  useSettledFlush(flushSplitRatio, {
    value: splitRatio,
    resting: !draggingSplit,
    delayMs: DIVIDER_SAVE_DELAY_MS,
  })

  /**
   * Writes where each console was left. Only the consoles that have moved since
   * the last write are sent, so a pause after opening Mail Admin does not rewrite
   * the Directory's search as well.
   *
   * A failed write is not worth an alert: it is a search box, not the close, and
   * the console is still showing what the learner typed. The console is put back
   * on the list of unsaved ones so the next pause or the way out tries again.
   */
  const flushConsoleFocus = useCallback(async () => {
    if (focusTimer.current !== null) {
      clearTimeout(focusTimer.current)
      focusTimer.current = null
    }
    const pending = [...dirtyFocus.current]
    if (pending.length === 0) {
      return
    }
    dirtyFocus.current = new Set()
    for (const consoleId of pending) {
      try {
        await saveConsoleFocus(consoleId, focusRef.current[consoleId] ?? EMPTY_FOCUS)
      } catch {
        dirtyFocus.current.add(consoleId)
      }
    }
  }, [])

  /**
   * The console on screen says where it now is; the write waits for the typing to
   * pause. Focus on a console that is not on screen is not a thing the page can be
   * told — the pane reports for itself.
   */
  const reportConsoleFocus = useCallback(
    (focus: ConsoleFocus) => {
      if (openTool === null) {
        return
      }
      const consoleId = openTool
      const next = focusConsole(focusRef.current, consoleId, focus)
      if (next === focusRef.current) {
        return
      }
      focusRef.current = next
      setConsoleFocus(next)
      dirtyFocus.current.add(consoleId)
      if (focusTimer.current !== null) {
        clearTimeout(focusTimer.current)
      }
      focusTimer.current = setTimeout(() => void flushConsoleFocus(), FOCUS_SAVE_DELAY_MS)
    },
    [openTool, flushConsoleFocus],
  )

  // The console's focus sits in a timer like the close draft does, so the browser
  // leaving the page — or the route changing under it — has to be a last chance to
  // write it rather than the end of it.
  useFlushOnHide(flushConsoleFocus)
  useEffect(() => () => void flushConsoleFocus(), [flushConsoleFocus])

  /**
   * The same trade, one column out: the case file against the tool card.
   *
   * The stage is measured rather than assumed, because the room both columns need
   * is in pixels: at a 1200px stage a quarter of it is 300px of case file, and at
   * a 900px stage the same quarter is a column too narrow to read. So the pointer's
   * ratio is clamped against the width the stage has now, and the clamp is the only
   * rule — there is no snapping here, because what a column "wants" is a reader's
   * judgement rather than something the content can name.
   */
  const stageGeometry = useCallback(
    (): { usable: number; left: number; handleWidth: number } | null => {
      const stage = stageRef.current
      const handle = stageHandle.current
      if (!stage || !handle) {
        return null
      }
      const stageBox = stage.getBoundingClientRect()
      const handleWidth = handle.getBoundingClientRect().width
      const usable = stageBox.width - handleWidth
      if (usable <= 0) {
        return null
      }
      return { usable, left: stageBox.left, handleWidth }
    },
    [],
  )

  const stageRatioAt = (clientX: number): number | null => {
    const geometry = stageGeometry()
    if (!geometry) {
      return null
    }
    return stageRatioWithin(
      (clientX - geometry.left - geometry.handleWidth / 2) / geometry.usable,
      geometry.usable,
    )
  }

  const onStagePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const ratio = stageRatioAt(event.clientX)
    if (ratio === null) {
      return
    }
    event.preventDefault()
    setDraggingStage(true)
    setStageRatio(ratio)
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Nothing to do: the drag continues without capture, over the columns it
      // is resizing.
    }
  }

  const onStagePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!draggingStage) {
      return
    }
    const ratio = stageRatioAt(event.clientX)
    if (ratio !== null) {
      setStageRatio(ratio)
    }
  }

  const onStagePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!draggingStage) {
      return
    }
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setDraggingStage(false)
  }

  /**
   * The same keyboard contract as the divider inside the card — arrows nudge,
   * Shift moves further, Home and End take the trade to the room the two columns'
   * minimums leave at this width, and Enter puts back the fractions the grid
   * shipped with.
   */
  const onStageKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey
      ? DIVIDER_KEY_STEP * DIVIDER_KEY_COARSE_FACTOR
      : DIVIDER_KEY_STEP
    const geometry = stageGeometry()
    const usable = geometry?.usable
    const keys: Record<string, number> = {
      ArrowLeft: stageRatio - step,
      ArrowRight: stageRatio + step,
      Home: usable !== undefined ? stageRatioWithin(0, usable) : STAGE_MIN_RATIO,
      End: usable !== undefined ? stageRatioWithin(1, usable) : STAGE_MAX_RATIO,
      Enter: STAGE_DEFAULT_RATIO,
    }
    const next = keys[event.key]
    if (next === undefined) {
      return
    }
    event.preventDefault()
    setStageRatio(stageRatioWithin(next, usable))
  }

  /**
   * A preset moves both dividers at once: the trade between the case file and the
   * card, and the split inside the card. Each is clamped by the same rule the
   * pointer respects — the stage by the room its two columns need at this width,
   * the card by its own quarter bounds — so a preset can never leave either
   * divider somewhere it would refuse to be dragged to.
   *
   * Nothing is stored here: a preset is a move like any other, and the dividers'
   * settle timers write where they land. The split is set even while the card is
   * not split, because the position is remembered for when it is — the switch
   * itself is the learner's, and a layout preset does not flick it.
   */
  const onLayoutPreset = useCallback(
    (preset: LayoutPreset) => {
      setStageRatio(stageRatioWithin(preset.stageRatio, stageGeometry()?.usable))
      setSplitRatio(splitRatioWithin(preset.splitRatio))
    },
    [stageGeometry],
  )

  /**
   * The number keys, one per preset.
   *
   * They stand aside for fields, for a modified key, and for a window where the
   * stage's divider is not drawn — a preset there would move a trade nobody can
   * see. The handle's own computed display is the test rather than a breakpoint
   * copied out of the stylesheet, so the shortcuts and the dividers cannot
   * disagree about which of them exists.
   */
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || isTypingTarget(event.target)) {
        return
      }
      const preset = LAYOUT_PRESET_KEYS[event.key]
      const handle = stageHandle.current
      if (!preset || !handle) {
        return
      }
      if (window.getComputedStyle(handle).display === 'none') {
        return
      }
      event.preventDefault()
      onLayoutPreset(preset)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onLayoutPreset])

  /**
   * Writes the trade where it came to rest — or, when the stage's width has changed
   * since, the same ratio, which is now a different pair of widths: a share of the
   * stage is what the learner chose.
   */
  const flushStageRatio = useCallback(async () => {
    if (!stageReady.current) {
      return
    }
    const ratio = stageRatioRef.current
    if (savedStageRatio.current === ratio) {
      return
    }
    savedStageRatio.current = ratio
    try {
      await saveStageRatio(ratio)
    } catch {
      // The columns are where the learner put them either way; the next move tries
      // the write again.
      savedStageRatio.current = null
    }
  }, [])

  useEffect(() => {
    stageRatioRef.current = stageRatio
  }, [stageRatio])

  useSettledFlush(flushStageRatio, {
    value: stageRatio,
    resting: !draggingStage,
    delayMs: DIVIDER_SAVE_DELAY_MS,
  })

  /**
   * The card's top edge, dragged against the screen it is pinned to.
   *
   * The two dividers measure a container; this one needs no measurement at all,
   * because the card is fixed to the window: the share is simply the part of the
   * viewport below the pointer. The clamp is the same rule either way, so a drag
   * cannot leave the card without a console or the page without a card.
   */
  const dockShareAt = (clientY: number): number =>
    dockShareWithin(1 - clientY / Math.max(1, window.innerHeight))

  const onDockPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDraggingDock(true)
    setDockShare(dockShareAt(event.clientY))
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Nothing to do: the drag continues without capture, over the page it is
      // resizing.
    }
  }

  const onDockPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!draggingDock) {
      return
    }
    setDockShare(dockShareAt(event.clientY))
  }

  const onDockPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!draggingDock) {
      return
    }
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setDraggingDock(false)
  }

  /** The share an untouched card would have here: a log's, or a desktop's. */
  const defaultDockShare = desktopShowing ? DOCK_SHARE_WITH_DESKTOP : DOCK_SHARE_DEFAULT

  /**
   * The dividers' keyboard contract, on the horizontal axis: arrows nudge (up
   * makes the card taller, because the edge is moving up), Shift moves further,
   * Home and End take the card to its bounds, and Enter puts back the share an
   * untouched card would have.
   */
  const onDockKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey
      ? DIVIDER_KEY_STEP * DIVIDER_KEY_COARSE_FACTOR
      : DIVIDER_KEY_STEP
    const current = dockShare ?? defaultDockShare
    const keys: Record<string, number> = {
      ArrowUp: current + step,
      ArrowDown: current - step,
      Home: DOCK_SHARE_MIN,
      End: DOCK_SHARE_MAX,
      Enter: defaultDockShare,
    }
    const next = keys[event.key]
    if (next === undefined) {
      return
    }
    event.preventDefault()
    setDockShare(dockShareWithin(next))
  }

  /** Writes the height the card came to rest at, and nothing while it is untouched. */
  const flushDockShare = useCallback(async () => {
    if (!dockReady.current) {
      return
    }
    const share = dockShareRef.current
    if (share === null || savedDockShare.current === share) {
      return
    }
    savedDockShare.current = share
    try {
      await saveDockShare(share)
    } catch {
      // The card stays where the learner put it either way; the next move tries
      // the write again.
      savedDockShare.current = null
    }
  }, [])

  useEffect(() => {
    dockShareRef.current = dockShare
  }, [dockShare])

  useSettledFlush(flushDockShare, {
    value: dockShare,
    resting: !draggingDock,
    delayMs: DIVIDER_SAVE_DELAY_MS,
  })

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
          const review = await reviewClosure({
            code: closureCode,
            note: resolutionNote,
          })
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
        setActionError(caught instanceof Error ? caught.message : 'That command could not be run.')
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
      const refused = await denyCaller(denyReason)
      setWorkspace(refused)
      setConfirmDeny(false)
      // A refusal has one close that fits it — the report to Security — and the
      // service has written it to the draft already; the form follows, so the
      // learner reads the report, not the resolve form. They can still change it.
      const closing = refused.denial?.closingCode
      if (closing) {
        setClosureCode(closing)
        setClosureReview(null)
      }
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
      // The close is reviewed on every attempt rather than reusing the hint shown
      // last time: a refusal's report is a contract, not advice, so it is read
      // against the note as it stands now.
      const review = await reviewClosure({ code: closureCode, note: resolutionNote })
      // A security report the desk cannot accept stops the close here, naming
      // the part that is missing. The service refuses it too, so no other
      // surface can record a refusal without one.
      if (review.report) {
        setClosureReview(review)
        setBusy(false)
        return
      }
      // A close that would pass can still leave the network proof bonus on
      // the table, so the review is shown before the learner commits to it.
      // A step that would only be partly credited is worth a look before it is
      // committed: the close is not blocked, but the score is not what the
      // learner may expect and the reason is in the review.
      if (
        !closureReview &&
        (review.blocking.length > 0 || review.partial.length > 0 || review.pendingBonusXp > 0)
      ) {
        setClosureReview(review)
        setBusy(false)
        return
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

  /**
   * The open tools as the switcher names them, narrowed by what has been typed.
   * Drawn in the strip's own order, so the list reads the way the tabs do.
   */
  const switcherTools = switcherMatches(
    openTools.map((id) => ({ id, label: toolLabel(id) })),
    switcherQuery,
  )

  /**
   * Closes the switcher, optionally handing the keyboard back to whatever had it
   * when the switcher opened. That is what makes Escape a cancel rather than a
   * jump to the top of the page — unless the element has left the document in
   * the meantime, which is what a tab closed behind the panel looks like.
   */
  const closeSwitcher = useCallback((restoreFocus: boolean) => {
    setSwitcherOpen(false)
    const target = switcherReturn.current
    switcherReturn.current = null
    if (restoreFocus && target && target.isConnected) {
      target.focus()
    }
  }, [])

  /**
   * Opens the tool the highlight is on. The tab is the anchor the learner came
   * from, so focus goes there once it exists: the console changes under it, and
   * the next key press then belongs to the strip.
   */
  const onSwitcherPick = (consoleId: ConsoleId) => {
    setSwitcherOpen(false)
    switcherReturn.current = null
    void onShowConsole(consoleId)
    window.requestAnimationFrame(() => {
      document.getElementById(`console-tab-${consoleId}`)?.focus()
    })
  }

  /**
   * The switcher's own keys: arrows walk the list, Home and End take its ends,
   * Enter opens what is highlighted, Escape puts the keyboard back. The highlight
   * is what `aria-activedescendant` reads, so the input keeps the focus and the
   * list is announced as the query narrows.
   */
  const onSwitcherKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setSwitcherIndex((index) =>
        stepSwitcherIndex(index, event.key === 'ArrowDown' ? 1 : -1, switcherTools.length),
      )
      return
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      setSwitcherIndex(event.key === 'Home' ? 0 : Math.max(0, switcherTools.length - 1))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const pick = switcherTools[switcherIndex]
      if (pick) {
        onSwitcherPick(pick.id)
      }
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      closeSwitcher(true)
      return
    }
    if (event.key === 'Tab') {
      // The panel says it is modal, so Tab may not walk out of it into the page
      // behind. Its input is the only place the keyboard can be, and it is
      // already there; the list itself is reached with the arrows.
      event.preventDefault()
    }
  }

  /**
   * `t` opens the switcher.
   *
   * It stands aside for a field being typed into, for a modified key, and for a
   * workspace with nothing open — a switcher over an empty strip would be a panel
   * saying there is nothing to switch to. Opening it closes the tools menu, which
   * is the other list of tools and would otherwise sit under this one.
   */
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || isTypingTarget(event.target)) {
        return
      }
      if (event.key.toLowerCase() !== SWITCHER_KEY || openTools.length === 0) {
        return
      }
      event.preventDefault()
      switcherReturn.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      setSwitcherQuery('')
      setSwitcherIndex(0)
      setToolMenuOpen(false)
      setSwitcherOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openTools])

  /**
   * The query has the keyboard as soon as the panel is on screen: a switcher you
   * have to tab into is not a keyboard-first one.
   */
  useEffect(() => {
    if (switcherOpen) {
      switcherInput.current?.focus()
    }
  }, [switcherOpen])

  /**
   * Puts the caller's latest view on screen, unless something newer has already
   * arrived: a command finishing while a read was in flight must not be undone by
   * the view that read returned.
   */
  const applyCallerView = useCallback((view: WorkspaceView | null) => {
    if (!view) {
      return
    }
    setWorkspace((current) =>
      current && lastSeq(current.entries) > lastSeq(view.entries) ? current : view,
    )
  }, [])

  // Reads are recorded one at a time: two records opened in the same breath
  // must not both read the caller's script before either has written its row,
  // or the same line would be said twice.
  const readInFlight = useRef<Promise<void>>(Promise.resolve())

  /** Reading a record is a step of the attempt, and the caller can answer it. */
  const onReadRecord = (consoleId: ConsoleId, entryId: string | null) => {
    readInFlight.current = readInFlight.current
      .then(() => recordConsoleRead(consoleId, entryId))
      .then(applyCallerView)
      .catch(() => {})
  }

  const onShowConsole = async (consoleId: ConsoleId) => {
    setPaneMode('tools')
    setOpenTool(consoleId)
    // Opening a tool that is already open only brings it forward.
    setOpenTools((current) => (current.includes(consoleId) ? current : [...current, consoleId]))
    setToolMenuOpen(false)
    // The caller hears a tool being opened, so the attempt records the look
    // before the console is read. A line said now keeps the latest view.
    onReadRecord(consoleId, null)

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
        [consoleId]: caught instanceof Error ? caught.message : 'The console could not be read.',
      }))
    }
  }

  /**
   * The keyboard's way to act on the dot.
   *
   * A tab that is not in front is the one that collects news, and a strip wider
   * than the card can hide it behind the fade, or behind the terminal when the
   * split is off — the dot says something is there but not where. This steps to
   * the next tab that has news, opening it, which is what marks it read: the same
   * move a click makes, down to bringing the tools pane forward when the terminal
   * was the pane in front. With every tab read the key does nothing, rather than
   * moving the workspace somewhere it was not asked to go.
   */
  // The shortcut reads the opener through a ref: opening a console is a fresh
  // function on every render, and a key listener rebuilt after each one to reach
  // it would be churn for no gain. The ref is kept current before the listener
  // effect below runs, because it is declared first.
  const showConsoleForNews = useRef(onShowConsole)
  useEffect(() => {
    showConsoleForNews.current = onShowConsole
  })

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || isTypingTarget(event.target)) {
        return
      }
      if (event.key.toLowerCase() !== NEWS_KEY) {
        return
      }
      const next = nextConsoleWithNews(openTools, openTool, consoleReads, consoleDigests)
      if (next === null) {
        return
      }
      event.preventDefault()
      void showConsoleForNews.current(next)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [consoleDigests, consoleReads, openTool, openTools])

  /**
   * Closing a tab drops its view as well as the tab, so reopening the tool reads
   * the machine again rather than putting back what it looked like when it was
   * closed. The pane moves to the neighbour the tab had, or to the shelf when it
   * had none.
   */
  const onCloseConsole = (consoleId: ConsoleId) => {
    const remaining = openTools.filter((id) => id !== consoleId)
    setOpenTools(remaining)
    // A closed tab cannot stay in the held group; the rest of the group keeps
    // its order, and the tab in front moves to the neighbour it had.
    setPinnedTools((current) => current.filter((id) => id !== consoleId))
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
        // A console action is a command, so it moves the world for every console
        // and not only the one that ran it: the map is evidence-driven, so all of
        // them are reread, exactly as after a command typed in the terminal.
        await refreshOpenConsoles()
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
    [refreshOpenConsoles],
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
  // A refusal gives the ticket a close of its own: the report to Security rather
  // than the ordinary hand-off, so the form says so and the code opens on it.
  const refusal = workspace.denial

  /**
   * The card's paperwork, in pieces it can arrange two ways. A desk reads the
   * reference, the requester, the impact and the device beside the report; a
   * folded window folds all of it behind one summary and keeps only the subject
   * and the report open, because the report is what the call is about and the
   * rest is reference the learner can open when they need it.
   */
  const ticketReference = (
    <div className={styles.cardTop}>
      <span className={styles.ticketId}>{ticketRef}</span>
      <span className={styles.severity} data-severity={ticket.severity}>
        {SEVERITY_LABELS[ticket.severity]}
      </span>
      <span className={styles.cardTopLine} aria-hidden="true" />
      <span className={styles.cardStatus}>Open</span>
    </div>
  )

  const ticketAssignee = (
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
  )

  const ticketContactFacts = (
    <>
      <div className={styles.detailRow}>
        <span className={styles.fieldLabel}>Reported by</span>
        <p className={styles.detailValue}>
          {caller.name} <span className={styles.detailMuted}>({caller.email})</span>
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
    </>
  )

  const ticketImpactFacts = (
    <>
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
    </>
  )

  /**
   * The report itself, which stays open on every width. A ticket that arrived as
   * a recording shows the recording where the description would be: the message
   * is the report, with the time it was left, how long it ran, and the line it
   * asks to be rung back on. The words are the generated report, unedited.
   */
  const ticketReport = ticket.voicemail ? (
    <div className={styles.voicemail} aria-label="Voicemail">
      <div className={styles.voicemailHead}>
        <span className={styles.voicemailBadge}>Voicemail</span>
        <span className={styles.voicemailWhen}>
          left at {formatSimClock(ticket.voicemail.leftAt)} ·{' '}
          {voicemailLength(ticket.voicemail.durationSeconds)} recording
        </span>
      </div>
      <p className={styles.voicemailTranscript}>“{ticket.body}”</p>
      <p className={styles.voicemailNote}>
        {ticket.voicemail.callbackLine === 'desk'
          ? 'The handset on file is out of action, so the message names the desk line. Ring it back from Verify the caller before you change anything.'
          : 'The number on file takes a call. Ring it back from Verify the caller if the message leaves you guessing.'}
      </p>
    </div>
  ) : (
    <div className={styles.detailRow}>
      <span className={styles.fieldLabel}>Issue description</span>
      <p className={styles.detailValue}>{ticket.body}</p>
    </div>
  )

  /**
   * The preset both dividers are sitting on, if any. A learner who has moved one
   * of them has left the preset, and the strip says so by lighting nothing.
   */
  const activePreset = layoutPresetAt(stageRatio, splitRatio)

  return (
    <div className={styles.workspace} ref={workspaceRef}>
      <div className={styles.stageBar}>
        <Link className={styles.backLink} to="/practice">
          <span aria-hidden="true">←</span> Back to queue
        </Link>

        {/* The two trades named together: a learner who reads the case file or
            works a console every time can ask for both with one key instead of
            aiming two dividers. */}
        <div className={styles.layoutPresets} role="group" aria-label="Workspace layout">
          <span className={styles.layoutPresetsLabel} aria-hidden="true">
            Layout
          </span>
          {LAYOUT_PRESETS.map((preset, index) => (
            <button
              key={preset.id}
              type="button"
              className={styles.layoutPreset}
              aria-label={LAYOUT_PRESET_COPY[preset.id].label}
              aria-keyshortcuts={String(index + 1)}
              aria-pressed={activePreset?.id === preset.id}
              title={LAYOUT_PRESET_COPY[preset.id].hint}
              onClick={() => onLayoutPreset(preset)}
            >
              {LAYOUT_PRESET_COPY[preset.id].name}
            </button>
          ))}
        </div>
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
                {workspace.procedurePenalty === 0 ? '0 pts' : `−${workspace.procedurePenalty} pts`}
              </span>
            </summary>
            {workspace.procedureViolations.length === 0 ? (
              <p className={styles.procedureCostNote}>
                No process deductions so far. Changing something before the caller is verified, or
                fixing before reading any evidence, is priced here as it happens.
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
                    would record. The score follows the log and this form; the close button is what
                    commits it.
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div
        className={styles.stage}
        data-stage
        ref={stageRef}
        style={
          {
            '--stage-ratio': stageRatio,
            // Where the card's top edge was left, when it has been moved. Both
            // shares are written, so the height the learner chose holds whether
            // a log or a machine's desktop is on the card; untouched, the
            // palette's own two shares apply.
            ...(dockShare === null
              ? {}
              : {
                  '--dock-share': `${Number((dockShare * 100).toFixed(2))}dvh`,
                  '--dock-share-desktop': `${Number((dockShare * 100).toFixed(2))}dvh`,
                }),
          } as CSSProperties
        }
      >
        <div className={styles.ticketColumn}>
          <section className={styles.ticketCard} aria-label="Ticket">
            {folded ? (
              <>
                {/*
                  * Where the window folds, the card is the call, not the paperwork:
                  * the subject and the report are what the learner is working from,
                  * and the reference, requester, impact and device fold behind one
                  * summary. The stage bar above still names the ticket, so nothing
                  * is lost from view, only from the first screen.
                  */}
                <h1 className={styles.ticketSubject}>{ticket.subject}</h1>
                <div className={styles.details}>{ticketReport}</div>
                <details className={styles.metadataFold}>
                  <summary className={styles.metadataSummary}>
                    <span className={styles.metadataTitle}>Ticket details</span>
                    <span className={styles.metadataNote}>
                      Reference, severity, requester, impact and device
                    </span>
                  </summary>
                  {ticketReference}
                  {ticketAssignee}
                  <div className={styles.details}>
                    {ticketContactFacts}
                    {ticketImpactFacts}
                  </div>
                </details>
              </>
            ) : (
              <>
                {ticketReference}
                <h1 className={styles.ticketSubject}>{ticket.subject}</h1>
                {ticketAssignee}
                <div className={styles.details}>
                  {ticketContactFacts}
                  {ticketReport}
                  {ticketImpactFacts}
                </div>
              </>
            )}

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
                  This ticket is an <strong>exam attempt</strong>, so every hint stays closed until
                  it is scored and the price is the exam's, not the one in Settings. The debrief
                  opens with the ladders the exam withheld — {workspace.hintPolicy.perHint} points a
                  rung on this attempt — so the steps you miss are still explained.
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
                      {workspace.hintsRemaining} hint
                      {workspace.hintsRemaining === 1 ? '' : 's'} remain
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
                      Every hinted step on this ticket has been revealed. The debrief will explain
                      the rest.
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
                      {workspace.hints.length === 0
                        ? 'Reveal the first hint'
                        : 'Reveal the next hint'}
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

            <CaseSection
              title={workspace.denial ? 'Request refused' : 'Verify the caller'}
              folded={folded}
            >
              {workspace.denial ? (
                <>
                  <div className={practice.denyState} role="status">
                    <p className={practice.denyHeading}>{workspace.denial.label}</p>
                    <p className={practice.mutedSmall}>
                      {workspace.denial.summary} No account changes were made on the caller’s word.
                      Record what was asked, then close the ticket with the denial outcome.
                    </p>
                    <BlockedCommands commands={workspace.denial.blockedCommands} />
                    {workspace.denial.retried.length > 0 ? (
                      <div
                        className={practice.retryNotice}
                        role="status"
                        aria-label="Changes tried after the refusal"
                      >
                        <strong>Tried after you refused</strong>
                        <ul>
                          {workspace.denial.retried.map((attempt) => (
                            <li key={attempt.seq}>
                              <code>{attempt.command}</code> — the refusal stopped it.
                            </li>
                          ))}
                        </ul>
                        <span>
                          A refusal is the decision on this ticket, not a step to work around. The
                          attempt goes to the debrief as it stands.
                        </span>
                      </div>
                    ) : null}
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
                        Send one code to the person on the ticket and have them read it back, ring a
                        line on file and confirm the request with them, or use something the caller
                        carries or can do at the desk. Only one code is live at a time, and a code
                        only proves who received it.
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
                            {recipient.role === 'caller'
                              ? 'on the ticket'
                              : recipient.role === 'team'
                                ? 'shared team line'
                                : 'manager on file'}{' '}
                            ({recipient.destination})
                          </option>
                        ))}
                      </select>

                      {selectedRecipient?.role === 'team' ? (
                        <p className={practice.mutedSmall}>
                          {selectedRecipient.name} is shared: whoever is at that desk picks it up,
                          so a call to it confirms a colleague rather than the person on this ticket.
                        </p>
                      ) : null}
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

                      {selectedRecipient && !canSendCode && selectedRecipient.role !== 'team' ? (
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
                          {/*
                            The clock is the simulation's, not the wall's — the code
                            lives ten simulated minutes, and every command moves that
                            clock a minute — so this is read from the view rather than
                            ticking down on its own and claiming a deadline that has not
                            arrived. Minutes are rounded up, so a code with half a
                            minute left reads "1 min" rather than "0 min".
                          */}
                          <p
                            className={
                              verification.active.remainingMs === 0
                                ? practice.warning
                                : practice.mutedSmall
                            }
                            role="status"
                          >
                            {verification.active.remainingMs === 0
                              ? `Expired at ${formatSimClock(verification.active.expiresAt)} — send a new code.`
                              : `Expires in ${Math.ceil(verification.active.remainingMs / 60_000)} min, at ${formatSimClock(verification.active.expiresAt)}.`}
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
            </CaseSection>

            <CaseSection title="Ask the requester" folded={folded}>
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
            </CaseSection>

            <CaseSection
              title="Troubleshooting notes"
              headingId="troubleshooting-notes-heading"
              folded={folded}
            >
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
                aria-labelledby="troubleshooting-notes-heading"
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
            </CaseSection>

            <CaseSection
              title="Customer notes"
              headingId="customer-notes-heading"
              folded={folded}
            >
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
                aria-labelledby="customer-notes-heading"
                placeholder="Plain-language update for the requester."
                value={customerDraft}
                onChange={(event) => setCustomerDraft(event.target.value)}
                rows={2}
              />
              <button
                type="button"
                className={practice.secondaryButton}
                disabled={busy}
                onClick={() => void saveNote('customer', customerDraft, () => setCustomerDraft(''))}
              >
                Send customer note
              </button>
            </CaseSection>

            <CaseSection
              title={refusal ? 'Report the refusal' : 'Close the ticket'}
              folded={folded}
            >
              <form className={practice.sectionForm} onSubmit={(event) => void onResolve(event)}>
                {refusal ? (
                <p className={practice.mutedSmall}>
                  The request was refused, so this close is a report rather than a hand-off: no fix
                  was made, and the account work on this ticket is over. A refusal is a decision,
                  and Security needs it in writing — what was asked, what you checked before
                  deciding, and what should happen next.
                </p>
              ) : null}
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
                {refusal ? 'Security report' : 'Handoff note'}
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
                placeholder={
                  refusal
                    ? 'What was asked, what the caller claimed, what you checked, and what Security should do next'
                    : 'What was reported, what you checked, and what the next team should do'
                }
              />
              <p className={practice.mutedSmall}>
                The code and note are saved with the attempt, so a reload brings this close back
                exactly as you left it.
              </p>
              {closureReview ? (
                <div className={practice.closureNotice} role="alert">
                  <strong>
                    {closureReview.report
                      ? 'The security report is missing something'
                      : closureReview.blocking.length > 0 || !closureReview.passed
                        ? 'This attempt would not pass yet'
                        : closureReview.partial.length > 0
                          ? 'One step would only be partly credited'
                          : 'The network proof bonus is still available'}
                  </strong>
                  {closureReview.report ? <span>{closureReview.report.message}</span> : null}
                  {closureReview.report ? null : closureReview.blocking.length > 0 ? (
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
                  ) : (
                    <span>
                      It would score {closureReview.total}/100
                      {closureReview.passed ? ' and pass' : ', below the pass mark'}.
                      {closureReview.pendingBonusXp > 0
                        ? ' Closing now also leaves the network proof bonus unclaimed.'
                        : ''}
                    </span>
                  )}
                  {closureReview.partial.length > 0 ? (
                    <>
                      <span>
                        {closureReview.partial.length === 1
                          ? 'One step is only partly met'
                          : `${closureReview.partial.length} steps are only partly met`}
                        , so it pays part of the points:
                      </span>
                      <ul>
                        {closureReview.partial.map((item) => (
                          <li key={item.id}>
                            {item.label} — {item.earned} of {item.weight} pts
                            {item.reason ? `: ${item.reason}` : ''}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
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
                    {closureReview.report
                      ? 'Add the missing part and close again: a refusal is recorded with its report, not without one.'
                      : closureReview.blocking.length > 0 || !closureReview.passed
                      ? 'Close anyway to record the attempt as it stands, or keep working and close when the steps are done.'
                      : closureReview.pendingBonusXp > 0
                        ? 'Keep working to prove the links, or close now and score what you have.'
                        : 'Close now to score what you have, or un-run the refusal and record it under the reason the ticket needs.'}
                  </span>
                </div>
              ) : null}
              <button type="submit" className={practice.primaryButton} disabled={busy}>
                {closureReview
                  ? closureReview.report
                    ? 'Close and report'
                    : closureReview.blocking.length > 0 || !closureReview.passed
                    ? 'Close anyway and score'
                    : closureReview.pendingBonusXp > 0
                      ? 'Close without the bonus'
                      : 'Close and score'
                  : refusal
                    ? 'Close and report'
                    : 'Resolve ticket'}
              </button>
              <p className={practice.mutedSmall}>
                {refusal
                  ? 'A refusal cannot be recorded without its report. It has to say what was asked, what you checked before refusing, and the next action for Security — the close stops and names the part if one is missing.'
                  : 'Required when you escalate: name the report, the evidence, and the next action. Resolving closes the session and scores your evidence, notes, and decision.'}
                </p>
              </form>
            </CaseSection>

            <CaseSection title="Abandon the ticket" folded={folded}>
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
            </CaseSection>

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

        {/* The trade between the two columns of the workspace, drawn like the
            divider inside the card so the two are one gesture. */}
        <div
          className={styles.stageHandle}
          ref={stageHandle}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the case file and the tool card"
          aria-valuemin={Math.round(STAGE_MIN_RATIO * 100)}
          aria-valuemax={Math.round(STAGE_MAX_RATIO * 100)}
          aria-valuenow={Math.round(stageRatio * 100)}
          title="Drag to resize · arrow keys to adjust · double-click to reset"
          tabIndex={0}
          onKeyDown={onStageKeyDown}
          onDoubleClick={() => setStageRatio(stageRatioWithin(STAGE_DEFAULT_RATIO))}
          onPointerDown={onStagePointerDown}
          onPointerMove={onStagePointerMove}
          onPointerUp={onStagePointerUp}
          onPointerCancel={onStagePointerUp}
        >
          <span className={styles.stageHandleGrip} aria-hidden="true" />
        </div>

        <section className={styles.toolCard} aria-label="Simulated tools">
          {/* The card's top edge on a phone: the workspace's third divider, and the
              only one across. It is drawn above the card rather than inside it, so
              dragging the seam never moves a line of the header under the finger. */}
          <div
            className={styles.dockHandle}
            ref={dockHandle}
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize the tool card"
            aria-valuemin={Math.round(DOCK_SHARE_MIN * 100)}
            aria-valuemax={Math.round(DOCK_SHARE_MAX * 100)}
            aria-valuenow={Math.round((dockShare ?? defaultDockShare) * 100)}
            aria-valuetext={`The tool card takes ${Math.round(
              (dockShare ?? defaultDockShare) * 100,
            )}% of the screen`}
            data-dragging={draggingDock ? 'true' : 'false'}
            title="Drag to resize · arrow keys to adjust · double-click to reset"
            tabIndex={0}
            onKeyDown={onDockKeyDown}
            onDoubleClick={() => setDockShare(defaultDockShare)}
            onPointerDown={onDockPointerDown}
            onPointerMove={onDockPointerMove}
            onPointerUp={onDockPointerUp}
            onPointerCancel={onDockPointerUp}
          >
            <span className={styles.dockHandleGrip} aria-hidden="true" />
            {/* Only while the edge is held: the number a drag has come to. */}
            <span className={styles.dockHandleShare} aria-hidden="true">
              {Math.round((dockShare ?? defaultDockShare) * 100)}%
            </span>
          </div>
          <div className={styles.toolHead}>
            <div className={styles.toolIdentity}>
              <span className={styles.toolGlyph} aria-hidden="true">
                ⌘
              </span>
              <span>
                <span className={styles.toolEyebrow}>Service desk</span>
                <span className={styles.toolTitle}>
                  {openTool ? toolLabel(openTool) : 'Workstation'}
                </span>
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
              {/* The divider's resting places, offered beside the switch that
                  creates a divider. They run the way the divider does — console
                  side, middle, log side — so the group reads as positions on the
                  card rather than as a list of panes. */}
              {splitView ? (
                <div className={styles.splitStops} role="group" aria-label="Divider position">
                  {SPLIT_STOP_BUTTONS.map((stop) => (
                    <button
                      key={stop.id}
                      type="button"
                      className={styles.splitStop}
                      aria-label={stop.label}
                      aria-pressed={splitRatio === stop.ratio}
                      title={stop.hint}
                      onClick={() => onSplitStop(stop.ratio)}
                    >
                      {stop.name}
                    </button>
                  ))}
                </div>
              ) : null}
              <span className={styles.toolClock}>{formatSimClock(workspace.simulatedClock)}</span>
              <button
                type="button"
                className={styles.toolsMenuButton}
                aria-expanded={toolMenuOpen}
                // The key is named where the tools are, so the switcher is a
                // shortcut rather than something to find out about by accident.
                title={
                  openTools.length > 0
                    ? 'Every console this ticket has open · press T to jump to one by name'
                    : undefined
                }
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
                  <ToolPicker groups={toolGroups} compact onOpen={(id) => void onShowConsole(id)} />
                </div>
              </div>
            ) : null}
          </div>

          {switcherOpen ? (
            <div
              className={styles.switcherBackdrop}
              // A click outside the panel is a cancel like Escape, and it is
              // swallowed: where it landed is not a tool, and a click that fell
              // through would move the workspace the panel was opened to change.
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  event.preventDefault()
                  closeSwitcher(true)
                }
              }}
            >
              <div
                className={styles.switcher}
                role="dialog"
                aria-modal="true"
                aria-label="Switch tool"
              >
                <label className={styles.switcherLabel} htmlFor="tool-switcher-input">
                  Switch to an open tool
                </label>
                <input
                  id="tool-switcher-input"
                  ref={switcherInput}
                  className={styles.switcherInput}
                  role="combobox"
                  aria-expanded="true"
                  aria-controls="tool-switcher-list"
                  aria-autocomplete="list"
                  aria-activedescendant={
                    switcherTools[switcherIndex]
                      ? `tool-switcher-${switcherTools[switcherIndex].id}`
                      : undefined
                  }
                  value={switcherQuery}
                  onChange={(event) => {
                    setSwitcherQuery(event.target.value)
                    // A narrower list is a new list; the arrows start at its top.
                    setSwitcherIndex(0)
                  }}
                  onKeyDown={onSwitcherKeyDown}
                  placeholder="Type a tool name"
                  autoComplete="off"
                  spellCheck={false}
                />
                {switcherTools.length > 0 ? (
                  <ul
                    id="tool-switcher-list"
                    className={styles.switcherList}
                  role="listbox"
                  // Not "Open tools": that is the strip's own name, and a
                  // combobox list answering to it would be the second thing on
                  // the card called that.
                  aria-label="Matching tools"
                >
                    {switcherTools.map((tool, index) => {
                      const hasNews =
                        tool.id !== lookedConsole &&
                        consoleHasNews(consoleReads, tool.id, consoleDigests[tool.id])
                      return (
                        <li
                          key={tool.id}
                          id={`tool-switcher-${tool.id}`}
                          role="option"
                          aria-selected={index === switcherIndex}
                          aria-label={`${tool.label}${hasNews ? ', new' : ''}${
                            tool.id === openTool ? ', open' : ''
                          }`}
                          className={
                            index === switcherIndex
                              ? `${styles.switcherOption} ${styles.switcherOptionActive}`
                              : styles.switcherOption
                          }
                          // `mousedown` rather than `click`: the panel closes
                          // before a click would be delivered, and the pick must
                          // not be lost with the element it was aimed at.
                          onMouseDown={(event) => {
                            event.preventDefault()
                            onSwitcherPick(tool.id)
                          }}
                        >
                          <span className={styles.switcherName}>{tool.label}</span>
                          {hasNews ? <span className={styles.switcherBadge}>new</span> : null}
                          {tool.id === openTool ? (
                            <span className={styles.switcherBadge}>open</span>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p className={styles.switcherEmpty}>
                    No open tool matches “{switcherQuery.trim()}”.
                  </p>
                )}
                <p className={styles.switcherHint}>↑↓ to move · Enter to switch · Esc to close</p>
              </div>
            </div>
          ) : null}

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
                paneMode === 'terminal'
                  ? `${styles.toolTab} ${styles.toolTabActive}`
                  : styles.toolTab
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
              {workspace.denial ? (
                <div
                  className={styles.blockedNotice}
                  role="status"
                  aria-label="Commands the refusal stops"
                >
                  <p className={styles.blockedHeading}>
                    Refusal stands — these commands will not run
                  </p>
                  <BlockedCommands commands={workspace.denial.blockedCommands} />
                  <p className={styles.blockedNote}>
                    Looking things up still works, so the log can carry what you checked. Then
                    finish the paper: record what was asked and close the ticket as denied.
                  </p>
                </div>
              ) : null}
              <div className={styles.quickRow} aria-label="Quick commands">
                {['ipconfig /all', 'ipconfig /renew', 'ping 10.20.4.1', 'systeminfo', 'help'].map(
                  (entry) => (
                    <button
                      key={entry}
                      type="button"
                      className={styles.quickCommand}
                      disabled={busy}
                      onClick={() => setCommand(entry)}
                    >
                      {entry}
                    </button>
                  ),
                )}
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
                data-snapped={splitSnapped ? 'true' : undefined}
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
                <div
                  className={styles.consoleTabs}
                  role="tablist"
                  aria-label="Open tools"
                  // The strip's two shortcuts, advertised where the strip is: one
                  // walks to the next tab with news, the other opens the panel
                  // that takes a name instead of a walk.
                  aria-keyshortcuts="N T"
                  ref={stripRef}
                  data-overflow={stripOverflow}
                  // A tool carried out of the shelf lands on the strip; the caret
                  // between two tabs says where, and the edge says the strip is
                  // the thing being aimed at.
                  data-drop-active={stripDropIndex === null ? undefined : 'true'}
                  onScroll={showToolInStrip}
                  onDragOver={(event) => {
                    const consoleId = carriedTool(event)
                    if (consoleId === null) {
                      return
                    }
                    event.preventDefault()
                    if (event.dataTransfer) {
                      event.dataTransfer.dropEffect = 'copy'
                    }
                    setStripDropIndex(
                      workspaceInsertIndex(workspaceLayout(), consoleId, stripDropPlace(event.clientX)),
                    )
                  }}
                  onDragLeave={(event) => {
                    if (draggingNewTool === null) {
                      return
                    }
                    // Crossing the strip's own tabs is not leaving the strip, and
                    // a caret that blinked off between them would read as a miss.
                    const next = event.relatedTarget
                    if (next instanceof Node && event.currentTarget.contains(next)) {
                      return
                    }
                    setStripDropIndex(null)
                  }}
                  onDrop={(event) => {
                    const consoleId = carriedTool(event)
                    if (consoleId === null) {
                      return
                    }
                    event.preventDefault()
                    const index = stripDropPlace(event.clientX)
                    setDraggingNewTool(null)
                    setStripDropIndex(null)
                    setDropTarget(null)
                    onDropTool(consoleId, index)
                  }}
                >
                  {openTools.map((consoleId, index) => {
                    const isPinned = pinnedTools.includes(consoleId)
                    // Something this console would print has changed since the
                    // last time it was in front — and a tab being looked at is
                    // never marked, even for the frame before its new page has
                    // been filed as read.
                    const hasNews =
                      consoleId !== lookedConsole &&
                      consoleHasNews(consoleReads, consoleId, consoleDigests[consoleId])
                    // The first tab outside the held group opens the rest of the
                    // strip, and is marked as the seam it is: the group is a
                    // promise about the left of the strip, and a promise needs an
                    // edge once there is more than one held tab.
                    const opensTheFreeTabs =
                      !isPinned && pinnedTools.length > 0 && index === pinnedTools.length
                    // The place a carried tool would land: ahead of this tab, or
                    // past the last one when the pointer is over the end of the
                    // row.
                    const caretAt =
                      stripDropIndex === index
                        ? 'start'
                        : stripDropIndex === openTools.length && index === openTools.length - 1
                          ? 'end'
                          : null
                    return (
                      <button
                        key={consoleId}
                        type="button"
                        role="tab"
                        id={`console-tab-${consoleId}`}
                        aria-selected={openTool === consoleId}
                        // The dot says it in colour and the title says it on hover;
                        // the name is what a screen reader reads out with the tab.
                        aria-label={
                          hasNews ? `${toolLabel(consoleId)}, new` : toolLabel(consoleId)
                        }
                        // A pinned tab is part of what holds the front, so only
                        // the others move.
                        draggable={openTools.length > 1 && !isPinned}
                        onDragStart={() => setDraggingTool(index)}
                        onDragOver={(event) => {
                          if (draggingTool === null || draggingTool === index) {
                            return
                          }
                          // Only a tab that could land here cancels the drop.
                          event.preventDefault()
                          setDropTarget(index)
                        }}
                        onDrop={(event) => {
                          event.preventDefault()
                          if (draggingTool !== null) {
                            onReorderTool(draggingTool, index)
                          }
                          setDraggingTool(null)
                          setDropTarget(null)
                        }}
                        onDragEnd={() => {
                          setDraggingTool(null)
                          setDropTarget(null)
                        }}
                        // The same move from the keyboard, because a drag is not
                        // available to everybody: Ctrl/Cmd and an arrow puts the tab
                        // one place along, and the pin stays where it is.
                        onKeyDown={(event) => {
                          if (!event.ctrlKey && !event.metaKey) {
                            return
                          }
                          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
                            return
                          }
                          event.preventDefault()
                          onReorderTool(index, index + (event.key === 'ArrowLeft' ? -1 : 1))
                        }}
                        title={`${toolLabel(consoleId)} — ${
                          hasNews ? 'something new to show · press N to step to the next one · ' : ''
                        }${
                          isPinned
                            ? 'held in the group at the left of the strip'
                            : 'drag to reorder, or Ctrl with an arrow key'
                        }`}
                        className={[
                          styles.consoleTab,
                          openTool === consoleId ? styles.consoleTabActive : '',
                          isPinned ? styles.consoleTabPinned : '',
                          opensTheFreeTabs ? styles.consoleTabGroupStart : '',
                          draggingTool === index ? styles.consoleTabDragging : '',
                          dropTarget === index ? styles.consoleTabDropTarget : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() => void onShowConsole(consoleId)}
                      >
                        {caretAt === null ? null : (
                          <span
                            className={
                              caretAt === 'end'
                                ? `${styles.consoleTabsCaret} ${styles.consoleTabsCaretEnd}`
                                : styles.consoleTabsCaret
                            }
                            data-strip-caret={caretAt}
                            aria-hidden="true"
                          />
                        )}
                        {isPinned ? (
                          <span className={styles.consoleTabPin} aria-hidden="true">
                            ⇥
                          </span>
                        ) : null}
                        {hasNews ? (
                          <span className={styles.consoleTabDot} aria-hidden="true" />
                        ) : null}
                        {toolLabel(consoleId)}
                      </button>
                    )
                  })}
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
                    <ToolPicker
                      groups={toolGroups}
                      onOpen={(id) => void onShowConsole(id)}
                      // The shelf sits under the strip, so a tool picked up here
                      // has somewhere to be dropped; with no tabs there is no
                      // strip and nothing to drag to.
                      onDragTool={openTools.length > 0 ? setDraggingNewTool : undefined}
                      onDragToolEnd={() => {
                        setDraggingNewTool(null)
                        setStripDropIndex(null)
                      }}
                    />
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
                      <span className={styles.consoleName} title={toolLabel(openTool)}>
                        {toolLabel(openTool)}
                      </span>
                      <button
                        type="button"
                        className={styles.consolePin}
                        aria-pressed={pinnedTools.includes(openTool)}
                        aria-label={
                          pinnedTools.includes(openTool)
                            ? `Unpin ${toolLabel(openTool)} from the left of the strip`
                            : `Pin ${toolLabel(openTool)} to the left of the strip`
                        }
                        onClick={onTogglePin}
                      >
                        {pinnedTools.includes(openTool) ? 'Pinned' : 'Pin'}
                      </button>
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
                    onRead={(entryId) => onReadRecord(openTool, entryId)}
                    // What this console was showing when it was last left, and
                    // the way back out: a reopened ticket lands on the machine.
                    focus={consoleFocus[openTool] ?? null}
                    onFocusChange={reportConsoleFocus}
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
