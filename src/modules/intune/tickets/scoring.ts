import { PASS_THRESHOLD, STRONG_THRESHOLD } from '../../../domain/generator/rubric'
import type { CategoryScore, RubricCategory, ScoreBand } from '../../../domain/scoring/types'
import { isDestructive } from '../types'
import type { DeviceAction, IntuneDevice, IntuneState } from '../types'
import type { IntuneTicketTemplate } from './templates'

/**
 * Scoring for an Intune attempt.
 *
 * The app's scorer judges a command log against a simulated machine, and this
 * module has neither, so the same shape is rebuilt here: the thresholds, the band
 * names and the "critical step + verified end state + no needless damage" split
 * are the app's, which is what makes an Intune score readable beside any other.
 */
export interface IntuneScoreItem {
  id: string
  label: string
  /** The rubric category the step is priced in, as the rest of the app prices it. */
  category: RubricCategory
  earned: number
  possible: number
  passed: boolean
  detail: string
}

/**
 * The rubric categories in the console's own order, and the words the score
 * panel prints. The app's `CATEGORY_LABELS` says the same thing; this copy keeps
 * the module from importing the evaluator it has no other use for.
 */
export const INTUNE_CATEGORIES: readonly RubricCategory[] = [
  'diagnosis',
  'documentation',
  'resolution',
  'safety',
]

export const INTUNE_CATEGORY_LABELS: Record<RubricCategory, string> = {
  diagnosis: 'Diagnostic reasoning',
  documentation: 'Documentation',
  resolution: 'Resolution',
  safety: 'Safety',
}

export interface IntuneScore {
  total: number
  passed: boolean
  band: ScoreBand
  /**
   * The attempt split by rubric category, in the app's own shape, so a console
   * attempt can join weak topics and the category breakdown on Progress. Reading
   * the record before the fix is diagnosis; the actions and the end state are
   * resolution; the destructive charge lands in safety. The console has no notes
   * step, so documentation carries no points here.
   */
  categoryScores: Record<RubricCategory, CategoryScore>
  items: readonly IntuneScoreItem[]
  penalty: number
  deductions: readonly string[]
  resolved: boolean
  /** What the reference answer did and why, in plain sentences. */
  explanation: readonly string[]
}

export interface IntuneAttempt {
  device: IntuneDevice
  state: IntuneState
  /** Actions taken on the ticket's device, oldest first. */
  actions: readonly DeviceAction[]
  /** Whether the record was read before the first of those actions. */
  reviewedBeforeFix: boolean
}

const DIAGNOSIS_POINTS = 10
const ACTION_POINTS = 55
const RESOLVED_POINTS = 20
const SAFETY_POINTS = 15

const ACTION_LABELS: Record<DeviceAction, string> = {
  sync: 'Sent a sync',
  restart: 'Restarted the device',
  'assign-apps': 'Assigned the required apps',
  'reassign-user': 'Changed the primary user',
  'remove-group': 'Removed the device from its group',
  retire: 'Retired the device',
  wipe: 'Wiped the device',
}

/**
 * Punishes a destructive action the ticket did not call for. Wiping is priced
 * higher than retiring because it cannot be undone: a wrong retire can be
 * re-enrolled, a wrong wipe is somebody's photographs.
 */
function destructiveCost(action: DeviceAction): number {
  return action === 'wipe' ? 40 : 25
}

export function scoreIntuneAttempt(
  template: IntuneTicketTemplate,
  attempt: IntuneAttempt,
): IntuneScore {
  const items: IntuneScoreItem[] = []

  // Reading the record first is what the tickets' own hints ask for, and it is
  // the one piece of diagnostic reasoning the console can actually observe.
  items.push({
    id: 'read-first',
    label: 'Read the device record before changing anything',
    category: 'diagnosis',
    earned: attempt.reviewedBeforeFix ? DIAGNOSIS_POINTS : 0,
    possible: DIAGNOSIS_POINTS,
    passed: attempt.reviewedBeforeFix,
    detail: attempt.reviewedBeforeFix
      ? 'The reasons were read before the first fix was tried.'
      : 'The first fix was tried without reading the record: the console cannot tell why it was chosen.',
  })

  const expected = template.expectedActions
  const perAction = expected.length > 0 ? ACTION_POINTS / expected.length : 0

  // Walk the expected path and consume the attempt's actions in order, so doing
  // the right two things the wrong way round still counts, but for less.
  const remaining = [...attempt.actions]
  const stepItems: IntuneScoreItem[] = expected.map((action, index) => {
    const position = remaining.indexOf(action)
    const inOrder = position === 0
    if (position >= 0) {
      remaining.splice(position, 1)
    }
    const earned = position < 0 ? 0 : inOrder ? perAction : perAction / 2
    return {
      id: `step-${index}-${action}`,
      label: ACTION_LABELS[action],
      category: 'resolution' as const,
      earned,
      possible: perAction,
      passed: position >= 0,
      detail:
        position < 0
          ? `This ticket needs ${ACTION_LABELS[action].toLowerCase()} before it is done.`
          : inOrder
            ? 'Done in the order the reference path takes it.'
            : 'Done, but out of order: the steps around it depend on each other.',
    }
  })

  items.push(...stepItems)

  const resolved = template.verify(attempt.device, attempt.state)
  items.push({
    id: 'resolved',
    label: 'The ticket is actually resolved',
    category: 'resolution',
    earned: resolved ? RESOLVED_POINTS : 0,
    possible: RESOLVED_POINTS,
    passed: resolved,
    detail: resolved
      ? template.resolution
      : `${template.resolution} The estate does not agree yet.`,
  })

  const deductions: string[] = []
  let penalty = 0
  for (const action of attempt.actions) {
    if (isDestructive(action) && !expected.includes(action)) {
      const cost = destructiveCost(action)
      penalty += cost
      deductions.push(
        `${ACTION_LABELS[action]} on ${attempt.device.name} was not needed for this ticket: −${cost}.`,
      )
    }
  }

  const safe = penalty === 0
  items.push({
    id: 'safety',
    label: 'No destructive action without cause',
    category: 'safety',
    earned: safe ? SAFETY_POINTS : 0,
    possible: SAFETY_POINTS,
    passed: safe,
    detail: safe
      ? 'Nothing irreversible was done to a working device.'
      : 'A device was destroyed that this ticket did not ask for.',
  })

  // The same split the app's evaluator writes: each item pays into its category,
  // then the charge for damage is taken out of the category it damaged. That is
  // what lets Progress say which kind of work costs this learner marks rather
  // than only that the attempt as a whole fell short.
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
  if (penalty > 0) {
    categoryScores.safety.earned = Math.max(0, categoryScores.safety.earned - penalty)
  }

  const raw = items.reduce((sum, item) => sum + item.earned, 0) - penalty
  const total = Math.max(0, Math.min(100, Math.round(raw)))
  const band: ScoreBand =
    total >= STRONG_THRESHOLD ? 'strong' : total >= PASS_THRESHOLD ? 'pass' : 'fail'

  return {
    total,
    passed: total >= PASS_THRESHOLD,
    band,
    categoryScores,
    items,
    penalty,
    deductions,
    resolved,
    explanation: [template.explanation, ...deductions],
  }
}
