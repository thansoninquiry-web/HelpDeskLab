import {
  ACTION_MINUTES,
  BELL_GRACE,
  LATE_PENALTY_PER_MINUTE,
  type AcademyMode,
  type AttemptState,
  type SchoolScenario,
} from '../types'

/**
 * The school clock.
 *
 * The bell does not care how the work went, so time is a first-class part of an
 * attempt: every read and every change costs minutes, and the cost is written on
 * the record when it is made. Scoring then reads the stored minutes rather than
 * the wall clock, so a page left open overnight scores the same as one finished
 * in a sitting.
 */

export function startMinute(scenario: SchoolScenario): number {
  return scenario.bell.at - scenario.window
}

/** The labels the desk actually says: "08:42". */
export function clockLabel(minute: number): string {
  const hour = 8 + Math.floor(minute / 60)
  const minutes = ((minute % 60) + 60) % 60
  return `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function lastMinute(state: AttemptState, scenario: SchoolScenario): number {
  const times = [
    ...state.reads.map((record) => record.minute),
    ...state.changes.map((record) => record.minute),
    ...state.dialog.map((record) => record.minute),
    ...state.checklist.map((record) => record.minute),
    ...(state.triage ? [state.triage.minute] : []),
  ]
  return times.length === 0 ? startMinute(scenario) : Math.max(...times)
}

/** When the attempt closed: the last thing it did, or the start if it did nothing. */
export function closureMinute(state: AttemptState, scenario: SchoolScenario): number {
  return lastMinute(state, scenario)
}

/** The minute the next action lands on, given what the attempt has already done. */
export function nextMinute(
  state: AttemptState,
  scenario: SchoolScenario,
  kind: 'read' | 'change' | 'dialog' | 'walk-up' | 'checklist',
  walkUpMinutes = 0,
): number {
  const last = lastMinute(state, scenario)
  if (kind === 'checklist') {
    return last
  }
  if (kind === 'walk-up') {
    return last + walkUpMinutes
  }
  return last + ACTION_MINUTES[state.mode][kind]
}

/** Minutes between the bell and the close. Negative means the room was ready early. */
export function lateness(state: AttemptState, scenario: SchoolScenario): number {
  return closureMinute(state, scenario) - scenario.bell.at
}

/**
 * The urgency points, out of 10.
 *
 * Standard visits get a grace period and lose 2 points a minute after it; time
 * pressure has no grace and loses 4. That is the whole difference the mode makes
 * to the score — the rest is the cost of each action.
 */
export function urgencyPoints(state: AttemptState, scenario: SchoolScenario): number {
  const late = lateness(state, scenario)
  const grace = BELL_GRACE[state.mode]
  if (late <= grace) {
    return 10
  }
  const penalty = (late - grace) * LATE_PENALTY_PER_MINUTE[state.mode]
  return Math.max(0, 10 - penalty)
}

/** How the clock stands, in the words the case page shows. */
export function clockReading(
  state: AttemptState,
  scenario: SchoolScenario,
): { minute: number; label: string; untilBell: number; late: boolean } {
  const minute = closureMinute(state, scenario)
  const untilBell = scenario.bell.at - minute
  return {
    minute,
    label: clockLabel(minute),
    untilBell,
    late: untilBell <= BELL_GRACE[state.mode] && untilBell < 0,
  }
}

/** The mode, spelled the way the page names it. */
export function modeLabel(mode: AcademyMode): string {
  return mode === 'rush' ? 'Time pressure' : 'Standard visit'
}
