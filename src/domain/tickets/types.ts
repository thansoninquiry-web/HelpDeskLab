import type { JsonObject } from '../shared/json'

export type TicketId = string
export type SessionId = string
export type ScenarioId = string

export type TicketStatus = 'available' | 'in_progress' | 'completed'
export type SessionOutcome = 'resolved' | 'abandoned'
export type ActionKind = 'command' | 'ask-user' | 'verify-caller' | 'note'

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
