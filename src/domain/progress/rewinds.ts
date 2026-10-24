import type { RewindRecord, UnrunStep } from './types'

/**
 * Where a learner un-runs, family by family.
 *
 * A rewind deletes the tail of an attempt's log and leaves a marker holding the
 * steps it took, so the log itself says what was un-run and on which ticket. Read
 * back across every attempt, that answers a question a score cannot: which family
 * this learner keeps backing out of, and which step in it they clearly are not
 * sure of. Heavy rewinding on one family is the signal; the step the cuts start
 * at is the detail worth acting on.
 *
 * Nothing here is stored: the summary is rebuilt from the action log each time it
 * is read, so it follows a rewind, a retry, or an older attempt without a
 * migration — the same rule the hint habits follow.
 */

/** How much of a family's practice gets rewound, in one word, heaviest first. */
export type RewindBand = 'heavy' | 'some' | 'rare'

/** Share of attempts that were rewound at least once, above which it is heavy. */
const HEAVY_PERCENT = 50

/** …and above which it is worth a look, but not a habit yet. */
const SOME_PERCENT = 20

/**
 * What to call the step a cut started at. A command is named by its verb — the
 * account it was aimed at is not the pattern — and the panel steps are named by
 * what the learner was doing.
 */
export function describeUnrunStep(step: UnrunStep | null): string {
  if (!step) {
    return 'a step the log no longer holds'
  }

  if (step.kind === 'command') {
    const verb = (step.command ?? '').trim().split(/\s+/)[0] ?? ''
    return verb.length > 0 ? verb.replace(/\.exe$/i, '') : 'a command'
  }

  switch (step.kind) {
    case 'note':
      return step.noteKind === 'customer'
        ? 'a customer note'
        : step.noteKind === 'resolution'
          ? 'a handoff note'
          : 'a troubleshooting note'
    case 'hint':
      return 'a hint'
    case 'code-sent':
      return 'a code sent to the caller'
    case 'verify-caller':
      return 'an identity check'
    case 'ask-user':
      return 'a question to the caller'
    case 'rewind':
      return 'an earlier cut'
    default:
      return 'a step'
  }
}

/** The most un-run step in one family, and how many cuts started at it. */
export interface UnrunStepCount {
  label: string
  /** Cuts that began at this step. */
  times: number
}

export interface FamilyRewinds {
  scenarioId: string
  /** Cuts left in the log for this family. */
  rewinds: number
  /** Attempts recorded for the family, so the share below has a denominator. */
  attempts: number
  /** Attempts in which at least one step was un-run. */
  attemptsWithRewind: number
  /** Steps un-run in total, counting the ones behind the cut as well. */
  stepsUnrun: number
  /** Share of attempts that were rewound, 0–100, rounded. */
  rewindPercent: number
  band: RewindBand
  /** The step the cuts most often started at, or null when none stands out. */
  worstStep: UnrunStepCount | null
}

/**
 * One row per family that was rewound, heaviest first. Attempts come from the
 * family's stored statistics, so a family with one cut in one attempt outranks a
 * family with four cuts across forty attempts — which is what "heavy rewinding on
 * a family" means.
 */
export function familyRewinds(
  records: readonly RewindRecord[],
  attemptsByScenario: ReadonlyMap<string, number>,
): FamilyRewinds[] {
  interface Group {
    rewinds: number
    stepsUnrun: number
    sessions: Set<string>
    steps: Map<string, number>
  }

  const groups = new Map<string, Group>()
  for (const record of records) {
    const group = groups.get(record.scenarioId) ?? {
      rewinds: 0,
      stepsUnrun: 0,
      sessions: new Set<string>(),
      steps: new Map<string, number>(),
    }

    group.rewinds += 1
    group.stepsUnrun += Math.max(0, record.dropped)
    group.sessions.add(record.sessionId)

    const label = describeUnrunStep(record.boundary)
    group.steps.set(label, (group.steps.get(label) ?? 0) + 1)
    groups.set(record.scenarioId, group)
  }

  const rows: FamilyRewinds[] = []
  for (const [scenarioId, group] of groups) {
    const attempts = attemptsByScenario.get(scenarioId) ?? 0
    // A cut can only happen in an attempt, but an attempt that was abandoned
    // after cutting never reached the family's statistics, so the share is
    // capped rather than trusted to stay under one.
    const rewindPercent =
      attempts === 0
        ? 0
        : Math.min(100, Math.round((group.sessions.size / attempts) * 100))

    const [worstStep] = [...group.steps.entries()].sort(
      ([leftLabel, leftTimes], [rightLabel, rightTimes]) =>
        rightTimes - leftTimes || leftLabel.localeCompare(rightLabel),
    )

    rows.push({
      scenarioId,
      rewinds: group.rewinds,
      attempts,
      attemptsWithRewind: group.sessions.size,
      stepsUnrun: group.stepsUnrun,
      rewindPercent,
      band: rewindBand(rewindPercent),
      worstStep: worstStep ? { label: worstStep[0], times: worstStep[1] } : null,
    })
  }

  return rows.sort(
    (left, right) =>
      right.rewindPercent - left.rewindPercent ||
      right.rewinds - left.rewinds ||
      left.scenarioId.localeCompare(right.scenarioId),
  )
}

function rewindBand(rewindPercent: number): RewindBand {
  if (rewindPercent >= HEAVY_PERCENT) {
    return 'heavy'
  }
  return rewindPercent >= SOME_PERCENT ? 'some' : 'rare'
}

export interface RewindSummary {
  /** Cuts left in the log, across every family. */
  rewinds: number
  /** Attempts in which at least one step was un-run. */
  attemptsWithRewind: number
  /** Steps un-run in total. */
  stepsUnrun: number
  /** Families with at least one cut. */
  families: number
}

export function summarizeRewinds(rows: readonly FamilyRewinds[]): RewindSummary {
  return {
    rewinds: rows.reduce((total, row) => total + row.rewinds, 0),
    attemptsWithRewind: rows.reduce((total, row) => total + row.attemptsWithRewind, 0),
    stepsUnrun: rows.reduce((total, row) => total + row.stepsUnrun, 0),
    families: rows.length,
  }
}
