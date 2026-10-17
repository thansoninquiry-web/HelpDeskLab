import type { JsonObject, JsonValue } from '../shared/json'
import { findCommand } from '../environment/commands'
import { parseCommandLine } from '../environment/parser'
import type { Effect, World } from '../environment/types'
import type { ActionKind } from '../tickets/types'
import type {
  CategoryScore,
  CheckSpec,
  EvaluationResult,
  Rubric,
  RubricCategory,
  RubricItem,
  RubricItemResult,
  ScoreBand,
  SessionDecision,
} from './types'

export interface EvaluatorAction {
  kind: ActionKind
  input: JsonObject
  output: JsonObject
}

export interface EvaluationInput {
  rubric: Rubric
  actions: readonly EvaluatorAction[]
  world: World
  decision: SessionDecision
  difficulty: 1 | 2 | 3
}

const CATEGORIES: readonly RubricCategory[] = [
  'diagnosis',
  'documentation',
  'resolution',
  'safety',
]

function effectsOf(action: EvaluatorAction): Effect[] {
  const effects = action.output.effects
  if (!Array.isArray(effects)) {
    return []
  }

  const result: Effect[] = []
  for (const entry of effects) {
    if (
      typeof entry === 'object' &&
      entry !== null &&
      !Array.isArray(entry) &&
      typeof entry.type === 'string'
    ) {
      result.push(entry as unknown as Effect)
    }
  }
  return result
}

function commandText(action: EvaluatorAction): string {
  const command = action.input.command
  return typeof command === 'string' ? command : ''
}

function ranCommand(action: EvaluatorAction, command: string, argsInclude?: string): boolean {
  if (action.kind !== 'command') {
    return false
  }
  const raw = commandText(action)
  const parsed = parseCommandLine(raw)
  if (!parsed.ok) {
    return false
  }
  const definition = findCommand(parsed.command.name)
  if (!definition || definition.name !== command.toLowerCase()) {
    return false
  }
  if (!argsInclude) {
    return true
  }
  return raw.toLowerCase().includes(argsInclude.toLowerCase())
}

/** True when a single action satisfies a check (ordered/absent handled separately). */
function actionSatisfies(spec: CheckSpec, action: EvaluatorAction): boolean {
  switch (spec.kind) {
    case 'ran':
      return ranCommand(action, spec.command, spec.argsInclude)
    case 'effect':
      return effectsOf(action).some(
        (effect) => effect.type === spec.effect && (!spec.target || effect.target === spec.target),
      )
    case 'verify-caller':
      return action.kind === 'verify-caller'
    case 'ask':
      return action.kind === 'ask-user' && (!spec.intent || action.input.intent === spec.intent)
    case 'note': {
      if (action.kind !== 'note' || action.input.noteKind !== spec.noteKind) {
        return false
      }
      const text = typeof action.input.text === 'string' ? action.input.text.trim() : ''
      return text.length >= (spec.minLength ?? 1)
    }
    default:
      return false
  }
}

function matchSequence(
  actions: readonly EvaluatorAction[],
  specs: readonly CheckSpec[],
  start: number,
): boolean {
  let cursor = start
  for (const spec of specs) {
    let found = false
    for (let index = cursor; index < actions.length; index += 1) {
      const action = actions[index]
      if (!action) {
        continue
      }
      if (spec.kind === 'ordered') {
        if (matchSequence(actions, spec.of, index)) {
          found = true
          cursor = index + 1
          break
        }
      } else if (actionSatisfies(spec, action)) {
        found = true
        cursor = index + 1
        break
      }
    }
    if (!found) {
      return false
    }
  }
  return true
}

function readPath(value: unknown, path: string): JsonValue | undefined {
  let current: unknown = value
  for (const segment of path.split('.')) {
    if (typeof current !== 'object' || current === null) {
      return undefined
    }
    current = (current as Record<string, unknown>)[segment]
  }
  return current as JsonValue | undefined
}

function worldMatches(spec: Extract<CheckSpec, { kind: 'world' }>, world: World): boolean {
  const actual = readPath(world, spec.path)
  return JSON.stringify(actual) === JSON.stringify(spec.equals)
}

function isSatisfiedAnywhere(
  actions: readonly EvaluatorAction[],
  spec: CheckSpec,
  world: World,
  decision: SessionDecision,
): boolean {
  switch (spec.kind) {
    case 'ordered':
      return actions.some((_, index) => matchSequence(actions, spec.of, index))
    case 'absent':
      return !isSatisfiedAnywhere(actions, spec.of, world, decision)
    case 'decision':
      return (
        decision.outcome === spec.outcome && (!spec.codes || spec.codes.includes(decision.code))
      )
    case 'world':
      return worldMatches(spec, world)
    default:
      return actions.some((action) => actionSatisfies(spec, action))
  }
}

function describe(spec: CheckSpec): string {
  switch (spec.kind) {
    case 'ran':
      return `run "${spec.command}${spec.argsInclude ? ` ${spec.argsInclude}` : ''}"`
    case 'effect':
      return `perform ${spec.effect}${spec.target ? ` on ${spec.target}` : ''}`
    case 'verify-caller':
      return 'verify the caller before changing anything'
    case 'ask':
      return 'ask the user a diagnostic question'
    case 'note':
      return `write a ${spec.noteKind} note${spec.minLength ? ` of at least ${spec.minLength} characters` : ''}`
    case 'ordered':
      return spec.of.map(describe).join(', then ')
    case 'absent':
      return `avoid ${describe(spec.of)}`
    case 'decision':
      return `choose "${spec.outcome}"${spec.codes ? ` with a matching closure code` : ''}`
    case 'world':
      return `leave ${spec.path} as ${JSON.stringify(spec.equals)}`
  }
}

function evidenceFor(spec: CheckSpec, passed: boolean): string {
  return passed ? `met: ${describe(spec)}` : `missing: ${describe(spec)}`
}

function evaluateItem(item: RubricItem, input: EvaluationInput): RubricItemResult {
  const checks = item.checks.map((spec) => ({
    spec,
    passed: isSatisfiedAnywhere(input.actions, spec, input.world, input.decision),
  }))
  const passed = checks.every((check) => check.passed)

  return {
    id: item.id,
    label: item.label,
    category: item.category,
    weight: item.weight,
    critical: item.critical,
    passed,
    why: item.why,
    hint: item.hint,
    evidence: checks.map((check) => evidenceFor(check.spec, check.passed)),
  }
}

function emptyCategoryScores(): Record<RubricCategory, CategoryScore> {
  return {
    diagnosis: { earned: 0, possible: 0 },
    documentation: { earned: 0, possible: 0 },
    resolution: { earned: 0, possible: 0 },
    safety: { earned: 0, possible: 0 },
  }
}

export function evaluateSession(input: EvaluationInput): EvaluationResult {
  const items = input.rubric.items.map((item) => evaluateItem(item, input))

  const categoryScores = emptyCategoryScores()
  for (const item of items) {
    const category = categoryScores[item.category]
    category.possible += item.weight
    if (item.passed) {
      category.earned += item.weight
    }
  }

  const possible = items.reduce((total, item) => total + item.weight, 0)
  const earned = items.reduce((total, item) => total + (item.passed ? item.weight : 0), 0)
  const total = possible === 0 ? 0 : Math.round((earned / possible) * 100)

  const criticalFailures = items
    .filter((item) => item.critical && !item.passed)
    .map((item) => item.label)
  const passed = criticalFailures.length === 0 && total >= input.rubric.passThreshold

  let band: ScoreBand = 'fail'
  if (passed) {
    band = total >= input.rubric.strongThreshold ? 'strong' : 'pass'
  }

  const feedback: string[] = []
  if (criticalFailures.length > 0) {
    feedback.push(
      `Critical step missed: ${criticalFailures.join('; ')}. This attempt cannot pass until those are done.`,
    )
  }

  for (const item of items) {
    if (item.passed) {
      if (item.category === 'resolution' || item.critical) {
        feedback.push(`Good: ${item.label}.`)
      }
      continue
    }
    const missing = item.evidence.filter((entry) => entry.startsWith('missing:'))
    feedback.push(`Missed ${item.label}: ${missing.join('; ')}.`)
  }

  const categorySummary = CATEGORIES.filter((category) => categoryScores[category].possible > 0)
    .map(
      (category) =>
        `${category} ${categoryScores[category].earned}/${categoryScores[category].possible}`,
    )
    .join(', ')
  feedback.push(`Breakdown: ${categorySummary}.`)

  const xp =
    input.difficulty * 30 + (passed ? 40 : 10) + (band === 'strong' ? 30 : 0)

  return {
    total,
    passed,
    band,
    categoryScores,
    items,
    criticalFailures,
    feedback,
    xp,
  }
}
