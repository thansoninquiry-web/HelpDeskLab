import type { JsonObject, JsonValue } from '../shared/json'
import { applyCommand } from './reducer'
import { focusedRemoteSession } from './remoteDesktop'
import { emptyVerificationState, issueVerificationCode, nextVerificationCode } from './verification'
import type { VerificationRecipient, World } from './types'

/** One recorded step, in the order the log holds it. */
export interface ReplayStep {
  kind: string
  atMs: number
  input: JsonObject
  output: JsonObject
}

export interface ReplayContext {
  /**
   * The key an attempt's verification codes are drawn from. The log records that
   * a code went out, never what it was, so the fold draws it again from the same
   * counter — keeping hidden truth out of the log.
   */
  codeSeed: string
}

/**
 * Rebuilds the simulated world by re-running an attempt's log from the world its
 * ticket generated. Every kind that changes the world is replayed here with the
 * same function the live path used, and every other kind is evidence only, so
 * the fold leaves the world exactly as it found it.
 *
 * A rewind depends on this being exact: whatever the fold does not reproduce is
 * a change the attempt would keep after its step had been un-run.
 */
export function foldWorld(
  initial: World,
  steps: readonly ReplayStep[],
  context: ReplayContext,
): World {
  let world = structuredClone(initial)
  for (const step of steps) {
    world = applyStep(world, step, context)
  }
  return world
}

function applyStep(world: World, step: ReplayStep, context: ReplayContext): World {
  if (step.kind === 'command') {
    // A shell command ran on a machine, and the step names it: a desktop
    // terminal on the machine its session was open on, the side terminal on the
    // ticket's host. A console action may name the machine it acted on without
    // having run there, so its tag is not the execution context. The session in
    // view is the fallback for a desktop step written before machine tags.
    const source = readText(step.input.source)
    const shell = source === 'terminal' || source === 'remote-desktop-terminal'
    const recorded = readText(step.input.machine)
    const named =
      shell && recorded
        ? world.devices.find((device) => device.hostname === recorded)
        : undefined
    const session =
      named === undefined && source === 'remote-desktop-terminal'
        ? focusedRemoteSession(world)
        : undefined
    return applyCommand(
      world,
      readText(step.input.command),
      named !== undefined
        ? { deviceId: named.id }
        : session
          ? { deviceId: session.machineId }
          : {},
    ).world
  }

  // A refused request is the state the account-changing commands read, so the
  // fold has to set it too: a rewind that drops the denial has to drop the
  // block with it, and the world in hand has to match what the log folds to.
  if (step.kind === 'deny-caller') {
    return {
      ...world,
      refusal: {
        reason: readText(step.input.reason),
        label: readText(step.input.label, 'Request refused'),
        atMs: step.atMs,
      },
    }
  }

  if (step.kind === 'code-sent') {
    const state = world.verification ?? emptyVerificationState()
    const recipient: VerificationRecipient = {
      id: readText(step.input.recipientId),
      name: readText(step.input.recipientName),
      role: 'caller',
      destination: readText(step.input.destination),
      methods: ['verification-code'],
      reachable: true,
    }
    return {
      ...world,
      verification: issueVerificationCode(state, {
        code: nextVerificationCode(context.codeSeed, state.issued),
        recipient,
        now: step.atMs,
      }),
    }
  }

  return world
}

function readText(value: JsonValue | undefined, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

/**
 * Whether two worlds hold the same values, whatever order their keys were
 * written in. Used to prove a log folds back to the world in hand before
 * anything is un-run on the strength of it.
 */
export function worldsMatch(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true
  }
  if (typeof left !== typeof right || left === null || right === null) {
    return false
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false
    }
    return left.every((value, index) => worldsMatch(value, right[index]))
  }
  if (typeof left !== 'object' || typeof right !== 'object') {
    return false
  }

  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftKeys = Object.keys(leftRecord)
  if (leftKeys.length !== Object.keys(rightRecord).length) {
    return false
  }
  return leftKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(rightRecord, key) &&
      worldsMatch(leftRecord[key], rightRecord[key]),
  )
}
