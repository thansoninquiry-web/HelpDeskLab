import { PASS_THRESHOLD, STRONG_THRESHOLD } from '../../../domain/generator/rubric'
import type { CategoryScore, RubricCategory, ScoreBand } from '../../../domain/scoring/types'
import { verifyCase } from '../data/cases'
import {
  CHECKS,
  CHECKLIST,
  FIX_LABELS,
  isDataRiskFix,
  isDestructiveFix,
  type BenchEstate,
  type ChangeRecord,
  type ChecklistId,
  type ChecklistRecord,
  type DesktopCase,
  type RecordedCheck,
} from '../types'

/**
 * Scoring for a Desktop Support attempt.
 *
 * The split is the app's four categories, weighted for this bench: the reads
 * that isolate the fault, the checklist that keeps the user's data and the next
 * technician safe, the change and the end state, and a charge for changes made
 * without a reason. The two rules specific to this module are the request's own:
 * look before you touch, and back the data up before anything that can lose it.
 */

export interface DesktopScoreItem {
  id: string
  label: string
  category: RubricCategory
  earned: number
  possible: number
  passed: boolean
  detail: string
}

export interface DesktopScore {
  total: number
  passed: boolean
  band: ScoreBand
  categoryScores: Record<RubricCategory, CategoryScore>
  items: readonly DesktopScoreItem[]
  penalty: number
  deductions: readonly string[]
  resolved: boolean
  criticalSafety: boolean
  explanation: readonly string[]
}

export interface DesktopAttempt {
  entry: DesktopCase
  estate: BenchEstate
  checks: readonly RecordedCheck[]
  changes: readonly ChangeRecord[]
  checklist: readonly ChecklistRecord[]
}

const EVIDENCE_POINTS = 20
const SEQUENCE_POINTS = 5
const FIX_POINTS = 30
const RESOLVED_POINTS = 10
const SAFETY_POINTS = 15

const CHECKLIST_POINTS: Record<ChecklistId, number> = {
  'verify-user': 5,
  backup: 7,
  document: 4,
  'follow-up': 4,
}

const RANDOM_CHANGE_COST = 5
const DESTRUCTIVE_CHANGE_COST = 10

/** Reads taken before the first change: what the diagnosis is scored on. */
export function diagnosticChecks(attempt: DesktopAttempt): RecordedCheck[] {
  const boundary = attempt.changes[0]?.at ?? Number.MAX_SAFE_INTEGER
  return attempt.checks.filter((check) => check.at < boundary)
}

function label(id: ChecklistId): string {
  return CHECKLIST.find((item) => item.id === id)?.label ?? id
}

function tick(attempt: DesktopAttempt, id: ChecklistId): ChecklistRecord | undefined {
  return attempt.checklist.find((record) => record.id === id)
}

/** The first change that can lose data, if any, and when it happened. */
function firstDataRisk(attempt: DesktopAttempt): ChangeRecord | undefined {
  return attempt.changes.find((change) => isDataRiskFix(change.fix))
}

export function scoreDesktopAttempt(attempt: DesktopAttempt): DesktopScore {
  const { entry, estate, changes } = attempt
  const items: DesktopScoreItem[] = []
  const diagnostic = diagnosticChecks(attempt)

  const matched = entry.evidence.filter((evidence) =>
    diagnostic.some(
      (check) =>
        check.id === evidence.check && (evidence.on === undefined || evidence.on === check.on),
    ),
  )
  const evidenceEarned =
    entry.evidence.length === 0
      ? EVIDENCE_POINTS
      : Math.round((EVIDENCE_POINTS * matched.length) / entry.evidence.length)
  const missing = entry.evidence.filter((evidence) => !matched.includes(evidence))
  items.push({
    id: 'evidence',
    label: 'Read the evidence that isolates the fault',
    category: 'diagnosis',
    earned: evidenceEarned,
    possible: EVIDENCE_POINTS,
    passed: missing.length === 0,
    detail:
      missing.length === 0
        ? 'Every read the reference path uses was taken before the first change.'
        : `${matched.length} of ${entry.evidence.length} isolating reads taken. Still missing: ${missing
            .map((evidence) => CHECKS[evidence.check].label)
            .join(', ')}.`,
  })

  // Looking before touching is the bench's first rule; a change is scored as a
  // change whether or not it was right, so a lucky fix still cannot earn this.
  const firstEvent = [...attempt.checks, ...attempt.changes].sort((left, right) => left.at - right.at)[0]
  const lookedFirst =
    changes.length === 0
      ? attempt.checks.length > 0
      : firstEvent !== undefined && 'id' in firstEvent
  items.push({
    id: 'sequence',
    label: 'Look before touching the machine',
    category: 'diagnosis',
    earned: lookedFirst ? SEQUENCE_POINTS : 0,
    possible: SEQUENCE_POINTS,
    passed: lookedFirst,
    detail: lookedFirst
      ? changes.length === 0
        ? 'No change was made before a read.'
        : 'The first thing done was a read, not a change.'
      : 'A change was made before anything was read: even a correct fix was a guess.',
  })

  /* ------------------------------------------------------------ checklist */

  const verifyRecord = tick(attempt, 'verify-user')
  items.push({
    id: 'check-verify',
    label: label('verify-user'),
    category: 'documentation',
    earned: verifyRecord ? CHECKLIST_POINTS['verify-user'] : 0,
    possible: CHECKLIST_POINTS['verify-user'],
    passed: verifyRecord !== undefined,
    detail: verifyRecord
      ? 'Who was asking, and which machine, is on the record.'
      : 'The ticket does not say who the user was or how they were identified.',
  })

  const backupRecord = tick(attempt, 'backup')
  const riskChange = firstDataRisk(attempt)
  const backupInTime =
    !entry.backupRequired ||
    (backupRecord !== undefined && (!riskChange || backupRecord.at < riskChange.at))
  const backupEarned = backupInTime ? CHECKLIST_POINTS.backup : 0
  items.push({
    id: 'check-backup',
    label: label('backup'),
    category: 'documentation',
    earned: backupEarned,
    possible: CHECKLIST_POINTS.backup,
    passed: backupEarned === CHECKLIST_POINTS.backup,
    detail: !entry.backupRequired
      ? 'No change in this case can lose the user’s data, so this step is not scored against it.'
      : backupRecord === undefined
        ? 'No backup was recorded, and this case can lose data.'
        : riskChange && backupRecord.at >= riskChange.at
          ? `The backup was taken after ${FIX_LABELS[riskChange.fix]}, which had already put the data at risk.`
          : 'The data was copied before anything that could lose it.',
  })

  const documentRecord = tick(attempt, 'document')
  const note = documentRecord?.note?.trim() ?? ''
  const noteOk = note.length >= 12
  items.push({
    id: 'check-document',
    label: label('document'),
    category: 'documentation',
    earned: noteOk ? CHECKLIST_POINTS.document : 0,
    possible: CHECKLIST_POINTS.document,
    passed: noteOk,
    detail: noteOk
      ? 'The note names what was found and what was done.'
      : documentRecord === undefined
        ? 'Nothing was written down for the next person.'
        : 'The note is too short to be useful: it needs the symptom, the evidence and the change.',
  })

  const followRecord = tick(attempt, 'follow-up')
  items.push({
    id: 'check-follow-up',
    label: label('follow-up'),
    category: 'documentation',
    earned: followRecord ? CHECKLIST_POINTS['follow-up'] : 0,
    possible: CHECKLIST_POINTS['follow-up'],
    passed: followRecord !== undefined,
    detail: followRecord
      ? 'The machine or the user is booked to be checked again.'
      : 'Nobody has said when this machine will be looked at again.',
  })

  /* ----------------------------------------------------------- resolution */

  const expected = entry.expectedFix
  const perFix = expected.length > 0 ? FIX_POINTS / expected.length : 0
  const remaining = changes.map((change) => change.fix).filter((fix) => expected.includes(fix))
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
          ? 'The case is not resolved until this change is made.'
          : inOrder
            ? 'Done in the order the reference path takes it.'
            : 'Done, but out of order: the step before it is what makes it hold.',
    })
  })

  const resolved = verifyCase(entry, estate)
  items.push({
    id: 'resolved',
    label: 'The machine is actually working',
    category: 'resolution',
    earned: resolved ? RESOLVED_POINTS : 0,
    possible: RESOLVED_POINTS,
    passed: resolved,
    detail: resolved ? entry.verifyText : `${entry.verifyText} The machine does not agree yet.`,
  })

  /* ---------------------------------------------------------------- safety */

  const random = changes.map((change) => change.fix).filter((fix) => !expected.includes(fix))
  const penalty = random.reduce(
    (total, fix) => total + (isDestructiveFix(fix) ? DESTRUCTIVE_CHANGE_COST : RANDOM_CHANGE_COST),
    0,
  )
  const deductions = random.map(
    (fix) =>
      `${FIX_LABELS[fix]} was not needed for this case: −${
        isDestructiveFix(fix) ? DESTRUCTIVE_CHANGE_COST : RANDOM_CHANGE_COST
      }.`,
  )
  const destructive = random.some(isDestructiveFix)
  const dataRiskWithoutBackup =
    entry.backupRequired &&
    riskChange !== undefined &&
    (backupRecord === undefined || backupRecord.at >= riskChange.at)
  const criticalSafety = destructive || dataRiskWithoutBackup

  items.push({
    id: 'safety',
    label: 'No change without a reason',
    category: 'safety',
    earned: Math.max(0, SAFETY_POINTS - penalty),
    possible: SAFETY_POINTS,
    passed: penalty === 0 && !dataRiskWithoutBackup,
    detail:
      penalty === 0 && !dataRiskWithoutBackup
        ? 'Every change made was one the case called for.'
        : dataRiskWithoutBackup
          ? 'Data was put at risk before it was backed up.'
          : `${random.length} change${random.length === 1 ? '' : 's'} not needed for this case.`,
  })

  const categoryScores: Record<RubricCategory, CategoryScore> = {
    diagnosis: { earned: 0, possible: 0 },
    documentation: { earned: 0, possible: 0 },
    resolution: { earned: 0, possible: 0 },
    safety: { earned: 0, possible: 0 },
  }
  for (const item of items) {
    categoryScores[item.category].possible += item.possible
    categoryScores[item.category].earned += item.earned
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
      ...entry.explanation,
      ...(dataRiskWithoutBackup
        ? [
            'The data was put at risk before it was backed up, so this attempt cannot pass however the machine ends up.',
          ]
        : []),
      ...(destructive
        ? [
            'A change that takes something away was made for a case that did not ask for it, so this attempt cannot pass.',
          ]
        : []),
      ...deductions,
    ],
  }
}
