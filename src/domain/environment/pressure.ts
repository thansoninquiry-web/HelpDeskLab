import { findCommand } from './commands'
import type { ConsoleId } from './console'
import { parseCommandLine } from './parser'
import type { EffectType } from './types'

/**
 * The caller on a pressured ticket does not wait to be asked. This module holds
 * the rule for when they break in; the lines themselves are ticket content.
 *
 * Everything is decided from the trace of the call so far, so the same attempt
 * always earns the same lines in the same order, whether it is read live or
 * replayed from its log.
 *
 * A line is earned one of two ways: the desk did something that plays into the
 * caller's hands, or the desk has spent the call without doing the check that
 * would end it. The second kind is why a caller has to be asked for a line even
 * when the learner has just been sitting there — an attempt where nothing is
 * happening is exactly the attempt this script is written for.
 */

/** One thing that happened on the call, in order. */
export type PressureStep =
  /** A command the desk ran, and what it changed. */
  | { kind: 'command'; command: string; effects: readonly EffectType[] }
  /** A question the desk put to the caller. */
  | { kind: 'ask' }
  /**
   * The desk opened a tool or read a record in it. `entryId` is null when the
   * console itself was opened, and the record's id once one is read.
   */
  | { kind: 'read'; consoleId: ConsoleId; entryId: string | null }
  /** The moment the caller was confirmed to be who the ticket says. */
  | { kind: 'verified' }
  /** Anything else the desk recorded: a note, a refusal, a hint. */
  | { kind: 'other' }

/**
 * What earns a line. A trigger is either the desk spending the call without
 * doing the check, or an action that plays into the caller's hands.
 */
export type PressureTrigger =
  /**
   * Stalling: this much work on the line, or this many minutes since the desk
   * last did anything, with nobody on the call identified. The clock restarts
   * on every step the desk takes, so the ladder follows the silence rather than
   * the age of the attempt: a learner who pauses after a run of work is nagged
   * afresh, and one who acts after a long pause is left alone. Once the caller
   * is verified the demand has been answered, so the stall lines stand down.
   */
  | { kind: 'stalled'; afterSteps: number; afterMinutes: number }
  /**
   * The desk looked: a tool console was opened, or a record in one was read.
   * A trigger names the console, and optionally the record, because that is the
   * part a caller can hear — being looked up, or the queue being opened.
   */
  | { kind: 'read'; consoleId: ConsoleId; entryId?: string }
  /** The desk ran the fix the caller asked for. */
  | { kind: 'obeyed'; command: string }
  /** The desk changed the account before the check that would justify it. */
  | {
      kind: 'acted-first'
      effect: EffectType
      /** Counts when the change came before this command was ever run. */
      beforeCommand?: string
      /** Counts when the change came before the caller was verified. */
      beforeVerified?: boolean
    }

export interface PressureLine {
  id: string
  trigger: PressureTrigger
  /**
   * Only due once the caller has already said one of these lines. It is how a
   * reaction to being ignored is written: the desk was warned about what it did,
   * and this line answers the fact that the warning changed nothing.
   */
  onceSaid?: readonly string[]
  /** What the caller says, in their own words. */
  message: string
}

export interface PressureState {
  /** The call so far, oldest first. */
  steps: readonly PressureStep[]
  /**
   * Minutes since the desk last acted on this ticket: the caller's clock, which
   * the app restarts on every learner step and which keeps running while the
   * desk sits still.
   */
  minutesSinceLastAction: number
  /** Ids of the lines the caller has already said on this attempt. */
  said: readonly string[]
  /**
   * The desk has refused the request. A refusal is the desk's answer to the
   * call, so there is nothing left to press for and nothing more is due.
   */
  refused?: boolean
}

function ranCommand(step: PressureStep, command: string): boolean {
  if (step.kind !== 'command') {
    return false
  }
  const parsed = parseCommandLine(step.command)
  if (!parsed.ok) {
    return false
  }
  return findCommand(parsed.command.name)?.name === command.toLowerCase()
}

function indexOfCommand(steps: readonly PressureStep[], command: string): number {
  return steps.findIndex((step) => ranCommand(step, command))
}

function indexOfVerified(steps: readonly PressureStep[]): number {
  return steps.findIndex((step) => step.kind === 'verified')
}

/**
 * The steps that count as work on the call: what the desk ran or asked. A read
 * is a look rather than work, so opening tools does not by itself walk the desk
 * up the ladder — it can still trip a line written about that look.
 */
function stepsWorked(steps: readonly PressureStep[]): number {
  return steps.filter((step) => step.kind === 'command' || step.kind === 'ask').length
}

function triggerIsDue(trigger: PressureTrigger, state: PressureState): boolean {
  switch (trigger.kind) {
    case 'stalled': {
      if (indexOfVerified(state.steps) >= 0) {
        return false
      }
      return (
        stepsWorked(state.steps) >= trigger.afterSteps ||
        state.minutesSinceLastAction >= trigger.afterMinutes
      )
    }
    case 'read':
      return state.steps.some(
        (step) =>
          step.kind === 'read' &&
          step.consoleId === trigger.consoleId &&
          (trigger.entryId === undefined || step.entryId === trigger.entryId),
      )
    case 'obeyed':
      return indexOfCommand(state.steps, trigger.command) >= 0
    case 'acted-first': {
      const changed = state.steps.findIndex(
        (step) => step.kind === 'command' && step.effects.includes(trigger.effect),
      )
      if (changed < 0) {
        return false
      }
      if (trigger.beforeCommand) {
        const looked = indexOfCommand(state.steps, trigger.beforeCommand)
        if (looked >= 0 && looked < changed) {
          return false
        }
      }
      if (trigger.beforeVerified) {
        const verified = indexOfVerified(state.steps)
        if (verified >= 0 && verified < changed) {
          return false
        }
      }
      return true
    }
  }
}

/**
 * The next line the caller has earned, or null while the desk is left alone.
 * The script is read in order, so an author puts the sharpest reaction to what
 * the desk just did ahead of the slower lines about time passing, and each line
 * is said at most once.
 */
export function duePressureLine(
  script: readonly PressureLine[],
  state: PressureState,
): PressureLine | null {
  if (state.refused) {
    return null
  }

  for (const line of script) {
    if (state.said.includes(line.id)) {
      continue
    }
    if (line.onceSaid && !line.onceSaid.some((id) => state.said.includes(id))) {
      continue
    }
    if (triggerIsDue(line.trigger, state)) {
      return line
    }
  }
  return null
}
