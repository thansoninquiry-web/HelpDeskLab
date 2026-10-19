import { COMMANDS } from '../environment/commands'
import { createLarkspurWorld } from '../environment/fixtures'
import { applyCommand } from '../environment/reducer'
import type { World } from '../environment/types'
import type { GeneratedTicket, ReferenceStep } from './types'

/**
 * A guard over authored hint text: a hint may describe the state a learner
 * should see, but it may not name a command, a switch, or a setting the
 * simulation does not have.
 *
 * Everything it checks against is derived from the code rather than restated:
 * commands and their switches come from the command registry, keys come from a
 * real world, and settings (labels and the values they can take) come from what
 * the tools actually print when the reference paths are replayed. A hint that
 * invents a command, mistypes a switch or a field, or promises a state the
 * simulation never produces fails here instead of misleading a learner
 * mid-ticket.
 *
 * Limits, so the guard is not trusted for more than it does: a `label: value`
 * pair is only read as a setting when that label is one the tools print
 * somewhere, so ordinary prose after a colon is ignored; a value counts as real
 * when a tool prints it, when it is state the estate holds, or when it is a
 * prefix of either (hints say "169.254", the tools print the full address); and
 * a lowercase invented label that is not a field name slips through, because
 * nothing distinguishes it from English prose.
 */

export type HintProblemReason =
  | 'unknown-command'
  | 'unknown-switch'
  | 'unknown-setting'
  | 'unobservable-value'

export interface HintProblem {
  /** Which rubric item's ladder the hint belongs to. */
  itemId: string
  /** 1-based rung of the ladder. */
  rung: number
  token: string
  reason: HintProblemReason
  detail: string
}

export interface HintVocabulary {
  /** Every command and alias the simulator answers to. */
  commands: ReadonlySet<string>
  /** Leading word of every hyphenated command, so an invented one is visible. */
  commandPrefixes: ReadonlySet<string>
  /** Switches each command documents in its own usage line. */
  switches: ReadonlyMap<string, ReadonlySet<string>>
  /** Labels the simulated tools print, and the values each label was seen with. */
  settings: ReadonlyMap<string, ReadonlySet<string>>
  /** Values the estate itself holds, so a hint may quote state no command printed. */
  estateValues: ReadonlySet<string>
  /** Field names that exist on the simulated estate. */
  worldKeys: ReadonlySet<string>
}

/** Labels that introduce an example or a cross-reference, not a setting. */
const PROSE_LABELS = new Set(['example', 'note', 'usage', 'alias', 'e.g', 'i.e', 'see', 'tip'])

/**
 * Words that start a clause rather than quote a value. "…not the site scope:
 * this is per-device" ends in a colon and a word, but it is a sentence, not a
 * setting, and a state value is never one of these.
 */
const PROSE_VALUES = new Set([
  'a',
  'an',
  'and',
  'because',
  'but',
  'do',
  'here',
  'if',
  'it',
  'never',
  'not',
  'please',
  'so',
  'than',
  'that',
  'the',
  'then',
  'there',
  'they',
  'this',
  'when',
  'which',
  'you',
])

/** Builds the vocabulary a ticket's hints are held to. */
export function hintVocabulary(
  ticket: GeneratedTicket,
  world: World = ticket.world,
): HintVocabulary {
  return simulationVocabulary([ticket], [world])
}

/**
 * Builds the vocabulary from every ticket given. Hints teach general rules as
 * well as this ticket's state — "169.254 means the lease failed" belongs on a
 * ticket that has no such address — so the labels and values come from the whole
 * simulation, not from one ticket.
 */
export function simulationVocabulary(
  tickets: readonly GeneratedTicket[],
  extraWorlds: readonly World[] = [],
): HintVocabulary {
  const settings = new Map<string, Set<string>>()
  const estate = new Set<string>()
  const keys = new Set<string>()

  for (const world of [createLarkspurWorld(), ...extraWorlds, ...tickets.map((t) => t.world)]) {
    for (const key of worldKeys(world)) {
      keys.add(key)
    }
    for (const value of estateValues(world)) {
      estate.add(value)
    }
  }

  for (const ticket of tickets) {
    for (const [label, values] of observableSettings(ticket.world, ticket.reference)) {
      for (const value of values) {
        add(settings, label, value)
      }
    }
  }

  return { ...commandVocabulary(), settings, estateValues: estate, worldKeys: keys }
}

export function commandVocabulary(): Pick<
  HintVocabulary,
  'commands' | 'commandPrefixes' | 'switches'
> {
  const commands = new Set<string>()
  const commandPrefixes = new Set<string>()
  const switches = new Map<string, Set<string>>()

  for (const command of COMMANDS) {
    const names = [command.name, ...command.aliases].map((name) => name.toLowerCase())
    const usageSwitches = new Set(
      [...command.usage.matchAll(/[/-][a-z][\w-]*/gi)].map((match) => match[0].toLowerCase()),
    )

    for (const name of names) {
      commands.add(name)
      switches.set(name, usageSwitches)
      const [head, ...rest] = name.split('-')
      if (head && rest.length > 0) {
        commandPrefixes.add(head)
      }
    }
  }

  return { commands, commandPrefixes, switches }
}

/**
 * Runs the ticket's own reference path and records every `label : value` line
 * the tools print. Values are lower-cased, so a hint can use sentence case.
 */
export function observableSettings(world: World, reference: readonly ReferenceStep[]): Map<string, Set<string>> {
  const settings = new Map<string, Set<string>>()
  let current = structuredClone(world)

  for (const step of reference) {
    if (step.type !== 'command') {
      continue
    }
    const result = applyCommand(current, step.input)
    current = result.world
    for (const line of result.lines) {
      const label = settingLabel(line.text)
      if (label) {
        add(settings, label.label, label.value)
      }
    }
  }

  return settings
}

/** Field names anywhere in a world, however nested. */
export function worldKeys(world: World): Set<string> {
  const keys = new Set<string>()

  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const entry of value) {
        walk(entry)
      }
      return
    }
    if (typeof value !== 'object' || value === null) {
      return
    }
    for (const [key, entry] of Object.entries(value)) {
      keys.add(key)
      walk(entry)
    }
  }

  walk(createLarkspurWorld())
  walk(world)
  return keys
}

/** Every string the world holds, lower-cased and trimmed. */
export function estateValues(world: World): Set<string> {
  const values = new Set<string>()

  const walk = (value: unknown): void => {
    if (typeof value === 'string') {
      const trimmed = value.trim().toLowerCase()
      if (trimmed.length > 0) {
        values.add(trimmed)
      }
      return
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        walk(entry)
      }
      return
    }
    if (typeof value === 'object' && value !== null) {
      for (const entry of Object.values(value)) {
        walk(entry)
      }
    }
  }

  walk(world)
  return values
}

/** Every hint on a ticket's rubric, checked in one pass. */
export function lintTicketHints(
  ticket: GeneratedTicket,
  vocabulary: HintVocabulary = hintVocabulary(ticket),
): HintProblem[] {
  const problems: HintProblem[] = []

  for (const item of ticket.rubric.items) {
    item.hints.forEach((hint, index) => {
      problems.push(
        ...lintHintText(hint, vocabulary, { itemId: item.id, rung: index + 1 }),
      )
    })
  }

  return problems
}

export interface HintLocation {
  itemId: string
  rung: number
}

/** Checks one hint string against the vocabulary. */
export function lintHintText(
  text: string,
  vocabulary: HintVocabulary,
  where: HintLocation,
): HintProblem[] {
  const problems = [
    ...unknownCommands(text, vocabulary, where),
    ...unknownSwitches(text, vocabulary, where),
    ...unknownWorldKeys(text, vocabulary, where),
    ...unknownSettings(text, vocabulary, where),
  ]

  // A mistyped field is one mistake, not two: report it once, as the field.
  const flaggedFields = new Set(
    problems
      .filter((problem) => problem.reason === 'unknown-setting' && !problem.token.includes(':'))
      .map((problem) => problem.token.toLowerCase()),
  )

  return problems.filter(
    (problem) =>
      !problem.token.includes(':') ||
      !flaggedFields.has((problem.token.split(':')[0] ?? '').trim().toLowerCase()),
  )
}

function unknownCommands(
  text: string,
  vocabulary: HintVocabulary,
  where: HintLocation,
): HintProblem[] {
  const problems: HintProblem[] = []

  for (const token of words(text)) {
    // `get-account` is command-shaped. `sign-in` and `follow-up` are not, because
    // no command in the simulator starts with those words.
    if (!COMMAND_SHAPE.test(token)) {
      continue
    }
    const head = token.split('-')[0] ?? ''
    if (!vocabulary.commandPrefixes.has(head) || vocabulary.commands.has(token)) {
      continue
    }
    problems.push({
      ...where,
      token,
      reason: 'unknown-command',
      detail: `No command named "${token}" exists. Type help in the terminal for the real list.`,
    })
  }

  return problems
}

function unknownSwitches(
  text: string,
  vocabulary: HintVocabulary,
  where: HintLocation,
): HintProblem[] {
  const problems: HintProblem[] = []
  const tokens = words(text)

  tokens.forEach((token, index) => {
    const definition = vocabulary.switches.get(token)
    if (!definition) {
      return
    }
    const next = tokens[index + 1]
    if (!next || !SWITCH_SHAPE.test(next) || definition.has(next)) {
      return
    }
    problems.push({
      ...where,
      token: next,
      reason: 'unknown-switch',
      detail: `"${token}" does not accept ${next}.`,
    })
  })

  return problems
}

function unknownSettings(
  text: string,
  vocabulary: HintVocabulary,
  where: HintLocation,
): HintProblem[] {
  const problems: HintProblem[] = []

  // Only the word directly before the colon is the label. Prose such as "the
  // record now shows status: locked" must not be read as a setting called
  // "the record now shows status".
  for (const match of text.matchAll(/([A-Za-z][A-Za-z0-9]*)\s*:\s*(\S+)/g)) {
    const rawLabel = match[1] ?? ''
    const rawValue = match[2] ?? ''
    const label = normaliseLabel(rawLabel)
    const value = normaliseValue(rawValue)

    if (
      label.length < 3 ||
      PROSE_LABELS.has(label) ||
      PROSE_VALUES.has(value) ||
      !STATE_VALUE.test(value)
    ) {
      continue
    }

    const seen = vocabulary.settings.get(label)
    // A label the tools never print is prose that happens to end in a colon.
    if (!seen || observedValue(value, seen, vocabulary)) {
      continue
    }

    problems.push({
      ...where,
      token: `${label}: ${value}`,
      reason: 'unobservable-value',
      detail: `"${label}" is real, but the simulation prints ${[...seen].join(' or ')}, never "${value}".`,
    })
  }

  return problems
}

function unknownWorldKeys(
  text: string,
  vocabulary: HintVocabulary,
  where: HintLocation,
): HintProblem[] {
  const problems: HintProblem[] = []

  for (const token of words(text)) {
    if (!CAMEL_CASE.test(token)) {
      continue
    }
    // The hint may name the command that prints the field, not the field itself.
    if (vocabulary.commands.has(token.toLowerCase())) {
      continue
    }
    if (vocabulary.worldKeys.has(token)) {
      continue
    }
    problems.push({
      ...where,
      token,
      reason: 'unknown-setting',
      detail: `No "${token}" field exists on the simulated estate.`,
    })
  }

  return problems
}

const COMMAND_SHAPE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/
const SWITCH_SHAPE = /^[/-][a-z][\w-]*$/i
const CAMEL_CASE = /^[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*$/
/** A printed value: one token, no sentences, no quoted prose. */
const STATE_VALUE = /^[A-Za-z0-9][\w./\\-]{0,19}$/

function words(text: string): string[] {
  return text.split(/[^A-Za-z0-9/-]+/).filter((token) => token.length > 0)
}

/** `status        : locked` in tool output becomes `status` → `locked`. */
function settingLabel(line: string): { label: string; value: string } | null {
  const match = /^([A-Za-z][A-Za-z ]{1,24}?)\s*:\s*(\S+)\s*$/.exec(line.trim())
  if (!match) {
    return null
  }
  const label = normaliseLabel(match[1] ?? '')
  const value = normaliseValue(match[2] ?? '')
  if (label.length === 0 || value.length === 0) {
    return null
  }
  return { label, value }
}

function normaliseLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, ' ')
}

function normaliseValue(value: string): string {
  return value.trim().replace(/[.,;]$/, '').toLowerCase()
}

/**
 * True when a hint's value is one the simulation produces: printed for that
 * label, held as estate state, or a prefix of either. The prefix rule is for
 * hints that name an address family ("169.254") where the tools print the whole
 * address; a short value still has to match exactly.
 */
function observedValue(
  value: string,
  printed: ReadonlySet<string>,
  vocabulary: HintVocabulary,
): boolean {
  if (printed.has(value) || vocabulary.estateValues.has(value)) {
    return true
  }
  if (value.length < 5) {
    return false
  }
  return (
    [...printed].some((seen) => seen.startsWith(value)) ||
    [...vocabulary.estateValues].some((seen) => seen.startsWith(value))
  )
}

function add(map: Map<string, Set<string>>, key: string, value: string): void {
  const existing = map.get(key)
  if (existing) {
    existing.add(value)
    return
  }
  map.set(key, new Set([value]))
}

/** One line per problem, for test output that reads like a review note. */
export function describeHintProblem(problem: HintProblem): string {
  return `${problem.itemId} rung ${problem.rung}: ${problem.detail}`
}
