import type { JsonObject, JsonValue } from '../shared/json'
import type { EffectType, VerificationMethod } from '../environment/types'
import type { TopologyView } from '../environment/topology'
import type { HintPolicy } from './policy'
import type { SessionId } from '../tickets/types'

export type ScoreBand = 'fail' | 'pass' | 'strong'

export interface Score {
  sessionId: SessionId
  total: number
  passed: boolean
  band: ScoreBand
  rubric: JsonObject
  computedAt: number
}

export type RubricCategory = 'diagnosis' | 'documentation' | 'resolution' | 'safety'

export type DecisionOutcome = 'resolved' | 'escalated'

export interface SessionDecision {
  outcome: DecisionOutcome
  code: string
  note: string
}

export interface NoteCoveragePart {
  id: string
  /** Shown in the debrief, for example "what the next team should do". */
  label: string
  /** Any one of these case-insensitive fragments satisfies the part. */
  any: readonly string[]
}

export type CheckSpec =
  | { kind: 'ran'; command: string; argsInclude?: string }
  | { kind: 'effect'; effect: EffectType; target?: string }
  | { kind: 'verify-caller'; method?: VerificationMethod }
  | { kind: 'deny-caller' }
  | { kind: 'ask'; intent?: string }
  | { kind: 'note'; noteKind: 'troubleshooting' | 'customer' | 'resolution'; minLength?: number }
  | {
      kind: 'note-covers'
      noteKind: 'troubleshooting' | 'customer' | 'resolution'
      parts: readonly NoteCoveragePart[]
      minLength?: number
    }
  | { kind: 'ordered'; of: CheckSpec[] }
  | { kind: 'absent'; of: CheckSpec }
  | { kind: 'decision'; outcome: DecisionOutcome; codes?: string[] }
  | { kind: 'world'; path: string; equals: JsonValue }

export interface RubricItem {
  id: string
  label: string
  why: string
  category: RubricCategory
  weight: number
  critical: boolean
  checks: CheckSpec[]
  /** At least two, from the gentlest nudge to the most explicit next step. */
  hints: readonly string[]
}

export interface Rubric {
  scenarioId: string
  variantId: string
  items: RubricItem[]
  passThreshold: number
  strongThreshold: number
}

export interface RubricItemResult {
  id: string
  label: string
  category: RubricCategory
  weight: number
  critical: boolean
  passed: boolean
  why: string
  hints: readonly string[]
  /** Learner-facing findings: what the attempt did, in plain sentences. */
  evidence: string[]
  /** The unanswered findings, kept apart so feedback never parses display text. */
  gaps?: string[]
}

export interface CategoryScore {
  earned: number
  possible: number
}

/** A link on the Server Room map that was not proved before the ticket closed. */
export interface TopologyLinkReport {
  label: string
  command: string
}

/**
 * What the network map showed when the ticket closed. The bonus is paid only
 * when every link was proved; otherwise the debrief names what was missed.
 */
export interface TopologyCoverage {
  totalLinks: number
  provedLinks: number
  bonusXp: number
  untested: TopologyLinkReport[]
  failed: TopologyLinkReport[]
}

/**
 * A process mistake priced independently of the end state. The learner can
 * reach the right outcome and still pay for how they got there.
 */
export interface ProcedureViolation {
  id:
    | 'unverified-change'
    | 'fix-before-evidence'
    | 'callback-instead-of-code'
    | 'weaker-verification'
  label: string
  detail: string
  points: number
  category: RubricCategory
}

export interface EvaluationResult {
  total: number
  passed: boolean
  band: ScoreBand
  categoryScores: Record<RubricCategory, CategoryScore>
  items: RubricItemResult[]
  criticalFailures: string[]
  feedback: string[]
  xp: number
  /** How many hints the learner revealed. */
  hintsUsed: number
  /** Points deducted from diagnostic reasoning for those hints. */
  hintPenalty: number
  /** The price this attempt was scored under, kept so the debrief can re-price. */
  hintPolicy: HintPolicy
  /** Process mistakes found in the action log, in the order they are priced. */
  violations: ProcedureViolation[]
  /** Points deducted for those violations. */
  procedurePenalty: number
  /** Present only on network tickets; null when the map does not apply. */
  topology: TopologyCoverage | null
  /**
   * The map itself as it stood when the ticket closed, kept whole so the debrief
   * can redraw the picture rather than only count it: every link with the state
   * the log left it in, and the line that settled it.
   */
  topologyMap: TopologyView | null
}
