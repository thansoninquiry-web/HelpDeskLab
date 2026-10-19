import { findCommand } from './commands'
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
   * Stalling: this much work on the line, or this many minutes of the desk's
   * time, with nobody on the call identified. Once the caller is verified the
   * demand has been answered, so the stall lines stand down.
   */
  | { kind: 'stalled'; afterSteps: number; afterMinutes: number }
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
  /** Minutes the desk has been sitting on this ticket. */
  minutesWaiting: number
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

/** The steps that count as work on the call: what the desk ran or asked. */
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
        state.minutesWaiting >= trigger.afterMinutes
      )
    }
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
