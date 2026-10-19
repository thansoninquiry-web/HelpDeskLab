import type { JsonObject } from '../shared/json'
import type { ActionKind } from './types'

/**
 * One time the caller broke in, and the step they broke in over. The debrief
 * reads this from the attempt's own log, so the count, the words and the step
 * each line followed cannot disagree with the trail.
 */
export interface PressureBeat {
  /** What the caller said, in their own words. */
  message: string
  /** What the desk had just done when the caller cut in. */
  after: string
  atMs: number
}

export interface PressureReport {
  /** Break-ins recorded on the call, rather than answers to a question. */
  interruptions: number
  /** Each break-in, oldest first, with the step it followed. */
  beats: PressureBeat[]
}

/** The part of a logged action this report reads. */
export interface PressureLogStep {
  kind: ActionKind
  atMs: number
  input: JsonObject
  output: JsonObject
}

/** The note names the workspace uses, so the debrief describes the same save. */
const NOTE_LABELS: Record<string, string> = {
  troubleshooting: 'troubleshooting note',
  customer: 'customer update',
  resolution: 'handoff note',
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

/** A caller line the log recorded on its own, rather than an answer to a question. */
function isInterruption(step: PressureLogStep): boolean {
  return step.kind === 'ask-user' && step.output.interruption === true
}

/**
 * The step a break-in followed, in the learner's words. This is the action
 * immediately before the line in the log — the thing the caller was reacting
 * to, whether the desk changed an account, saved a note, or simply carried on.
 */
function afterPhrase(step: PressureLogStep | undefined): string {
  if (!step) {
    return 'at the start of the call'
  }

  switch (step.kind) {
    case 'command': {
      const command = text(step.input.command).trim()
      return command ? `after you ran \`${command}\`` : 'after you ran a command'
    }
    case 'ask-user':
      return isInterruption(step)
        ? 'after they broke in again'
        : 'after you asked the caller a question'
    case 'note': {
      const label = NOTE_LABELS[text(step.input.noteKind)] ?? 'note'
      return `after you saved your ${label}`
    }
    case 'verify-caller':
      return step.output.verified === false
        ? 'after a failed identity check'
        : 'after you verified the caller'
    case 'code-sent': {
      const recipient = text(step.input.recipientName).trim()
      return recipient
        ? `after you sent a verification code to ${recipient}`
        : 'after you sent a verification code'
    }
    case 'deny-caller':
      return 'after you refused the request'
    case 'hint':
      return 'after you took a hint'
    case 'rewind': {
      const dropped = typeof step.input.dropped === 'number' ? step.input.dropped : 0
      if (dropped <= 0) {
        return 'after you un-ran part of the log'
      }
      return `after you un-ran ${dropped} step${dropped === 1 ? '' : 's'}`
    }
  }
}

/**
 * How hard the caller pressed: every break-in the log still holds, each with
 * the step it followed. A quiet call reports zero beats rather than an empty
 * section the debrief has to explain away.
 */
export function pressureReport(steps: readonly PressureLogStep[]): PressureReport {
  const beats: PressureBeat[] = []

  steps.forEach((step, index) => {
    if (!isInterruption(step)) {
      return
    }
    beats.push({
      message: text(step.output.answer).trim() || 'The caller broke in.',
      after: afterPhrase(steps[index - 1]),
      atMs: step.atMs,
    })
  })

  return { interruptions: beats.length, beats }
}
