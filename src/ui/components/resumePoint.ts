import type { ResumePoint } from '../../app/practiceService'
import { SOURCE_LABELS } from './sourceLabel'

/**
 * Where an open attempt would put the learner back, as the queue says it:
 * "the Printers console, 3 steps in".
 *
 * The console is named from the same label set as every other surface that says
 * where a step came from, so the queue cannot call a console something the log
 * does not. The article is part of the phrase because every call site reads it
 * after a preposition — "left off in the Printers console" — and no surface
 * should have to guess one.
 */
export function resumeWhere(point: ResumePoint): string {
  if (point.tool !== null) {
    return `the ${SOURCE_LABELS[point.tool]} console`
  }
  // No console in front, so resuming lands in the pane that was: the terminal,
  // or the picker waiting for a choice.
  return point.pane === 'terminal' ? 'the terminal' : 'the tool picker'
}

/** "1 step in", "3 steps in", or "before the first step" for a log with none. */
export function stepsIn(count: number): string {
  if (count === 0) {
    return 'before the first step'
  }
  return count === 1 ? '1 step in' : `${count} steps in`
}

/** Where a resume lands and how far in the work had got, in one phrase. */
export function resumeSummary(point: ResumePoint): string {
  return `${resumeWhere(point)}, ${stepsIn(point.steps)}`
}
