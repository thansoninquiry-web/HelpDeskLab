// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The phone header is CSS-only, and jsdom applies no media queries, so this
 * reads the stylesheet the way the narrow-workspace test does: not to pin
 * numbers, but to hold the shape that stops a label being cut off — two rows,
 * the sections on a row of their own, and that row wrapping onto a second line
 * instead of hiding a label behind a sideways scroll nobody can see. The
 * header's height token is the floor those rows add up to, never a ceiling that
 * would clip the extra line.
 */

const css = readFileSync(
  fileURLToPath(new URL('../../src/ui/components/AppShell.module.css', import.meta.url)),
  'utf8',
)

const tokens = readFileSync(
  fileURLToPath(new URL('../../src/ui/styles/tokens.css', import.meta.url)),
  'utf8',
)

/** The body of one media block, by its breakpoint. */
function mediaBlock(query: string): string {
  const start = css.indexOf(query)
  if (start < 0) {
    throw new Error(`AppShell.module.css has no ${query}`)
  }
  const open = css.indexOf('{', start)
  let depth = 0
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1
    if (css[index] === '}') {
      depth -= 1
      if (depth === 0) {
        return css.slice(open + 1, index)
      }
    }
  }
  throw new Error(`${query} is unterminated`)
}

/** The declarations of one rule inside a block, by selector. */
function rule(block: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(block)
  if (!match?.[1]) {
    throw new Error(`no rule for ${selector}`)
  }
  return match[1]
}

/** One step of the type scale, in rem, read from the stylesheet that declares it. */
function scaleStep(token: string): number {
  const match = new RegExp(`${token}\\s*:\\s*([\\d.]+)rem`).exec(tokens)
  if (!match?.[1]) {
    throw new Error(`${token} is not a rem step of the type scale`)
  }
  return Number.parseFloat(match[1])
}

/**
 * The size a rule sets, through the token it names. Sizes are read this way
 * rather than as raw rem so this test keeps holding the shape it cares about —
 * the narrow block is smaller than the wide one — without pinning a number that
 * the type scale owns.
 */
function fontSize(block: string, selector: string): number {
  const token = rule(block, selector).match(/font-size:\s*var\((--[a-z0-9-]+)\)/)?.[1]
  if (!token) {
    throw new Error(`${selector} does not set its size from the type scale`)
  }
  return scaleStep(token)
}

describe('phone-width header', () => {
  const phone = mediaBlock('@media (max-width: 600px)')
  const topLevel = css.slice(0, css.indexOf('@media'))

  it('splits into an identity row and a section row', () => {
    const header = rule(phone, '.header')
    expect(header).toMatch(/display:\s*grid/)
    // Two rows, and the sections get their own one under the brand and score.
    expect(header).toMatch(/grid-template-rows:\s*2\.95rem\s+minmax\(3\.2rem, auto\)/)
    expect(rule(phone, '.nav')).toMatch(/grid-area:\s*2\s*\/\s*1\s*\/\s*3\s*\/\s*3/)
  })

  it('keeps the header height token as the floor its two rows add up to', () => {
    const header = rule(phone, '.header')
    const height = rule(phone, '.shell').match(/--header-height:\s*([\d.]+)rem/)
    expect(height?.[1]).toBeTruthy()

    const rows = header.match(/grid-template-rows:\s*([^;]+);/)?.[1] ?? ''
    expect(rows).toContain('minmax(3.2rem, auto)')
    const floors = [...rows.matchAll(/([\d.]+)rem/g)].map((match) =>
      Number.parseFloat(match[1] ?? '0'),
    )
    expect(floors.reduce((total, row) => total + row, 0)).toBeCloseTo(
      Number.parseFloat(height?.[1] ?? '0'),
      5,
    )

    // A floor, not a fixed height: a third line grows the header instead of
    // being cut off, and the token still describes the minimum on screen.
    expect(header).toMatch(/min-height:\s*var\(--header-height\)/)
    expect(header).not.toMatch(/(?:^|\n)\s*height:\s*var\(--header-height\)/)
    expect(rule(topLevel, '.header')).toMatch(/min-height:\s*var\(--header-height\)/)
  })

  it('wraps the sections instead of sliding one out of sight', () => {
    const nav = rule(topLevel, '.nav')
    expect(nav).toMatch(/flex-wrap:\s*wrap/)
    expect(nav).toMatch(/align-content:\s*center/)
    // Nothing clips or scrolls: a full row moves to the next line instead.
    expect(nav).not.toMatch(/overflow-x:\s*auto|overflow:\s*hidden/)
    expect(rule(topLevel, '.navLink')).toMatch(/white-space:\s*nowrap/)

    const phoneNav = rule(phone, '.nav')
    expect(phoneNav).not.toMatch(/scroll-snap-type|scroll-padding|overflow-x/)
    expect(rule(phone, '.navLink')).not.toMatch(/scroll-snap-align/)
  })

  it('lets each label keep its width rather than squeezing it', () => {
    expect(rule(topLevel, '.navLink')).toMatch(/flex:\s*none/)
    // The brand may shrink to the space it is given, so it cannot push the score
    // chip off the row it shares.
    expect(rule(phone, '.brand')).toMatch(/min-width:\s*0/)
    expect(rule(phone, '.name')).toMatch(/font-size:/)
  })

  it('tightens the section type instead of clipping it', () => {
    const base = fontSize(topLevel, '.navLink')
    const compact = fontSize(phone, '.navLink')
    // Five labels have to fit a phone row: smaller type and tighter tracking,
    // never a narrower box that cuts the text.
    expect(compact).toBeGreaterThan(0)
    expect(compact).toBeLessThan(base)
    expect(rule(phone, '.navLink')).toMatch(/padding:\s*0\s+0\.45rem/)
  })

  it('folds the section row away once the page is scrolled', () => {
    const collapsed = ".shell[data-scrolled='true']"

    // One compact row on a phone: the identity row's own floor, with the
    // sections and their row taken out of the header's height.
    expect(rule(phone, collapsed)).toMatch(/--header-height:\s*2\.95rem/)
    expect(rule(phone, `${collapsed} .header`)).toMatch(/grid-template-rows:\s*2\.95rem/)
    expect(rule(phone, `${collapsed} .nav`)).toMatch(/display:\s*none/)

    // Folded is a scroll state, not a width state. The unscrolled phone header
    // still shows every section, and no wider breakpoint reads the attribute,
    // so a tablet or a desktop header never loses its navigation.
    expect(rule(phone, '.nav')).not.toMatch(/display:\s*none/)
    expect(topLevel).not.toMatch(/data-scrolled/)
    expect(mediaBlock('@media (max-width: 760px)')).not.toMatch(/data-scrolled/)

    // The compact row is the first row the expanded header already lays out, so
    // folding cannot move the brand or the score chip.
    const rows = rule(phone, '.header').match(/grid-template-rows:\s*([^;]+);/)?.[1] ?? ''
    const identityRow = /([\d.]+)rem/.exec(rows)?.[1]
    expect(rule(phone, collapsed).match(/--header-height:\s*([\d.]+)rem/)?.[1]).toBe(identityRow)
  })

  it('moves the score behind a compact button instead of the chip', () => {
    // The chip writes out XP, rank, and streak in a line; on a phone that line
    // was taking the width the brand needed. The row keeps the button and the
    // chip goes — not both, or the row is back where it started.
    expect(rule(phone, '.progressChip')).toMatch(/display:\s*none/)
    expect(rule(phone, '.scorePopover')).toMatch(/display:\s*block/)
    expect(rule(phone, '.scorePopover')).toMatch(/position:\s*relative/)

    // Everywhere wider there is room for the chip, and the button is not
    // rendered as a second, competing score beside it.
    expect(rule(topLevel, '.scorePopover')).toMatch(/display:\s*none/)
  })

  it('draws the score button at a hit-target size and anchors the panel to it', () => {
    // 1.5rem is the 24px floor at the default root; the button is drawn above
    // it so the smallest text size still leaves a thumb something to hit.
    const floor = (value: string | undefined, name: string): number => {
      const match = value?.match(new RegExp(`${name}:\\s*([\\d.]+)rem`))
      if (!match?.[1]) {
        throw new Error(`the score button does not set ${name}`)
      }
      return Number.parseFloat(match[1])
    }
    const trigger = rule(topLevel, '.scoreTrigger')
    expect(floor(trigger, 'min-width')).toBeGreaterThanOrEqual(1.5)
    expect(floor(trigger, 'min-height')).toBeGreaterThanOrEqual(1.5)

    // The panel hangs off the button, inside the viewport, over the section row
    // rather than pushing it down.
    const panel = rule(topLevel, '.scorePanel')
    expect(panel).toMatch(/position:\s*absolute/)
    expect(panel).toMatch(/right:\s*0/)
    expect(panel).toMatch(/top:\s*calc\(100%/)
    expect(panel).toMatch(/box-shadow:/)
  })

  it('wins over the narrower header rules it refines', () => {
    expect(css.indexOf('@media (max-width: 600px)')).toBeGreaterThan(
      css.indexOf('@media (max-width: 760px)'),
    )
    // The phone block reshapes the header; it does not hide the sections.
    expect(rule(phone, '.nav')).not.toMatch(/display:\s*none/)
    expect(mediaBlock('@media (max-width: 760px)')).toMatch(
      /\.headerRule,\s*\n\s*\.rankName,\s*\n\s*\.streak\s*\{[^}]*display:\s*none/,
    )
  })
})
