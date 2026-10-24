import type { JsonObject, JsonValue } from '../shared/json'
import { findCommand } from '../environment/commands'
import { parseCommandLine } from '../environment/parser'
import { usableCallerVerificationMethods } from '../environment/verification'
import type { Effect, EffectType, VerificationMethod, World } from '../environment/types'
import type { TopologyCheck, TopologyView } from '../environment/topology'
import { attemptXp } from '../progress/xp'
import type { ActionKind } from '../tickets/types'
import {
  hintsAreFree,
  normalizeHintPolicy,
  totalHintCost,
  type HintPolicy,
} from './policy'
import { missingNoteParts as missingNotePartsIn } from './noteCoverage'
import { refusalReasonInfo } from './refusal'
import type {
  CategoryScore,
  CheckSpec,
  EvaluationResult,
  NoteCoveragePart,
  ProcedureViolation,
  Rubric,
  RubricCategory,
  RubricItem,
  RubricItemResult,
  ScoreBand,
  SessionDecision,
  TopologyCoverage,
  TopologyLinkReport,
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
  /**
   * What this attempt pays for a hint. The caller pins it when the attempt
   * starts; the default is the standard price the Settings control starts from.
   */
  hints?: HintPolicy
  /** True only when the ticket is a network fault. */
  networkTicket?: boolean
  /** The map as the log left it, used for the proof bonus and its debrief. */
  topology?: TopologyView
  /** The bonus belongs to a closed ticket, not to a hint preview. */
  closing?: boolean
}

/**
 * A hint is a priced shortcut to the next step, capped so a hint-heavy attempt
 * still gets a readable score. Process mistakes are priced separately.
 */
export {
  DEFAULT_HINT_POLICY,
  HINT_CAP_LIMIT,
  HINT_COST_LIMIT,
  HINT_PENALTY_PER_HINT,
  MAX_HINT_PENALTY,
  hintPolicyError,
  hintsAreFree,
  normalizeHintPolicy,
  rungCost,
  totalHintCost,
  type HintPolicy,
} from './policy'
export const UNVERIFIED_CHANGE_PENALTY = 10
export const FIX_BEFORE_EVIDENCE_PENALTY = 5
/**
 * What it costs to take a colleague's word on a shared line as proof of who is
 * calling. It is a process cost, not a cheaper check: the call established a
 * different person, so it cannot stand in for verifying the employee and the
 * safety item stays unmet. Acting on it afterwards is priced separately, by the
 * unverified change it turns out to be.
 */
export const SHARED_LINE_CALLBACK_PENALTY = 5

/**
 * What a refusal earns when it stopped the work but named the wrong pretext.
 *
 * A refusal does two things: it stops the request, and it records which rule the
 * request broke. Refusing for a mismatched reason does the first and not the
 * second, so the step is half earned — the account was protected, but the report
 * does not say what Security is looking for. The attempt can still pass; it just
 * cannot pass strongly on a report that names the wrong ask.
 */
export const MISMATCHED_REFUSAL_CREDIT = 0.5

/**
 * How strong each way of proving a caller is. The live code and a walk-up with
 * photo ID reach the person themselves; a badge proves whoever presented it; a
 * callback reaches whoever answers a line; the printed PIN is a fixed secret
 * that could have been read by someone else.
 *
 * The rank decides whether a check was the best one available, and the penalty
 * is what the weaker choice costs when a stronger one was on the table.
 */
export const VERIFICATION_METHOD_RANK: Record<VerificationMethod, number> = {
  'in-person': 0,
  'verification-code': 0,
  'badge-scan': 3,
  callback: 5,
  'letter-pin': 8,
}

export const WEAKER_METHOD_PENALTY: Record<VerificationMethod, number> = {
  'in-person': 0,
  'verification-code': 0,
  'badge-scan': 3,
  callback: 5,
  'letter-pin': 8,
}

const METHOD_LABELS: Record<VerificationMethod, string> = {
  'in-person': 'a walk-up with photo ID',
  'verification-code': 'a live code read back',
  'badge-scan': 'a badge scan at the desk',
  callback: 'a callback',
  'letter-pin': 'the PIN from the letter',
}

/**
 * What a check costs when a stronger one was available, and zero otherwise. The
 * gate still clears — this is a process cost, not a failed proof.
 */
export function weakerVerificationCost(
  method: VerificationMethod,
  available: readonly VerificationMethod[],
): number {
  if (available.length === 0) {
    return 0
  }
  const best = Math.min(...available.map((candidate) => VERIFICATION_METHOD_RANK[candidate]))
  return VERIFICATION_METHOD_RANK[method] > best ? WEAKER_METHOD_PENALTY[method] : 0
}
/**
 * What a callback costs when the caller's phone could have taken a code.
 *
 * The callback still clears the gate — it is a real check, and the only one
 * available when the handset is out of action — but it reaches whoever answers
 * the line on file, while a read-back proves the person on the call holds the
 * handset the code was sent to. Choosing the weaker check while the stronger
 * one was available is a process cost, not a failed gate.
 */
export const CALLBACK_OVER_CODE_PENALTY = 5
/** Paid once, on a closed network ticket whose map has no unproved link. */
export const TOPOLOGY_BONUS_XP = 25

/** Changes that only a verified caller can authorise. */
const VERIFICATION_SENSITIVE_EFFECTS: readonly EffectType[] = [
  'account_unlocked',
  'password_reset',
  'mfa_reset',
  'signin_unblocked',
  'group_member_added',
  'share_deny_removed',
]

/**
 * Opening or closing a support session moves the session record, not the
 * machine: it is how the desk reaches a machine, so it is not a fix made before
 * the evidence and does not count as one here.
 */
const SESSION_EFFECTS: ReadonlySet<EffectType> = new Set(['remote_connected', 'remote_ended'])

/** Read-only commands: seeing one of these means the evidence came first. */
const EVIDENCE_COMMANDS: ReadonlySet<string> = new Set([
  'ipconfig',
  'ping',
  'nslookup',
  'test-netconnection',
  'get-account',
  'get-signin-log',
  'get-dhcp-scope',
  'get-printers',
  'get-printqueue',
  'get-share-access',
  'get-mailbox',
  'get-quarantine',
  'get-messages',
  'trace-message',
  'get-remote-machine',
  'get-sessions',
  'get-deployment',
  'get-deployment-queue',
])

const CATEGORIES: readonly RubricCategory[] = [
  'diagnosis',
  'documentation',
  'resolution',
  'safety',
]

/**
 * The categories in the learner's words. The debrief, the feedback lines and the
 * penalty notices all read from here, so a category is never printed as the key
 * the scorer stores it under.
 */
export const CATEGORY_LABELS: Record<RubricCategory, string> = {
  diagnosis: 'Diagnostic reasoning',
  documentation: 'Documentation',
  resolution: 'Resolution',
  safety: 'Safety',
}

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

/**
 * Which verification method a recorded action used, or null when the log does
 * not say. An action that names no method cannot stand in for a named one.
 */
function verificationMethodOf(action: EvaluatorAction): VerificationMethod | null {
  const method = action.input.method
  return method === 'verification-code' ||
    method === 'callback' ||
    method === 'badge-scan' ||
    method === 'letter-pin' ||
    method === 'in-person'
    ? method
    : null
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
      // A recorded verification only counts when it actually verified someone,
      // and, when the item names a method, when it was that method: a code read
      // back is not a call placed, and the log has to say which one happened.
      // It also has to have proved the person on the ticket: a call to a shared
      // line records that a colleague answered, which is somebody else however
      // friendly the confirmation sounded.
      return (
        action.kind === 'verify-caller' &&
        action.output.verified !== false &&
        action.output.provesCaller !== false &&
        (!spec.method || verificationMethodOf(action) === spec.method)
      )
    case 'deny-caller':
      // Only a recorded refusal counts; a note that says "denied" is not an
      // action. When the item names a reason, the refusal has to have been for
      // that reason: the decision is which rule the request broke. A refusal
      // filed under another reason still happened, which is why it can satisfy
      // a sequence or an absence even though it does not satisfy this check.
      return (
        action.kind === 'deny-caller' &&
        action.output.denied !== false &&
        (!spec.reason || action.input.reason === spec.reason)
      )
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

/** The refusal the log recorded, whatever reason it was filed under. */
function recordedRefusal(actions: readonly EvaluatorAction[]): EvaluatorAction | null {
  return (
    actions.find((action) => action.kind === 'deny-caller' && action.output.denied !== false) ??
    null
  )
}

/**
 * What a check earned: all of it, none of it, or — for the one check where a
 * partly right answer exists — half.
 *
 * A refusal is the only action that carries a "why". Refusing for the wrong
 * reason is not the same as not refusing: the caller was stopped, which is the
 * harm the step protects against, and only the record of the pretext is wrong.
 * That half is priced here rather than folded into the pass/fail gate, so the
 * debrief can point at what is still unearned instead of zeroing the step.
 */
function checkCredit(
  spec: CheckSpec,
  actions: readonly EvaluatorAction[],
  world: World,
  decision: SessionDecision,
): number {
  if (spec.kind === 'deny-caller' && spec.reason) {
    const refusal = recordedRefusal(actions)
    if (!refusal) {
      return 0
    }
    return refusal.input.reason === spec.reason ? 1 : MISMATCHED_REFUSAL_CREDIT
  }
  return isSatisfiedAnywhere(actions, spec, world, decision) ? 1 : 0
}

/**
 * The share of a step an attempt earned. Old scores kept no share, so their
 * pass flag is read as the whole step or nothing — which is what it meant.
 */
export function itemCredit(item: Pick<RubricItemResult, 'passed' | 'credit'>): number {
  if (typeof item.credit === 'number' && Number.isFinite(item.credit)) {
    return Math.min(1, Math.max(0, item.credit))
  }
  return item.passed ? 1 : 0
}

/**
 * The whole points a step earned. Rounded per step because the debrief shows
 * points, and a card reading 12.5/30 would be a number the screen cannot hold.
 */
export function itemPoints(
  item: Pick<RubricItemResult, 'weight' | 'passed' | 'credit'>,
): number {
  return Math.round(item.weight * itemCredit(item))
}

function commandName(action: EvaluatorAction): string | null {
  if (action.kind !== 'command') {
    return null
  }
  const parsed = parseCommandLine(commandText(action))
  return parsed.ok ? (findCommand(parsed.command.name)?.name ?? null) : null
}

/**
 * Reads the attempt once and prices each process mistake at most once, so
 * repeating an error cannot inflate the penalty.
 *
 * `availableMethods` is what the caller could actually offer on this ticket,
 * with a code sent to a dead handset already filtered out. A check that cleared
 * the gate still counts; it is only priced when a stronger check was on the
 * table and the desk took the weaker one.
 */
export function detectProcedureViolations(
  actions: readonly EvaluatorAction[],
  options: { availableMethods: readonly VerificationMethod[] },
): ProcedureViolation[] {
  let verified = false
  let verifiedBy: VerificationMethod | null = null
  let colleagueAnswered = false
  let evidenceSeen = false
  let unverifiedChange = false
  let fixBeforeEvidence = false

  for (const action of actions) {
    if (action.kind === 'verify-caller') {
      // A colleague answering a shared line is proof of somebody else, so it
      // gets its own finding rather than the weaker-check price: the two
      // mistakes are not the same, and only one of them is a real proof.
      if (action.output.result === 'colleague-answered') {
        colleagueAnswered = true
        continue
      }
      if (action.output.verified === false) {
        continue
      }
      if (!verified) {
        verified = true
        // The check that actually cleared the gate is the one that counted: a
        // weaker check after a stronger one cannot undo the stronger proof.
        verifiedBy = verificationMethodOf(action)
      }
      continue
    }
    if (action.kind !== 'command') {
      continue
    }

    const effects = effectsOf(action)
    if (!evidenceSeen && effects.length === 0) {
      const name = commandName(action)
      if (name && EVIDENCE_COMMANDS.has(name)) {
        evidenceSeen = true
      }
    }

    for (const effect of effects) {
      if (!verified && VERIFICATION_SENSITIVE_EFFECTS.includes(effect.type)) {
        unverifiedChange = true
      }
      if (!evidenceSeen && !SESSION_EFFECTS.has(effect.type)) {
        fixBeforeEvidence = true
      }
    }
  }

  const violations: ProcedureViolation[] = []
  if (unverifiedChange) {
    violations.push({
      id: 'unverified-change',
      label: 'Changed the account before verifying the caller',
      detail:
        'An account change was made before anyone proved they were the person on the ticket.',
      points: UNVERIFIED_CHANGE_PENALTY,
      category: 'safety',
    })
  }
  if (fixBeforeEvidence) {
    violations.push({
      id: 'fix-before-evidence',
      label: 'Changed something before reading any evidence',
      detail: 'No read-only check came before the fix, so the change was not justified by its state.',
      points: FIX_BEFORE_EVIDENCE_PENALTY,
      category: 'diagnosis',
    })
  }
  if (colleagueAnswered) {
    violations.push({
      id: 'callback-to-shared-line',
      label: 'Took a colleague’s word for who was calling',
      detail:
        'A shared team line was rung and a colleague answered. They can confirm what the team knows, but they are not the employee on the ticket, so the call verified somebody else and the caller is still unproven.',
      points: SHARED_LINE_CALLBACK_PENALTY,
      category: 'safety',
    })
  }
  if (verifiedBy && !colleagueAnswered) {
    const cost = weakerVerificationCost(verifiedBy, options.availableMethods)
    if (cost > 0) {
      const best = options.availableMethods.reduce((left, right) =>
        VERIFICATION_METHOD_RANK[left] <= VERIFICATION_METHOD_RANK[right] ? left : right,
      )
      violations.push(
        verifiedBy === 'callback'
          ? {
              id: 'callback-instead-of-code',
              label: 'Rang back instead of having a code read back',
              detail:
                'The caller’s phone could take a code, so the read-back was the check to make. A callback only proves that somebody on that line answered.',
              points: cost,
              category: 'safety',
            }
          : {
              id: 'weaker-verification',
              label: `Proved the caller with ${METHOD_LABELS[verifiedBy]}`,
              detail: `A stronger check was available: ${METHOD_LABELS[best]}. ${METHOD_LABELS[verifiedBy]} is still a real proof, but it leaves more room for someone else to answer for the employee.`,
              points: cost,
              category: 'safety',
            },
      )
    }
  }
  return violations
}

function notesOfKind(
  actions: readonly EvaluatorAction[],
  spec: Extract<CheckSpec, { kind: 'note-covers' }>,
): string[] {
  return actions.flatMap((action) => {
    if (action.kind !== 'note' || action.input.noteKind !== spec.noteKind) {
      return []
    }
    const text = typeof action.input.text === 'string' ? action.input.text.trim() : ''
    return text.length >= (spec.minLength ?? 1) ? [text] : []
  })
}

function hasNoteOfKind(
  actions: readonly EvaluatorAction[],
  spec: { noteKind: 'troubleshooting' | 'customer' | 'resolution' },
): boolean {
  return actions.some((action) => {
    if (action.kind !== 'note' || action.input.noteKind !== spec.noteKind) {
      return false
    }
    const text = typeof action.input.text === 'string' ? action.input.text.trim() : ''
    return text.length > 0
  })
}

function missingNoteParts(
  actions: readonly EvaluatorAction[],
  spec: Extract<CheckSpec, { kind: 'note-covers' }>,
): NoteCoveragePart[] {
  // The scoring read and a refusal close's own check are one matcher: a note
  // that covers a part here covers it on the close form as well.
  return missingNotePartsIn(notesOfKind(actions, spec).join('\n'), spec.parts)
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
    case 'note-covers':
      return missingNoteParts(actions, spec).length === 0
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

/**
 * `matchSequence`, but it keeps the actions that matched as well as the verdict,
 * so credit can be given to the sequence that actually proved the check.
 */
function sequenceIndices(
  specs: readonly CheckSpec[],
  actions: readonly EvaluatorAction[],
  start: number,
): number[] | null {
  let cursor = start
  const matched: number[] = []
  for (const spec of specs) {
    let found = false
    for (let index = cursor; index < actions.length; index += 1) {
      const action = actions[index]
      if (!action) {
        continue
      }
      if (spec.kind === 'ordered') {
        const nested = sequenceIndices(spec.of, actions, index)
        if (nested) {
          matched.push(...nested)
          found = true
          cursor = index + 1
          break
        }
      } else if (actionSatisfies(spec, action)) {
        matched.push(index)
        found = true
        cursor = index + 1
        break
      }
    }
    if (!found) {
      return null
    }
  }
  return matched
}

/**
 * The actions that proved a check. A command check is proved by the first action
 * that met it: running the same read again adds to the log but proves nothing
 * the attempt did not already have, so the repeat earns nothing. A check no
 * action can satisfy — an absence, a note's coverage, the closure decision, the
 * world left behind — names no command, and the debrief does not pretend a typed
 * line earned what a sentence or a closure code did.
 */
function provingIndices(spec: CheckSpec, actions: readonly EvaluatorAction[]): number[] {
  if (spec.kind === 'ordered') {
    return sequenceIndices(spec.of, actions, 0) ?? []
  }
  if (spec.kind !== 'ran' && spec.kind !== 'effect') {
    return []
  }
  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index]
    if (action && actionSatisfies(spec, action)) {
      return [index]
    }
  }
  return []
}

/**
 * Which steps of the rubric each recorded action earned, by index into the log.
 * A step is credited only to the actions that proved it on an attempt that went
 * on to earn its points, so a command that proved part of a step which still
 * fell short is not dressed up as credit.
 */
export function commandCreditLedger(
  actions: readonly EvaluatorAction[],
  rubric: Rubric,
  world: World,
  decision: SessionDecision,
): Map<number, string[]> {
  const ledger = new Map<number, string[]>()

  for (const item of rubric.items) {
    const passed = item.checks.every((spec) =>
      isSatisfiedAnywhere(actions, spec, world, decision),
    )
    if (!passed) {
      continue
    }

    const credited = new Set<number>()
    for (const spec of item.checks) {
      for (const index of provingIndices(spec, actions)) {
        if (credited.has(index)) {
          continue
        }
        credited.add(index)

        const labels = ledger.get(index) ?? []
        ledger.set(index, labels)
        if (!labels.includes(item.label)) {
          labels.push(item.label)
        }
      }
    }
  }

  return ledger
}

/*
 * The debrief is written for the person who worked the ticket. Every finding
 * starts from what they did ("You unlocked the account") or from the silence
 * ("No record that you ..."), never from the evaluator's vocabulary of check
 * kinds, effect names, and boolean flags.
 */
/**
 * How each change reads in a sentence. The target is placed where the sentence
 * wants it — "unlocked tbrooks’ account", "restarted the spooler on LT-4471" —
 * rather than appended in brackets, which reads like a query result instead of
 * something the learner did.
 */
const EFFECT_PHRASES: Record<EffectType, (target?: string) => string> = {
  account_unlocked: (target) =>
    target ? `unlocked ${target}’s account` : 'unlocked the account',
  password_reset: (target) => (target ? `reset ${target}’s password` : 'reset the password'),
  dns_changed: (target) =>
    target ? `corrected the DNS servers on ${target}` : 'corrected the DNS servers',
  dns_cache_flushed: () => 'flushed the DNS cache',
  lease_renewed: (target) =>
    target ? `renewed the DHCP lease on ${target}` : 'renewed the DHCP lease',
  spooler_restarted: (target) =>
    target ? `restarted the print spooler on ${target}` : 'restarted the print spooler',
  print_queue_cleared: (target) =>
    target ? `cleared the stuck print jobs on ${target}` : 'cleared the stuck print jobs',
  default_printer_changed: (target) =>
    target ? `made ${target} the default printer` : 'changed the default printer',
  dhcp_lease_removed: (target) =>
    target ? `removed the stale lease ${target}` : 'removed the stale DHCP lease',
  mfa_reset: (target) =>
    target ? `cleared the MFA methods registered for ${target}` : 'cleared the MFA methods',
  signin_unblocked: (target) =>
    target ? `cleared the sign-in block on ${target}` : 'cleared the sign-in block',
  group_member_added: (target) => {
    const [group, member] = (target ?? '').split('/')
    return group && member ? `restored ${member} to ${group}` : 'restored group membership'
  },
  share_deny_removed: (target) =>
    target ? `removed the explicit share deny on ${target}` : 'removed the explicit share deny',
  mail_released: (target) =>
    target ? `released the held message ${target}` : 'released the held message',
  sender_blocked: (target) => (target ? `blocked ${target}` : 'blocked the sender'),
  forwarding_cleared: (target) =>
    target ? `removed the mailbox forwarding on ${target}` : 'removed the mailbox forwarding',
  remote_connected: (target) => (target ? `connected to ${target}` : 'connected to the machine'),
  remote_ended: (target) =>
    target ? `ended the remote session on ${target}` : 'ended the remote session',
  machine_rebooted: (target) => (target ? `restarted ${target}` : 'restarted the machine'),
  updates_installed: (target) =>
    target ? `installed the missing updates on ${target}` : 'installed the missing updates',
  disk_cleaned: (target) =>
    target ? `freed up disk space on ${target}` : 'freed up disk space',
  user_signed_out: (target) =>
    target ? `signed the user out of ${target}` : 'signed the user out',
  deployment_started: (target) =>
    target ? `started the imaging run on ${target}` : 'started the imaging run',
  deployment_completed: (target) =>
    target ? `completed the imaging run on ${target}` : 'completed the imaging run',
  machine_issued: (target) =>
    target ? `issued ${target} to its new holder` : 'issued the machine',
  shelf_held: (target) =>
    target ? `held ${target} on the shelf` : 'held the machine on the shelf',
  shipment_dispatched: (target) =>
    target ? `dispatched shipment ${target}` : 'dispatched the shipment',
  shipment_delivered: (target) =>
    target ? `recorded shipment ${target} as delivered` : 'recorded the shipment as delivered',
  shipment_rebooked: (target) =>
    target ? `rebooked shipment ${target}` : 'rebooked the shipment',
}

const ASK_PHRASES: Record<string, string> = {
  'what-error': 'what the error message said',
  'when-start': 'when the problem started',
  'what-changed': 'what had changed',
  'other-users': 'whether anyone else was affected',
  'already-tried': 'what they had already tried',
}

const NOTE_PHRASES = {
  troubleshooting: 'left a troubleshooting note',
  customer: 'sent the customer a plain-language update',
  resolution: 'wrote the handoff note',
} as const

const NOTE_NOUNS = {
  troubleshooting: 'troubleshooting note',
  customer: 'customer update',
  resolution: 'handoff note',
} as const

/** The verb phrase for one check, with no person and no ending punctuation. */
function actionPhrase(spec: CheckSpec): string {
  switch (spec.kind) {
    case 'ran':
      return `ran ${spec.command}${spec.argsInclude ? ` ${spec.argsInclude}` : ''}`
    case 'effect':
      return EFFECT_PHRASES[spec.effect](spec.target)
    case 'verify-caller':
      if (spec.method === 'callback') {
        return 'rang the caller back on a number on file'
      }
      if (spec.method === 'verification-code') {
        return 'verified the caller with a verification code'
      }
      if (spec.method === 'badge-scan') {
        return 'scanned the caller’s badge at the desk'
      }
      if (spec.method === 'letter-pin') {
        return 'verified the PIN from the onboarding letter'
      }
      if (spec.method === 'in-person') {
        return 'checked photo ID at the desk'
      }
      return 'verified the caller before changing anything'
    case 'deny-caller': {
      const reason = spec.reason ? refusalReasonInfo(spec.reason) : null
      return reason
        ? `refused the request — “${reason.label}” — and reported it to Security`
        : 'refused the request and reported it to Security'
    }
    case 'ask':
      return `asked the caller ${ASK_PHRASES[spec.intent ?? ''] ?? 'a diagnostic question'}`
    case 'note':
      return NOTE_PHRASES[spec.noteKind]
    case 'note-covers':
      return `wrote a ${NOTE_NOUNS[spec.noteKind]} that covered ${spec.parts.map((part) => part.label).join(', ')}`
    case 'ordered':
      // "and then", not "then": the phrase is read inside a sentence about what
      // the learner did, and a comma-joined list reads like a machine log.
      return spec.of.map(actionPhrase).join(' and then ')
    case 'absent':
      return `did not ${actionPhrase(spec.of)}`
    case 'decision':
      if (spec.codes?.includes('denied-social-engineering')) {
        return 'closed the ticket as a security denial'
      }
      return spec.outcome === 'resolved'
        ? 'closed the ticket as resolved'
        : 'closed the ticket as an escalation'
    case 'world':
      return 'left the machine in the required state'
  }
}

/**
 * A refusal that stopped the work under the wrong pretext. The debrief has to
 * say which reason was filed and which one the ticket needed, because "refused"
 * alone reads as a pass and the missing half is the part Security relies on.
 */
function mismatchedRefusalFinding(
  spec: CheckSpec & { kind: 'deny-caller' },
  actions: readonly EvaluatorAction[],
): string {
  const refusal = recordedRefusal(actions)
  const filed =
    refusal && typeof refusal.input.reason === 'string'
      ? refusalReasonInfo(refusal.input.reason)
      : null
  const needed = spec.reason ? refusalReasonInfo(spec.reason) : null
  const filedLabel = filed?.label ?? 'a reason this desk does not record'
  const rule = needed?.detail ?? 'That rule is the one this request broke.'
  return `Partial credit: you refused the request, but filed it as “${filedLabel}” rather than “${needed?.label ?? 'the reason this ticket needed'}”. ${rule} A refusal earns this step in full when its reason names the pretext that actually applied.`
}

function findingFor(
  spec: CheckSpec,
  credit: number,
  actions: readonly EvaluatorAction[],
): string {
  const passed = credit === 1

  if (spec.kind === 'absent') {
    return passed
      ? `You ${actionPhrase(spec)}.`
      : `You ${actionPhrase(spec.of)}, which this ticket did not call for.`
  }

  if (spec.kind === 'note') {
    if (passed) {
      return `You ${NOTE_PHRASES[spec.noteKind]}.`
    }
    const attempted = hasNoteOfKind(actions, spec)
    return attempted
      ? `Your ${NOTE_NOUNS[spec.noteKind]} was too short to count as a usable record.`
      : `No ${NOTE_NOUNS[spec.noteKind]} was left.`
  }

  // The decision the learner made and the one the ticket needed are two
  // different things; saying only "no record" hides which way it went wrong.
  if (spec.kind === 'decision' && !passed) {
    return spec.outcome === 'resolved'
      ? 'You escalated the ticket, but this one was yours to resolve.'
      : 'You closed the ticket as resolved, but it needed another team.'
  }

  // A refused request is not answered by "no record": the record exists, and
  // what is wrong with it is the reason it was filed under.
  if (spec.kind === 'deny-caller' && credit > 0 && credit < 1) {
    return mismatchedRefusalFinding(spec, actions)
  }

  return passed
    ? `You ${actionPhrase(spec)}.`
    : `No record that you ${actionPhrase(spec)}.`
}

/** A handoff check reports each coverage part separately so the debrief is specific. */
function findingsForSpec(
  spec: CheckSpec,
  credit: number,
  actions: readonly EvaluatorAction[],
  gapsOnly = false,
): string[] {
  if (spec.kind !== 'note-covers') {
    return [findingFor(spec, credit, actions)]
  }
  const passed = credit === 1
  // A note that is too short to use is not judged on coverage: the learner
  // needs to know it did not count, not that its words missed a heading.
  if (!passed && hasNoteOfKind(actions, spec) && notesOfKind(actions, spec).length === 0) {
    return [`Your ${NOTE_NOUNS[spec.noteKind]} was too short to hand over.`]
  }

  const missing = new Set(missingNoteParts(actions, spec).map((part) => part.id))
  const findings = spec.parts
    .filter((part) => !gapsOnly || missing.has(part.id))
    .map((part) =>
      missing.has(part.id)
        ? `Your ${NOTE_NOUNS[spec.noteKind]} did not cover ${part.label}.`
        : `Your ${NOTE_NOUNS[spec.noteKind]} covered ${part.label}.`,
    )

  // A handoff can cover every part and still fail for being too short.
  if (!passed && missing.size === 0) {
    const tooShort = `Your ${NOTE_NOUNS[spec.noteKind]} was too short to hand over.`
    return gapsOnly ? [tooShort] : [...findings, tooShort]
  }
  return findings
}

function evaluateItem(item: RubricItem, input: EvaluationInput): RubricItemResult {
  const checks = item.checks.map((spec) => ({
    spec,
    credit: checkCredit(spec, input.actions, input.world, input.decision),
  }))
  // Each check is an equal share of the step, so a step with one partly answered
  // check earns that share and owes the rest.
  const credit =
    checks.length === 0
      ? 1
      : checks.reduce((sum, check) => sum + check.credit, 0) / checks.length
  const passed = checks.every((check) => check.credit === 1)
  const evidence: string[] = []
  const gaps: string[] = []

  for (const check of checks) {
    evidence.push(...findingsForSpec(check.spec, check.credit, input.actions))
    if (check.credit < 1) {
      // A handoff that covered two parts still owes only the third; the parts
      // that passed are findings, not gaps.
      gaps.push(...findingsForSpec(check.spec, check.credit, input.actions, true))
    }
  }

  return {
    id: item.id,
    label: item.label,
    category: item.category,
    weight: item.weight,
    critical: item.critical,
    passed,
    credit,
    why: item.why,
    hints: item.hints,
    evidence,
    gaps,
  }
}

function linkReport(groupTitle: string, check: TopologyCheck): TopologyLinkReport {
  return { label: `${groupTitle} · ${check.label}`, command: check.command }
}

/**
 * The map is read once at close. A link that was never tested is reported as
 * untested; one that was tested and failed keeps that distinction.
 */
function summarizeTopology(topology: TopologyView): TopologyCoverage {
  const untested: TopologyLinkReport[] = []
  const failed: TopologyLinkReport[] = []

  for (const group of topology.groups) {
    for (const check of group.checks) {
      if (check.state === 'unknown') {
        untested.push(linkReport(group.title, check))
      } else if (check.state === 'failed') {
        failed.push(linkReport(group.title, check))
      }
    }
  }

  const allProved = topology.total > 0 && topology.proved === topology.total
  return {
    totalLinks: topology.total,
    provedLinks: topology.proved,
    bonusXp: allProved ? TOPOLOGY_BONUS_XP : 0,
    untested,
    failed,
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
    category.earned += itemPoints(item)
  }

  const possible = items.reduce((total, item) => total + item.weight, 0)
  const earned = items.reduce((total, item) => total + itemPoints(item), 0)
  const rawTotal = possible === 0 ? 0 : Math.round((earned / possible) * 100)

  // Both are read from the recorded attempt, not from anything the interface
  // claims. Each hint is priced by the attempt's own policy, up to its cap; a
  // process violation is priced in the category it damages, and only once
  // however often it is repeated.
  const hintPolicy = normalizeHintPolicy(input.hints ?? null)
  const hintsUsed = input.actions.filter((action) => action.kind === 'hint').length
  const hintPenalty = totalHintCost(hintPolicy, hintsUsed)
  const violations = detectProcedureViolations(input.actions, {
    availableMethods: usableCallerVerificationMethods({
      mobileInService: input.world.mobileOutOfAction !== true,
      onSite: input.world.callerOnSite === true,
      letterPinOnFile: input.world.letterPinOnFile === true,
    }),
  })
  const procedurePenalty = violations.reduce((sum, violation) => sum + violation.points, 0)
  const total = Math.max(0, rawTotal - procedurePenalty - hintPenalty)

  for (const violation of violations) {
    const category = categoryScores[violation.category]
    category.earned = Math.max(0, category.earned - violation.points)
  }

  if (hintPenalty > 0) {
    const diagnosis = categoryScores.diagnosis
    diagnosis.earned = Math.max(0, diagnosis.earned - hintPenalty)
  }

  // The findings, not the item labels: a step that was never done cannot be
  // listed as "Unlocked tbrooks", and a label is rubric authoring vocabulary the
  // learner has never seen. A critical item always has at least one gap.
  //
  // A partly earned step is not a missed gate: the refusal happened, and what is
  // wrong is the reason written beside it. Blocking the whole attempt on that
  // would price a wrong sentence like a leaked password, so the shortfall is
  // carried by the score and named in the step instead.
  const failedCritical = items.filter(
    (item) => item.critical && itemCredit(item) === 0,
  )
  const criticalFailures: string[] = []
  for (const item of failedCritical) {
    const gaps = item.gaps && item.gaps.length > 0 ? item.gaps : [item.label]
    for (const gap of gaps) {
      // The same missing action is reported once on its own and once inside the
      // sequence it belonged to. Keep the fuller sentence instead of reading
      // the same absence twice.
      if (criticalFailures.some((said) => gap.includes(said))) continue
      const covered = criticalFailures.findIndex((said) => said.includes(gap))
      if (covered >= 0) {
        criticalFailures[covered] = gap
        continue
      }
      criticalFailures.push(gap)
    }
  }
  const passed = criticalFailures.length === 0 && total >= input.rubric.passThreshold

  let band: ScoreBand = 'fail'
  if (passed) {
    band = total >= input.rubric.strongThreshold ? 'strong' : 'pass'
  }

  const feedback: string[] = []
  // A finding is said once. The critical summary quotes the same sentences the
  // step list below would, so the list would otherwise open by repeating itself.
  const said = new Set<string>()
  const add = (line: string) => {
    if (!said.has(line)) {
      said.add(line)
      feedback.push(line)
    }
  }

  if (criticalFailures.length > 0) {
    add(`This attempt cannot pass yet. ${criticalFailures.join(' ')}`)
  }

  for (const violation of violations) {
    add(
      `Procedure cost: −${violation.points} from ${CATEGORY_LABELS[violation.category]} — ${violation.label}. ${violation.detail}`,
    )
  }

  if (hintsUsed > 0) {
    const cost = hintsAreFree(hintPolicy)
      ? 'they were free on this device'
      : `${hintPolicy.perHint} per hint, capped at ${hintPolicy.cap}`
    add(
      `${hintsUsed} hint${hintsUsed === 1 ? '' : 's'} revealed, costing ${hintPenalty} point${hintPenalty === 1 ? '' : 's'} of diagnostic reasoning (${cost}).`,
    )
  }

  for (const item of items) {
    if (item.passed) {
      if (item.category === 'resolution' || item.critical) {
        // What the attempt did, in the same words as the finding above it.
        add(item.evidence[0] ?? `${item.label}.`)
      }
      continue
    }
    // A critical step's findings are already in the summary line above; saying
    // them again is the repetition this whole list is supposed to avoid.
    if (failedCritical.includes(item)) {
      continue
    }
    const gaps = item.gaps ?? item.evidence.filter((entry) => entry.startsWith('missing:'))
    const plain = gaps.map((entry) => entry.replace(/^(met|missing): /, ''))
    add(plain.length > 0 ? plain.join(' ') : 'This step was not met.')
  }

  const categorySummary = CATEGORIES.filter((category) => categoryScores[category].possible > 0)
    .map(
      (category) =>
        `${CATEGORY_LABELS[category]} ${categoryScores[category].earned}/${categoryScores[category].possible}`,
    )
    .join(' · ')
  feedback.push(`Where the points went: ${categorySummary}.`)

  // The proof bonus is a property of the closed network ticket, not of the
  // pass mark: a thorough map still earns it on an attempt that fell short.
  const topologyMap =
    input.closing && input.networkTicket ? (input.topology ?? null) : null
  // The summary and the picture are kept together: the debrief reworks the
  // counts, but only the snapshot says which link each one was.
  const topology = topologyMap ? summarizeTopology(topologyMap) : null
  // The base formula is shared with every other scorer — the Intune console
  // earns on the same terms — and the proof bonus is this surface's own.
  const xp =
    attemptXp({ difficulty: input.difficulty, passed, band }) + (topology?.bonusXp ?? 0)

  return {
    total,
    passed,
    band,
    categoryScores,
    items,
    criticalFailures,
    feedback,
    xp,
    hintsUsed,
    hintPenalty,
    hintPolicy,
    violations,
    procedurePenalty,
    topology,
    topologyMap,
  }
}
