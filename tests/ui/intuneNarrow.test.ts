// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The Intune console on a 390px phone.
 *
 * jsdom applies no media queries and lays nothing out, so the phone layout is
 * read from the stylesheet, the way the workspace's narrow tests read the dock.
 * The numbers here are the ones the stylesheet declares: the page's gutter comes
 * from the palette, the root font size from `global.css`, and the text scale from
 * the setting. A fixed floor wider than that content box is the bug this file
 * exists to catch — a five-column table or a filter field can make a phone page
 * scroll sideways, and nothing in the shell clamps it.
 *
 * The console's own layout is fluid: the filters wrap, the tables scroll inside
 * their wrap, and the action bar wraps. The 480px block tightens the cells and
 * gives each filter a row of its own, because three 11rem fields cannot share a
 * phone's width.
 */

function read(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), 'utf8')
}

const intune = read('src/modules/intune/ui/intune.module.css')
const tokens = read('src/ui/styles/tokens.css')
const global = read('src/ui/styles/global.css')

/** The phone this suite is about: the width and the text size both matter. */
const PHONE_WIDTH = 390
const LARGE_SCALE = 1.125
const DEFAULT_SCALE = 1

/** The body of the block that opens at `start`, brace-balanced. */
function blockBody(css: string, start: number): string {
  const open = css.indexOf('{', start)
  let depth = 0
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1
    if (css[index] === '}') {
      depth -= 1
      if (depth === 0) return css.slice(open + 1, index)
    }
  }
  throw new Error('a block is unterminated')
}

/** One breakpoint's block, by the query the stylesheet writes. */
function mediaBlock(css: string, query: string): string {
  const start = css.indexOf(query)
  if (start < 0) throw new Error(`no ${query} in the stylesheet`)
  return blockBody(css, start)
}

/**
 * The declarations of one rule, matched as a whole selector: `.table` must not
 * find `.tableWrap`, and a grouped rule (`.button, .buttonQuiet`) is found by
 * any one of its members. The first `{` after the selector opens the block.
 */
function rule(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*(?=,|\\{)`).exec(css)
  if (!match) throw new Error(`no rule for ${selector}`)
  const open = css.indexOf('{', match.index)
  const close = css.indexOf('}', open)
  if (open < 0 || close < 0) throw new Error(`the rule for ${selector} is unterminated`)
  return css.slice(open + 1, close)
}

/** The root font size in pixels: `html { font-size: calc(16px * var(--ui-scale)) }`. */
const ROOT_PX = Number(
  /font-size:\s*calc\(\s*([\d.]+)px\s*\*\s*var\(--ui-scale\)/.exec(global)?.[1],
)

/** One value of the text-size setting, read from the palette that declares it. */
function scale(name: 'small' | 'default' | 'large'): number {
  const block = new RegExp(`:root\\[data-text-size='${name}'\\]\\s*\\{([^}]*)\\}`).exec(tokens)?.[1]
  const value = block === undefined ? undefined : /--ui-scale\s*:\s*([\d.]+)/.exec(block)?.[1]
  if (value === undefined) throw new Error(`no --ui-scale for ${name}`)
  return Number.parseFloat(value)
}

/** The gutter's floor: a phone is narrower than the clamp's middle term. */
const GUTTER_REM = Number(/--gutter:\s*clamp\(\s*([\d.]+)rem/.exec(tokens)?.[1])

/** What the page's content column measures at this width and text size. */
function contentWidth(textSize: 'default' | 'large'): number {
  if (!Number.isFinite(ROOT_PX) || !Number.isFinite(GUTTER_REM)) {
    throw new Error('the root font size or the gutter is not a number this audit can read')
  }
  const root = ROOT_PX * scale(textSize)
  return PHONE_WIDTH - 2 * GUTTER_REM * root
}

/** A rem length as the pixels it becomes at one text size. */
function rem(value: number, textSize: 'default' | 'large'): number {
  return value * ROOT_PX * scale(textSize)
}

describe('the Intune console at 390px', () => {
  const phone = mediaBlock(intune, '@media (max-width: 480px)')

  it('reads the width and the scale it claims to check', () => {
    // If either read fails, the arithmetic below would be checking nothing.
    expect(ROOT_PX).toBe(16)
    expect(GUTTER_REM).toBe(1)
    expect(scale('large')).toBe(LARGE_SCALE)
    expect(scale('default')).toBe(DEFAULT_SCALE)
    // 390 - two one-rem gutters, at the default and at the large text size.
    expect(contentWidth('default')).toBe(358)
    expect(contentWidth('large')).toBeCloseTo(354, 5)
  })

  it('stacks the filter fields instead of letting three share the width', () => {
    const filters = rule(intune, '.filters')
    expect(filters).toMatch(/flex-wrap:\s*wrap/)

    // Each field may shrink; the control fills the field rather than holding an
    // 11rem floor, which is what widened a phone when three sat in one row.
    const field = rule(intune, '.field')
    expect(field).toMatch(/min-width:\s*0/)
    expect(field).toMatch(/flex:\s*0\s+1\s+11rem/)
    const control = rule(intune, '.field input')
    expect(control).toMatch(/width:\s*100%/)
    expect(control).toMatch(/min-width:\s*0/)
    expect(control).not.toMatch(/min-width:\s*11rem/)

    // On a phone each one takes a row of its own, so the row's gap is vertical
    // and the search field is as wide as the console.
    expect(rule(phone, '.field')).toMatch(/flex:\s*1\s+1\s+100%/)
  })

  it('keeps a wide table inside a wrapper that scrolls, not the page', () => {
    // Five columns of device data do not fit 354px: the wrap takes the overflow
    // sideways so the page keeps one column and the shell does not scroll.
    const wrap = rule(intune, '.tableWrap')
    expect(wrap).toMatch(/overflow-x:\s*auto/)
    expect(wrap).toMatch(/max-width:\s*100%/)
    expect(rule(intune, '.table')).toMatch(/width:\s*100%/)
    expect(wrap).not.toMatch(/position:\s*fixed/)

    // The phone block buys columns room by tightening the cells rather than by
    // hiding a field: both paddings shrink.
    const baseCells = rule(intune, '.table th')
    const phoneCells = rule(phone, '.table th')
    const px = (declarations: string): number =>
      Number(/padding:\s*([\d.]+)rem/.exec(declarations)?.[1])
    expect(px(phoneCells)).toBeLessThan(px(baseCells))
    expect(px(phoneCells)).toBeGreaterThan(0)
  })

  it('wraps the action bar and every confirmation at 390', () => {
    expect(rule(intune, '.actionButtons')).toMatch(/flex-wrap:\s*wrap/)
    // A long label ("Change primary user") may not force the row wider than the
    // phone: the button is capped and its text wraps inside the cap.
    const button = rule(intune, '.button')
    expect(button).toMatch(/max-width:\s*100%/)
    expect(button).not.toMatch(/white-space:\s*nowrap/)
    expect(button).not.toMatch(/min-width:/)

    // Confirm and Cancel wrap rather than pushing the dialog off the card, and
    // the dialog itself is a block inside the page, so it cannot exceed it.
    expect(rule(intune, '.dialogButtons')).toMatch(/flex-wrap:\s*wrap/)
    expect(intune).not.toMatch(/\.dialog\s*\{[^}]*width:\s*[\d.]+px/)
  })

  it('lets the console sections wrap instead of clipping a label', () => {
    expect(rule(intune, '.nav')).toMatch(/flex-wrap:\s*wrap/)
    expect(rule(intune, '.ticketRow')).toMatch(/flex-wrap:\s*wrap/)
    expect(rule(intune, '.deviceHead')).toMatch(/flex-wrap:\s*wrap/)
    // Nothing in the phone block hides a control; it only reflows.
    expect(phone).not.toMatch(/display:\s*none/)
  })

  it('caps the grid floor so the estate cards stack inside the column', () => {
    // `minmax(16rem, 1fr)` is 288px at the large size — under 354 here, but the
    // floor would win on a narrower phone or with a larger scale. `min(16rem,
    // 100%)` keeps the card inside the column whatever the root size is.
    const cards = rule(intune, '.cards')
    expect(cards).toMatch(/repeat\(auto-fit,\s*minmax\(min\(16rem,\s*100%\),\s*1fr\)\)/)

    const floor = Number(/minmax\(min\(([\d.]+)rem/.exec(cards)?.[1])
    expect(rem(floor, 'large')).toBeLessThan(contentWidth('large'))
  })

  it('puts the phone block last, where its overrides beat the base rules', () => {
    // A media query adds no specificity, so only source order lets it win.
    expect(intune.lastIndexOf('@media (max-width: 480px)')).toBeGreaterThan(
      intune.indexOf('.field {'),
    )
    expect(intune.lastIndexOf('@media (max-width: 480px)')).toBeGreaterThan(
      intune.indexOf('.table th,'),
    )
    expect(intune.indexOf('@media (max-width: 480px)')).toBe(
      intune.lastIndexOf('@media (max-width: 480px)'),
    )
  })
})
