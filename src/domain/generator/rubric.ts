import type { EffectType, VerificationMethod } from '../environment/types'
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
    code: 'denied-social-engineering',
    label: 'Denied (social engineering) — reported to Security',
    outcome: 'escalated',
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

/** A refusal the learner actually recorded, not a note that mentions refusing. */
export const denyCaller = (): CheckSpec => ({ kind: 'deny-caller' })

/**
 * The handoff note is scored on its content, not its length: the next person
 * needs the report, the evidence, and the next action, in any words.
 */
export const handoffNote = (): CheckSpec => ({
  kind: 'note-covers',
  noteKind: 'resolution',
  minLength: 40,
  parts: [
    {
      id: 'reported',
      label: 'what the user reported',
      any: ['report', 'said', 'says', 'states', 'complains', 'denied access', 'cannot', "can't", 'unable to', 'error'],
    },
    {
      id: 'checked',
      label: 'what you checked',
      any: [
        'checked',
        'checking',
        'confirmed',
        'verified',
        'reviewed',
        'tested',
        'ran ',
        'looked',
        'inspected',
        'ipconfig',
        'nslookup',
        'get-account',
        'get-signin-log',
        'get-share-access',
        'get-dhcp-scope',
        'scope',
        'sign-in log',
        'share access',
      ],
    },
    {
      id: 'next',
      label: 'what the next team should do',
      any: [
        'next',
        'tier 2',
        'tier2',
        'escalat',
        'network team',
        'identity team',
        'data owner',
        'owner',
        'follow up',
        'follow-up',
        'should',
        'needs to',
        'will need',
        'handoff',
      ],
    },
  ],
})

export const ask = (intent?: string): CheckSpec => ({ kind: 'ask', intent })

export const decision = (outcome: DecisionOutcome, codes?: readonly string[]): CheckSpec => ({
  kind: 'decision',
  outcome,
  codes: codes ? [...codes] : undefined,
})
