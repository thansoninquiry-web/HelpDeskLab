import type { JsonObject, JsonValue } from '../shared/json'
import type { EffectType } from '../environment/types'
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
  | { kind: 'verify-caller' }
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
  hint?: string
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
  hint?: string
  evidence: string[]
}

export interface CategoryScore {
  earned: number
  possible: number
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
}
