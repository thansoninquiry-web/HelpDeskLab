import type { EffectType } from '../environment/types'
import type {
  CheckSpec,
  DecisionOutcome,
  Rubric,
  RubricCategory,
  RubricItem,
} from '../scoring/types'

export const PASS_THRESHOLD = 75
export const STRONG_THRESHOLD = 90

export interface ClosureCode {
  code: string
  label: string
  outcome: DecisionOutcome
}

export const CLOSURE_CODES: readonly ClosureCode[] = [
  { code: 'resolved-remote', label: 'Resolved remotely', outcome: 'resolved' },
  { code: 'resolved-user-guidance', label: 'Resolved with user guidance', outcome: 'resolved' },
  { code: 'escalated-tier2', label: 'Escalated to Tier 2', outcome: 'escalated' },
  { code: 'escalated-identity', label: 'Escalated to the Identity team', outcome: 'escalated' },
  {
    code: 'escalated-field-services',
    label: 'Escalated to Field Services',
    outcome: 'escalated',
  },
]

export function closureCodesFor(outcome: DecisionOutcome): ClosureCode[] {
  return CLOSURE_CODES.filter((entry) => entry.outcome === outcome)
}

export interface ItemInput {
  id: string
  label: string
  why: string
  category: RubricCategory
  weight: number
  critical?: boolean
  checks: CheckSpec[]
  hint?: string
}

export function makeItem(input: ItemInput): RubricItem {
  return {
    id: input.id,
    label: input.label,
    why: input.why,
    category: input.category,
    weight: input.weight,
    critical: input.critical ?? false,
    checks: input.checks,
    hint: input.hint,
  }
}

export function makeRubric(
  scenarioId: string,
  variantId: string,
  items: RubricItem[],
): Rubric {
  return {
    scenarioId,
    variantId,
    items,
    passThreshold: PASS_THRESHOLD,
    strongThreshold: STRONG_THRESHOLD,
  }
}

export const ran = (command: string, argsInclude?: string): CheckSpec => ({
  kind: 'ran',
  command,
  argsInclude,
})

export const effect = (effectType: EffectType, target?: string): CheckSpec => ({
  kind: 'effect',
  effect: effectType,
  target,
})

export const ordered = (...of: CheckSpec[]): CheckSpec => ({ kind: 'ordered', of })

export const absent = (of: CheckSpec): CheckSpec => ({ kind: 'absent', of })

export const note = (
  noteKind: 'troubleshooting' | 'customer' | 'resolution',
  minLength = 20,
): CheckSpec => ({ kind: 'note', noteKind, minLength })

export const verifyCaller = (): CheckSpec => ({ kind: 'verify-caller' })

export const ask = (intent?: string): CheckSpec => ({ kind: 'ask', intent })

export const decision = (outcome: DecisionOutcome, codes?: readonly string[]): CheckSpec => ({
  kind: 'decision',
  outcome,
  codes: codes ? [...codes] : undefined,
})
