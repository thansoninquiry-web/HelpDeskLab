/**
 * The interface's text size: one choice in Settings that scales the whole
 * workspace from the root, so a learner on a small screen can read the same
 * layout without a stylesheet sweep and a learner at arm's length can have it
 * larger.
 *
 * Everything in the stylesheets is a rem — type and spacing alike — so one
 * number on the root moves all of it together and nothing drifts out of
 * proportion. The number lives in `src/ui/styles/tokens.css` as `--ui-scale`,
 * keyed by the attribute this module's values are written to; this module owns
 * only what a choice is called, how it reads back, and which one a stored value
 * from another build falls back to.
 */

export type TextSize = 'small' | 'default' | 'large'

/** Offered in this order in Settings. */
export const TEXT_SIZES: readonly TextSize[] = ['small', 'default', 'large']

export const DEFAULT_TEXT_SIZE: TextSize = 'default'

export interface TextSizeChoice {
  value: TextSize
  label: string
  detail: string
}

export const TEXT_SIZE_CHOICES: readonly TextSizeChoice[] = [
  {
    value: 'small',
    label: 'Small',
    detail: 'A tighter workspace: everything scales down together, spacing included.',
  },
  {
    value: 'default',
    label: 'Default',
    detail: 'The size the workspace was laid out at.',
  },
  {
    value: 'large',
    label: 'Large',
    detail: 'Everything scales up together, so the labels read from further away.',
  },
]

export function isTextSize(value: unknown): value is TextSize {
  return typeof value === 'string' && (TEXT_SIZES as readonly string[]).includes(value)
}

/**
 * Anything unrecognizable — a hand-edited backup, a missing row, nothing chosen
 * yet — reads as the default. A missing row is exactly an install that never
 * picked a size, which is the size the layout was designed at.
 */
export function parseTextSize(value: unknown): TextSize {
  return isTextSize(value) ? value : DEFAULT_TEXT_SIZE
}

/** One sentence saying what the choice is doing, for the Settings panel. */
export function describeTextSize(size: TextSize): string {
  switch (size) {
    case 'small':
      return 'The workspace is scaled down, spacing included, so more of it fits on the screen.'
    case 'large':
      return 'The workspace is scaled up, spacing included, so the same layout takes more room.'
    default:
      return 'The workspace is at the size it was laid out at.'
  }
}
