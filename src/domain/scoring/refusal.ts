import type { RefusalReason } from './types'

/**
 * One way a request can be refused. The words live in the domain because two
 * places need them and they must not drift: the deny control offers them, and a
 * rubric asks for one of them, so the debrief can quote the reason a ticket
 * needed beside the one the attempt filed.
 */
export interface RefusalReasonInfo {
  reason: RefusalReason
  label: string
  /** The rule the caller broke, said as the desk would say it. */
  detail: string
}

/**
 * The refusal vocabulary, in the order the deny control lists it. Every reason
 * is a thing the caller did, so a refusal records evidence rather than a
 * feeling about the call.
 */
export const REFUSAL_REASONS: readonly RefusalReasonInfo[] = [
  {
    reason: 'third-party-request',
    label: 'Asked for someone else’s account',
    detail: 'Only the account owner can authorise a reset or an unlock.',
  },
  {
    reason: 'unverified-identity',
    label: 'Could not verify who is calling',
    detail: 'No code was read back to prove the caller is the person on the ticket.',
  },
  {
    reason: 'credential-request',
    label: 'Asked for a password or a code',
    detail: 'The service desk never reads out or accepts passwords or verification codes.',
  },
  {
    reason: 'pressure',
    label: 'Used urgency to skip the checks',
    detail: 'Time pressure is a pretext, not a reason to bypass verification.',
  },
]

/** The vocabulary entry for a recorded reason, or null when it is not one of ours. */
export function refusalReasonInfo(value: string): RefusalReasonInfo | null {
  return REFUSAL_REASONS.find((entry) => entry.reason === value) ?? null
}
