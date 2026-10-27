import { PASS_THRESHOLD, STRONG_THRESHOLD } from '../../../domain/generator/rubric'
import type { CategoryScore, RubricCategory, ScoreBand } from '../../../domain/scoring/types'
import {
  CHECKS,
  FIX_LABELS,
  isDestructiveFix,
  layerOf,
  type ChangeRecord,
  type CheckId,
  type Incident,
  type LabEstate,
  type RecordedCheck,
} from '../types'

/**
 * Scoring for a Networking Lab attempt.
 *
 * The app's scorer reads a command log against a simulated machine; this module
 * has its own estate, so it rebuilds the same shape: the app's thresholds and
 * band names, a split by rubric category, and a safety rule that can fail an
 * attempt on its own. What is specific to the lab is the two things the request
 * asked for: evidence of the layer before the change, and a charge for changes
 * that were guesses.
 */

export interface NetlabScoreItem {
  id: string
  label: string
  category: RubricCategory
  earned: number
  possible: number
  passed: boolean
  detail: string
}

export interface NetlabScore {
  total: number
  passed: boolean
  band: ScoreBand
  categoryScores: Record<RubricCategory, CategoryScore>
  items: readonly NetlabScoreItem[]
  penalty: number
  deductions: readonly string[]
  resolved: boolean
  /** True when a change took something away that the incident did not need. */
  criticalSafety: boolean
  explanation: readonly string[]
}

export interface NetlabAttempt {
  incident: Incident
  estate: LabEstate
  checks: readonly RecordedCheck[]
  changes: readonly ChangeRecord[]
}

// Diagnosis carries more than a third of the marks on purpose: a lucky fix with
// no reads scores 65, so guessing the right change cannot pass an incident.
const EVIDENCE_POINTS = 15
const ORDER_POINTS = 15
const SCOPE_POINTS = 5
const FIX_POINTS = 35
const RESOLVED_POINTS = 20
const SAFETY_POINTS = 10

const RANDOM_CHANGE_COST = 5
const DESTRUCTIVE_CHANGE_COST = 10

/**
 * The checks that count as diagnosis: everything read before the first change.
 *
 * A read after a fix is still a read — it is how a learner confirms a change —
 * but it is not the reasoning the diagnosis is scored on, because by then the
 * decision had been made.
 */
export function diagnosticChecks(attempt: NetlabAttempt): RecordedCheck[] {
  const boundary = attempt.changes[0]?.at ?? Number.MAX_SAFE_INTEGER
  return attempt.checks.filter((check) => check.at < boundary)
}

function label(id: CheckId): string {
  return CHECKS[id].label
}

export function scoreNetlabAttempt(attempt: NetlabAttempt): NetlabScore {
  const { incident, estate, changes } = attempt
  const items: NetlabScoreItem[] = []
  const diagnostic = diagnosticChecks(attempt)

  const matchedEvidence = incident.evidence.filter((evidence) =>
    diagnostic.some(
      (check) =>
        check.id === evidence.id &&
        (evidence.deviceId === undefined || evidence.deviceId === check.deviceId),
    ),
  )
  const evidenceEarned =
    incident.evidence.length === 0
      ? EVIDENCE_POINTS
      : Math.round((EVIDENCE_POINTS * matchedEvidence.length) / incident.evidence.length)
  const missing = incident.evidence.filter((evidence) => !matchedEvidence.includes(evidence))

  items.push({
    id: 'evidence',
    label: 'Read the evidence that isolates this fault',
    category: 'diagnosis',
    earned: evidenceEarned,
    possible: EVIDENCE_POINTS,
    passed: missing.length === 0,
    detail:
      missing.length === 0
        ? 'Every read the reference path uses was taken before the first change.'
        : `${matchedEvidence.length} of ${incident.evidence.length} isolating reads taken. Still missing: ${missing
            .map((evidence) => label(evidence.id))
            .join(', ')}.`,
  })

  const firstCheck = diagnostic[0] ?? null
  const anyAtOrBelow = diagnostic.some((check) => layerOf(check.id) <= incident.faultLayer)
  const startsAtOrBelow = firstCheck !== null && layerOf(firstCheck.id) <= incident.faultLayer
  const orderEarned = startsAtOrBelow ? ORDER_POINTS : anyAtOrBelow ? ORDER_POINTS / 2 : 0

  items.push({
    id: 'layer-order',
    label: 'Isolate the layer before changing anything',
    category: 'diagnosis',
    earned: orderEarned,
    possible: ORDER_POINTS,
    passed: startsAtOrBelow,
    detail: startsAtOrBelow
      ? `The first read was at layer ${layerOf(firstCheck.id)}, at or below the fault's layer ${incident.faultLayer}.`
      : anyAtOrBelow
        ? `A read reached layer ${incident.faultLayer} eventually, but the first look was above it.`
        : `No read got down to layer ${incident.faultLayer} before the changes: the fix was a guess even if it worked.`,
  })

  // A neighbour table or a shared table reads beyond the machine it was run on,
  // so it establishes the blast radius even when the console is pointed at the
  // affected device.
  const scopeReads: readonly CheckId[] = [
    'arp',
    'vlan',
    'trunk',
    'mac-table',
    'dhcp-pool',
    'wan-status',
  ]
  const scope = diagnostic.some(
    (check) => check.deviceId !== incident.subjectId || scopeReads.includes(check.id),
  )
  items.push({
    id: 'scope',
    label: 'Establish how far the fault reaches',
    category: 'diagnosis',
    earned: scope ? SCOPE_POINTS : 0,
    possible: SCOPE_POINTS,
    passed: scope,
    detail: scope
      ? 'A second device or the shared equipment was read, so the blast radius is known rather than assumed.'
      : `Every read was of ${incident.subjectId} itself: nothing established whether the room or the site was affected.`,
  })

  const expected = incident.expectedFix
  const perFix = expected.length > 0 ? FIX_POINTS / expected.length : 0
  // Only the changes that belong to the path are walked, so a wrong change does
  // not also cost resolution credit for knocking the order out.
  const remaining = changes
    .map((change) => change.fix)
    .filter((fix) => expected.includes(fix))
  expected.forEach((fix, index) => {
    const position = remaining.indexOf(fix)
    const inOrder = position === 0
    if (position >= 0) {
      remaining.splice(position, 1)
    }
    const earned = position < 0 ? 0 : inOrder ? perFix : perFix / 2
    items.push({
      id: `fix-${index}-${fix}`,
      label: FIX_LABELS[fix],
      category: 'resolution',
      earned,
      possible: perFix,
      passed: position >= 0,
      detail:
        position < 0
          ? 'The incident is not resolved until this change is made.'
          : inOrder
            ? 'Done in the order the reference path takes it.'
            : 'Done, but out of order: the step before it is what makes it hold.',
    })
  })

  const resolved = incident.verify(estate)
  items.push({
    id: 'resolved',
    label: 'The incident is actually resolved',
    category: 'resolution',
    earned: resolved ? RESOLVED_POINTS : 0,
    possible: RESOLVED_POINTS,
    passed: resolved,
    detail: resolved
      ? incident.verifyText
      : `${incident.verifyText} The estate does not agree yet.`,
  })

  const randomChanges = changes
    .map((change) => change.fix)
    .filter((fix) => !expected.includes(fix))
  const penalty = randomChanges.reduce(
    (total, fix) => total + (isDestructiveFix(fix) ? DESTRUCTIVE_CHANGE_COST : RANDOM_CHANGE_COST),
    0,
  )
  const criticalSafety = randomChanges.some(isDestructiveFix)
  const deductions = randomChanges.map(
    (fix) =>
      `${FIX_LABELS[fix]} was not needed for this incident: −${
        isDestructiveFix(fix) ? DESTRUCTIVE_CHANGE_COST : RANDOM_CHANGE_COST
      }.`,
  )
  const safetyEarned = Math.max(0, SAFETY_POINTS - penalty)

  items.push({
    id: 'safety',
    label: 'No change without a reason',
    category: 'safety',
    earned: safetyEarned,
    possible: SAFETY_POINTS,
    passed: penalty === 0,
    detail:
      penalty === 0
        ? 'Every change made was one the incident called for.'
        : `${randomChanges.length} change${randomChanges.length === 1 ? '' : 's'} not needed for this incident.`,
  })

  const categoryScores: Record<RubricCategory, CategoryScore> = {
    diagnosis: { earned: 0, possible: 0 },
    documentation: { earned: 0, possible: 0 },
    resolution: { earned: 0, possible: 0 },
    safety: { earned: 0, possible: 0 },
  }
  for (const item of items) {
    const category = categoryScores[item.category]
    category.possible += item.possible
    category.earned += item.earned
  }

  const raw = items.reduce((sum, item) => sum + item.earned, 0)
  const total = Math.max(0, Math.min(100, Math.round(raw)))
  const band: ScoreBand =
    total >= STRONG_THRESHOLD ? 'strong' : total >= PASS_THRESHOLD ? 'pass' : 'fail'

  return {
    total,
    passed: total >= PASS_THRESHOLD && !criticalSafety,
    band,
    categoryScores,
    items,
    penalty,
    deductions,
    resolved,
    criticalSafety,
    explanation: [
      ...incident.explanation,
      ...(criticalSafety
        ? [
            'A change that took something away was made for an incident that did not ask for it, so this attempt cannot pass.',
          ]
        : []),
      ...deductions,
    ],
  }
}
