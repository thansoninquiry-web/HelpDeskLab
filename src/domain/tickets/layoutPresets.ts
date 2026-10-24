import { SPLIT_DEFAULT_RATIO } from './splitLayout'
import { STAGE_DEFAULT_RATIO } from './stageLayout'

/**
 * The whole workspace in a few shapes a learner can ask for at once.
 *
 * There are two dividers — the trade between the case file and the tool card, and
 * the split inside the card between the terminal and the tools — and a learner who
 * is reading a long report wants both moved the same way every time. Naming those
 * pairs is the difference between pressing one key and aiming two dividers.
 *
 * The ratios are the same kind of number the dividers themselves keep, inside the
 * same bounds, so a preset can never ask for a place either divider would refuse
 * to sit. They are paired by hand rather than derived: a wide case file leaves the
 * card narrow, so the log takes the larger half of it; a wide card leaves room for
 * a console, so the tools take the larger half.
 */

export type LayoutPresetId = 'case-file' | 'balanced' | 'machine'

export interface LayoutPreset {
  id: LayoutPresetId
  /** The share of the stage the case file takes. */
  stageRatio: number
  /** The share of the card the terminal takes. */
  splitRatio: number
}

/**
 * The presets in the order the workspace widens: paperwork, the shipped desk, the
 * machine. The order is what the number keys follow, so it is also the order a
 * learner reads them in.
 */
export const LAYOUT_PRESETS: readonly LayoutPreset[] = [
  // The case file takes most of the stage, and the log keeps the larger half of
  // the card that is left: a report being read line by line, with the command
  // output still legible beside it.
  { id: 'case-file', stageRatio: 0.55, splitRatio: 0.6 },
  // What the grid shipped with: 0.92 of the stage against 1.45, split down the
  // middle. Coming back here is how a learner undoes a preset.
  { id: 'balanced', stageRatio: STAGE_DEFAULT_RATIO, splitRatio: SPLIT_DEFAULT_RATIO },
  // The card takes most of the stage and the console most of the card: a table
  // being read, or a form being filled, rather than a log being scrolled.
  { id: 'machine', stageRatio: 0.26, splitRatio: 0.35 },
]

/**
 * How close a divider has to be to a preset's ratio to count as being on it. Both
 * ratios are kept to a thousandth, and a preset that has been clamped against the
 * stage's width is a different number — so this is the tolerance between two
 * rounded values, not a range of positions.
 */
const PRESET_EPSILON = 0.0005

/** The preset the two dividers are both sitting on, or null between them. */
export function layoutPresetAt(stageRatio: number, splitRatio: number): LayoutPreset | null {
  return (
    LAYOUT_PRESETS.find(
      (preset) =>
        Math.abs(preset.stageRatio - stageRatio) <= PRESET_EPSILON &&
        Math.abs(preset.splitRatio - splitRatio) <= PRESET_EPSILON,
    ) ?? null
  )
}
