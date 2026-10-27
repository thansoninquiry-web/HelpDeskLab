import { PASS_THRESHOLD, STRONG_THRESHOLD } from '../../../domain/generator/rubric'
import type { CategoryScore, RubricCategory, ScoreBand } from '../../../domain/scoring/types'
import { CHANGES, isHarmful } from '../data/catalog'
import {
  WALK_UP_AFTER,
  type AttemptState,
  type ChangeRecord,
  type ChecklistId,
  type SchoolScenario,
} from '../types'
import { closureMinute, lateness, urgencyPoints } from './clock'

/**
 * Scoring an Education IT scenario.
 *
 * Four categories, weighted for a school: the reads that isolate the fault, the
 * conversation and the note the teacher is left with, the change that fixes the
 * room before the bell, and the safety of the visit. Three rules are this pack's
 * own: read before you touch, talk to the caller like a person, and never take a
 * change that makes the school less safe to save five minutes.
 */

export interface AcademyScoreItem {
  id: string
  label: string
  category: RubricCategory
  earned: number
  possible: number
  passed: boolean
  detail: string
}

export interface AcademyScore {
  total: number
  passed: boolean
  band: ScoreBand
  categoryScores: Record<RubricCategory, CategoryScore>
  items: readonly AcademyScoreItem[]
  penalty: number
  deductions: readonly string[]
  resolved: boolean
  criticalSafety: boolean
  closedMinute: number
  minutesLate: number
  explanation: readonly string[]
}

export interface AcademyAttempt {
  scenario: SchoolScenario
  state: AttemptState
}

const EVIDENCE_POINTS = 14
const SEQUENCE_POINTS = 6
const COMMUNICATION_POINTS = 10
const NOTE_POINTS = 6
const FOLLOW_UP_POINTS = 4
const FIX_POINTS = 28
const RESOLVED_POINTS = 10
const URGENCY_POINTS = 10
const KIT_POINTS = 2
const SAFETY_POINTS = 2
const TRIAGE_POINTS = 4
const NO_HARM_POINTS = 4

const RANDOM_CHANGE_COST = 3
const HARMFUL_CHANGE_COST = 8

const CATEGORY_NAMES: Record<RubricCategory, string> = {
  diagnosis: 'diagnosis',
  documentation: 'communication and notes',
  resolution: 'resolution',
  safety: 'safety',
}

export function decisiveReads(state: AttemptState): readonly string[] {
  const boundary = state.changes[0]?.at ?? Number.MAX_SAFE_INTEGER
  return state.reads.filter((record) => record.at < boundary).map((record) => record.id)
}

function checklist(state: AttemptState, id: ChecklistId) {
  return state.checklist.find((record) => record.id === id)
}

function latestDialog(state: AttemptState, nodeId: string) {
  return [...state.dialog].reverse().find((record) => record.nodeId === nodeId)
}

export function isResolved(scenario: SchoolScenario, state: AttemptState): boolean {
  return scenario.expected.every((change) => state.changes.some((record) => record.id === change))
}

export function scoreAcademyAttempt(attempt: AcademyAttempt): AcademyScore {
  const { scenario, state } = attempt
  const items: AcademyScoreItem[] = []

  /* -------------------------------------------------------------- diagnosis */

  const read = decisiveReads(state)
  const decisive = scenario.reads.filter((entry) => entry.decisive === true)
  const matched = decisive.filter((entry) => read.includes(entry.id))
  const evidenceEarned =
    decisive.length === 0
      ? EVIDENCE_POINTS
      : Math.round((EVIDENCE_POINTS * matched.length) / decisive.length)
  const missing = decisive.filter((entry) => !matched.includes(entry))
  items.push({
    id: 'evidence',
    label: 'Read the evidence that isolates it',
    category: 'diagnosis',
    earned: evidenceEarned,
    possible: EVIDENCE_POINTS,
    passed: missing.length === 0,
    detail:
      missing.length === 0
        ? 'Every read the reference path uses was taken before the first change.'
        : `${matched.length} of ${decisive.length} isolating reads taken before the first change.`,
  })

  const firstEvent = [...state.reads, ...state.changes].sort((left, right) => left.at - right.at)[0]
  const lookedFirstProper =
    state.changes.length === 0
      ? state.reads.length > 0
      : firstEvent !== undefined && state.reads.some((record) => record.at === firstEvent.at)
  items.push({
    id: 'sequence',
    label: 'Isolate the layer before changing anything',
    category: 'diagnosis',
    earned: lookedFirstProper ? SEQUENCE_POINTS : 0,
    possible: SEQUENCE_POINTS,
    passed: lookedFirstProper,
    detail: lookedFirstProper
      ? state.changes.length === 0
        ? 'No change was made before a read.'
        : 'The first thing done was a read, not a change.'
      : 'A change was made before anything was read: even a right fix was a guess.',
  })

  /* -------------------------------------------------------- documentation */

  let communication = 0
  const communicationDetail: string[] = []
  const perNode = scenario.dialog.length === 0 ? 0 : COMMUNICATION_POINTS / scenario.dialog.length
  for (const node of scenario.dialog) {
    const answered = latestDialog(state, node.id)
    if (!answered) {
      communicationDetail.push('Nothing was said about this step.')
      continue
    }
    const option = node.options.find((entry) => entry.id === answered.optionId)
    const credit = option?.best ? 1 : option?.tone === 'jargon' ? 0.25 : 0
    communication += perNode * credit
    communicationDetail.push(
      option?.best
        ? 'A plain answer that moved the call on.'
        : option?.tone === 'jargon'
          ? 'The answer used technician language the caller did not need.'
          : 'The answer was short with the caller.',
    )
  }
  items.push({
    id: 'communication',
    label: 'Talk to the caller like a person',
    category: 'documentation',
    earned: Math.round(communication),
    possible: COMMUNICATION_POINTS,
    passed: communication === COMMUNICATION_POINTS,
    detail:
      communication === COMMUNICATION_POINTS
        ? 'Every answer was plain, specific and honest about what happens next.'
        : communicationDetail.filter(Boolean).join(' ') || 'The caller was not spoken to.',
  })

  const noteRecord = checklist(state, 'document')
  const note = noteRecord?.note?.trim() ?? ''
  const noteOk = note.length >= 20
  items.push({
    id: 'visit-note',
    label: 'Write the visit note',
    category: 'documentation',
    earned: noteOk ? NOTE_POINTS : 0,
    possible: NOTE_POINTS,
    passed: noteOk,
    detail: noteOk
      ? 'The note says what was wrong, what changed, and what the teacher should watch for.'
      : noteRecord === undefined
        ? 'No visit note was written.'
        : 'The note is too short: it needs the room, the fault, the change and the follow-up.',
  })

  const followRecord = checklist(state, 'follow-up')
  items.push({
    id: 'follow-up',
    label: 'Book the follow-up',
    category: 'documentation',
    earned: followRecord ? FOLLOW_UP_POINTS : 0,
    possible: FOLLOW_UP_POINTS,
    passed: followRecord !== undefined,
    detail: followRecord
      ? 'The room or the caller is booked to be checked again.'
      : 'Nobody has said when the room will be looked at again.',
  })

  /* ----------------------------------------------------------- resolution */

  const expected = scenario.expected
  const perFix = expected.length > 0 ? FIX_POINTS / expected.length : 0
  const remaining = state.changes
    .map((record) => record.id)
    .filter((id) => expected.includes(id))
  expected.forEach((id, index) => {
    const position = remaining.indexOf(id)
    const inOrder = position === 0
    if (position >= 0) {
      remaining.splice(position, 1)
    }
    items.push({
      id: `fix-${index}-${id}`,
      label: CHANGES[id].label,
      category: 'resolution',
      earned: position < 0 ? 0 : inOrder ? perFix : perFix / 2,
      possible: perFix,
      passed: position >= 0,
      detail:
        position < 0
          ? 'The room is not fixed until this is done.'
          : inOrder
            ? 'Done in the order the reference path takes it.'
            : 'Done, but out of order: the step before it is what makes it hold.',
    })
  })

  const resolved = isResolved(scenario, state)
  items.push({
    id: 'resolved',
    label: 'The room is actually working',
    category: 'resolution',
    earned: resolved ? RESOLVED_POINTS : 0,
    possible: RESOLVED_POINTS,
    passed: resolved,
    detail: resolved ? scenario.verifyText : `${scenario.verifyText} The room does not agree yet.`,
  })

  const urgency = urgencyPoints(state, scenario)
  const late = lateness(state, scenario)
  items.push({
    id: 'urgency',
    label: 'Finish before the bell',
    category: 'resolution',
    earned: urgency,
    possible: URGENCY_POINTS,
    passed: urgency === URGENCY_POINTS,
    detail:
      urgency === URGENCY_POINTS
        ? late <= 0
          ? 'Closed with time to spare before the bell.'
          : 'Closed inside the grace window the visit allows.'
        : `Closed ${late} minute${late === 1 ? '' : 's'} after the bell: the room was not ready when the class arrived.`,
  })

  /* --------------------------------------------------------------- safety */

  const kitRecord = checklist(state, 'kit')
  const safetyRecord = checklist(state, 'safety')
  items.push({
    id: 'visit-kit',
    label: 'Pack the kit for the visit',
    category: 'safety',
    earned: kitRecord ? KIT_POINTS : 0,
    possible: KIT_POINTS,
    passed: kitRecord !== undefined,
    detail: kitRecord
      ? 'The kit was packed before the walk.'
      : 'The kit was not checked, so the walk may need a second trip.',
  })
  items.push({
    id: 'visit-safety',
    label: 'Check the room before you lift or reach',
    category: 'safety',
    earned: safetyRecord ? SAFETY_POINTS : 0,
    possible: SAFETY_POINTS,
    passed: safetyRecord !== undefined,
    detail: safetyRecord
      ? 'Power, ladder and lifting were considered before the work.'
      : 'The safety check was skipped: no record of power, ladder or lifting.',
  })

  const walkUp = scenario.walkUp
  if (!walkUp) {
    items.push({
      id: 'triage',
      label: 'Handle the mid-ticket interruption',
      category: 'safety',
      earned: TRIAGE_POINTS,
      possible: TRIAGE_POINTS,
      passed: true,
      detail: 'No interruption arrived during this visit.',
    })
  } else {
    const choice = state.triage?.optionId
    const chosen = walkUp.options.find((option) => option.id === choice)
    const answeredInTime =
      state.triage !== null &&
      state.triage.walkUpId === walkUp.id &&
      state.changes.length + state.reads.length >= WALK_UP_AFTER
    items.push({
      id: 'triage',
      label: 'Handle the mid-ticket interruption',
      category: 'safety',
      earned: answeredInTime && chosen?.best ? TRIAGE_POINTS : 0,
      possible: TRIAGE_POINTS,
      passed: answeredInTime && chosen?.best === true,
      detail: !answeredInTime
        ? 'The walk-up was never triaged: someone was left standing at the door.'
        : chosen?.best
          ? walkUp.note
          : `You chose “${chosen?.label ?? 'nothing'}”. ${walkUp.note}`,
    })
  }

  const unneeded = state.changes.filter((record) => !expected.includes(record.id))
  const penalty = unneeded.reduce(
    (total, record) => total + (isHarmful(record.id) ? HARMFUL_CHANGE_COST : RANDOM_CHANGE_COST),
    0,
  )
  const deductions = unneeded.map(
    (record: ChangeRecord) =>
      `${CHANGES[record.id].label} was not needed for this scenario: −${
        isHarmful(record.id) ? HARMFUL_CHANGE_COST : RANDOM_CHANGE_COST
      }.`,
  )
  const harmful = unneeded.filter((record) => isHarmful(record.id))
  const criticalSafety = harmful.length > 0

  items.push({
    id: 'no-harm',
    label: 'No change that makes the school less safe',
    category: 'safety',
    earned: Math.max(0, NO_HARM_POINTS - penalty),
    possible: NO_HARM_POINTS,
    passed: penalty === 0,
    detail:
      penalty === 0
        ? 'Every change made was one the scenario called for.'
        : harmful.length > 0
          ? `${harmful.length} change${harmful.length === 1 ? '' : 's'} made the school less safe: ${
              harmful[0] ? CHANGES[harmful[0].id].label : ''
            }.`
          : `${unneeded.length} change${unneeded.length === 1 ? '' : 's'} not needed for this scenario.`,
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
  // Isolating the fault before touching anything is the desk's first rule. A
  // correct guess is still a guess, so an attempt that changed something with no
  // isolating read cannot pass however the room ends up.
  const readBeforeChange = state.changes.length === 0 || read.length > 0
  const failedCategories = (Object.keys(categoryScores) as RubricCategory[])
    .filter((category) => {
      const entry = categoryScores[category]
      return entry.possible > 0 && entry.earned / entry.possible < 0.6
    })
    .map((category) => CATEGORY_NAMES[category])

  return {
    total,
    passed: total >= PASS_THRESHOLD && !criticalSafety && readBeforeChange,
    band,
    categoryScores,
    items,
    penalty,
    deductions,
    resolved,
    criticalSafety,
    closedMinute: closureMinute(state, scenario),
    minutesLate: late,
    explanation: [
      ...scenario.explanation,
      ...(failedCategories.length > 0
        ? [`The weakest part of this attempt was ${failedCategories.join(' and ')}.`]
        : []),
      ...(criticalSafety
        ? [
            'A change that makes the school less safe was made, so this attempt cannot pass however the room ends up.',
          ]
        : []),
      ...(!readBeforeChange
        ? [
            'A change was made before any read that isolates the fault, so this attempt cannot pass however the room ends up.',
          ]
        : []),
      ...deductions,
    ],
  }
}
