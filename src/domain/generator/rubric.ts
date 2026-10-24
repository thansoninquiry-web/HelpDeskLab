import type { EffectType, VerificationMethod } from '../environment/types'
import { HANDOFF_NOTE_MIN_LENGTH, HANDOFF_NOTE_PARTS } from '../scoring/noteCoverage'
import type {
  CheckSpec,
  DecisionOutcome,
  RefusalReason,
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
  /**
   * The close a refusal takes: the desk's decision was to refuse the request, so
   * the paperwork is a report to Security rather than a fix or a hand-off. The
   * outcome stays `escalated` — a refusal is handed on, not resolved — so the
   * scorer's own rule and the close form agree about what happened.
   */
  refusal?: boolean
}

export const CLOSURE_CODES: readonly ClosureCode[] = [
  { code: 'resolved-remote', label: 'Resolved remotely', outcome: 'resolved' },
  { code: 'resolved-user-guidance', label: 'Resolved with user guidance', outcome: 'resolved' },
  { code: 'escalated-tier2', label: 'Escalated to Tier 2', outcome: 'escalated' },
  { code: 'escalated-identity', label: 'Escalated to the Identity team', outcome: 'escalated' },
  {
    code: 'denied-social-engineering',
    label: 'Denied (social engineering) — reported to Security',
    outcome: 'escalated',
    refusal: true,
  },
  {
    code: 'escalated-field-services',
    label: 'Escalated to Field Services',
    outcome: 'escalated',
  },
]

export function closureCodesFor(outcome: DecisionOutcome): ClosureCode[] {
  return CLOSURE_CODES.filter((entry) => entry.outcome === outcome)
}

/**
 * The codes a refused ticket closes under, in the order the form lists them.
 * Read from the catalogue rather than named by the interface, so the close a
 * refusal opens on and the disposition the scorer accepts come from one entry.
 */
export function refusalClosureCodes(): ClosureCode[] {
  return CLOSURE_CODES.filter((entry) => entry.refusal === true)
}

export interface ItemInput {
  id: string
  label: string
  why: string
  category: RubricCategory
  weight: number
  critical?: boolean
  checks: CheckSpec[]
  /** At least two, so a second nudge is available when the first is not enough. */
  hints: readonly [string, string, ...string[]]
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
    hints: [...input.hints],
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

export const verifyCaller = (method?: VerificationMethod): CheckSpec => ({
  kind: 'verify-caller',
  method,
})

/**
 * A refusal the learner actually recorded, not a note that mentions refusing.
 * Naming a reason makes the reason part of the check: a request refused as a
 * credential request is not the same decision as one refused for an unproven
 * caller, and a ticket can now say which one it needed.
 */
export const denyCaller = (reason?: RefusalReason): CheckSpec =>
  reason ? { kind: 'deny-caller', reason } : { kind: 'deny-caller' }

/**
 * The handoff note is scored on its content, not its length: the next person
 * needs the report, the evidence, and the next action, in any words.
 */
export const handoffNote = (): CheckSpec => ({
  kind: 'note-covers',
  noteKind: 'resolution',
  minLength: HANDOFF_NOTE_MIN_LENGTH,
  // The parts live beside the matcher in `scoring/noteCoverage.ts`, where a
  // refusal's own report is read against the same vocabulary.
  parts: HANDOFF_NOTE_PARTS,
})

export const ask = (intent?: string): CheckSpec => ({ kind: 'ask', intent })

export const decision = (outcome: DecisionOutcome, codes?: readonly string[]): CheckSpec => ({
  kind: 'decision',
  outcome,
  codes: codes ? [...codes] : undefined,
})
