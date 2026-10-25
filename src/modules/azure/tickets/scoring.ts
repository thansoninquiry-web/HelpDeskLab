import { PASS_THRESHOLD, STRONG_THRESHOLD } from '../../../domain/generator/rubric'
import type { CategoryScore, RubricCategory, ScoreBand } from '../../../domain/scoring/types'
import { isDestructive } from '../types'
import type { AzureResource, AzureState, ResourceAction } from '../types'
import type { AzureTicketTemplate } from './templates'

/**
 * Scoring for an Azure attempt.
 *
 * The app's scorer judges a command log against a simulated machine, and this
 * module has neither, so the same shape is rebuilt here: the thresholds, the band
 * names and the "critical step + verified end state + no needless damage" split
 * are the app's, which is what makes a console score readable beside any other.
 */
export interface AzureScoreItem {
  id: string
  label: string
  /** The rubric category the step is priced in, as the rest of the app prices it. */
  category: RubricCategory
  earned: number
  possible: number
  passed: boolean
  detail: string
}

export const AZURE_CATEGORIES: readonly RubricCategory[] = [
  'diagnosis',
  'documentation',
  'resolution',
  'safety',
]

export const AZURE_CATEGORY_LABELS: Record<RubricCategory, string> = {
  diagnosis: 'Diagnostic reasoning',
  documentation: 'Documentation',
  resolution: 'Resolution',
  safety: 'Safety',
}

export interface AzureScore {
  total: number
  passed: boolean
  band: ScoreBand
  /**
   * The attempt split by rubric category, so a console attempt joins weak topics
   * and the category breakdown on Progress. Reading the record before the change
   * is diagnosis; the actions and the end state are resolution; destroying a
   * resource the ticket did not ask for is charged to safety. The console has no
   * notes step, so documentation carries no points here.
   */
  categoryScores: Record<RubricCategory, CategoryScore>
  items: readonly AzureScoreItem[]
  penalty: number
  deductions: readonly string[]
  resolved: boolean
  /** What the reference answer did and why, in plain sentences. */
  explanation: readonly string[]
}

export interface AzureAttempt {
  resource: AzureResource
  state: AzureState
  /** Actions taken on the ticket's resource, oldest first. */
  actions: readonly ResourceAction[]
  /** Whether the record was read before the first of those actions. */
  reviewedBeforeFix: boolean
}

const DIAGNOSIS_POINTS = 10
const ACTION_POINTS = 55
const RESOLVED_POINTS = 20
const SAFETY_POINTS = 15

const ACTION_LABELS: Record<ResourceAction, string> = {
  start: 'Started the machine',
  deallocate: 'Deallocated the machine',
  restart: 'Restarted the machine',
  'open-port': 'Opened an inbound port',
  'close-port': 'Closed an inbound port',
  'restrict-public-access': 'Turned off public blob access',
  'enable-soft-delete': 'Turned on soft delete',
  'require-tls': 'Required TLS 1.2',
  'scale-up': 'Scaled the plan up',
  'assign-role': 'Changed a role assignment',
  'delete-vm': 'Deleted the machine',
  'delete-resource-group': 'Deleted the resource group',
}

/**
 * Punishes a destructive action the ticket did not call for. Deleting the whole
 * group is priced higher than deleting one machine because it takes the rules,
 * the role assignments and every other resource in it at once.
 */
function destructiveCost(action: ResourceAction): number {
  return action === 'delete-resource-group' ? 50 : 40
}

export function scoreAzureAttempt(
  template: AzureTicketTemplate,
  attempt: AzureAttempt,
): AzureScore {
  const items: AzureScoreItem[] = []

  items.push({
    id: 'read-first',
    label: 'Read the resource record before changing anything',
    category: 'diagnosis',
    earned: attempt.reviewedBeforeFix ? DIAGNOSIS_POINTS : 0,
    possible: DIAGNOSIS_POINTS,
    passed: attempt.reviewedBeforeFix,
    detail: attempt.reviewedBeforeFix
      ? 'The findings were read before the first change was made.'
      : 'The first change was made without reading the record: the console cannot tell why it was chosen.',
  })

  const expected = template.expectedActions
  const perAction = expected.length > 0 ? ACTION_POINTS / expected.length : 0

  // Walk the expected path and consume the attempt's actions in order, so doing
  // the right two things the wrong way round still counts, but for less.
  const remaining = [...attempt.actions]
  const stepItems: AzureScoreItem[] = expected.map((action, index) => {
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
          ? `This ticket needs this step before it is done: ${ACTION_LABELS[action].toLowerCase()}.`
          : inOrder
            ? 'Done in the order the reference path takes it.'
            : 'Done, but out of order: the steps around it depend on each other.',
    }
  })

  items.push(...stepItems)

  // A deleted resource cannot close anything: deleting the machine is not a fix
  // for a ticket about the machine, and the ticket has to say so.
  const resolved =
    attempt.resource.deleted === true ? false : template.verify(attempt.resource, attempt.state)
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
        `${ACTION_LABELS[action]} on ${attempt.resource.name} was not needed for this ticket: −${cost}.`,
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
      ? 'Nothing irreversible was done to a working resource.'
      : 'A resource was destroyed that this ticket did not ask for.',
  })

  // The same split the app's evaluator writes: each item pays into its category,
  // then the charge for damage is taken out of the category it damaged.
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
