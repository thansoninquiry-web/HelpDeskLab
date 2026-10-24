import {
  CONSOLE_DEFINITIONS,
  filterConsoleEntries,
  searchConsoleEntries,
  type ConsoleDefinition,
  type ConsoleEntry,
  type ConsoleEvidence,
  type ConsoleHistoryItem,
  type ConsoleId,
} from '../domain/environment/console'
import { CONSOLE_IDS, consoleEntries } from '../domain/environment/consoles'
import {
  buildDirectoryHistory,
  type DirectoryHistorySession,
} from '../domain/environment/directoryHistory'
import { ensureWorldState } from '../domain/environment/fixtures'
import {
  focusedRemoteSession,
  remoteDesktopView,
  type DesktopView,
} from '../domain/environment/remoteDesktop'
import { toolsByGroup, type ToolGroupId, type ToolId } from '../domain/environment/tools'
import { duePressureLine, type PressureStep } from '../domain/environment/pressure'
import { buildTopology, type TopologyCommand, type TopologyView } from '../domain/environment/topology'
import { applyCommand, type CommandOptions } from '../domain/environment/reducer'
import {
  foldWorld,
  worldsMatch,
  type ReplayStep,
} from '../domain/environment/replay'
import {
  accountChangingCommands,
  commandGroups,
  findCommand,
  isAccountChanging,
  type CommandGroupId,
} from '../domain/environment/commands'
import type {
  EffectType,
  VerificationMethod,
  VerificationRecipient,
  World,
} from '../domain/environment/types'
import {
  CALLER_RECIPIENT_ID,
  LETTER_PIN_ATTEMPTS,
  badgeIdFor,
  badgeMessage,
  callbackMessage,
  checkBadgeScan,
  checkCallback,
  checkInPerson,
  checkLetterPin,
  checkVerificationCode,
  contradictedClaims,
  emptyVerificationState,
  findRecipient,
  formatVerificationCode,
  inPersonMessage,
  issueVerificationCode,
  letterPinFor,
  letterPinMessage,
  letterPinState,
  nextVerificationCode,
  usableCallerVerificationMethods,
  verificationCodeRemainingMs,
  verificationMessage,
  verificationRecipients,
  type DirectoryEvidence,
  type IdentityContradiction,
} from '../domain/environment/verification'
import {
  CLOSURE_CODES,
  generateTicket,
  listVariants,
  publicTicketJson,
  randomSeed,
  refusalClosureCodes,
} from '../domain/generator'
import { CURRICULUM } from '../domain/curriculum/modules'
import { lessonFor } from '../domain/curriculum/lessons'
import {
  CLOSURE_NOTE_LIMIT,
  EMPTY_CLOSURE_DRAFT,
  closureDraftJson,
  isEmptyClosureDraft,
  normalizeClosureDraft,
  type ClosureDraft,
} from '../domain/tickets/closureDraft'
import { pressureReport, type PressureReport } from '../domain/tickets/pressureReport'
import { toolUseReport, type ToolUseReport } from '../domain/tickets/toolUse'
import {
  consoleFocusJson,
  focusConsole,
  isEmptyConsoleFocusMap,
  normalizeConsoleFocus,
  type ConsoleFocus,
  type ConsoleFocusMap,
} from '../domain/environment/consoleFocus'
import {
  DEFAULT_WORKSPACE_LAYOUT,
  isEmptyWorkspaceLayout,
  normalizeWorkspaceLayout,
  workspaceLayoutJson,
  type WorkspaceLayout,
  type WorkspacePane,
} from '../domain/tickets/workspaceLayout'
import type {
  GeneratedTicket,
  PublicTicket,
  ReferenceNoteKind,
  ReferenceStep,
  Severity,
  TicketCategory,
} from '../domain/generator'
import {
  hintHabits,
  summarizeHintHabits,
  type HintHabitSummary,
  type StepHintHabit,
} from '../domain/progress/hints'
import { foldScenarioStats } from '../domain/progress/leitner'
import { summarizeHistory, type ProgressSummary, type RankProgress } from '../domain/progress/rank'
import { loadIntuneProgress } from './intuneProgress'
import {
  familyRewinds,
  summarizeRewinds,
  type FamilyRewinds,
  type RewindSummary,
} from '../domain/progress/rewinds'
import {
  summarizeVerificationChecks,
  type VerificationMethodRow,
  type VerificationSummary,
} from '../domain/progress/verification'
import type { RewindRecord, ScoreHistoryEntry, ScenarioStats } from '../domain/progress/types'
import type { TargetRecommendation } from '../domain/targets/types'
import {
  TOPOLOGY_BONUS_XP,
  commandCreditLedger,
  detectProcedureViolations,
  evaluateSession,
  itemCredit,
  itemPoints,
} from '../domain/scoring/evaluator'
import { securityReportGaps, securityReportShortfall } from '../domain/scoring/noteCoverage'
import {
  REFUSAL_REASONS,
  refusalReasonInfo,
  type RefusalReasonInfo,
} from '../domain/scoring/refusal'

/**
 * The categories in the learner's words. The debrief and the feedback lines both
 * read from here, so no part of the interface prints the key the scorer stores.
 */
export { CATEGORY_LABELS } from '../domain/scoring/evaluator'

/**
 * How much of a step an attempt earned, so the debrief can show a partly met
 * step as points rather than as a tick or a cross.
 */
export { itemCredit }

import {
  hintBudgetLeft,
  hintBudgetSpent,
  hintPricesDiffer,
  hintPricingJson,
  normalizeHintPricing,
  rungCost,
  totalHintCost,
  type HintPolicy,
  type HintPricing,
} from '../domain/scoring/policy'
import { loadExamMode, resolveHintPricing } from './settingsService'
import { hintLedger, reconstructHintRungs } from '../domain/scoring/hints'
import {
  isVoicemailArrival,
  voicemailSeed,
  type VoicemailArrival,
} from '../domain/tickets/voicemail'
import type { HintLadderItem, HintRepair, HintRung } from '../domain/scoring/hints'
import type {
  CategoryScore,
  EvaluationResult,
  ProcedureViolation,
  RefusalReason,
  Rubric,
  RubricCategory,
  RubricItemResult,
  SessionDecision,
  TopologyCoverage,
} from '../domain/scoring/types'
import type { JsonObject, JsonValue } from '../domain/shared/json'
import { ACTION_KINDS, type ActionKind, type Session, type SessionAction, type Ticket } from '../domain/tickets/types'
import type { TicketStatus } from '../domain/tickets/types'
import type { Persistence } from '../persistence/database'
import { createId } from './ids'
import { getLocalDatabase } from './persistenceService'
import { loadTargetRecommendations } from './targetsService'

export type { TargetRecommendation } from '../domain/targets/types'
export type {
  ConsoleAction,
  ConsoleActionArgument,
  ConsoleDefinition,
  ConsoleEntry,
  ConsoleIcon,
  ConsoleId,
} from '../domain/environment/console'
export type { DesktopPrinterView, DesktopView } from '../domain/environment/remoteDesktop'
export { DESKTOP_ACTIONS } from '../domain/environment/remoteDesktop'
export { CALLBACK_OVER_CODE_PENALTY, weakerVerificationCost } from '../domain/scoring/evaluator'
export type {
  Reachability,
  TopologyCheck,
  TopologyGroup,
  TopologyView,
} from '../domain/environment/topology'
export type { HintRung } from '../domain/scoring/hints'

const QUEUE_TARGET = 5
const QUEUE_SCAN = 60

/* ------------------------------------------------------------------ views */

/**
 * Where an attempt had got to when it was left, in enough detail for the queue
 * to say what resuming lands in rather than only which ticket it was.
 *
 * It is the attempt's own record, not a new one: the console in front is the
 * stored workspace layout, and the steps are what the log holds.
 */
export interface ResumePoint {
  /** The console in front, or null while the tools pane showed its picker. */
  tool: ConsoleId | null
  /** Which pane was in front when no console was: the terminal, or the picker. */
  pane: WorkspacePane
  /** Steps in the log — the work a resume puts back in the trail. */
  steps: number
}

export interface TicketView {
  id: string
  scenarioId: string
  variantId: string
  scenarioTitle: string
  variantLabel: string
  difficulty: 1 | 2 | 3
  severity: Severity
  category: TicketCategory
  status: TicketStatus
  subject: string
  body: string
  requester: PublicTicket['requester']
  device: PublicTicket['device']
  symptoms: string[]
  reportedAt: number
  /**
   * How the request arrived: a message on the desk's voicemail, or null when it
   * came in live. The body above is the recording's transcript either way, so
   * a voicemail ticket is the same words with a time and a callback line on it.
   */
  voicemail: VoicemailArrival | null
  /**
   * Where the open attempt on this ticket had got to, or null when there is no
   * attempt to resume. Only the one attempt the app holds open has one; every
   * other ticket in the queue is work nobody has picked up yet.
   */
  resume: ResumePoint | null
}

export type { VoicemailArrival } from '../domain/tickets/voicemail'

export interface ConsoleLine {
  text: string
  tone: 'default' | 'error' | 'success' | 'muted'
}

/**
 * Where a simulated command came from. Every command is logged the same way, so
 * without this the debrief could not tell a typed `get-dhcp-scope` from one
 * pressed in the Server Room.
 */
/**
 * Where a command was typed or pressed. `terminal` is the side terminal,
 * `remote-desktop-terminal` is the terminal inside a Remote Desktop session,
 * and a console id is one of that console's actions.
 */
export type CommandSource = 'terminal' | 'remote-desktop-terminal' | ConsoleId

/**
 * The workspace panels that produce a step which is not a command: the hint
 * control, the three places a note is written, and the identity panel (sending
 * a code, reading one back, ringing a contact, and refusing the request).
 */
export type PanelSource =
  | 'hints'
  | 'troubleshooting-notes'
  | 'customer-notes'
  | 'handoff-note'
  | 'verify-caller'

/**
 * Every surface a step can come from. A command comes from a terminal or a
 * console; a hint, a note, or an identity check comes from the panel that took
 * it. One vocabulary, so the workspace log and the debrief label steps the same
 * way and a new console cannot invent its own name for itself.
 */
export type StepSource = CommandSource | PanelSource

/** Which panel writes which kind of note. */
const NOTE_SOURCES: Record<NoteKind, PanelSource> = {
  troubleshooting: 'troubleshooting-notes',
  customer: 'customer-notes',
  resolution: 'handoff-note',
}

/**
 * One labelled step in the debrief's trail. Commands were the first family to
 * carry this; hints, notes and identity checks carry it now, so every step a
 * tool or a panel produced says which one it was. Questions, caller
 * interruptions and rewinds are deliberately absent: they are conversation and
 * history, not work a surface did.
 */
export type TrailEntry = { source: StepSource; atMs: number } & (
  /**
   * The rubric steps whose points this command earned. Empty means the command
   * was a dead end: the simulator answered it, but no step rested on it.
   */
  | {
      kind: 'command'
      command: string
      ok: boolean
      credit: string[]
      /**
       * The machine the command acted on: the shell it was typed in, or the
       * machine record a console action was run from. A command that acted on
       * no single machine, and a log written before this was recorded, read as
       * null.
       */
      machine: string | null
    }
  /** `label` is the step the hint unstuck, and `cost` what that rung was priced. */
  | { kind: 'hint'; label: string; cost: number }
  | { kind: 'note'; noteKind: NoteKind; text: string }
  /** A code out, a code checked, a call, or a refusal. */
  | { kind: 'identity'; label: string; summary: string; ok: boolean }
)

/**
 * One step of the attempt, as the log shows it. `seq` is the step's place in
 * that log, and it is what a rewind names: un-running from here means this step
 * and every step after it.
 */
export type WorkspaceEntry = { seq: number } & (
  | {
      kind: 'command'
      text: string
      atMs: number
      ok: boolean
      lines: ConsoleLine[]
      source: CommandSource
      /** The machine the command acted on, or null when it named none. */
      machine: string | null
    }
  | { kind: 'ask'; label: string; question: string; answer: string; atMs: number }
  /** A line the caller broke in with, rather than an answer to a question. */
  | { kind: 'interruption'; message: string; atMs: number }
  | { kind: 'verify'; summary: string; ok: boolean; atMs: number }
  | { kind: 'deny'; summary: string; label: string; atMs: number }
  | { kind: 'note'; noteKind: NoteKind; text: string; atMs: number }
  | { kind: 'hint'; itemId: string; text: string; atMs: number; cost: number }
  /** A code went out. Not a proof, but part of what happened on the call. */
  | { kind: 'code-sent'; recipientName: string; destination: string; atMs: number }
  /**
   * The cut a rewind left behind: how many steps went, and when. `canReapply` is
   * true while the cut is still the end of the log and the steps it took were
   * kept, which is what lets an accidental rewind be put back.
   */
  | { kind: 'rewind'; dropped: number; atMs: number; canReapply: boolean }
)

export interface HintView {
  /** The rubric item the hint belongs to, used to avoid repeating a hint. */
  id: string
  text: string
}

export interface WorkspaceView {
  sessionId: string
  ticket: TicketView
  entries: WorkspaceEntry[]
  simulatedClock: number
  minutesElapsed: number
  hasVerifiedCaller: boolean
  troubleshootingNotes: string[]
  customerNotes: string[]
  commandsRun: number
  /** Hints revealed so far, in the order they were revealed. */
  hints: HintView[]
  /** Points committed for hints so far, up to the cap. */
  hintPenalty: number
  /** The price this attempt pays per hint, the cap it is held to, and its budget. */
  hintPolicy: HintPolicy
  /**
   * Hints this attempt can still reveal: the rungs left on unmet steps, held
   * down by whatever is left of its budget.
   */
  hintsRemaining: number
  /** True when the attempt has revealed every hint its budget allows. */
  hintBudgetSpent: boolean
  /** Points deducted for process mistakes so far. */
  procedurePenalty: number
  /**
   * The process mistakes recorded so far, in the order they are priced. This is
   * the same read the debrief will make, so the workspace can show the cost
   * while the learner can still change what they do next.
   */
  procedureViolations: ProcedureViolation[]
  /** Identity gate: who a code can go to, and what is live right now. */
  verification: VerificationView
  /** A recorded refusal of the request, if the attempt has one. */
  denial: DenialView | null
  /**
   * The close being written: the chosen code and the handoff note. Saved with
   * the attempt, so a reload reopens the form where the learner left it.
   */
  closureDraft: ClosureDraft
  /**
   * Where the learner was working when the attempt was last open: the pane in
   * front, the console showing, and the tabs left open beside it. The workspace
   * starts on the terminal for a new attempt and returns to the tool a reopened
   * one was working in.
   */
  layout: WorkspaceLayout
  /**
   * Where the learner was inside each console the attempt was worked in — the
   * search typed there and the record left open, by console id. A reopened
   * ticket puts those back, so it lands on the machine rather than a bare list.
   */
  consoleFocus: ConsoleFocusMap
  /**
   * True on an exam attempt. Hints stay closed for as long as it is open, so
   * the workspace shows no way to reveal one and the debrief hands the ladders
   * over instead.
   */
  exam: boolean
  /**
   * Whether this attempt's steps can be un-run. An exam never can: the log is
   * the whole record of the sitting, and probing then un-running would undercut
   * it the same way a hint would.
   */
  canRewind: boolean
}

export type VerificationRecipientView = VerificationRecipient

export interface VerificationAttemptView {
  result: 'wrong-recipient' | 'not-the-caller' | 'unreachable' | 'expired' | 'retired' | 'mismatch'
  message: string
  atMs: number
}

/** The last badge, letter PIN or walk-up check, whatever it proved. */
export interface MethodAttemptView {
  method: VerificationMethod
  result: string
  message: string
  atMs: number
}

/** The printed PIN the caller can read from their onboarding letter. */
export interface LetterPinMethodView {
  available: boolean
  attemptsLeft: number
  locked: boolean
  /** The digits, when the caller holds the letter; null when they cannot. */
  readBack: string | null
}

export interface BadgeMethodView {
  available: boolean
  badgeId: string
}

export interface InPersonMethodView {
  available: boolean
}

export interface CallbackAttemptView {
  result: 'verified' | 'no-answer' | 'wrong-contact' | 'colleague-answered' | 'not-the-caller'
  message: string
  contactId: string
  contactName: string
  destination: string
  /** The colleague who picked up a shared line, when one answered. */
  answeredBy: string | null
  atMs: number
}

export interface VerificationView {
  callerId: string
  recipients: VerificationRecipientView[]
  /**
   * Claims the caller made that the evidence contradicts, once the gate has
   * looked. Empty until a code, a callback or a refusal puts evidence on the
   * record, so the panel cannot give an impostor away before the desk checks.
   */
  contradictions: IdentityContradiction[]
  active: {
    recipientId: string
    recipientName: string
    destination: string
    issuedAt: number
    expiresAt: number
    /**
     * Simulated milliseconds left before the code expires, from the same clock
     * the read-back check compares against. Zero means it is already expired, so
     * the panel can say so before the learner types six digits to find out.
     */
    remainingMs: number
    /**
     * True only when the live code is with the person on this call: it went to
     * the employee on the ticket and that employee is the caller.
     */
    forCaller: boolean
    /**
     * True when the person on the call is not the employee the ticket is about.
     * The code is still with that employee, so nothing can be read back.
     */
    callerImpersonating: boolean
    /**
     * False when the code went to a line that cannot reach the person, so there
     * is nobody who could read it back whatever the caller types.
     */
    recipientReachable: boolean
    /** What the caller reads out; null when the caller cannot read the code. */
    readBack: string | null
  } | null
  /** The last read-back that failed, kept so the reason survives a reload. */
  lastAttempt: VerificationAttemptView | null
  /** The last callback this attempt placed, whatever it proved. */
  callback: CallbackAttemptView | null
  /** The three proofs that need something the caller carries or does in person. */
  methods: {
    badge: BadgeMethodView
    letterPin: LetterPinMethodView
    inPerson: InPersonMethodView
  }
  /** The last badge, letter PIN or walk-up check, kept across a reload. */
  methodAttempt: MethodAttemptView | null
}

/**
 * The reasons the deny control offers, read from the domain's vocabulary so a
 * rubric that requires a particular reason and the control that records it can
 * never disagree about what those reasons are.
 */
export type DenialReason = RefusalReason

/**
 * One option in the deny control. The words come from the domain vocabulary, so
 * the reason a rubric requires is written exactly as the control offers it and
 * the debrief can quote both sides of a mismatched refusal.
 */
export type DenialReasonOption = RefusalReasonInfo

export interface DenialView {
  reason: DenialReason
  label: string
  summary: string
  atMs: number
  /**
   * The code this refusal closes under — the report to Security — or null when
   * this build offers no refusal code. The close form opens on it, so the refusal
   * is reported rather than handed on as a fix.
   */
  closingCode: string | null
  /**
   * The commands the refusal stops, named from the registry. The workspace says
   * which ones they are while the refusal stands, so the block is a rule the
   * desk can read rather than a wall it walks into.
   */
  blockedCommands: string[]
  /**
   * Account changes the attempt tried *after* the refusal, in the order it tried
   * them. The refusal stopped each one, but trying it at all is the attempt
   * arguing with its own decision, so the case file names it beside the refusal
   * rather than leaving it to the debrief to discover. Read from the log, so
   * un-running the denial takes the callout with it.
   */
  retried: RefusalRetry[]
}

/** One account-changing command tried after the refusal, and when. */
export interface RefusalRetry {
  seq: number
  command: string
  atMs: number
}

/**
 * A rubric step as the debrief shows it: the scored result, plus the hint rungs
 * this attempt revealed on that step. The rungs are rebuilt from the action log,
 * so an old debrief prices them the way the workspace did at the time.
 */
export interface DebriefItem extends RubricItemResult {
  hintsTaken: HintRung[]
}

export interface DebriefView {
  sessionId: string
  ticket: TicketView
  decision: SessionDecision
  total: number
  passed: boolean
  band: 'fail' | 'pass' | 'strong'
  xp: number
  criticalFailures: string[]
  feedback: string[]
  items: DebriefItem[]
  categoryScores: Record<RubricCategory, CategoryScore>
  reference: ReferenceStepView[]
  /** The hint price this attempt was scored under, whatever Settings says now. */
  hintPolicy: HintPolicy
  /**
   * What this ticket would be priced at today, present only when that price has
   * moved since the attempt started. The attempt keeps the price it paid: this
   * is the setting drifting, said beside the score rather than applied to it.
   * Null on an exam attempt, which was priced by the exam rather than by the
   * catalogue, so a changed setting says nothing about what it paid.
   */
  hintPriceNow: HintPolicy | null
  /**
   * Where that price came from — the default, a scenario family's own price, or
   * the exam rate — and the default it departed from. A score written before
   * this was recorded reads as the default, which is what it paid.
   */
  hintPricing: HintPricing
  endedAt: number
  hintsUsed: number
  /** Zero on attempts scored after hints became free; kept for old records. */
  hintPenalty: number
  /**
   * Rungs the score charged that the action log no longer accounts for — a log
   * pruned, restored without its rows, or lost after scoring. `hintsUsed` stays
   * the number that was charged; this is the part no step can show, so the two
   * places agree instead of one claiming hints the other has never heard of.
   */
  unaccountedHints: number
  /** What those rungs cost at this attempt's own price. */
  unaccountedHintCost: number
  /**
   * The repair the learner made for those rungs, or null when none was made.
   * It is kept beside the score rather than in it, and every reading of it is
   * labelled as reconstructed: the rungs have a price again, and still no step.
   */
  hintRepair: HintRepair | null
  violations: ProcedureViolation[]
  procedurePenalty: number
  /** Every step a tool or a panel produced, in order, labelled with its source. */
  trail: TrailEntry[]
  /**
   * The caller's claims that the directory or the identity gate contradicted.
   * Quoted with the evidence beside them, so the debrief explains what gave an
   * impersonator away rather than only that the request was refused.
   */
  identityFindings: IdentityContradiction[]
  /**
   * The refusal this attempt recorded, set beside the account changes it went on
   * to try. Empty on an attempt that never refused the caller, and on one that
   * refused and then left the account alone.
   */
  refusalFindings: RefusalFinding[]
  /**
   * How hard the caller pressed on this attempt: every break-in the log holds,
   * with the step it followed. Read from the log, so it agrees with the trail.
   */
  pressure: PressureReport
  /**
   * Which consoles the attempt opened, in what order, and which of them carried
   * the work — read from the log itself, so it agrees with the trail above it.
   */
  toolUse: ToolUseReport
  /** True when the attempt was sat as an exam, so its hints were withheld. */
  exam: boolean
  /** How many times the attempt was un-run before it was scored. */
  rewinds: number
  /** How many steps went in total, across those rewinds. */
  rewoundSteps: number
  /** Network tickets only: what the map proved before the ticket closed. */
  topology: TopologyCoverage | null
  /**
   * Network tickets only: the map as it stood at the close, so the debrief can
   * show which links were proved, which failed, and which were never tested —
   * the same picture the Server Room showed, with nothing lit after the fact.
   */
  topologyMap: TopologyView | null
}

export interface ReferenceStepView {
  label: string
  detail?: string
}

export interface ProgressRow {
  scenarioId: string
  scenarioTitle: string
  /** Where "practise this again" should go, when it is not the ticket queue. */
  href?: string
  attempts: number
  passes: number
  bestScore: number
  lastPlayedAt: number | null
  leitnerBox: number
  dueAt: number | null
}

export interface WeakTopic {
  scenarioId: string
  scenarioTitle: string
  attempts: number
  averageScore: number
  passRate: number
  weakestCategory: {
    category: RubricCategory
    label: string
    earned: number
    possible: number
    percent: number
  } | null
  recommendation: string
}

/** One family's rewinding, with the family's title, ready for the page. */
export type ProgressRewindRow = FamilyRewinds & { scenarioTitle: string }

export interface ProgressView {
  attempts: number
  passes: number
  bestScore: number
  averageBest: number
  totalXp: number
  rank: RankProgress
  streakDays: number
  rows: ProgressRow[]
  weakTopics: WeakTopic[]
  /**
   * Which rubric steps this learner buys hints for, and which they work out
   * alone, rebuilt from the scored rubrics and the action log.
   */
  hintHabits: StepHintHabit[]
  hintHabitSummary: HintHabitSummary
  /**
   * Where this learner un-runs, family by family, rebuilt from the cut markers
   * each attempt's log left behind.
   */
  familyRewinds: ProgressRewindRow[]
  rewindSummary: RewindSummary
  /**
   * Which proof this learner reaches for when a caller has to be identified,
   * and how often each one actually proved the person on the ticket.
   */
  verificationHabits: VerificationMethodRow[]
  verificationSummary: VerificationSummary
  /** Weighted by how often job listings ask for a family and how weak the scores are. */
  targetRecommendations: TargetRecommendation[]
}

export type { ProgressSummary }
export type { HintHabitBand, HintHabitSummary, StepHintHabit } from '../domain/progress/hints'
export type { FamilyRewinds, RewindBand, RewindSummary, UnrunStepCount } from '../domain/progress/rewinds'
export type { VerificationMethodRow, VerificationSummary } from '../domain/progress/verification'
export type { PressureBeat, PressureReport } from '../domain/tickets/pressureReport'
export type { ConsoleVisit, ToolUseReport } from '../domain/tickets/toolUse'

export type NoteKind = 'troubleshooting' | 'customer' | 'resolution'

export type CategoryScoreKeys = RubricCategory

export interface CallerPrompt {
  intent: string
  label: string
}

/* --------------------------------------------------------------- runtime */

interface ActiveAttempt {
  ticket: Ticket
  session: Session
  world: World
  generated: GeneratedTicket
  /** The hint price this attempt was started under, pinned for its lifetime. */
  hintPolicy: HintPolicy
  /** The same price with where it came from, so the debrief can name it. */
  hintPricing: HintPricing
  /** The close being written, kept in step with the session row as it changes. */
  closureDraft: ClosureDraft
  /** Where the learner was working, kept in step with the session row. */
  workspaceLayout: WorkspaceLayout
  /** What each console was showing, kept in step with the session row. */
  consoleFocus: ConsoleFocusMap
  /** True when this attempt is an exam: hints are withheld until it is scored. */
  exam: boolean
}

let activeAttempt: ActiveAttempt | null = null

function requireActive(): ActiveAttempt {
  if (!activeAttempt) {
    throw new Error('No attempt is open. Start a ticket from the queue first.')
  }
  return activeAttempt
}

function toJson(value: unknown): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject
}

function asWorld(value: JsonObject): World {
  return ensureWorldState(value as unknown as World)
}

function isRecord(value: unknown): value is Record<string, JsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: JsonValue | undefined, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function parsePublicTicket(content: JsonObject): PublicTicket {
  if (!isRecord(content) || typeof content.subject !== 'string') {
    throw new Error('Ticket content is missing or corrupt.')
  }
  return content as unknown as PublicTicket
}

function toTicketView(ticket: Ticket, resume: ResumePoint | null = null): TicketView {
  const content = parsePublicTicket(ticket.publicContent)
  return {
    id: ticket.id,
    scenarioId: ticket.scenarioId,
    variantId: ticket.variantId,
    scenarioTitle: content.scenarioTitle ?? ticket.scenarioId,
    variantLabel: content.variantLabel ?? ticket.variantId,
    difficulty: ticket.difficulty,
    severity: content.severity ?? 'medium',
    category: content.category ?? 'identity',
    status: ticket.status,
    subject: content.subject,
    body: content.body ?? '',
    requester: content.requester,
    device: content.device,
    symptoms: Array.isArray(content.reportedSymptoms) ? content.reportedSymptoms : [],
    reportedAt: content.createdAt ?? ticket.createdAt,
    voicemail: isVoicemailArrival(content.voicemail) ? content.voicemail : null,
    resume,
  }
}

function rebuildTicket(ticket: Ticket): GeneratedTicket {
  // The stored variant is part of the ticket: without it, a family that gains a
  // variant would replay old tickets into a scenario they were never scored on.
  // A variant retired since the ticket was made falls back to the seed's draw
  // rather than leaving an existing ticket impossible to open.
  const pinned = listVariants(ticket.scenarioId).some(
    (variant) => variant.id === ticket.variantId,
  )
  return generateTicket(ticket.seed, {
    familyId: ticket.scenarioId,
    variantId: pinned ? ticket.variantId : undefined,
  })
}

async function database(): Promise<Persistence> {
  return getLocalDatabase()
}

/* ------------------------------------------------------------------ queue */

export async function loadQueue(): Promise<TicketView[]> {
  const db = await database()
  let recent = await db.tickets.listRecent(QUEUE_SCAN)
  const open = recent.filter((ticket) => ticket.status !== 'completed')

  if (open.length < QUEUE_TARGET) {
    await createTickets(QUEUE_TARGET - open.length, recent)
    recent = await db.tickets.listRecent(QUEUE_SCAN)
  }

  // The queue says what resuming an open ticket lands in, so it reads the one
  // attempt the app holds open: the console in front is the layout a reopen
  // puts back, and the step count is the log it puts back with it. Read once
  // for the whole queue, because only one attempt can be open at a time.
  const active = await db.sessions.findActive()
  let resume: ResumePoint | null = null
  if (active !== null) {
    // The layout is read exactly as a reopen reads it, so the queue promises
    // the console the workspace would really come back in.
    const layout = normalizeWorkspaceLayout(active.workspaceLayout, CONSOLE_IDS)
    resume = {
      tool: (layout.tool as ConsoleId | null) ?? null,
      pane: layout.pane,
      steps: await db.actions.countBySession(active.id),
    }
  }

  return sortQueue(
    recent.map((ticket) =>
      toTicketView(ticket, resume !== null && active?.ticketId === ticket.id ? resume : null),
    ),
  )
}

const STATUS_ORDER: Record<TicketStatus, number> = {
  available: 0,
  in_progress: 1,
  completed: 2,
}

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

/** Open work first, then the most severe ticket, then the newest report. */
export function sortQueue<T extends Pick<TicketView, 'status' | 'severity' | 'reportedAt'>>(
  tickets: readonly T[],
): T[] {
  return [...tickets].sort((left, right) => {
    if (STATUS_ORDER[left.status] !== STATUS_ORDER[right.status]) {
      return STATUS_ORDER[left.status] - STATUS_ORDER[right.status]
    }
    if (SEVERITY_ORDER[left.severity] !== SEVERITY_ORDER[right.severity]) {
      return SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity]
    }
    return right.reportedAt - left.reportedAt
  })
}

export async function createTickets(
  count: number,
  existing?: readonly Ticket[],
  familyId?: string,
  variantId?: string,
  arrival?: 'voicemail',
): Promise<TicketView[]> {
  const db = await database()
  const known = existing ?? (await db.tickets.listRecent(QUEUE_SCAN))
  const avoidSignatures = known.map((ticket) => ticket.signature)
  const created: TicketView[] = []

  for (let index = 0; index < count; index += 1) {
    const drawn = randomSeed()
    // Whether a ticket arrives as a message is drawn from its seed, so asking
    // for a voicemail means drawing a seed that has one. The seed is what the
    // queue stores, so the ticket rebuilds as the same message later.
    const seed = arrival === 'voicemail' ? voicemailSeed(drawn) : drawn
    const generated = generateTicket(seed, {
      avoidSignatures,
      ...(familyId ? { familyId } : {}),
      ...(variantId ? { variantId } : {}),
    })
    avoidSignatures.push(generated.signature)

    const ticket: Ticket = {
      id: createId(),
      scenarioId: generated.scenarioId,
      variantId: generated.variantId,
      difficulty: generated.difficulty,
      seed: generated.seed,
      signature: generated.signature,
      publicContent: publicTicketJson(generated.public),
      createdAt: Date.now(),
      status: 'available',
    }

    await db.tickets.create(ticket)
    created.push(toTicketView(ticket))
  }

  return created
}

/**
 * The per-module Practice entry point: open a ticket the module's lesson sends
 * the learner to first, with the variant pinned where a random draw could miss
 * the requirement. An available ticket already in the queue is reused so the
 * entry point does not leave duplicates behind; only when none matches is one
 * generated. The module's own lesson says which family that is, so the
 * dashboard and the lesson page cannot disagree.
 */
export async function startModulePractice(moduleId: string): Promise<WorkspaceView> {
  const module = CURRICULUM.find((candidate) => candidate.id === moduleId)
  if (!module || module.status !== 'playable') {
    throw new Error('That module is not available to practise.')
  }

  const practice = lessonFor(moduleId)?.practice
  if (!practice || practice.kind !== 'tickets') {
    throw new Error('That module is practised from the Job targets page, not a ticket.')
  }

  const familyId = practice.families[0]
  if (!familyId) {
    throw new Error('That module has no ticket family to practise.')
  }
  // A module about voicemails opens on one: reusing a live ticket from the
  // queue would send the learner to a ticket the module is not about.
  const wantsVoicemail = practice.arrival === 'voicemail'

  const db = await database()
  const recent = await db.tickets.listRecent(QUEUE_SCAN)
  const matching = recent.find(
    (ticket) =>
      ticket.status === 'available' &&
      ticket.scenarioId === familyId &&
      (practice.variantId === undefined || ticket.variantId === practice.variantId) &&
      (!wantsVoicemail || isVoicemailArrival(ticket.publicContent.voicemail)),
  )
  if (matching) {
    return startAttempt(matching.id)
  }

  const [created] = await createTickets(
    1,
    recent,
    familyId,
    practice.variantId,
    practice.arrival,
  )
  if (!created) {
    throw new Error('A ticket for this module could not be generated.')
  }
  return startAttempt(created.id)
}

/* -------------------------------------------------------------- sessions */

export async function startAttempt(ticketId: string): Promise<WorkspaceView> {
  const db = await database()
  const ticket = await db.tickets.findById(ticketId)
  if (!ticket) {
    throw new Error('That ticket no longer exists.')
  }

  const running = await db.sessions.findActive()
  if (running) {
    if (running.ticketId === ticketId) {
      return openSession(running.id)
    }
    await db.sessions.finish(running.id, {
      endedAt: Date.now(),
      resolution: 'abandoned',
      outcome: 'abandoned',
    })
    // The ticket goes back on the queue instead of showing as in progress forever.
    await db.tickets.updateStatus(running.ticketId, 'available')
  }

  const generated = rebuildTicket(ticket)
  // An exam pins the standard price whatever the setting says, so the same
  // ticket costs the same for everyone who sits it. Otherwise the ticket plays
  // at its own family's price, falling back to the default. Either way the
  // attempt records where the price came from, for the debrief to explain.
  const exam = await loadExamMode()
  const hintPricing = await resolveHintPricing(ticket.scenarioId, exam)
  const hintPolicy = hintPricing.policy
  const session: Session = {
    id: createId(),
    ticketId: ticket.id,
    startedAt: Date.now(),
    endedAt: null,
    world: toJson(generated.world),
    hintPolicy: toJson(hintPricingJson(hintPricing)),
    closureDraft: null,
    // A new ticket starts on a clean terminal: only a layout the learner made is
    // ever written, so a new attempt stores none.
    workspaceLayout: null,
    // Nor any console focus: the searches a previous ticket ran were its work.
    consoleFocus: null,
    examMode: exam,
    resolution: null,
    outcome: null,
  }

  await db.sessions.create(session)
  await db.tickets.updateStatus(ticket.id, 'in_progress')
  activeAttempt = {
    ticket,
    session,
    world: generated.world,
    generated,
    hintPolicy,
    hintPricing,
    closureDraft: EMPTY_CLOSURE_DRAFT,
    // A new attempt opens on the terminal with no tools: the consoles a previous
    // ticket left open were that ticket's work, not this one's.
    workspaceLayout: DEFAULT_WORKSPACE_LAYOUT,
    consoleFocus: {},
    exam,
  }

  return getWorkspace()
}

export async function openSession(sessionId: string): Promise<WorkspaceView> {
  const db = await database()
  const session = await db.sessions.findById(sessionId)
  if (!session) {
    throw new Error('That session could not be found.')
  }
  if (session.endedAt !== null) {
    throw new Error('That session is already closed. Open its debrief instead.')
  }

  const ticket = await db.tickets.findById(session.ticketId)
  if (!ticket) {
    throw new Error('The ticket behind this session no longer exists.')
  }

  const generated = rebuildTicket(ticket)
  // A row from before the setting existed reads back as the standard price, and
  // one from before families were priced reads as the default even though the
  // learner may have set a family price since.
  const hintPricing = normalizeHintPricing(session.hintPolicy)
  activeAttempt = {
    ticket,
    session,
    world: asWorld(session.world),
    generated,
    hintPolicy: hintPricing.policy,
    hintPricing,
    // ...and one from before the draft existed reopens with nothing chosen.
    closureDraft: normalizeClosureDraft(
      session.closureDraft,
      CLOSURE_CODES.map((entry) => entry.code),
    ),
    // ...and one from before the layout existed reopens on the terminal, with a
    // console this build no longer offers dropped rather than restored.
    workspaceLayout: normalizeWorkspaceLayout(session.workspaceLayout, CONSOLE_IDS),
    // Somewhere inside each console is read the same way: a console this build
    // dropped loses its search rather than keeping the ticket from opening.
    consoleFocus: normalizeConsoleFocus(session.consoleFocus, CONSOLE_IDS),
    // The mode belongs to the attempt, so a reload keeps an exam an exam.
    exam: session.examMode,
  }

  return getWorkspace()
}

export async function findActiveSessionId(): Promise<string | null> {
  const db = await database()
  const session = await db.sessions.findActive()
  return session?.id ?? null
}

/** Drops the in-memory attempt after the database is replaced or reset. */
export function clearActiveAttempt(): void {
  activeAttempt = null
}

export async function abandonAttempt(): Promise<void> {
  const attempt = requireActive()
  const db = await database()

  await db.sessions.finish(attempt.session.id, {
    endedAt: Date.now(),
    resolution: 'abandoned',
    outcome: 'abandoned',
  })
  await db.tickets.updateStatus(attempt.ticket.id, 'available')
  activeAttempt = null
}

/* ------------------------------------------------------------- workspace */

export async function getWorkspace(): Promise<WorkspaceView> {
  const attempt = requireActive()
  const db = await database()
  const actions = await db.actions.listBySession(attempt.session.id)
  const entries: WorkspaceEntry[] = []
  const troubleshootingNotes: string[] = []
  const customerNotes: string[] = []
  const hints: HintView[] = []
  const hintedByItem = new Map<string, number>()
  let hintsSeen = 0
  let hasVerifiedCaller = false
  let denial: DenialView | null = null
  let failedVerification: (VerificationAttemptView & { codeIssue: number }) | null = null
  let lastCallback: CallbackAttemptView | null = null
  let commandsRun = 0
  // A caller line or a tool read is not work on the machine: it leaves nothing
  // in the world, so it must not lock a cut the learner has just made before
  // they can put it back.
  const lastWorkSeq = actions
    .filter((action) => !canFollowACut(action))
    .at(-1)?.seq

  for (const action of actions) {
    const input = action.input
    const output = action.output
    const seq = action.seq

    if (action.kind === 'command') {
      commandsRun += 1
      entries.push({
        seq,
        kind: 'command',
        text: readString(input.command),
        atMs: action.atMs,
        ok: output.ok === true,
        lines: readLines(output.lines),
        source: readCommandSource(input),
        machine: readMachine(input),
      })
      continue
    }

    if (action.kind === 'ask-user') {
      // The caller breaking in is not a question the desk asked, so it does not
      // render as a question with an answer under it.
      if (output.interruption === true) {
        entries.push({
          seq,
          kind: 'interruption',
          message: readString(output.answer),
          atMs: action.atMs,
        })
        continue
      }
      entries.push({
        seq,
        kind: 'ask',
        label: readString(input.label, 'Question'),
        question: readString(output.question),
        answer: readString(output.answer),
        atMs: action.atMs,
      })
      continue
    }

    if (action.kind === 'verify-caller') {
      const verified = output.verified !== false
      const method = asVerificationMethod(input.method)
      if (verified) {
        hasVerifiedCaller = true
      } else if (method === 'verification-code') {
        const result = readString(output.result, 'mismatch')
        failedVerification = {
          result:
            result === 'wrong-recipient' ||
            result === 'not-the-caller' ||
            result === 'unreachable' ||
            result === 'expired' ||
            result === 'retired'
              ? result
              : 'mismatch',
          message: readString(output.summary),
          atMs: action.atMs,
          codeIssue: typeof output.codeIssue === 'number' ? output.codeIssue : -1,
        }
      }
      // A callback carries its own record: which line was rung, and what came
      // back from it. It is not a read-back, so it does not touch lastAttempt.
      if (method === 'callback') {
        lastCallback = {
          result: asCallbackResult(readString(output.result, 'no-answer')),
          message: readString(output.summary, 'The call was placed.'),
          contactId: readString(input.contactId),
          contactName: readString(input.contactName, 'The contact'),
          destination: readString(input.destination, 'that line'),
          answeredBy: readString(output.answeredBy) || null,
          atMs: action.atMs,
        }
      }
      entries.push({
        seq,
        kind: 'verify',
        summary: readString(output.summary),
        ok: verified,
        atMs: action.atMs,
      })
      continue
    }

    if (action.kind === 'code-sent') {
      entries.push({
        seq,
        kind: 'code-sent',
        recipientName: readString(input.recipientName, 'the contact'),
        destination: readString(input.destination, 'that line'),
        atMs: action.atMs,
      })
      continue
    }

    if (action.kind === 'rewind') {
      entries.push({
        seq,
        kind: 'rewind',
        dropped: typeof input.dropped === 'number' ? input.dropped : 0,
        atMs: action.atMs,
        // Only the last cut can be put back: steps logged after it would have
        // to move, and their place in the log is what a rewind names.
        canReapply: action.seq === lastWorkSeq && storedRewindSteps(input) !== null,
      })
      continue
    }

    if (action.kind === 'deny-caller') {
      const reason = readString(input.reason)
      const label = readString(input.label, 'Request refused')
      const summary = readString(output.summary, 'Refused the request.')
      denial = {
        reason: asDenialReason(reason),
        label,
        summary,
        atMs: action.atMs,
        closingCode: refusalClosureCodes()[0]?.code ?? null,
        blockedCommands: accountChangingCommands(),
        // What the attempt went on to try, so the case file can call it out
        // beside the decision while the ticket is still open.
        retried: accountChangesAfterRefusal(actions).map((tried) => ({
          seq: tried.seq,
          command: readString(tried.input.command),
          atMs: tried.atMs,
        })),
      }
      entries.push({ seq, kind: 'deny', summary, label, atMs: action.atMs })
      continue
    }

    if (action.kind === 'hint') {
      const itemId = readString(input.itemId)
      const index = typeof input.hintIndex === 'number' ? input.hintIndex : 0
      const text = readString(input.hint)
      // One item can hand out several hints, so the id carries the rung.
      const entryId = `${itemId}#${index}`
      hints.push({ id: entryId, text })
      hintedByItem.set(itemId, Math.max(hintedByItem.get(itemId) ?? 0, index + 1))
      hintsSeen += 1
      // The rung that crosses the cap is priced up to it; later rungs are free.
      const cost = rungCost(attempt.hintPolicy, hintsSeen)

      entries.push({ seq, kind: 'hint', itemId: entryId, text, atMs: action.atMs, cost })
      continue
    }

    if (action.kind === 'note') {
      const noteKind = readString(input.noteKind) as NoteKind
      const text = readString(input.text)
      if (noteKind === 'troubleshooting') {
        troubleshootingNotes.push(text)
      } else if (noteKind === 'customer') {
        customerNotes.push(text)
      }
      entries.push({ seq, kind: 'note', noteKind, text, atMs: action.atMs })
    }
  }

  // Only hints on steps still unmet can be offered, so count those.
  const evaluated = evaluateSession({
    rubric: attempt.generated.rubric,
    actions,
    world: attempt.world,
    // The close code is unknown here, so no decision item counts as met yet.
    decision: { outcome: 'resolved', code: 'pending', note: '' },
    difficulty: attempt.ticket.difficulty,
    hints: attempt.hintPolicy,
  })
  const passedIds = new Set(
    evaluated.items.filter((item) => item.passed).map((item) => item.id),
  )
  const rungsLeft = attempt.generated.rubric.items.reduce((sum, item) => {
    if (passedIds.has(item.id)) {
      return sum
    }
    const shown = hintedByItem.get(item.id) ?? 0
    return sum + Math.max(0, item.hints.length - shown)
  }, 0)
  // A budget can run out before the ladders do, and then it is the budget that
  // decides how many hints are still on offer.
  const budgetLeft = hintBudgetLeft(attempt.hintPolicy, hints.length)
  const hintsRemaining = budgetLeft === null ? rungsLeft : Math.min(rungsLeft, budgetLeft)
  // Priced once, so showing it live and scoring it at the close agree.
  const procedureViolations = detectProcedureViolations(actions, {
    availableMethods: usableCallerVerificationMethods({
      mobileInService: attempt.world.mobileOutOfAction !== true,
      onSite: attempt.world.callerOnSite === true,
      letterPinOnFile: attempt.world.letterPinOnFile === true,
    }),
  })
  // The gate reports only what the log has established: a directory row the
  // learner read, or identity evidence a code or a call produced. Before either,
  // there is nothing to show and the panel keeps the caller's story alone.
  const contradictions = identityFindingsFor(
    attempt.generated.world,
    attempt.generated.public.requester.name,
    actions,
  )
  const methodAttempt = lastMethodAttempt(actions)

  return {
    sessionId: attempt.session.id,
    ticket: toTicketView(attempt.ticket),
    entries,
    simulatedClock: attempt.world.clock,
    minutesElapsed: Math.round((attempt.world.clock - attempt.generated.world.clock) / 60_000),
    hasVerifiedCaller,
    troubleshootingNotes,
    customerNotes,
    commandsRun,
    hints,
    hintPenalty: totalHintCost(attempt.hintPolicy, hints.length),
    hintsRemaining,
    hintBudgetSpent: hintBudgetSpent(attempt.hintPolicy, hints.length),
    hintPolicy: attempt.hintPolicy,
    procedureViolations,
    procedurePenalty: procedureViolations.reduce(
      (sum, violation) => sum + violation.points,
      0,
    ),
    verification: toVerificationView(
      attempt,
      failedVerification,
      lastCallback,
      methodAttempt,
      contradictions,
    ),
    denial,
    closureDraft: attempt.closureDraft,
    layout: attempt.workspaceLayout,
    consoleFocus: attempt.consoleFocus,
    exam: attempt.exam,
    canRewind: !attempt.exam,
  }
}

function verificationRecipientsFor(attempt: ActiveAttempt): VerificationRecipient[] {
  const requester = attempt.generated.public.requester
  const directoryUser = attempt.world.users.find(
    (candidate) => candidate.samAccountName === requester.samAccountName,
  )
  return verificationRecipients({
    name: requester.name,
    employeeId: requester.employeeId,
    managerName: directoryUser?.managerName ?? null,
    mobileInService: attempt.world.mobileOutOfAction !== true,
    onSite: attempt.world.callerOnSite === true,
    letterPinOnFile: attempt.world.letterPinOnFile === true,
    sharedLine: attempt.world.sharedCallbackLine,
  })
}

/**
 * The directory state the attempt's log actually established, by account. Only
 * a successful get-account read counts, and the first read is kept: that is the
 * state the caller's story is checked against, before any later change. An
 * account the learner never looked up yields no row, so it cannot contradict a
 * claim in the debrief.
 */
function directoryEvidenceFrom(
  actions: readonly SessionAction[],
): DirectoryEvidence[] {
  const rows = new Map<string, DirectoryEvidence>()
  for (const action of actions) {
    if (action.kind !== 'command' || action.output.ok !== true) {
      continue
    }
    const [name, sam] = readString(action.input.command).trim().split(/\s+/)
    if (!sam || (name !== 'get-account' && name !== 'get-aduser')) {
      continue
    }
    const key = sam.toLowerCase()
    if (rows.has(key)) {
      continue
    }
    const lines = readLines(action.output.lines).map((line) => line.text)
    const status = outputField(lines, 'status')
    if (status !== 'active' && status !== 'locked' && status !== 'disabled') {
      continue
    }
    rows.set(key, {
      samAccountName: sam,
      displayName: outputField(lines, 'displayName') ?? sam,
      status,
      passwordExpired: outputField(lines, 'passwordExpired') === 'True',
    })
  }
  return [...rows.values()]
}

/** One `field : value` line from a command's output, or null when absent. */
function outputField(lines: readonly string[], field: string): string | null {
  const pattern = new RegExp(`^\\s*${field}\\s*:\\s*(.+)$`, 'i')
  for (const line of lines) {
    const match = pattern.exec(line)
    if (match?.[1]) {
      return match[1].trim()
    }
  }
  return null
}

/**
 * The caller's claims checked against the evidence the attempt logged: the
 * directory rows it read and the identity gate actions it took. The log is the
 * record: un-running a code or a lookup drops the evidence with it.
 */
function identityFindingsFor(
  world: World,
  employeeName: string,
  actions: readonly SessionAction[],
): IdentityContradiction[] {
  const claims = world.callerClaims
  if (!claims || claims.length === 0) {
    return []
  }

  const codeSentToCaller = actions.some(
    (action) =>
      action.kind === 'code-sent' &&
      readString(action.input.recipientId) === CALLER_RECIPIENT_ID,
  )
  const readBackVerified = actions.some(
    (action) => action.kind === 'verify-caller' && action.output.verified === true,
  )
  const callbackDenied = actions.some(
    (action) =>
      action.kind === 'verify-caller' &&
      readString(action.input.method) === 'callback' &&
      readString(action.output.result) === 'not-the-caller',
  )
  // A callback a colleague answered: the one confirmation on the record came
  // from someone who is not the employee, so it cannot have established them.
  const colleagueCallback = actions.find(
    (action) =>
      action.kind === 'verify-caller' &&
      readString(action.input.method) === 'callback' &&
      readString(action.output.result) === 'colleague-answered',
  )
  const colleagueName = readString(colleagueCallback?.output.answeredBy)

  return contradictedClaims(claims, {
    directory: directoryEvidenceFrom(actions),
    employeeName,
    // A code with the employee on the ticket is evidence about the caller only
    // once they have been asked to read it back and it never comes.
    codeUnreadable:
      world.callerImpersonating === true && codeSentToCaller && !readBackVerified,
    callbackDenied,
    callbackWrongPerson: colleagueCallback
      ? {
          answeredBy: colleagueName || 'A colleague',
          line: readString(colleagueCallback.input.contactName, 'team line'),
        }
      : undefined,
  })
}

/**
 * The desk's own decision, set beside what it did next.
 *
 * A refusal is a decision, not an obstacle: the account work it refused does not
 * happen, so a command that tries it again is stopped and changes nothing. That
 * is why this is a finding and not a penalty — the attempt contradicted its own
 * close, and naming the contradiction is the whole of it.
 */
export interface RefusalFinding {
  id: string
  /** The refusal as the log recorded it, quoted back. */
  claim: string
  /** The changes tried after it, and what came of them. */
  evidence: string
}

/** The verb of a typed line, without a typed `.exe`. */
function commandVerb(line: string): string {
  return (line.trim().split(/\s+/)[0] ?? '').replace(/\.exe$/i, '')
}

/**
 * What the attempt did after it had refused the request.
 *
 * Every step after the denial folds into a world that already holds the refusal —
 * the only thing that can lift it is un-running the denial, and that takes the
 * steps after it out of the log with it — so an account-changing command sitting
 * behind a denial is one the desk tried knowing the answer. Read from the log, so
 * a rewind that drops the denial drops the finding with it.
 */
function accountChangesAfterRefusal(logged: readonly SessionAction[]): SessionAction[] {
  const denial = logged.find((action) => action.kind === 'deny-caller')
  if (!denial) {
    return []
  }

  return logged.filter(
    (action) =>
      action.kind === 'command' &&
      action.seq > denial.seq &&
      isAccountChanging(readString(action.input.command)),
  )
}

function refusalFindingsFor(logged: readonly SessionAction[]): RefusalFinding[] {
  const denial = logged.find((action) => action.kind === 'deny-caller')
  if (!denial) {
    return []
  }

  // The same selection the case file calls out while the ticket is open.
  const tried = accountChangesAfterRefusal(logged)
  // A refusal that was honoured has nothing to report: the debrief records what
  // the attempt did, not what it might have.
  if (tried.length === 0) {
    return []
  }

  const verbs = [...new Set(tried.map((action) => commandVerb(readString(action.input.command))))]
  const targets = [
    ...new Set(
      tried
        .map((action) => readString(action.input.command).trim().split(/\s+/)[1] ?? '')
        .filter((target) => target.length > 0),
    ),
  ]
  const attempted = `${verbs.join(', ')}${targets.length > 0 ? ` on ${targets.join(', ')}` : ''}`
  const triedStatement =
    tried.length === 1
      ? '1 command that changes an account came after it'
      : `${tried.length} commands that change an account came after it`
  const stopping = tried.length === 1 ? 'and the refusal stopped it' : 'and the refusal stopped every one'

  return [
    {
      id: 'change-after-refusal',
      claim: readString(denial.output.summary, 'Refused the request.'),
      evidence:
        `${triedStatement} — ${attempted} — ${stopping}, ` +
        'so nothing was changed on the caller’s word. The refusal is the decision, not a step to work around.',
    },
  ]
}

function verificationSeed(attempt: ActiveAttempt): string {
  return `${attempt.ticket.id}:${attempt.generated.seed}`
}

/** The methods whose attempts are shown beside their own row, not the code form. */
const CARRIED_METHODS: readonly VerificationMethod[] = ['badge-scan', 'letter-pin', 'in-person']

/**
 * The last badge, letter PIN or walk-up check in the log. These proofs have no
 * live code to expire, so their last answer is the one the panel shows.
 */
function lastMethodAttempt(actions: readonly SessionAction[]): MethodAttemptView | null {
  for (let index = actions.length - 1; index >= 0; index -= 1) {
    const action = actions[index]
    if (action?.kind !== 'verify-caller') {
      continue
    }
    const method = asVerificationMethod(action.input.method)
    if (!method || !CARRIED_METHODS.includes(method)) {
      continue
    }
    return {
      method,
      result: readString(action.output.result, 'mismatch'),
      message: readString(action.output.summary),
      atMs: action.atMs,
    }
  }
  return null
}

function toVerificationView(
  attempt: ActiveAttempt,
  failed: (VerificationAttemptView & { codeIssue: number }) | null,
  callback: CallbackAttemptView | null,
  methodAttempt: MethodAttemptView | null,
  contradictions: IdentityContradiction[],
): VerificationView {
  const state = attempt.world.verification ?? emptyVerificationState()
  const active = state.active
  const impersonating = attempt.world.callerImpersonating === true
  const recipients = verificationRecipientsFor(attempt)
  const callerRecipient = findRecipient(recipients, CALLER_RECIPIENT_ID)
  const caller = callerRecipient?.methods ?? []
  const onSite = attempt.world.callerOnSite === true
  const letterOnFile = attempt.world.letterPinOnFile === true
  const pinState = letterPinState(state)
  const activeRecipient = active ? findRecipient(recipients, active.recipientId) : null
  const reachable = activeRecipient === null || activeRecipient.reachable
  // An impersonated caller never holds the live code, and neither does anyone
  // else when the code went to a line that cannot reach the person.
  const forCaller =
    active !== null &&
    active.recipientId === CALLER_RECIPIENT_ID &&
    !impersonating &&
    reachable
  // A failure against a code that has since been replaced would only confuse.
  const currentFailure = failed && failed.codeIssue === state.issued ? failed : null

  return {
    callerId: CALLER_RECIPIENT_ID,
    recipients,
    contradictions,
    active: active
      ? {
          recipientId: active.recipientId,
          recipientName: active.recipientName,
          destination: active.destination,
          issuedAt: active.issuedAt,
          expiresAt: active.expiresAt,
          remainingMs: verificationCodeRemainingMs(active, attempt.world.clock),
          forCaller,
          callerImpersonating: impersonating,
          recipientReachable: reachable,
          readBack: forCaller ? formatVerificationCode(active.code) : null,
        }
      : null,
    lastAttempt: currentFailure
      ? {
          result: currentFailure.result,
          message: currentFailure.message,
          atMs: currentFailure.atMs,
        }
      : null,
    callback,
    methods: {
      badge: {
        available: onSite && caller.includes('badge-scan'),
        badgeId: badgeIdFor(attempt.generated.public.requester.employeeId),
      },
      letterPin: {
        available: letterOnFile && caller.includes('letter-pin'),
        attemptsLeft: Math.max(0, LETTER_PIN_ATTEMPTS - pinState.attempts),
        locked: pinState.locked,
        readBack:
          letterOnFile && caller.includes('letter-pin') && !impersonating
            ? formatVerificationCode(letterPinFor(verificationSeed(attempt)))
            : null,
      },
      inPerson: { available: onSite && caller.includes('in-person') },
    },
    methodAttempt,
  }
}

/** The caller's own words are recorded as call turns, the same as their answers. */
const CALLER_INTERRUPTION_INTENT = 'caller-interruption'

/**
 * Minutes since the desk last did anything on the call, in wall time.
 *
 * The caller's stall ladder used to be measured from the start of the attempt,
 * which charged a learner twice for the same silence: a pause early in the call
 * still counted after they had got going again, and a long first read made the
 * ladder jump several rungs the moment they paused. The clock now restarts on
 * every step the learner takes, and only runs while they are doing nothing.
 *
 * The caller's own lines are not steps the desk took — being spoken to is exactly
 * what the ladder is waiting out — so they are skipped. A row written before the
 * step kept its wall time has none to read, which falls back to the attempt's
 * start rather than pretending the action never happened.
 */
function minutesSinceLastAction(
  attempt: ActiveAttempt,
  actions: readonly SessionAction[],
): number {
  let lastActedAt = attempt.session.startedAt
  for (const action of actions) {
    if (isCallerInterruption(action) || action.wallMs === null) {
      continue
    }
    if (action.wallMs > lastActedAt) {
      lastActedAt = action.wallMs
    }
  }
  return Math.floor(Math.max(0, Date.now() - lastActedAt) / 60_000)
}

function effectTypesOf(value: JsonValue | undefined): EffectType[] {
  if (!Array.isArray(value)) {
    return []
  }
  const types: EffectType[] = []
  for (const entry of value) {
    if (typeof entry === 'object' && entry !== null && !Array.isArray(entry)) {
      const type = entry.type
      if (typeof type === 'string') {
        types.push(type as EffectType)
      }
    }
  }
  return types
}

/** The call so far, as the caller's script reads it. */
function pressureSteps(actions: readonly SessionAction[]): PressureStep[] {
  const steps: PressureStep[] = []
  for (const action of actions) {
    if (action.kind === 'command') {
      steps.push({
        kind: 'command',
        command: readString(action.input.command),
        effects: effectTypesOf(action.output.effects),
      })
      continue
    }
    if (action.kind === 'ask-user') {
      // The caller's own lines are not work the desk did.
      if (readString(action.input.intent) === CALLER_INTERRUPTION_INTENT) {
        continue
      }
      steps.push({ kind: 'ask' })
      continue
    }
    if (action.kind === 'verify-caller' && action.output.verified !== false) {
      steps.push({ kind: 'verified' })
      continue
    }
    if (action.kind === 'console-read') {
      const consoleId = readString(action.input.consoleId)
      if (consoleId.length > 0) {
        steps.push({
          kind: 'read',
          consoleId: consoleId as ConsoleId,
          entryId: readString(action.input.entryId) || null,
        })
      }
      continue
    }
    steps.push({ kind: 'other' })
  }
  return steps
}

/**
 * The caller speaks between the desk's actions. A line is appended as an
 * `ask-user` action - the kind an answered question already uses - so a call turn
 * is in the action log, reads back after a reload, and cannot be said twice. A
 * separate action kind would be a migration for the same facts.
 */
async function hearCaller(attempt: ActiveAttempt) {
  const script = attempt.generated.pressure
  if (!script) {
    return null
  }
  const db = await database()
  const actions = await db.actions.listBySession(attempt.session.id)
  const line = duePressureLine(script, {
    steps: pressureSteps(actions),
    minutesSinceLastAction: minutesSinceLastAction(attempt, actions),
    said: actions
      .filter(
        (action) =>
          action.kind === 'ask-user' &&
          readString(action.input.intent) === CALLER_INTERRUPTION_INTENT,
      )
      .map((action) => readString(action.input.lineId)),
    refused: attempt.world.refusal !== undefined,
  })
  if (!line) {
    return null
  }

  await db.actions.append({
    sessionId: attempt.session.id,
    atMs: attempt.world.clock,
    kind: 'ask-user',
    input: { intent: CALLER_INTERRUPTION_INTENT, lineId: line.id, trigger: line.trigger.kind },
    output: { question: '', answer: line.message, interruption: true },
  })

  return line
}

/**
 * Reads the attempt back for the interface. An action the desk takes is what
 * gives the caller their opening, so a line they have earned by then is recorded
 * before the view is built, and the panel shows it with everything else.
 */
async function workspaceAfter(attempt: ActiveAttempt): Promise<WorkspaceView> {
  await hearCaller(attempt)
  return getWorkspace()
}

/**
 * The caller speaks while the desk is doing nothing. Every other line arrives
 * attached to an action, so a learner who stops acting stops hearing from the
 * caller at all; this is the door the panel knocks on instead, on a timer. It
 * answers with the attempt only when the caller actually said something, so a
 * quiet tick changes nothing on screen.
 */
export async function callerInterjection(): Promise<WorkspaceView | null> {
  // A ticket with no script has nothing to say, so the tick costs it no reads.
  if (!activeAttempt || !activeAttempt.generated.pressure) {
    return null
  }
  const line = await hearCaller(activeAttempt)
  return line ? getWorkspace() : null
}

function readLines(value: JsonValue | undefined): ConsoleLine[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return []
    }
    const text = readString(entry.text)
    const tone = readString(entry.kind, 'default')
    const allowed = tone === 'error' || tone === 'success' || tone === 'muted' ? tone : 'default'
    return text ? [{ text, tone: allowed as ConsoleLine['tone'] }] : []
  })
}

export async function submitCommand(input: string): Promise<WorkspaceView> {
  return executeCommand(input, 'terminal')
}

/**
 * A command typed into the terminal app on a Remote Desktop session. It goes
 * through the same parser, reducer and action log as the side terminal, and it
 * runs on the machine that session is open on — not the ticket's host — so
 * `hostname`, `ipconfig`, and the rest describe the desktop in front of you.
 * The recorded source still differs, so the debrief can say where it happened.
 */
export async function submitDesktopTerminalCommand(input: string): Promise<WorkspaceView> {
  const attempt = requireActive()
  const session = focusedRemoteSession(attempt.world)
  if (!session) {
    throw new Error('No Remote Desktop session is open, so there is no machine to run on.')
  }
  return executeCommand(input, 'remote-desktop-terminal', { deviceId: session.machineId })
}

const COMMAND_SOURCES: readonly CommandSource[] = [
  'terminal',
  'remote-desktop-terminal',
  ...CONSOLE_IDS,
]

const PANEL_SOURCES: readonly PanelSource[] = [
  'hints',
  'troubleshooting-notes',
  'customer-notes',
  'handoff-note',
  'verify-caller',
]

/**
 * A stored action predating provenance, or one written by hand, reads as a
 * typed command rather than being dropped.
 */
function readCommandSource(input: JsonObject): CommandSource {
  const value = input.source
  return typeof value === 'string' && COMMAND_SOURCES.includes(value as CommandSource)
    ? (value as CommandSource)
    : 'terminal'
}

/**
 * The machine a stored command ran on. A log written before commands carried
 * this — and every console action, which queries a record rather than running
 * in a shell — reads as no machine named.
 */
function readMachine(input: JsonObject): string | null {
  const value = input.machine
  return typeof value === 'string' && value.length > 0 ? value : null
}

/**
 * The panel a stored step says it came from, or the one that could have taken it
 * if the action predates provenance. A hand-edited log therefore reads as the
 * panel that fits the step rather than as a source the interface does not know.
 */
function readPanelSource(input: JsonObject, fallback: PanelSource): PanelSource {
  const value = input.source
  return typeof value === 'string' && PANEL_SOURCES.includes(value as PanelSource)
    ? (value as PanelSource)
    : fallback
}

/**
 * The trail the debrief shows: the attempt's commands in the order they ran, and
 * the hints, notes and identity checks between them, each labelled with the tool
 * or the panel that produced it. Hint rungs are priced here rather than read off
 * the rows, so an old debrief re-prices exactly as it did when it was scored.
 */
function attemptTrail(
  actions: readonly SessionAction[],
  context: {
    rubric: Rubric
    policy: HintPolicy
    world: World
    decision: SessionDecision
  },
): TrailEntry[] {
  const { rubric, policy, world, decision } = context
  const trail: TrailEntry[] = []
  const itemLabels = new Map(rubric.items.map((item) => [item.id, item.label]))
  const credit = commandCreditLedger(actions, rubric, world, decision)
  let hintsSeen = 0

  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index]
    if (!action) {
      continue
    }
    const input = action.input
    switch (action.kind) {
      case 'command':
        trail.push({
          kind: 'command',
          command: readString(input.command),
          source: readCommandSource(input),
          machine: readMachine(input),
          ok: action.output.ok === true,
          credit: credit.get(index) ?? [],
          atMs: action.atMs,
        })
        break
      case 'hint':
        hintsSeen += 1
        trail.push({
          kind: 'hint',
          source: readPanelSource(input, 'hints'),
          label: itemLabels.get(readString(input.itemId)) ?? 'a step of this ticket',
          cost: rungCost(policy, hintsSeen),
          atMs: action.atMs,
        })
        break
      case 'note': {
        const noteKind = readString(input.noteKind) as NoteKind
        trail.push({
          kind: 'note',
          source: readPanelSource(input, NOTE_SOURCES[noteKind] ?? 'troubleshooting-notes'),
          noteKind,
          text: readString(input.text),
          atMs: action.atMs,
        })
        break
      }
      case 'code-sent':
        trail.push({
          kind: 'identity',
          source: readPanelSource(input, 'verify-caller'),
          label: 'Code sent',
          summary: `to ${readString(input.recipientName, 'the contact')} · ${readString(
            input.destination,
            'that line',
          )}`,
          ok: true,
          atMs: action.atMs,
        })
        break
      case 'verify-caller': {
        const method = asVerificationMethod(input.method)
        trail.push({
          kind: 'identity',
          source: readPanelSource(input, 'verify-caller'),
          label: method === 'callback' ? 'Callback' : 'Code check',
          summary: readString(action.output.summary, 'The check was made.'),
          ok: action.output.verified !== false,
          atMs: action.atMs,
        })
        break
      }
      case 'deny-caller':
        trail.push({
          kind: 'identity',
          source: readPanelSource(input, 'verify-caller'),
          label: 'Request refused',
          summary: readString(input.label, 'The request was refused.'),
          ok: true,
          atMs: action.atMs,
        })
        break
      default:
        // Questions, caller interruptions, and rewinds are not panel work.
        break
    }
  }

  return trail
}

/**
 * One path for every simulated command, whether it was typed in the terminal or
 * pressed in a console. The action log, the clock step, the effects, and the
 * rubric therefore cannot tell the two apart — only the recorded source does.
 */
async function executeCommand(
  input: string,
  source: CommandSource,
  options: CommandOptions = {},
): Promise<WorkspaceView> {
  const attempt = requireActive()
  const db = await database()
  const result = applyCommand(attempt.world, input, options)

  // Every command is filed under the machine it acted on. A command typed in a
  // shell ran on that machine: the desktop terminal names the machine its
  // session is open on, and the side terminal speaks for the machine the ticket
  // is about. A console action on a machine record names the machine it acted
  // on without changing the context it ran in, so the machine tag and the
  // execution context are separate things.
  const machineId =
    options.deviceId ??
    options.machineId ??
    (source === 'terminal' ? attempt.world.currentDeviceId : null)
  // Named from the world the command was handed, so the label is the machine it
  // was filed under rather than whatever the command may have done while it ran.
  const machine =
    machineId === null
      ? null
      : (attempt.world.devices.find((device) => device.id === machineId)?.hostname ?? null)

  attempt.world = result.world
  await db.actions.append({
    sessionId: attempt.session.id,
    atMs: result.world.clock,
    kind: 'command',
    input: machine === null ? { command: input, source } : { command: input, source, machine },
    output: toJson({ lines: result.lines, effects: result.effects, ok: result.ok }),
  })
  await db.sessions.saveWorld(attempt.session.id, toJson(attempt.world))

  return workspaceAfter(attempt)
}

/* --------------------------------------------------------------- consoles */

export interface ConsoleView {
  sessionId: string
  /** The machine the session is connected to. */
  hostname: string
  consoleId: ConsoleId
  definition: ConsoleDefinition
  entries: ConsoleEntry[]
  /**
   * A map of links this attempt has actually tested. Only the Server Room
   * supplies one today; a console without it renders its records directly.
   */
  topology: TopologyView | null
  /**
   * Remote Desktop while a session is open: the fake Windows shell reads this
   * projection. Null everywhere else, and when no session is active.
   */
  desktop?: DesktopView | null
}


export interface ToolView {
  id: ToolId
  label: string
  detail: string
}

export interface ToolGroupView {
  id: ToolGroupId
  label: string
  tools: ToolView[]
}

/**
 * The tool shelf the picker renders: every tool, grouped. The interface
 * enumerates nothing itself.
 */
/** One line of the reference: the command as it is typed, and what it does. */
export interface CommandCheatSheetEntry {
  usage: string
  summary: string
}

export interface CommandCheatSheetGroup {
  label: string
  /** True when this group holds tools the open ticket is worked with. */
  relevant: boolean
  entries: CommandCheatSheetEntry[]
}

/**
 * The groups a ticket is worked with, by scenario family. The cheat sheet opens
 * on these and folds the rest away, so a network ticket is not asked to read
 * past the mail tools to find `ipconfig`. This is a toolset, not the answer
 * path: a group is listed because the work for that family lives in it, never
 * because a particular check requires one command.
 */
const SCENARIO_COMMAND_GROUPS: Readonly<Record<string, readonly CommandGroupId[]>> = {
  'PWD-01': ['identity', 'm365'],
  'NET-01': ['network', 'workstation'],
  'DHCP-01': ['dhcp', 'network', 'workstation'],
  'M365-01': ['m365', 'identity'],
  'FS-01': ['shares', 'identity'],
  'PRN-01': ['printer', 'workstation'],
  'MAIL-01': ['mail'],
  'MAILSEC-01': ['mail'],
  'RDP-01': ['remote', 'network', 'workstation'],
  'DEP-01': ['deployment', 'shelf', 'shipping', 'workstation'],
}

/**
 * The cheat sheet is the terminal's own reference, not a second list: the groups,
 * the usages and the summaries come from the command registry, so a command
 * that is added, renamed, or retired changes both at once and the panel cannot
 * teach a spelling the terminal no longer accepts. With a ticket open, the
 * groups that ticket is worked with are marked so the panel can lead with them;
 * a family the map does not know keeps the whole reference open.
 */
export function commandCheatSheet(scenarioId?: string): CommandCheatSheetGroup[] {
  const relevant = scenarioId === undefined ? undefined : SCENARIO_COMMAND_GROUPS[scenarioId]
  const groups = commandGroups()

  if (relevant === undefined) {
    return groups.map((group) => toSheetGroup(group, true))
  }

  // The ticket's own tools come first, in the order the map lists them, so a
  // trace opens on Mail rather than on whatever sits alphabetically first.
  const rank = new Map(relevant.map((id, index) => [id, index]))
  const ordered = [...groups].sort((left, right) => {
    const leftRank = rank.get(left.id)
    const rightRank = rank.get(right.id)
    if (leftRank === undefined && rightRank === undefined) {
      return 0
    }
    if (leftRank === undefined) {
      return 1
    }
    if (rightRank === undefined) {
      return -1
    }
    return leftRank - rightRank
  })

  return ordered.map((group) => toSheetGroup(group, rank.has(group.id)))
}

function toSheetGroup(
  group: ReturnType<typeof commandGroups>[number],
  relevant: boolean,
): CommandCheatSheetGroup {
  return {
    label: group.label,
    relevant,
    entries: group.commands.map(({ usage, summary }) => ({ usage, summary })),
  }
}

export function toolCatalog(): ToolGroupView[] {
  return toolsByGroup().map((entry) => ({
    id: entry.group.id,
    label: entry.group.label,
    tools: entry.tools.map((tool) => ({
      id: tool.id,
      label: tool.label,
      detail: tool.detail,
    })),
  }))
}

/** Null when no ticket is open, so a console can render an empty state. */
/** Newest closed sessions a directory record draws its history from. */
const DIRECTORY_HISTORY_SESSIONS = 40
/** Newest logged actions read when pairing past commands with accounts. */
const DIRECTORY_HISTORY_ACTIONS = 500

/**
 * The desk's past with each account, read from closed sessions only: an open
 * attempt's own steps are still the workspace log, not history. A command
 * touches an account when the account is one of its arguments, and a ticket
 * touches it when it was raised for that account or named it in a step.
 */
async function loadDirectoryHistory(
  attempt: ActiveAttempt,
): Promise<Record<string, readonly ConsoleHistoryItem[]>> {
  const db = await database()
  const [sessions, tickets, actions] = await Promise.all([
    db.sessions.listRecent(DIRECTORY_HISTORY_SESSIONS),
    db.tickets.listRecent(DIRECTORY_HISTORY_SESSIONS),
    db.actions.listRecent(DIRECTORY_HISTORY_ACTIONS),
  ])

  const ticketsById = new Map(tickets.map((ticket) => [ticket.id, ticket]))
  const closed: DirectoryHistorySession[] = []
  for (const session of sessions) {
    if (session.endedAt === null || session.outcome === null) {
      continue
    }
    const ticket = ticketsById.get(session.ticketId)
    if (!ticket) {
      continue
    }
    let content: PublicTicket
    try {
      content = parsePublicTicket(ticket.publicContent)
    } catch {
      continue
    }
    closed.push({
      id: session.id,
      endedAt: session.endedAt,
      outcome: session.outcome,
      requester: content.requester.samAccountName,
      scenarioTitle: content.scenarioTitle ?? ticket.scenarioId,
      subject: content.subject,
    })
  }

  const closedIds = new Set(closed.map((session) => session.id))
  return buildDirectoryHistory({
    accounts: attempt.world.users.map((user) => user.samAccountName),
    sessions: closed,
    commands: actions.flatMap((action) =>
      action.kind === 'command' && closedIds.has(action.sessionId)
        ? [
            {
              sessionId: action.sessionId,
              atMs: action.atMs,
              command: readString(action.input.command),
            },
          ]
        : [],
    ),
  })
}

export async function loadConsole(consoleId: ConsoleId): Promise<ConsoleView | null> {
  if (!activeAttempt) {
    return null
  }

  const device = activeAttempt.world.devices.find(
    (candidate) => candidate.id === activeAttempt?.world.currentDeviceId,
  )
  const evidence = await loadConsoleEvidence(activeAttempt)
  const history = consoleId === 'directory' ? await loadDirectoryHistory(activeAttempt) : {}

  return {
    sessionId: activeAttempt.session.id,
    hostname: device?.hostname ?? 'unknown',
    consoleId,
    definition: CONSOLE_DEFINITIONS[consoleId],
    entries: consoleEntries(activeAttempt.world, consoleId, evidence, history),
    topology: consoleId === 'server-room' ? await loadTopology(activeAttempt) : null,
    desktop: consoleId === 'remote-desktop' ? remoteDesktopView(activeAttempt.world) : null,
  }
}

/**
 * What the attempt has already run, reduced to the commands and the lines they
 * printed. A console may offer values the log has named, and nothing else.
 */
async function loadConsoleEvidence(attempt: ActiveAttempt): Promise<ConsoleEvidence> {
  const db = await database()
  const actions = await db.actions.listBySession(attempt.session.id)
  return actions
    .filter((action) => action.kind === 'command')
    .map((action) => ({
      command: readString(action.input.command),
      lines: readLines(action.output.lines),
    }))
}

/**
 * The map is rebuilt from the recorded commands every time it is read, so a
 * check lights its link only after the log holds the result.
 */
async function loadTopology(attempt: ActiveAttempt): Promise<TopologyView> {
  const db = await database()
  const actions = await db.actions.listBySession(attempt.session.id)
  return buildTopology(attempt.world, topologyCommands(actions))
}

function topologyCommands(actions: readonly SessionAction[]): TopologyCommand[] {
  return actions
    .filter((action) => action.kind === 'command')
    .map((action) => ({
      command: readString(action.input.command),
      lines: readLines(action.output.lines),
      atMs: action.atMs,
    }))
}

export function searchConsole(
  entries: readonly ConsoleEntry[],
  query: string,
  filterId: string | null = null,
): ConsoleEntry[] {
  return filterConsoleEntries(searchConsoleEntries(entries, query), filterId)
}

/**
 * Runs a console action through the same command pipeline as the terminal. The
 * action is re-derived from the world by id, so the only thing the interface
 * gets to choose is which listed entry and action to press — and, for an action
 * that needs one, the value the learner typed into it.
 */
export async function runConsoleAction(
  consoleId: ConsoleId,
  entryId: string,
  actionId: string,
  inputs?: readonly string[],
): Promise<WorkspaceView> {
  const attempt = requireActive()
  const entry = consoleEntries(attempt.world, consoleId).find(
    (candidate) => candidate.id === entryId,
  )
  const action = entry?.actions.find((candidate) => candidate.id === actionId)
  if (!action) {
    throw new Error('That console action is not available.')
  }

  const declared = action.args ?? []
  const values = declared.map((_argument, index) => (inputs?.[index] ?? '').trim())
  declared.forEach((argument, index) => {
    if (!argument.validate(values[index] ?? '')) {
      throw new Error(`${argument.label} must be ${argument.hint}.`)
    }
  })

  // A machine console's rows are machines, so an action run from one acted on
  // that machine. The command still runs in the desk's own context: a connect
  // from the machine's row is not the same as being already at that machine.
  const machine = CONSOLE_DEFINITIONS[consoleId].machineScoped
    ? attempt.world.devices.find((device) => device.hostname === entryId)
    : undefined

  return executeCommand(
    action.command(entryId, values),
    consoleId,
    machine ? { machineId: machine.id } : {},
  )
}

/**
 * Records that the desk opened a tool or read a record in it, and lets the caller
 * answer straight away.
 *
 * A console is opened and a record is read without running anything, so nothing
 * else in the log would say the desk looked. The caller's script can hear it — a
 * line can be written against the directory being opened or a mailbox being read
 * — and the stall clock restarts on the row like any other step the learner
 * took. The read changes no machine, so the view only comes back when the caller
 * actually said something; otherwise the interface has nothing to redraw.
 */
export async function recordConsoleRead(
  consoleId: ConsoleId,
  entryId: string | null,
): Promise<WorkspaceView | null> {
  const attempt = requireActive()
  const db = await database()
  await db.actions.append({
    sessionId: attempt.session.id,
    atMs: attempt.world.clock,
    kind: 'console-read',
    input: entryId === null ? { consoleId } : { consoleId, entryId },
    output: { read: true },
  })
  const line = await hearCaller(attempt)
  return line ? getWorkspace() : null
}

const CALLER_PROMPTS: readonly CallerPrompt[] = [
  { intent: 'what-error', label: 'What does the message say?' },
  { intent: 'when-start', label: 'When did this start?' },
  { intent: 'what-changed', label: 'What changed since it last worked?' },
  { intent: 'other-users', label: 'Is anyone else affected?' },
  { intent: 'already-tried', label: 'What have you already tried?' },
]

export function callerPrompts(): readonly CallerPrompt[] {
  return CALLER_PROMPTS
}

type CallerIntent = (typeof CALLER_PROMPTS)[number]['intent']

/** Variant-specific replies override the category defaults below. */
const VARIANT_ANSWERS: Record<string, Partial<Record<CallerIntent, string>>> = {
  'account-lockout': {
    'what-error': 'It says my account has been locked out and to contact an administrator.',
  },
  'expired-password': {
    'what-error': 'It says my password has expired and the change password option just fails.',
  },
  'disabled-account': {
    'what-error': 'It says my account is disabled and I should contact my administrator.',
  },
  'pressured-lockout': {
    'what-error':
      'It says my account is locked. I am not sitting through the questions - unlock it and send me a new password in the next five minutes.',
    'when-start':
      'Does it matter? It is locked now and my client call is in ten minutes. Just unlock it.',
    'what-changed':
      'Nothing changed. Can we skip to the part where you unlock it and send me a new password?',
    'other-users': 'I have no idea, ask them later. My account, right now, please.',
    'already-tried':
      'I tried signing in twice and gave up. I have answered enough - unlock the account and reset the password.',
  },
  'third-party-reset': {
    'what-error':
      'It is not an error on my machine. My manager is locked out on the road and asked me to get the reset done for them.',
    'when-start': 'They called me about an hour ago. They cannot get in from the hotel.',
    'what-changed': 'Nothing on my side. I am just passing the message on for them.',
    'other-users': 'No, it is only their account. Mine works fine.',
    'already-tried': 'They tried signing in a few times from the airport and gave up.',
  },
  'impersonated-caller': {
    'what-error':
      'It says my account is locked out. Just unlock it and reset the password for me and I will be out of your way.',
    'when-start':
      'About an hour ago. I am at a hotel this week, so I cannot bring the laptop to anyone.',
    'what-changed': 'Nothing. It worked yesterday. Can we skip to the unlock?',
    'other-users': 'I have no idea. It is only my account as far as I know.',
    'already-tried':
      'I never got a text from you. Just read the code out to me and I will type it in for you.',
  },
  'chat-relay-reset': {
    'what-error':
      'It is not my account. The account owner messaged me in chat, said they are locked out, and asked me to get the reset sorted for them.',
    'when-start': 'They messaged me about twenty minutes ago, before the close.',
    'what-changed': 'Nothing on my side. I am just the one passing the request on.',
    'other-users': 'Just their account as far as I know. Mine is working fine.',
    'already-tried':
      'They said they tried signing in a couple of times. Send the code to me and I will read it back for you.',
  },
  'bad-static-dns': {
    'what-error': 'The browser says the site cannot be reached. Some apps still work though.',
    'when-start': 'Since I restarted my laptop about an hour ago.',
    'what-changed':
      'Nothing I did on purpose. Someone from IT set a fixed address on it last week.',
  },
  'stale-dhcp-lease': {
    'what-error': 'It says no internet. There is a warning triangle on the network icon.',
    'when-start': 'This morning, after the laptop sat in my bag all weekend.',
  },
  'scope-wrong-dns': {
    'what-error': 'It says the site cannot be reached. Some apps still work though.',
    'when-start': 'Since first thing this morning, and it is not just me.',
    'what-changed':
      'Nothing on my side. The laptop picks up its settings automatically when it starts.',
    'other-users':
      'Two people near me have the same problem, so it is not just my machine.',
  },
  'scope-exhausted': {
    'what-error': 'It says no internet, with a warning on the network icon.',
    'when-start': 'When I picked up the spare laptop this morning.',
    'what-changed': 'Nothing. This laptop was in the pool over the weekend.',
    'other-users': 'The loaner next to mine could not connect either.',
  },
  'mfa-method-lost': {
    'what-error':
      'It asks me to approve on my phone, but that phone is gone. Then it says no method is available.',
    'when-start': 'Since I swapped phones on Saturday.',
    'what-changed': 'I replaced my handset. Nothing else changed.',
    'other-users': 'No, everyone else is signing in fine.',
  },
  'smart-lockout': {
    'what-error':
      'It says my account has been locked to protect me. It never showed an error about the password.',
    'when-start': 'Last night, after I used the hotel Wi-Fi.',
    'what-changed': 'I am travelling this week; that is the only difference.',
    'other-users': 'No, my colleague on the same trip is fine.',
  },
  'missing-group-membership': {
    'what-error': 'It lets me open the folder but every file is read-only when I try to save.',
    'when-start': 'Since this morning. I could save last week.',
    'what-changed': 'I moved teams last month, but nothing changed this week.',
    'other-users': 'My colleague in the same team can still edit the files.',
  },
  'explicit-deny': {
    'what-error': 'It says access is denied and will not open the folder at all.',
    'when-start': 'Since yesterday. It worked last month.',
    'what-changed': 'Nothing on my side. My manager says I am still in the team.',
    'other-users': 'My colleagues can still open it.',
  },
  'spooler-stopped': {
    'what-error': 'Nothing happens at all. The job disappears from the list after a while.',
    'what-changed': 'Nothing. I have not installed anything or changed settings.',
  },
  'angry-caller': {
    'what-error':
      'It just sits there at zero and then vanishes. No error, no paper — and the van is waiting.',
    'when-start': 'This morning. I called about it hours ago and nothing has changed.',
    'what-changed': 'Nothing changed. Do not ask me that again — just get the printer fixed.',
    'other-users': 'I do not care who else can print. Mine cannot, and the run is late.',
    'already-tried': 'I turned it off and on twice. I am not doing it a third time.',
  },
  'job-stuck-offline': {
    'what-error':
      'It says the printer is offline and one job has been stuck at printing since the morning.',
    'what-changed': 'I cancelled a big invoice job this morning and it never disappeared.',
  },
}

function callerAnswer(intent: string, ticket: TicketView): { question: string; answer: string } | null {
  const prompt = CALLER_PROMPTS.find((entry) => entry.intent === intent)
  if (!prompt) {
    return null
  }

  const answers: Record<string, string> = {
    'what-error': 'It is not showing a clear message, sorry.',
    'when-start': 'This morning. It was all fine yesterday.',
    'what-changed': 'Nothing that I know of. I have not changed anything.',
    'other-users':
      ticket.category === 'printer'
        ? 'My colleague cannot print to that printer either, so it is not just my laptop.'
        : ticket.category === 'network'
          ? 'No, the person next to me is working fine.'
          : 'No, it is only me. Everyone else seems to be working.',
    'already-tried':
      ticket.category === 'printer'
        ? 'I turned the printer off and on again and resent the job.'
        : ticket.category === 'network'
          ? 'I restarted the laptop once and unplugged the network cable.'
          : 'I tried signing in a few times and restarted the laptop.',
  }

  const variantAnswer = VARIANT_ANSWERS[ticket.variantId]?.[intent as CallerIntent]

  return {
    question: prompt.label,
    answer: variantAnswer ?? answers[intent] ?? 'I am not sure, sorry.',
  }
}

export async function askCaller(intent: string): Promise<WorkspaceView> {
  const attempt = requireActive()
  const db = await database()
  const view = toTicketView(attempt.ticket)
  const reply = callerAnswer(intent, view)
  if (!reply) {
    throw new Error(`Unknown question: ${intent}`)
  }

  await db.actions.append({
    sessionId: attempt.session.id,
    atMs: attempt.world.clock,
    kind: 'ask-user',
    input: { intent, label: reply.question },
    output: { question: reply.question, answer: reply.answer },
  })

  return workspaceAfter(attempt)
}

/**
 * Sends the one live verification code to a contact on the ticket. A second
 * send retires the first, so only the newest code can ever be read back.
 */
export async function sendVerificationCode(recipientId: string): Promise<WorkspaceView> {
  const attempt = requireActive()
  const db = await database()
  const recipient = verificationRecipientsFor(attempt).find(
    (candidate) => candidate.id === recipientId,
  )
  if (!recipient) {
    throw new Error('That contact is not on this ticket.')
  }
  if (!recipient.methods.includes('verification-code')) {
    throw new Error(`A code cannot be sent to ${recipient.destination}. Ring it back instead.`)
  }

  const state = attempt.world.verification ?? emptyVerificationState()
  const code = nextVerificationCode(`${attempt.ticket.id}:${attempt.generated.seed}`, state.issued)
  attempt.world = {
    ...attempt.world,
    verification: issueVerificationCode(state, {
      code,
      recipient,
      now: attempt.world.clock,
    }),
  }

  // A send changes the world without proving anything, so it is logged as
  // itself. The rewind depends on this: it is the one change to the attempt that
  // no command accounts for, and an unrecorded one would survive a rewind that
  // dropped the step it happened on.
  await db.actions.append({
    sessionId: attempt.session.id,
    atMs: attempt.world.clock,
    kind: 'code-sent',
    input: {
      method: 'verification-code',
      source: 'verify-caller',
      recipientId: recipient.id,
      recipientName: recipient.name,
      destination: recipient.destination,
    },
    output: { sent: true, expiresAt: attempt.world.verification?.active?.expiresAt ?? null },
  })

  await db.sessions.saveWorld(attempt.session.id, toJson(attempt.world))
  return workspaceAfter(attempt)
}

/**
 * Checks the digits the caller read out. A failure is recorded as a
 * `verify-caller` action with `verified: false`, so the action log keeps the
 * attempt visible without ever satisfying the safety rubric item.
 */
export async function verifyCallerWithCode(input: string): Promise<WorkspaceView> {
  const attempt = requireActive()
  const db = await database()
  const state = attempt.world.verification ?? emptyVerificationState()
  const recipients = verificationRecipientsFor(attempt)
  const active = state.active ? findRecipient(recipients, state.active.recipientId) : null
  const check = checkVerificationCode(state, input, {
    now: attempt.world.clock,
    callerId: CALLER_RECIPIENT_ID,
    callerImpersonating: attempt.world.callerImpersonating === true,
    recipientReachable: active?.reachable ?? true,
  })

  if (check.result === 'no-active-code') {
    throw new Error(verificationMessage(check))
  }

  await db.actions.append({
    sessionId: attempt.session.id,
    atMs: attempt.world.clock,
    kind: 'verify-caller',
    input: { method: 'verification-code', source: 'verify-caller' },
    output: {
      summary: verificationMessage(check),
      verified: check.result === 'verified',
      result: check.result,
      codeIssue: state.issued,
    },
  })

  return workspaceAfter(attempt)
}

/**
 * The second proof: the desk rings the person back on a line on file. It is
 * recorded as its own `verify-caller` action with the contact that was rung, so
 * the evidence requirement is the call itself: a code read back, or a call to a
 * line that reaches nobody, cannot stand in for it.
 */
export async function placeCallback(contactId: string): Promise<WorkspaceView> {
  const attempt = requireActive()
  const db = await database()
  const contact = verificationRecipientsFor(attempt).find(
    (candidate) => candidate.id === contactId,
  )
  if (!contact) {
    throw new Error('That contact is not on this ticket.')
  }

  const check = checkCallback(contact, {
    callerImpersonating: attempt.world.callerImpersonating === true,
  })

  // A colleague answering a shared line is a failed check, not a weaker one:
  // the call reached somebody who is not the employee, so the gate stays shut
  // and the record names the person who did answer. `provesCaller` says the
  // same thing for anything that reads the log later.
  const answeredBy = check.result === 'colleague-answered' ? check.answeredBy : null

  await db.actions.append({
    sessionId: attempt.session.id,
    atMs: attempt.world.clock,
    kind: 'verify-caller',
    input: {
      method: 'callback',
      source: 'verify-caller',
      contactId: contact.id,
      contactName: contact.name,
      destination: contact.destination,
    },
    output: {
      summary: callbackMessage(check, contact.destination),
      verified: check.result === 'verified',
      provesCaller: check.result === 'verified',
      result: check.result,
      ...(answeredBy ? { answeredBy } : {}),
    },
  })

  return workspaceAfter(attempt)
}

/**
 * Scans the badge at the desk. The badge proves the person physically present
 * and only for the caller the ticket is about; a caller who is not at the desk
 * has nothing to scan, and someone using the employee's name without their card
 * cannot produce it.
 */
export async function scanBadge(): Promise<WorkspaceView> {
  const attempt = requireActive()
  const db = await database()
  const caller = verificationRecipientsFor(attempt).find(
    (candidate) => candidate.id === CALLER_RECIPIENT_ID,
  )
  if (!caller) {
    throw new Error('The caller is not on this ticket.')
  }

  const badgeId = badgeIdFor(attempt.generated.public.requester.employeeId)
  const check = checkBadgeScan(caller, {
    onSite: attempt.world.callerOnSite === true,
    callerImpersonating: attempt.world.callerImpersonating === true,
  })

  await db.actions.append({
    sessionId: attempt.session.id,
    atMs: attempt.world.clock,
    kind: 'verify-caller',
    input: { method: 'badge-scan', source: 'verify-caller', badgeId },
    output: {
      summary: badgeMessage(check, badgeId),
      verified: check.result === 'verified',
      result: check.result,
    },
  })

  return workspaceAfter(attempt)
}

/**
 * Checks the printed PIN from the onboarding letter. A wrong entry is counted
 * against the attempt and locked after three, so the letter is not a secret to
 * guess at. The PIN is derived from the ticket, so a reload agrees with it.
 */
export async function verifyCallerWithLetterPin(input: string): Promise<WorkspaceView> {
  const attempt = requireActive()
  const db = await database()
  const caller = verificationRecipientsFor(attempt).find(
    (candidate) => candidate.id === CALLER_RECIPIENT_ID,
  )
  if (!caller) {
    throw new Error('The caller is not on this ticket.')
  }

  const state = attempt.world.verification ?? emptyVerificationState()
  const pinState = letterPinState(state)
  const check = checkLetterPin(caller, input, {
    expectedPin: letterPinFor(verificationSeed(attempt)),
    state: pinState,
    callerImpersonating: attempt.world.callerImpersonating === true,
  })

  if (check.result === 'locked' || check.result === 'no-letter') {
    throw new Error(letterPinMessage(check))
  }

  const wrongEntry = check.result === 'mismatch'
  const nextPinState = {
    attempts: pinState.attempts + (wrongEntry ? 1 : 0),
    locked: wrongEntry && check.attemptsLeft === 0,
  }
  if (wrongEntry) {
    attempt.world = {
      ...attempt.world,
      verification: { ...state, letterPin: nextPinState },
    }
    await db.sessions.saveWorld(attempt.session.id, toJson(attempt.world))
  }

  await db.actions.append({
    sessionId: attempt.session.id,
    atMs: attempt.world.clock,
    kind: 'verify-caller',
    input: { method: 'letter-pin', source: 'verify-caller', attempts: nextPinState.attempts },
    output: {
      summary: letterPinMessage(check),
      verified: check.result === 'verified',
      result: check.result,
      attemptsLeft:
        check.result === 'mismatch' ? check.attemptsLeft : Math.max(0, LETTER_PIN_ATTEMPTS - nextPinState.attempts),
    },
  })

  return workspaceAfter(attempt)
}

/**
 * Records a walk-up at the service desk, where the evidence is the photo ID the
 * desk checks against the directory. It needs the person in front of the desk,
 * so it cannot stand in for a caller who is somewhere else.
 */
export async function recordInPersonVisit(): Promise<WorkspaceView> {
  const attempt = requireActive()
  const db = await database()
  const caller = verificationRecipientsFor(attempt).find(
    (candidate) => candidate.id === CALLER_RECIPIENT_ID,
  )
  if (!caller) {
    throw new Error('The caller is not on this ticket.')
  }

  const check = checkInPerson(caller, {
    onSite: attempt.world.callerOnSite === true,
    callerImpersonating: attempt.world.callerImpersonating === true,
  })

  await db.actions.append({
    sessionId: attempt.session.id,
    atMs: attempt.world.clock,
    kind: 'verify-caller',
    input: { method: 'in-person', source: 'verify-caller', photoId: true },
    output: {
      summary: inPersonMessage(check),
      verified: check.result === 'verified',
      result: check.result,
    },
  })

  return workspaceAfter(attempt)
}

/**
 * Reasons the desk can refuse a request, read from the domain's own vocabulary:
 * the control and the rubrics share one list, so a reason a ticket scores is
 * always a reason the desk can record.
 */
export function denialReasons(): readonly DenialReasonOption[] {
  return REFUSAL_REASONS
}

function asDenialReason(value: string): DenialReason {
  return refusalReasonInfo(value)?.reason ?? 'unverified-identity'
}

/** Which method a recorded verification used; null when the log does not say. */
function asVerificationMethod(value: JsonValue | undefined): VerificationMethod | null {
  return value === 'callback' ||
    value === 'verification-code' ||
    value === 'badge-scan' ||
    value === 'letter-pin' ||
    value === 'in-person'
    ? value
    : null
}

function asCallbackResult(value: string): CallbackAttemptView['result'] {
  return value === 'verified' ||
    value === 'wrong-contact' ||
    value === 'colleague-answered' ||
    value === 'not-the-caller'
    ? value
    : 'no-answer'
}

/**
 * Refuses the request and records it. A denial is one-way and cannot be
 * repeated; only the recorded action satisfies the rubric check, so a note that
 * merely mentions refusing will not do.
 */
export async function denyCaller(reason: DenialReason): Promise<WorkspaceView> {
  const attempt = requireActive()
  const db = await database()
  const option = refusalReasonInfo(reason)
  if (!option) {
    throw new Error('Choose a reason for refusing the request.')
  }

  const stored = await db.actions.listBySession(attempt.session.id)
  if (stored.some((action) => action.kind === 'deny-caller')) {
    throw new Error('This request has already been refused.')
  }

  await db.actions.append({
    sessionId: attempt.session.id,
    atMs: attempt.world.clock,
    kind: 'deny-caller',
    input: { reason: option.reason, label: option.label, source: 'verify-caller' },
    output: {
      denied: true,
      summary: `Refused the request — ${option.label.toLowerCase()}.`,
    },
  })

  // The refusal is world state, not just a line in the log: it is what stops the
  // account-changing commands from running behind the desk's back, and it is
  // saved with the world so a reload still means it.
  attempt.world = {
    ...attempt.world,
    refusal: { reason: option.reason, label: option.label, atMs: attempt.world.clock },
  }
  await db.sessions.saveWorld(attempt.session.id, toJson(attempt.world))

  // The refusal has one close that fits it, so the form opens on the report to
  // Security. It is written as the draft, so a reload reopens that close rather
  // than the default one; a code the learner had already chosen is left alone,
  // because the refusal decides the disposition, not the paperwork they were
  // already writing.
  const closingCode = refusalClosureCodes()[0]?.code ?? null
  if (closingCode !== null && attempt.closureDraft.code === null) {
    await saveClosureDraft({ code: closingCode, note: attempt.closureDraft.note })
  }

  return workspaceAfter(attempt)
}

export async function addNote(noteKind: NoteKind, text: string): Promise<WorkspaceView> {
  const attempt = requireActive()
  const trimmed = text.trim()
  if (trimmed.length < 10) {
    throw new Error('A note needs at least 10 characters to be useful.')
  }

  const db = await database()
  await db.actions.append({
    sessionId: attempt.session.id,
    atMs: attempt.world.clock,
    kind: 'note',
    input: { noteKind, text: trimmed, source: NOTE_SOURCES[noteKind] },
    output: { saved: true },
  })

  return workspaceAfter(attempt)
}

/**
 * Saves the close being written — the code the learner has chosen and the
 * handoff note — so a reload reopens the form where they left it. Only a closed
 * session discards it: the decision then lives in the session row and the note
 * in the action log.
 */
export async function saveClosureDraft(input: ClosureDraft): Promise<void> {
  const attempt = requireActive()
  const draft: ClosureDraft = {
    // A code this build no longer offers reads as "not chosen yet".
    code:
      input.code !== null && CLOSURE_CODES.some((entry) => entry.code === input.code)
        ? input.code
        : null,
    note: input.note.slice(0, CLOSURE_NOTE_LIMIT),
  }

  // An empty form carries nothing, so it costs no snapshot write to say so.
  if (isEmptyClosureDraft(draft) && isEmptyClosureDraft(attempt.closureDraft)) {
    return
  }

  const db = await database()
  await db.sessions.saveClosureDraft(
    attempt.session.id,
    isEmptyClosureDraft(draft) ? null : closureDraftJson(draft),
  )
  attempt.closureDraft = draft
}

/** The close being written, and the longest note the form accepts. */
export { CLOSURE_NOTE_LIMIT } from '../domain/tickets/closureDraft'
export type { ClosureDraft } from '../domain/tickets/closureDraft'

/**
 * Records where the learner is working — the pane in front, the console showing
 * and the tabs open beside it — so a ticket reopens in the tool it was left in.
 *
 * It is written as it changes rather than on the way out, like the split
 * preference beside it: a click is a decision that has already happened, and a
 * save that fails costs one stale reopen rather than the learner's work. A
 * workspace the learner never left — the terminal, no tools — carries nothing,
 * and says so by clearing the column instead of writing a row of defaults.
 */
export async function saveWorkspaceLayout(input: WorkspaceLayout): Promise<void> {
  const attempt = requireActive()
  const layout = normalizeWorkspaceLayout(input, CONSOLE_IDS)

  // Nothing moved, so there is nothing to write: the pane is switched and tabs
  // are opened and closed one click at a time, and a click that changes nothing
  // the workspace remembers costs no write.
  if (sameLayout(layout, attempt.workspaceLayout)) {
    return
  }

  const db = await database()
  await db.sessions.saveWorkspaceLayout(
    attempt.session.id,
    isEmptyWorkspaceLayout(layout) ? null : workspaceLayoutJson(layout),
  )
  attempt.workspaceLayout = layout
}

/**
 * Saves what one console is showing now — the search typed in it and the record
 * open in it — so a reopened ticket lands back on that machine.
 *
 * It is the console's own state rather than the attempt's decision, so it is
 * written as it changes (through the page's pause, not on every keystroke) and a
 * console that is cleared leaves no entry behind.
 */
export async function saveConsoleFocus(
  consoleId: ConsoleId,
  focus: ConsoleFocus,
): Promise<void> {
  const attempt = requireActive()
  const next = focusConsole(attempt.consoleFocus, consoleId, focus)

  // Typing then deleting the same text is not a move: a write that changes
  // nothing the attempt remembers costs no row.
  if (next === attempt.consoleFocus) {
    return
  }

  const db = await database()
  await db.sessions.saveConsoleFocus(
    attempt.session.id,
    isEmptyConsoleFocusMap(next) ? null : consoleFocusJson(next),
  )
  attempt.consoleFocus = next
}

function sameLayout(left: WorkspaceLayout, right: WorkspaceLayout): boolean {
  return (
    left.pane === right.pane &&
    left.tool === right.tool &&
    left.ratio === right.ratio &&
    left.pinned.length === right.pinned.length &&
    left.pinned.every((id, index) => id === right.pinned[index]) &&
    left.tabs.length === right.tabs.length &&
    left.tabs.every((id, index) => id === right.tabs[index])
  )
}

/**
 * The workspace layout a ticket reopens in, and the rules that change it: the
 * pins that hold a group of tabs at the front of the strip, the move a drag
 * makes, and the place a tool dropped on the strip lands at. They are pure and
 * live in the domain, so the order the interface shows and the order the row
 * stores are decided by one piece of code.
 */
export type { WorkspaceLayout, WorkspacePane } from '../domain/tickets/workspaceLayout'

/**
 * Where the learner was inside a console — its search and the record it had
 * open — belongs to the attempt, and is read and written from here.
 */
export type { ConsoleFocus, ConsoleFocusMap } from '../domain/environment/consoleFocus'
export { focusConsole } from '../domain/environment/consoleFocus'
export {
  insertWorkspaceTool,
  pinWorkspaceTool,
  reorderWorkspaceTools,
  workspaceInsertIndex,
} from '../domain/tickets/workspaceLayout'

/**
 * What an open console has printed since the learner last had it in front. The
 * workspace reads it from here rather than from the domain directly, like every
 * other rule the interface uses.
 */
export {
  consoleDigest,
  consoleHasNews,
  nextConsoleWithNews,
  noteConsoleRead,
} from '../domain/environment/consoleNews'
export type { ConsoleReads } from '../domain/environment/consoleNews'

/* ----------------------------------------------------------------- hints */

/**
 * Thrown when every hinted step on the ticket has already been revealed, so the
 * interface can retire the hint control instead of matching on a message.
 */
export class NoHintAvailableError extends Error {
  constructor() {
    super(
      'There is no further hint for this ticket. Close it when you are ready, or keep investigating.',
    )
    this.name = 'NoHintAvailableError'
  }
}

/**
 * Thrown when the attempt has already taken every hint its budget allows. The
 * budget rations hints without charging for them, so this is not a scoring
 * event: the learner either carries on unaided or raises the budget in Settings.
 */
export class HintBudgetSpentError extends Error {
  constructor(limit: number) {
    super(
      `This attempt has used all ${limit} hint${limit === 1 ? '' : 's'} in its budget. Carry on without them, or raise the budget in Settings for the next attempt.`,
    )
    this.name = 'HintBudgetSpentError'
  }
}

/**
 * Thrown when an exam attempt is asked for a hint. The exam withholds the whole
 * ladder until the attempt is scored, so this is a mode refusal rather than a
 * dead end: the rungs are waiting in the debrief.
 */
export class HintsWithheldError extends Error {
  constructor() {
    super(
      'Hints are withheld on an exam attempt. They are handed over in the debrief, once the ticket is scored.',
    )
    this.name = 'HintsWithheldError'
  }
}

/**
 * Reveals the next rung of the hint chain for the first rubric step the attempt
 * has not met yet. Each rung is recorded in the action log and priced by the
 * evaluator, so the workspace can show what is left and what it will cost before
 * the learner commits.
 */
export async function revealHint(): Promise<WorkspaceView> {
  const attempt = requireActive()
  // The interface has no control for this on an exam, and the service refuses it
  // anyway: a hidden button is not a guard.
  if (attempt.exam) {
    throw new HintsWithheldError()
  }

  const db = await database()
  const stored = await db.actions.listBySession(attempt.session.id)
  const taken = stored.filter((action) => action.kind === 'hint').length
  if (hintBudgetSpent(attempt.hintPolicy, taken)) {
    throw new HintBudgetSpentError(attempt.hintPolicy.budget)
  }

  const revealed = new Map<string, number>()
  for (const action of stored) {
    if (action.kind !== 'hint') {
      continue
    }
    const itemId = readString(action.input.itemId)
    // Actions saved before ladders existed have no index; they were the first rung.
    const index = typeof action.input.hintIndex === 'number' ? action.input.hintIndex : 0
    revealed.set(itemId, Math.max(revealed.get(itemId) ?? 0, index + 1))
  }

  // A pending close keeps every decision item unmet, so its hints stay available.
  const result = await evaluateAttempt(
    attempt,
    { outcome: 'resolved', code: 'pending', note: '' },
    '',
    false,
  )
  const passedIds = new Set(result.items.filter((item) => item.passed).map((item) => item.id))

  let next: { itemId: string; hintIndex: number; hint: string } | null = null
  for (const item of attempt.generated.rubric.items) {
    if (passedIds.has(item.id)) {
      continue
    }
    const shown = revealed.get(item.id) ?? 0
    const hint = item.hints[shown]
    if (hint) {
      next = { itemId: item.id, hintIndex: shown, hint }
      break
    }
  }

  if (!next) {
    throw new NoHintAvailableError()
  }

  await db.actions.append({
    sessionId: attempt.session.id,
    atMs: attempt.world.clock,
    kind: 'hint',
    input: {
      itemId: next.itemId,
      hintIndex: next.hintIndex,
      hint: next.hint,
      source: 'hints',
    },
    output: { revealed: true },
  })

  return workspaceAfter(attempt)
}

/* ----------------------------------------------------------------- rewind */

/**
 * Thrown when an attempt cannot be un-run: it is an exam, the step is already
 * gone, or the log no longer folds back to the world in hand.
 */
export class RewindRefusedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RewindRefusedError'
  }
}

const REWIND_IN_EXAM =
  'An exam attempt cannot be rewound. Every step of the sitting stands, which is what sitting one means.'

/**
 * The fold is only trusted once it has reproduced the world in hand. A log that
 * cannot be replayed exactly — one written before these steps were recorded —
 * refuses the rewind rather than dropping actions and keeping their effects.
 */
const REWIND_UNREPLAYABLE =
  'This attempt\u2019s steps cannot be replayed exactly, so nothing was un-run. Carry on from here, or abandon the ticket.'

/** The key this attempt's verification codes are drawn from. */
function codeSeedFor(attempt: ActiveAttempt): string {
  return `${attempt.ticket.id}:${attempt.generated.seed}`
}

function asReplaySteps(actions: readonly SessionAction[]): ReplayStep[] {
  return actions.map((action) => ({
    kind: action.kind,
    atMs: action.atMs,
    input: action.input,
    output: action.output,
  }))
}

/** A caller line the log recorded on its own, rather than an answer to a question. */
function isCallerInterruption(action: SessionAction): boolean {
  return action.kind === 'ask-user' && action.output.interruption === true
}

/**
 * A row that leaves the log open for a put-back: a caller line, or a tool read.
 * Neither changes the world, so a cut made before one can still be reversed, and
 * the row follows the restored steps rather than standing in their way.
 */
function canFollowACut(action: SessionAction): boolean {
  return isCallerInterruption(action) || action.kind === 'console-read'
}

/** One step a rewind dropped, as the marker keeps it. */
interface StoredRewindStep {
  kind: ActionKind
  atMs: number
  input: JsonObject
  output: JsonObject
}

/**
 * The steps a rewind marker holds, or null when it cannot offer them back. A
 * marker written before the steps were kept reads as null: its tail is gone.
 */
function storedRewindSteps(input: JsonObject): StoredRewindStep[] | null {
  const removed = input.removed
  if (!Array.isArray(removed) || removed.length === 0) {
    return null
  }
  if (typeof input.dropped === 'number' && input.dropped !== removed.length) {
    return null
  }

  const steps: StoredRewindStep[] = []
  for (const entry of removed) {
    if (!isRecord(entry)) {
      return null
    }
    const kind = entry.kind
    const atMs = entry.atMs
    if (typeof kind !== 'string' || !ACTION_KINDS.includes(kind as ActionKind)) {
      return null
    }
    if (typeof atMs !== 'number' || !isRecord(entry.input) || !isRecord(entry.output)) {
      return null
    }
    steps.push({ kind: kind as ActionKind, atMs, input: entry.input, output: entry.output })
  }
  return steps
}

/**
 * Un-runs an attempt from `fromSeq`: that step and every step after it leave the
 * log, and the world goes back with them, rebuilt by folding what remains from
 * the world the ticket generated. The dropped steps ride on the marker, so an
 * accidental cut can be put back instead of retyped.
 *
 * The world is rebuilt rather than remembered because the log is the attempt:
 * replaying it is what makes an un-run check stop counting towards the score, a
 * revealed hint stop costing points, and a machine go back to the state the
 * learner left it in. The flip side is that the fold has to be exact, so the
 * whole log is folded first and compared with the world in hand — if they
 * disagree, nothing is touched.
 */
export async function rewindAttempt(fromSeq: number): Promise<WorkspaceView> {
  const attempt = requireActive()
  if (attempt.exam) {
    throw new RewindRefusedError(REWIND_IN_EXAM)
  }
  if (!Number.isInteger(fromSeq) || fromSeq < 1) {
    throw new RewindRefusedError('That step is not in the log.')
  }

  const db = await database()
  const logged = await db.actions.listBySession(attempt.session.id)
  const kept = logged.filter((action) => action.seq < fromSeq)
  const dropped = logged.length - kept.length
  if (dropped === 0) {
    throw new RewindRefusedError('That step is no longer in the log.')
  }

  const context = { codeSeed: codeSeedFor(attempt) }
  const replayed = foldWorld(attempt.generated.world, asReplaySteps(logged), context)
  if (!worldsMatch(replayed, attempt.world)) {
    throw new RewindRefusedError(REWIND_UNREPLAYABLE)
  }

  const world = foldWorld(attempt.generated.world, asReplaySteps(kept), context)
  // The marker keeps the steps themselves, not just a count: putting a cut back
  // has to restore the commands, hints, notes and checks it took, with the same
  // outputs the fold will replay.
  const removed = logged.slice(kept.length).map((action) => ({
    kind: action.kind,
    atMs: action.atMs,
    input: action.input,
    output: action.output,
  }))
  await db.actions.rewind(
    attempt.session.id,
    fromSeq,
    {
      sessionId: attempt.session.id,
      atMs: world.clock,
      kind: 'rewind',
      input: { dropped, fromSeq, removed },
      output: { rewound: true },
    },
    toJson(world),
  )

  attempt.world = world
  return workspaceAfter(attempt)
}

const REAPPLY_AFTER_WORK =
  'Work has been logged since that rewind, so its steps cannot be put back in order. Carry on from here, or abandon the ticket.'

const REAPPLY_LEGACY =
  'This cut was made before its steps could be kept, so they cannot be put back. Carry on from here, or abandon the ticket.'

/**
 * Puts back the steps the latest rewind dropped. The marker goes and the steps
 * it held take its place, so the log reads as if the cut had not been made and
 * the world, score, and hint ledger return with them.
 *
 * Only the last cut can be reversed: later steps would have to move out of the
 * way, and seq is exactly what a rewind points at. A learner who has carried on
 * is told so rather than having the log rewritten under their later work.
 */
export async function reapplyRewind(seq: number): Promise<WorkspaceView> {
  const attempt = requireActive()
  if (attempt.exam) {
    throw new RewindRefusedError(REWIND_IN_EXAM)
  }
  if (!Number.isInteger(seq) || seq < 1) {
    throw new RewindRefusedError('That cut is not in the log.')
  }

  const db = await database()
  const logged = await db.actions.listBySession(attempt.session.id)
  const markerIndex = logged.findIndex((action) => action.seq === seq && action.kind === 'rewind')
  if (markerIndex < 0) {
    throw new RewindRefusedError('That cut is no longer in the log.')
  }
  const marker = logged[markerIndex]
  if (!marker) {
    throw new RewindRefusedError('That cut is no longer in the log.')
  }
  const steps = storedRewindSteps(marker.input)
  if (!steps) {
    throw new RewindRefusedError(REAPPLY_LEGACY)
  }

  // Caller lines may have arrived since the cut; work may not. Conversation
  // follows the restored steps, but a command or a note means the learner has
  // carried on and the old seq numbers can no longer be theirs.
  const tail = logged.slice(markerIndex + 1)
  if (tail.some((action) => !canFollowACut(action))) {
    throw new RewindRefusedError(REAPPLY_AFTER_WORK)
  }

  const context = { codeSeed: codeSeedFor(attempt) }
  if (!worldsMatch(foldWorld(attempt.generated.world, asReplaySteps(logged), context), attempt.world)) {
    throw new RewindRefusedError(REWIND_UNREPLAYABLE)
  }

  // The kept prefix plus the restored steps is the log as it stood before the
  // cut, so folding it puts back the world the learner had. Conversation does
  // not change the world, so the tail is left to follow the steps.
  const restored = [...logged.slice(0, markerIndex), ...steps]
  const world = foldWorld(attempt.generated.world, restored, context)
  const asAction = (step: StoredRewindStep) => ({
    sessionId: attempt.session.id,
    atMs: step.atMs,
    kind: step.kind,
    input: step.input,
    output: step.output,
  })
  await db.actions.reapply(
    attempt.session.id,
    marker.seq,
    steps.map(asAction),
    tail.map((action) =>
      asAction({
        kind: action.kind,
        atMs: action.atMs,
        input: action.input,
        output: action.output,
      }),
    ),
    toJson(world),
  )

  attempt.world = world
  return workspaceAfter(attempt)
}


/* --------------------------------------------------------------- scoring */

export function closureOptions(): typeof CLOSURE_CODES {
  return CLOSURE_CODES
}

/**
 * A closure as it was written on the form, for the debrief: the stored score
 * keeps the code, and a learner should not be shown a slug they never typed. An
 * unrecognized code — a score from before a code was renamed — reads as itself.
 */
export function closureLabel(code: string): string {
  return CLOSURE_CODES.find((entry) => entry.code === code)?.label ?? code
}

export interface ResolveInput {
  code: string
  note: string
}

export interface ClosureReview {
  total: number
  passed: boolean
  /**
   * The two charges already taken out of `total`: process mistakes priced by
   * the log, and hints at this attempt's own rate. The workspace shows them
   * live, so it reads them from the same dry run the close itself uses rather
   * than counting them a second way.
   */
  procedurePenalty: number
  hintPenalty: number
  criticalFailures: string[]
  /** Critical rubric items the attempt has not met yet. */
  blocking: Array<{ id: string; label: string; hint?: string }>
  /**
   * Steps this close would only earn in part — the refusal that stopped the work
   * under the wrong pretext. Named before the learner commits, so a close that
   * would score 85 explains itself instead of just looking wrong.
   */
  partial: Array<{ id: string; label: string; earned: number; weight: number; reason?: string }>
  /**
   * What the security report still has to say, when the chosen code closes the
   * ticket as a refusal: a report to Security is the close's own contract, not a
   * target to aim at, so this names each part the note does not cover and the
   * close is refused until it does. Null on every other close, and null on a
   * report that is already complete.
   */
  report: { missing: string[]; tooShort: boolean; message: string } | null
  /**
   * Network tickets only: the proof as this close would score it, so the review
   * can show what the map is still missing before the learner commits. Null on
   * every other family, where no bonus can be paid.
   */
  topology: TopologyCoverage | null
  /**
   * The bonus still on the table: the network proof pays nothing unless every
   * link is proved, so this is the whole bonus while any link is unproved.
   * Zero once it is earned, and on tickets with no map.
   */
  pendingBonusXp: number
}

/**
 * The security report a refusal close has to be, read once so the review and the
 * close itself cannot disagree about what is missing. Returns null when the code
 * is not a refusal close, or when the report already says everything asked of it.
 */
function securityReportFor(
  closure: (typeof CLOSURE_CODES)[number],
  note: string,
): { missing: string[]; tooShort: boolean; message: string } | null {
  if (closure.refusal !== true) {
    return null
  }
  const gaps = securityReportGaps(note)
  return gaps
    ? { missing: gaps.missing.map((part) => part.label), tooShort: gaps.tooShort, message: securityReportShortfall(gaps) }
    : null
}

async function evaluateAttempt(
  attempt: ActiveAttempt,
  decision: SessionDecision,
  pendingNote: string,
  closing = true,
): Promise<EvaluationResult> {
  const db = await database()
  const storedActions = await db.actions.listBySession(attempt.session.id)
  const actions = storedActions.map((action) => ({
    kind: action.kind as ActionKind,
    input: action.input,
    output: action.output,
  }))

  if (pendingNote.length > 0) {
    actions.push({
      kind: 'note',
      input: { noteKind: 'resolution', text: pendingNote },
      output: { saved: true },
    })
  }

  const networkTicket = attempt.generated.public.category === 'network'
  const topology =
    networkTicket && closing
      ? buildTopology(attempt.world, topologyCommands(storedActions))
      : undefined

  return evaluateSession({
    rubric: attempt.generated.rubric,
    actions,
    world: attempt.world,
    decision,
    difficulty: attempt.ticket.difficulty,
    hints: attempt.hintPolicy,
    networkTicket,
    topology,
    closing,
  })
}

/**
 * Scores the attempt without closing it, so the UI can warn about critical
 * steps before the learner commits to an irreversible close.
 */
export async function reviewClosure(input: ResolveInput): Promise<ClosureReview> {
  const attempt = requireActive()
  const closure = CLOSURE_CODES.find((entry) => entry.code === input.code)
  if (!closure) {
    throw new Error('Choose a closure code before resolving the ticket.')
  }

  const note = input.note.trim()
  const result = await evaluateAttempt(
    attempt,
    { outcome: closure.outcome, code: closure.code, note },
    note,
  )

  const topology = result.topology

  return {
    total: result.total,
    report: securityReportFor(closure, note),
    passed: result.passed,
    procedurePenalty: result.procedurePenalty,
    hintPenalty: result.hintPenalty,
    criticalFailures: result.criticalFailures,
    blocking: result.items
      .filter((item) => item.critical && itemCredit(item) === 0)
      .map((item) => ({ id: item.id, label: item.label, hint: item.hints[0] })),
    partial: result.items
      .filter((item) => itemCredit(item) > 0 && itemCredit(item) < 1)
      .map((item) => ({
        id: item.id,
        label: item.label,
        earned: itemPoints(item),
        weight: item.weight,
        reason: item.gaps?.[0],
      })),
    topology,
    // The bonus is all-or-nothing: an unproved link withholds the whole of it,
    // so what is pending is the full amount whenever a map has been left short.
    pendingBonusXp:
      topology && topology.totalLinks > 0 && topology.bonusXp === 0 ? TOPOLOGY_BONUS_XP : 0,
  }
}

export async function resolveAttempt(input: ResolveInput): Promise<DebriefView> {
  const attempt = requireActive()
  const db = await database()
  const closure = CLOSURE_CODES.find((entry) => entry.code === input.code)
  if (!closure) {
    throw new Error('Choose a closure code before resolving the ticket.')
  }

  const note = input.note.trim()
  // A refusal closes as a report to Security, and the report is the close's
  // contract: what was asked, what was checked before refusing, and what
  // Security should do next. Nothing is written when a part is missing — no
  // resolution note, no closed session — so a refused close leaves the attempt
  // exactly as it was.
  const report = securityReportFor(closure, note)
  if (report) {
    throw new Error(report.message)
  }

  if (note.length > 0) {
    await db.actions.append({
      sessionId: attempt.session.id,
      atMs: attempt.world.clock,
      kind: 'note',
      input: { noteKind: 'resolution', text: note, source: NOTE_SOURCES.resolution },
      output: { saved: true },
    })
  }

  const decision: SessionDecision = {
    outcome: closure.outcome,
    code: closure.code,
    note,
  }

  const result = await evaluateAttempt(attempt, decision, '')

  const endedAt = Date.now()
  await db.sessions.finish(attempt.session.id, {
    endedAt,
    resolution: closure.code,
    outcome: 'resolved',
  })
  await db.scores.save({
    sessionId: attempt.session.id,
    total: result.total,
    passed: result.passed,
    band: result.band,
    // The score keeps where the price came from as well as what it was, because
    // the debrief is the only place that can say a family price applied.
    rubric: toJson({ ...result, hintPricing: hintPricingJson(attempt.hintPricing) }),
    computedAt: endedAt,
  })
  await db.tickets.updateStatus(attempt.ticket.id, 'completed')
  await updateProgress(attempt.ticket.scenarioId, result, endedAt)

  // The close can come long after the price was pinned, so the debrief records
  // whether Settings has moved under it as well as what it paid.
  const todayPolicy = attempt.exam
    ? null
    : (await resolveHintPricing(attempt.ticket.scenarioId, false)).policy
  const hintPriceNow =
    todayPolicy && hintPricesDiffer(attempt.hintPolicy, todayPolicy) ? todayPolicy : null

  const logged = await db.actions.listBySession(attempt.session.id)
  const debrief = buildDebrief(
    attempt,
    result,
    decision,
    endedAt,
    attemptTrail(logged, {
      rubric: attempt.generated.rubric,
      policy: attempt.hintPolicy,
      world: attempt.world,
      decision,
    }),
    logged,
    hintPriceNow,
  )
  activeAttempt = null
  return debrief
}

function buildDebrief(
  attempt: ActiveAttempt,
  result: EvaluationResult,
  decision: SessionDecision,
  endedAt: number,
  trail: TrailEntry[],
  logged: readonly SessionAction[],
  hintPriceNow: HintPolicy | null,
): DebriefView {
  const items = debriefItems(result.items, logged, attempt.hintPolicy)
  return {
    sessionId: attempt.session.id,
    ticket: toTicketView(attempt.ticket),
    decision,
    total: result.total,
    passed: result.passed,
    band: result.band,
    xp: result.xp,
    criticalFailures: result.criticalFailures,
    feedback: result.feedback,
    items,
    categoryScores: result.categoryScores,
    reference: attempt.generated.reference.map(describeReference),
    endedAt,
    hintPolicy: attempt.hintPolicy,
    hintPricing: attempt.hintPricing,
    hintPriceNow,
    hintsUsed: result.hintsUsed,
    hintPenalty: result.hintPenalty,
    ...hintReconciliation(items, result.hintsUsed, result.hintPenalty),
    // A close that was just scored has nothing to repair: its log is the log
    // the score was read from.
    hintRepair: null,
    violations: result.violations,
    procedurePenalty: result.procedurePenalty,
    trail,
    topology: result.topology,
    topologyMap: result.topologyMap,
    identityFindings: identityFindingsFor(
      attempt.generated.world,
      attempt.generated.public.requester.name,
      logged,
    ),
    refusalFindings: refusalFindingsFor(logged),
    pressure: pressureReport(logged),
    toolUse: toolUseReport(logged),
    exam: attempt.exam,
    ...rewindTally(logged),
  }
}

/**
 * What the attempt did to its own log before it was scored. The score is read
 * from the log as it stands, so the debrief says how much of it was un-run
 * rather than pretending the attempt happened in one pass.
 */
function rewindTally(logged: readonly SessionAction[]): { rewinds: number; rewoundSteps: number } {
  let rewinds = 0
  let rewoundSteps = 0
  for (const action of logged) {
    if (action.kind !== 'rewind') {
      continue
    }
    rewinds += 1
    rewoundSteps += typeof action.input.dropped === 'number' ? action.input.dropped : 0
  }
  return { rewinds, rewoundSteps }
}

/**
 * Attaches each step's revealed hint rungs to its scored result. A score written
 * before hint ladders carries one `hint` per item rather than an array, so the
 * ladder is normalized here and both debrief paths agree on it.
 */
function debriefItems(
  items: readonly RubricItemResult[],
  logged: readonly SessionAction[],
  policy: HintPolicy,
): DebriefItem[] {
  const ladders: HintLadderItem[] = items.map((item) => {
    const legacy = item as RubricItemResult & { hint?: string }
    return {
      id: item.id,
      label: item.label,
      hints: legacy.hints ?? (legacy.hint ? [legacy.hint] : []),
    }
  })
  const ledger = new Map(
    hintLedger(logged, ladders, policy).map((entry) => [entry.itemId, entry]),
  )

  return items.map((item, index) => ({
    ...item,
    hints: ladders[index]?.hints ?? [],
    hintsTaken: ledger.get(item.id)?.rungs ?? [],
  }))
}

/**
 * The part of the hint charge the log cannot place on a step.
 *
 * Normally zero: every rung the evaluator charged has a hint action behind it.
 * When the log is missing, the score still says how many rungs were taken and
 * what they cost, so the difference is reported rather than dropped — a debrief
 * that showed the count but no rungs would be disagreeing with itself.
 */
function hintReconciliation(
  items: readonly DebriefItem[],
  hintsUsed: number,
  hintPenalty: number,
): { unaccountedHints: number; unaccountedHintCost: number } {
  const taken = items.flatMap((item) => item.hintsTaken)
  const attributedCost = taken.reduce((sum, rung) => sum + rung.cost, 0)
  return {
    unaccountedHints: Math.max(0, hintsUsed - taken.length),
    unaccountedHintCost: Math.max(0, hintPenalty - attributedCost),
  }
}

const REFERENCE_NOTE_LABELS: Record<ReferenceNoteKind, string> = {
  troubleshooting: 'Leave a troubleshooting note',
  customer: 'Send the customer a plain-language update',
  resolution: 'Write the handoff note the next team will pick up',
}

/**
 * The reference path is read by the learner after the attempt, so each step
 * names the work in plain language and keeps the raw command or intent as the
 * supporting detail rather than the label itself.
 */
function describeReference(step: ReferenceStep): ReferenceStepView {
  switch (step.type) {
    case 'command': {
      const [name] = step.input.trim().split(/\s+/)
      const definition = name ? findCommand(name) : undefined
      // A step that names its own purpose keeps the command as the detail, so
      // the path says why the same lookup comes round twice without losing the
      // line to type. Everything else is explained by what the tool is for.
      return step.label
        ? { label: step.label, detail: step.input }
        : {
            label: `Run ${step.input}`,
            detail: definition
              ? definition.summary
              : 'Read the output before deciding the next step.',
          }
    }
    case 'verify-caller':
      return step.method === 'callback'
        ? {
            label: 'Ring the caller back before anything changes',
            detail:
              'Call a number on file that reaches the person on the ticket and have them confirm the request.',
          }
        : {
            label: 'Verify the caller before anything changes',
            detail: 'Send a code to the contact on the ticket and have them read it back.',
          }
    case 'deny-caller':
      return {
        label: 'Refuse the request and report it to Security',
        detail: 'Do not change the account. Record the denial and escalate it with the security code.',
      }
    case 'ask-user': {
      const prompt = CALLER_PROMPTS.find((candidate) => candidate.intent === step.intent)
      return {
        label: prompt ? `Ask the caller: ${prompt.label}` : 'Ask the caller a diagnostic question',
        detail: 'Their answer is what decides the next check.',
      }
    }
    case 'note':
      return { label: REFERENCE_NOTE_LABELS[step.noteKind], detail: step.text }
  }
}

async function updateProgress(
  scenarioId: string,
  result: EvaluationResult,
  now: number,
): Promise<void> {
  const db = await database()
  const existing = await db.progress.get(scenarioId)
  const next = nextStats(existing, scenarioId, result, now)
  await db.progress.upsert(next)
}

function nextStats(
  existing: ScenarioStats | null,
  scenarioId: string,
  result: EvaluationResult,
  now: number,
): ScenarioStats {
  // The rule itself lives in the domain now: the Intune console folds its own
  // attempts through the same function, so a box and a due date mean the same
  // thing whichever surface scored the work.
  return foldScenarioStats(existing, scenarioId, result, now)
}

/* ------------------------------------------------------------- debriefs */

export async function loadDebrief(sessionId: string): Promise<DebriefView | null> {
  const db = await database()
  const session = await db.sessions.findById(sessionId)
  if (!session) {
    return null
  }
  const score = await db.scores.findBySession(sessionId)
  if (!score) {
    return null
  }

  const ticket = await db.tickets.findById(session.ticketId)
  if (!ticket) {
    return null
  }

  const generated = rebuildTicket(ticket)
  const stored = score.rubric as unknown as EvaluationResult & { hintPricing?: unknown }
  // The price this attempt was scored under, not whatever Settings says today,
  // and where it came from: a family price still reads as one after the family
  // is re-priced, and an older score without the record reads as the default.
  const hintPricing = normalizeHintPricing(stored.hintPricing ?? stored.hintPolicy)
  const hintPolicy = hintPricing.policy
  // What the same ticket would pay if it were started now. Read for the attempt's
  // own family, so adding or removing a family price counts as a move; an exam's
  // price came from the exam, so the catalogue cannot have moved it.
  const todayPolicy = session.examMode
    ? null
    : (await resolveHintPricing(ticket.scenarioId, false)).policy
  const hintPriceNow = todayPolicy && hintPricesDiffer(hintPolicy, todayPolicy) ? todayPolicy : null
  const logged = await db.actions.listBySession(sessionId)
  const closure = CLOSURE_CODES.find((entry) => entry.code === session.resolution)
  const decision: SessionDecision = {
    outcome: closure?.outcome ?? 'resolved',
    code: session.resolution ?? 'resolved-remote',
    note: '',
  }
  const trail = attemptTrail(logged, {
    rubric: generated.rubric,
    policy: hintPolicy,
    world: asWorld(session.world),
    decision,
  })
  const coverage = (stored.topology as TopologyCoverage | undefined) ?? null
  const snapshot = (stored.topologyMap as TopologyView | null | undefined) ?? null
  // A score written before the map was kept is redrawn from the same log and the
  // world the attempt ended on — the same picture, not a newer one.
  const topologyMap =
    snapshot ??
    (coverage ? buildTopology(asWorld(session.world), topologyCommands(logged)) : null)

  const items = debriefItems(stored.items ?? [], logged, hintPolicy)
  // A score written before hints were counted carries no number; the log is then
  // the only account of how many rungs were taken, so it supplies the count the
  // steps already show. The charge stays what was stored: nothing is invented.
  const hintsUsed =
    typeof stored.hintsUsed === 'number'
      ? stored.hintsUsed
      : items.reduce((total, item) => total + item.hintsTaken.length, 0)
  const hintPenalty = stored.hintPenalty ?? 0
  // Kept beside the evaluation, so an attempt scored years ago can still be
  // repaired without a later act rewriting what it was scored at.
  const hintRepair = await db.scores.findHintRepair(sessionId)

  return {
    sessionId,
    ticket: toTicketView(ticket),
    decision,
    total: score.total,
    passed: score.passed,
    band: score.band,
    xp: stored.xp ?? 0,
    criticalFailures: stored.criticalFailures ?? [],
    feedback: stored.feedback ?? [],
    items,
    categoryScores:
      stored.categoryScores ??
      ({
        diagnosis: { earned: 0, possible: 0 },
        documentation: { earned: 0, possible: 0 },
        resolution: { earned: 0, possible: 0 },
        safety: { earned: 0, possible: 0 },
      } satisfies Record<RubricCategory, CategoryScore>),
    reference: generated.reference.map(describeReference),
    endedAt: session.endedAt ?? score.computedAt,
    hintPolicy,
    hintPricing,
    hintPriceNow,
    hintsUsed,
    hintPenalty,
    ...hintReconciliation(items, hintsUsed, hintPenalty),
    hintRepair,
    violations: stored.violations ?? [],
    procedurePenalty: stored.procedurePenalty ?? 0,
    trail,
    topology: coverage,
    topologyMap,
    identityFindings: identityFindingsFor(
      generated.world,
      generated.public.requester.name,
      logged,
    ),
    refusalFindings: refusalFindingsFor(logged),
    pressure: pressureReport(logged),
    toolUse: toolUseReport(logged),
    // A row written before exam mode existed reads back as a practice attempt.
    exam: session.examMode,
    ...rewindTally(logged),
  }
}

/**
 * Rebuilds the hint rungs an attempt's log lost, and keeps the rebuild on the
 * score.
 *
 * The score kept how many rungs were charged and what they cost; the log no
 * longer holds the rows that bought them. What can still be known about them is
 * what was written down: the count, where in the reveal order they can only have
 * fallen, and the price this attempt played under. The repair stores exactly
 * that. It does not give a lost rung a step — the log cannot say which one it
 * unstuck, and a guessed step would be a worse record than a gap.
 *
 * The action is idempotent: an attempt that already has a repair returns it
 * untouched, and one that is missing nothing gets none, so a second press can
 * never charge the same rungs twice.
 */
export async function repairHintRecord(sessionId: string): Promise<DebriefView> {
  const debrief = await loadDebrief(sessionId)
  if (!debrief) {
    throw new Error('That debrief could not be found. It may have been removed with a database reset.')
  }

  if (debrief.hintRepair !== null || debrief.unaccountedHints === 0) {
    return debrief
  }

  const placed = debrief.items.reduce((total, item) => total + item.hintsTaken.length, 0)
  const reconstruction = reconstructHintRungs(
    debrief.hintPolicy,
    placed,
    debrief.unaccountedHints,
    debrief.unaccountedHintCost,
  )

  const db = await database()
  await db.scores.saveHintRepair(sessionId, {
    ...reconstruction,
    repairedAt: Date.now(),
    source: 'policy',
  })

  const repaired = await loadDebrief(sessionId)
  return repaired ?? debrief
}

/* -------------------------------------------------------------- progress */

const CATEGORY_LABELS: Record<RubricCategory, string> = {
  diagnosis: 'diagnosis and evidence',
  documentation: 'notes and handoff',
  resolution: 'the fix and closure decision',
  safety: 'safety checks',
}

const WEAK_TOPIC_THRESHOLD = 90
const MAX_WEAK_TOPICS = 2

/**
 * Families are ranked by average score, then by pass rate, so the suggestion is
 * driven by what was actually scored rather than by how often it was tried.
 */
export function computeWeakTopics(history: readonly ScoreHistoryEntry[]): WeakTopic[] {
  const byScenario = new Map<string, ScoreHistoryEntry[]>()
  for (const entry of history) {
    const existing = byScenario.get(entry.scenarioId)
    if (existing) {
      existing.push(entry)
    } else {
      byScenario.set(entry.scenarioId, [entry])
    }
  }

  const topics: WeakTopic[] = []

  for (const [scenarioId, entries] of byScenario) {
    const attempts = entries.length
    const averageScore = Math.round(
      entries.reduce((total, entry) => total + entry.total, 0) / attempts,
    )
    const passRate = Math.round(
      (entries.filter((entry) => entry.passed).length / attempts) * 100,
    )

    const totals: Record<RubricCategory, { earned: number; possible: number }> = {
      diagnosis: { earned: 0, possible: 0 },
      documentation: { earned: 0, possible: 0 },
      resolution: { earned: 0, possible: 0 },
      safety: { earned: 0, possible: 0 },
    }

    for (const entry of entries) {
      if (!entry.categoryScores) {
        continue
      }
      for (const category of Object.keys(totals) as RubricCategory[]) {
        totals[category].earned += entry.categoryScores[category].earned
        totals[category].possible += entry.categoryScores[category].possible
      }
    }

    let weakestCategory: WeakTopic['weakestCategory'] = null
    for (const category of Object.keys(totals) as RubricCategory[]) {
      const score = totals[category]
      if (score.possible === 0) {
        continue
      }
      const percent = Math.round((score.earned / score.possible) * 100)
      if (!weakestCategory || percent < weakestCategory.percent) {
        weakestCategory = {
          category,
          label: CATEGORY_LABELS[category],
          earned: score.earned,
          possible: score.possible,
          percent,
        }
      }
    }

    const recommendation =
      weakestCategory && weakestCategory.percent < 100
        ? `You lose the most marks on ${weakestCategory.label}. Practise a ${scenarioId} ticket and work on that before retrying.`
        : `Your average is ${averageScore}. Retry a ${scenarioId} ticket to keep the pattern fresh.`

    topics.push({
      scenarioId,
      scenarioTitle: titleFor(scenarioId),
      attempts,
      averageScore,
      passRate,
      weakestCategory,
      recommendation,
    })
  }

  return topics
    .filter((topic) => topic.averageScore < WEAK_TOPIC_THRESHOLD)
    .sort(
      (left, right) =>
        left.averageScore - right.averageScore ||
        left.passRate - right.passRate ||
        right.attempts - left.attempts,
    )
    .slice(0, MAX_WEAK_TOPICS)
}

export async function loadProgress(): Promise<ProgressView> {
  const db = await database()
  const [
    stats,
    history,
    targetRecommendations,
    scoredSteps,
    takenHints,
    scoredHintCounts,
    rewindRecords,
    verificationChecks,
  ] = await Promise.all([
    db.progress.list(),
    db.scores.listHistory(),
    loadTargetRecommendations(),
    db.scores.listScoredSteps(),
    db.actions.listHints(),
    // The scores' own count, read beside the log so a lost hint row is reported
    // rather than quietly missing from the habit.
    db.scores.listScoredHintCounts(),
    db.actions.listRewinds(),
    db.actions.listVerificationChecks(),
  ])
  // The Intune console scores its own attempts without opening a ticket session,
  // so its finished work joins the ticket history here rather than in another
  // table: XP, rank, streaks and the scenario list then read one history.
  const intune = await loadIntuneProgress()
  const mergedHistory = [...history, ...intune.history]
  const mergedStats = [...stats, ...intune.stats]
  const titles = { ...SCENARIO_TITLES, ...intune.titles }

  const summary = summarizeHistory(mergedHistory, Date.now())
  const verificationSummary = summarizeVerificationChecks(verificationChecks)

  const rows: ProgressRow[] = mergedStats.map((entry) => ({
    scenarioId: entry.scenarioId,
    scenarioTitle: titleFor(entry.scenarioId, titles),
    // Ticket families are practised from the queue; an Intune scenario only
    // exists in its console, so its row links there instead.
    ...(intune.titles[entry.scenarioId] ? { href: '/intune/tickets' } : {}),
    attempts: entry.attempts,
    passes: entry.passes,
    bestScore: entry.bestScore,
    lastPlayedAt: entry.lastPlayedAt,
    leitnerBox: entry.leitnerBox,
    dueAt: entry.dueAt,
  }))

  const attempts = rows.reduce((total, row) => total + row.attempts, 0)
  const passes = rows.reduce((total, row) => total + row.passes, 0)
  const bestScore = rows.reduce((best, row) => Math.max(best, row.bestScore), 0)
  const averageBest =
    rows.length === 0
      ? 0
      : Math.round(rows.reduce((total, row) => total + row.bestScore, 0) / rows.length)

  return {
    attempts,
    passes,
    bestScore,
    averageBest,
    totalXp: summary.totalXp,
    rank: summary.rank,
    streakDays: summary.streakDays,
    rows,
    weakTopics: computeWeakTopics(history),
    hintHabits: hintHabits(scoredSteps, takenHints),
    hintHabitSummary: summarizeHintHabits(scoredSteps, takenHints, scoredHintCounts),
    ...rewindRows(mergedStats, rewindRecords),
    verificationHabits: verificationSummary.rows,
    verificationSummary,
    targetRecommendations,
  }
}

/**
 * The rewinding read from the log, with each family's title and the attempts it
 * was played, so the page can show a share rather than a bare count.
 */
function rewindRows(
  stats: readonly ScenarioStats[],
  records: readonly RewindRecord[],
): { familyRewinds: ProgressRewindRow[]; rewindSummary: RewindSummary } {
  const attemptsByScenario = new Map(stats.map((entry) => [entry.scenarioId, entry.attempts]))
  const rows = familyRewinds(records, attemptsByScenario).map((row) => ({
    ...row,
    scenarioTitle: titleFor(row.scenarioId),
  }))

  return { familyRewinds: rows, rewindSummary: summarizeRewinds(rows) }
}

/** Header-sized view: XP, rank, and streak without the recommendation work. */
export async function loadProgressSummary(): Promise<ProgressSummary> {
  const db = await database()
  const [history, intune] = await Promise.all([db.scores.listHistory(), loadIntuneProgress()])
  return summarizeHistory([...history, ...intune.history], Date.now())
}

/** Used by the queue to point at families the target listings ask for. */
export async function loadPracticeRecommendations(): Promise<TargetRecommendation[]> {
  return loadTargetRecommendations()
}

const SCENARIO_TITLES: Record<string, string> = {
  'PWD-01': 'Password and account access',
  'NET-01': 'Network and name resolution',
  'DHCP-01': 'DHCP scopes and addresses',
  'M365-01': 'Microsoft 365 sign-in',
  'FS-01': 'Shared drives and permissions',
  'PRN-01': 'Printing and the spooler',
  'MAIL-01': 'Mailboxes and delivery',
  'MAILSEC-01': 'Mail security and quarantine',
  'RDP-01': 'Remote desktop support',
  'DEP-01': 'Imaging and deployment',
}

function titleFor(
  scenarioId: string,
  titles: Record<string, string> = SCENARIO_TITLES,
): string {
  return titles[scenarioId] ?? scenarioId
}

/* ------------------------------------------------------------------ misc */

export function formatSimClock(clock: number): string {
  return new Date(clock).toISOString().slice(11, 16)
}

export function rubricSummary(rubric: Rubric): { items: number; totalWeight: number } {
  return {
    items: rubric.items.length,
    totalWeight: rubric.items.reduce((total, item) => total + item.weight, 0),
  }
}
