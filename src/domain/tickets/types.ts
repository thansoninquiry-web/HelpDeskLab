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
  atMs: number
  kind: ActionKind
  input: JsonObject
  output: JsonObject
}

export type NewSessionAction = Omit<SessionAction, 'id' | 'seq'>
