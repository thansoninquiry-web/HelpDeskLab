// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The phone layout is CSS-only, and jsdom applies no media queries, so nothing
 * else in the suite can see it. These read the stylesheet the way the token and
 * theme tests do: not to check numbers, but to hold the shape that makes the
 * docked console work — one screen, one column, the tool above the terminal,
 * nothing to drag, and a chip row that scrolls instead of wrapping.
 */

const css = readFileSync(
  fileURLToPath(new URL('../../src/ui/routes/workspace.module.css', import.meta.url)),
  'utf8',
)

/** The body of one media block, by its breakpoint. */
function mediaBlock(query: string): string {
  const start = css.indexOf(query)
  if (start < 0) {
    throw new Error(`workspace.module.css has no ${query}`)
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

describe('phone-width workspace', () => {
  const phone = mediaBlock('@media (max-width: 600px)')

  it('gives the card the screen, so the console is not below a long page', () => {
    const card = rule(phone, '.toolCard')
    expect(card).toMatch(/height:\s*calc\(100vh - var\(--header-height\)[^)]*\)/)
    expect(card).toMatch(/height:\s*calc\(100dvh - var\(--header-height\)[^)]*\)/)
    // The narrow-window floor would let the card grow past the screen again.
    expect(card).toMatch(/min-height:\s*0/)
  })

  it('stacks the halves in one column with proportional rows', () => {
    const split = rule(phone, '.toolSplitOn')
    expect(split).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/)
    // Proportional rows shrink with a short window instead of clipping.
    expect(split).toMatch(/grid-template-rows:[\s\S]*fr[\s\S]*fr/)
    expect(split).not.toMatch(/dvh|rem/)
  })

  it('keeps the terminal docked and lets the tool scroll above it', () => {
    // The DOM is terminal-first, so the orders are what swap them on screen.
    expect(rule(phone, '.toolSplitOn > .toolBody:first-child')).toMatch(/order:\s*2/)
    expect(rule(phone, '.toolSplitOn > .toolBody:last-child')).toMatch(/order:\s*1/)
    // The hairline belongs to the docked console now, not to the pane above it.
    expect(rule(phone, '.toolSplitOn > .toolBody:first-child')).toMatch(/border-top:/)
    expect(rule(phone, '.toolSplitOn > .toolBody:last-child')).toMatch(/border-top:\s*0/)
  })

  it('takes the divider away, because there is one column to drag in', () => {
    expect(rule(phone, '.splitHandle')).toMatch(/display:\s*none/)
  })

  it('scrolls the quick commands sideways rather than wrapping them', () => {
    expect(rule(phone, '.quickRow')).toMatch(/flex-wrap:\s*nowrap/)
    expect(rule(phone, '.quickRow')).toMatch(/overflow-x:\s*auto/)
    expect(rule(phone, '.quickCommand')).toMatch(/flex:\s*none/)
  })

  it('leaves the wider layouts alone', () => {
    const narrow = mediaBlock('@media (max-width: 980px)')
    expect(narrow).not.toMatch(/splitHandle/)
    expect(css).toContain('@media (max-width: 1180px)')
  })
})
