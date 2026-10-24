import type { VerificationMethod } from '../environment/types'
import type { VerificationCheckRecord } from './types'

/**
 * How a learner proves who is on the call.
 *
 * Every check the identity panel records says which method it used, so the log
 * answers a question no score does: which proof this desk reaches for, and
 * whether it actually proved the person. A callback that a colleague answers is
 * a check that happened and proved somebody else, so it counts here as used and
 * not proved — the same reading the scorer takes.
 *
 * Nothing is stored: the summary is rebuilt from the action log each time it is
 * read, so it follows a retry, a rewind, or an older attempt with no migration.
 */

/**
 * The methods in the order the desk offers them: the two that reach a remote
 * caller first, then the three that need the person in front of the desk.
 */
export const VERIFICATION_METHODS: readonly VerificationMethod[] = [
  'verification-code',
  'callback',
  'badge-scan',
  'letter-pin',
  'in-person',
]

/** The methods in the learner's words, so the page never prints a method id. */
export const VERIFICATION_METHOD_LABELS: Record<VerificationMethod, string> = {
  'verification-code': 'Code read-back',
  callback: 'Callback',
  'badge-scan': 'Badge at the desk',
  'letter-pin': 'Letter PIN',
  'in-person': 'Photo ID at the desk',
}

export interface VerificationMethodRow {
  method: VerificationMethod
  label: string
  /** Checks logged with this method, across every attempt. */
  checks: number
  /** Of those, the checks that proved the person on the ticket. */
  proved: number
  /** Checks that did not prove them: a failed read-back, a colleague, no answer. */
  failed: number
  /** Attempts at least one of these checks came from. */
  attempts: number
  /** Share of this method's checks that proved the caller, 0–100, rounded. */
  provedPercent: number
}

export interface VerificationSummary {
  /** One row per method the learner has actually used, most used first. */
  rows: VerificationMethodRow[]
  /** Every caller check in the logs. */
  checks: number
  proved: number
  /** Attempts with at least one caller check in their log. */
  attempts: number
  /** Share of all checks that proved the caller, 0–100, rounded. */
  provedPercent: number
}

function percent(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 100)
}

/**
 * One row per method the logs used. Attempts are counted per method, because a
 * learner who tried a code, failed, and then rang back made one attempt and two
 * choices; the headline `attempts` stays the distinct attempts either way.
 */
export function summarizeVerificationChecks(
  checks: readonly VerificationCheckRecord[],
): VerificationSummary {
  interface Group {
    method: VerificationMethod
    checks: number
    proved: number
    sessions: Set<string>
  }

  const groups = new Map<VerificationMethod, Group>()
  const sessions = new Set<string>()

  for (const check of checks) {
    sessions.add(check.sessionId)
    const group = groups.get(check.method) ?? {
      method: check.method,
      checks: 0,
      proved: 0,
      sessions: new Set<string>(),
    }
    group.checks += 1
    group.sessions.add(check.sessionId)
    if (check.proved) {
      group.proved += 1
    }
    groups.set(check.method, group)
  }

  const order = (method: VerificationMethod) => VERIFICATION_METHODS.indexOf(method)
  const rows: VerificationMethodRow[] = [...groups.values()]
    .map((group) => ({
      method: group.method,
      label: VERIFICATION_METHOD_LABELS[group.method],
      checks: group.checks,
      proved: group.proved,
      failed: group.checks - group.proved,
      attempts: group.sessions.size,
      provedPercent: percent(group.proved, group.checks),
    }))
    // Most used first: the question is which proof this desk reaches for. Ties
    // fall back to the order the desk offers the methods in, so the list is
    // stable between reads.
    .sort((left, right) => right.checks - left.checks || order(left.method) - order(right.method))

  const totalChecks = rows.reduce((sum, row) => sum + row.checks, 0)
  const proved = rows.reduce((sum, row) => sum + row.proved, 0)

  return {
    rows,
    checks: totalChecks,
    proved,
    attempts: sessions.size,
    provedPercent: percent(proved, totalChecks),
  }
}
