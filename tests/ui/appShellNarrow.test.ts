// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The phone header is CSS-only, and jsdom applies no media queries, so this
 * reads the stylesheet the way the narrow-workspace test does: not to pin
 * numbers, but to hold the shape that stops a label being cut off — two rows,
 * the sections on a strip of their own, the strip scrolling and snapping, and
 * the header height kept in step with the rows it actually has.
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

/** Values of one property, in order. */
function values(block: string, property: string): string[] {
  const match = new RegExp(`(?:^|\\n)\\s*${property}:\\s*([^;]+);`).exec(block)
  return match?.[1] ? match[1].trim().split(/\s+/) : []
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
    expect(values(header, 'grid-template-rows')).toHaveLength(2)
    expect(rule(phone, '.nav')).toMatch(/grid-area:\s*2\s*\/\s*1\s*\/\s*3\s*\/\s*3/)
  })

  it('keeps the header height equal to the rows it draws', () => {
    const header = rule(phone, '.header')
    const height = rule(phone, '.shell').match(/--header-height:\s*([\d.]+)rem/)
    expect(height?.[1]).toBeTruthy()

    // Sticky offsets and the phone workspace card both measure this token, so a
    // header taller than the token would push the card off the bottom again.
    const rows = values(header, 'grid-template-rows').map((row) => Number.parseFloat(row))
    expect(rows.reduce((total, row) => total + row, 0)).toBeCloseTo(
      Number.parseFloat(height?.[1] ?? '0'),
      5,
    )
    expect(header).toMatch(/height:\s*var\(--header-height\)/)
  })

  it('gives the sections a row of their own that scrolls only when it must', () => {
    const nav = rule(phone, '.nav')
    expect(nav).toMatch(/scroll-snap-type:\s*x\s+proximity/)
    expect(nav).toMatch(/overscroll-behavior-x:\s*contain/)
    // Every link is a snap point, so the row does not rest on half a label.
    expect(rule(phone, '.navLink')).toMatch(/scroll-snap-align:\s*start/)
    // And the strip scrolls rather than wrapping or spilling out of the header.
    expect(rule(topLevel, '.nav')).toMatch(/overflow-x:\s*auto/)
    expect(rule(topLevel, '.navLink')).toMatch(/white-space:\s*nowrap/)
  })

  it('lets each label keep its width rather than squeezing it', () => {
    expect(rule(phone, '.navLink')).toMatch(/flex:\s*none/)
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
