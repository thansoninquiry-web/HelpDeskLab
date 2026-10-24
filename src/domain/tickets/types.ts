import type { JsonObject } from '../shared/json'

export type TicketId = string
export type SessionId = string
export type ScenarioId = string

export type TicketStatus = 'available' | 'in_progress' | 'completed'
export type SessionOutcome = 'resolved' | 'abandoned'
export const ACTION_KINDS = [
  'command',
  'ask-user',
  'verify-caller',
  'deny-caller',
  'note',
  'hint',
  /**
   * A verification code went out. It changes the world without being a proof,
   * so it is recorded apart from `verify-caller` — and it is what lets the log
   * be folded back into the world, sends being the one change a command cannot
   * account for.
   */
  'code-sent',
  /**
   * A cut in the log: the steps after it were un-run. The marker holds how many
   * went and the steps themselves, so an accidental cut can be put back and an
   * attempt that edited its own history still reads honestly.
   */
  'rewind',
  /**
   * The desk opened a tool console or read one of its records. It changes no
   * machine and issues no command, but it is the learner acting on the call: the
   * caller can react to being looked up, and the stall clock restarts on it. The
   * row is evidence only — it is never a step of the rubric, and a cut can still
   * be put back after one, because it changes nothing in the world.
   */
  'console-read',
] as const

export type ActionKind = (typeof ACTION_KINDS)[number]

/**
 * Generated ticket content. Public content is safe to render to the learner;
 * hidden world state lives on the session.
 */
export interface Ticket {
  id: TicketId
  scenarioId: ScenarioId
  variantId: string
  difficulty: 1 | 2 | 3
  seed: number
  signature: string
  publicContent: JsonObject
  createdAt: number
  status: TicketStatus
}

export interface Session {
  id: SessionId
  ticketId: TicketId
  startedAt: number
  endedAt: number | null
  /** Simulated world, including hidden truth. Never passed to UI components. */
  world: JsonObject
  /**
   * The hint price pinned when this attempt started. Null on rows written before
   * the setting existed, which are read back as the standard price.
   */
  hintPolicy: JsonObject | null
  /**
   * The close the learner was writing when the session was last saved: the
   * chosen code and the handoff note. Null once the session closes, so a
   * reopened attempt never inherits a decision it already committed.
   */
  closureDraft: JsonObject | null
  /**
   * Where the learner was working inside the ticket: the pane in front, the
   * console showing, and the tabs open beside it. Null on rows written before
   * the layout existed, and cleared when the session closes, because a finished
   * ticket has no workspace left to reopen.
   */
  workspaceLayout: JsonObject | null
  /**
   * Where the learner was inside each console: the search typed there and the
   * record left open, keyed by console id. Null on rows written before the focus
   * existed, and cleared when the session closes, like the layout beside it.
   */
  consoleFocus: JsonObject | null
  /**
   * True when the attempt was sat as an exam: hints stay closed for its whole
   * lifetime, whatever the setting says afterwards.
   */
  examMode: boolean
  resolution: string | null
  outcome: SessionOutcome | null
}

export interface SessionAction {
  id: number
  sessionId: SessionId
  seq: number
  /**
   * Where the step sits on the call's own clock, which only moves when a command
   * runs. It is what the timeline prints, and it cannot say how long the desk has
   * been quiet: an idle minute does not move it.
   */
  atMs: number
  /**
   * When the step was appended, in wall-clock milliseconds — the other clock a
   * step keeps. The caller's stall ladder is measured from the learner's last
   * step in real time, which `atMs` cannot answer. The repository stamps it, so
   * a caller writes no timestamp of its own, and it is null on rows written
   * before the column existed.
   */
  wallMs: number | null
  kind: ActionKind
  input: JsonObject
  output: JsonObject
}

export type NewSessionAction = Omit<SessionAction, 'id' | 'seq' | 'wallMs'>
