// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  FOLDED_LAYOUT_QUERIES,
  PHONE_LAYOUT_QUERY,
  SHORT_LAYOUT_QUERY,
} from '../../src/ui/components/useFoldedCaseFile'

/**
 * The phone layout is CSS-only, and jsdom applies no media queries, so nothing
 * else in the suite can see it. These read the stylesheet the way the token and
 * theme tests do: not to check numbers, but to hold the shape that makes the
 * docked console work — a card pinned to the viewport's bottom edge, one column,
 * the tool above the terminal, nothing to drag, and a chip row that scrolls
 * instead of wrapping.
 */

const css = readFileSync(
  fileURLToPath(new URL('../../src/ui/routes/workspace.module.css', import.meta.url)),
  'utf8',
)

const shell = readFileSync(
  fileURLToPath(new URL('../../src/ui/components/AppShell.module.css', import.meta.url)),
  'utf8',
)

/** The share of the screen a rule measures itself against, as the token it names. */
function shareToken(declarations: string): string | undefined {
  return /calc\(\s*var\((--[a-z0-9-]+)\)/.exec(declarations)?.[1]
}

/** The body of the block that opens at `start`, brace-balanced. */
function blockBody(start: number): string {
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
  throw new Error('a media block is unterminated')
}

/** The first body for one breakpoint. */
function mediaBlock(query: string): string {
  const start = css.indexOf(query)
  if (start < 0) {
    throw new Error(`workspace.module.css has no ${query}`)
  }
  return blockBody(start)
}

/** Every body for one breakpoint: the stylesheet has several at 1180px. */
function mediaBlocks(query: string): string[] {
  const found: string[] = []
  for (let from = 0; ; ) {
    const start = css.indexOf(query, from)
    if (start < 0) {
      return found
    }
    found.push(blockBody(start))
    from = start + query.length
  }
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

describe('short, wide workspace', () => {
  // A landscape phone included: the width gate only keeps out a window too
  // narrow to hold the dock beside anything at all, and the phone dock above
  // requires a window taller than this one.
  const short = mediaBlock('@media (max-height: 480px) and (min-width: 481px)')

  it('docks the card to the right edge, full height under the header', () => {
    const card = rule(short, '.toolCard')
    // Fixed against the right edge rather than stacked under a long case file,
    // which on a 390px-tall window is a card nobody can see.
    expect(card).toMatch(/position:\s*fixed/)
    expect(card).toMatch(/(?:^|[\s;])top:\s*var\(--header-height\)/)
    expect(card).toMatch(/(?:^|[\s;])bottom:\s*0/)
    expect(card).toMatch(/(?:^|[\s;])right:\s*0/)
    expect(card).toMatch(/(?:^|[\s;])left:\s*auto/)
    expect(card).toMatch(/width:\s*var\(--dock-width\)/)
    // The narrow-window floor would let it grow past a short screen again.
    expect(card).toMatch(/min-height:\s*0/)
    // Above the page it covers, below the sticky header and the skip link.
    const headerZIndex = Number(/\.header\s*\{[^}]*z-index:\s*(\d+)/.exec(shell)?.[1])
    expect(Number(/z-index:\s*(\d+)/.exec(card)?.[1])).toBeLessThan(headerZIndex)
  })

  it('keeps the case file and the stage bar clear of the dock', () => {
    // One width for the sheet and the room taken for it, so the case file and
    // the ticket's own line cannot end up underneath it. `--dock-width` is
    // declared once, in tokens.css, and the theme audit holds it there.
    expect(rule(short, '.stage')).toMatch(/grid-template-columns:[\s\S]*var\(--dock-width\)/)
    expect(rule(short, '.stageBar')).toMatch(/max-width:\s*calc\(100% - var\(--dock-width\)/)
    expect(rule(short, '.stageHandle')).toMatch(/display:\s*none/)
  })

  it('ends above the on-screen keyboard rather than under it', () => {
    const card = rule(short, '.toolCard')
    // A landscape phone types into this sheet too: the measured strip lifts its
    // bottom edge, with the plain edge left for a browser that cannot measure.
    expect(card).toMatch(/bottom:\s*var\(--keyboard-inset,\s*0px\)/)
    expect(card).toMatch(/(?:^|[\s;])bottom:\s*0/)
  })

  it('docks the console inside the card as it does on a phone', () => {
    const split = rule(short, '.toolSplitOn')
    expect(split).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/)
    // A floor under the console rather than a proportional pair: at 320px tall
    // the pair leaves the log nothing. In rem, so it grows with the text size,
    // and measured against two lines by tests/ui/phoneLog.test.ts.
    expect(split).toMatch(/grid-template-rows:[\s\S]*minmax\([\d.]+rem,\s*1fr\)/)
    // The DOM is terminal-first, so the orders are what swap them on screen.
    expect(rule(short, '.toolSplitOn > .toolBody:first-child')).toMatch(/order:\s*2/)
    expect(rule(short, '.toolSplitOn > .toolBody:last-child')).toMatch(/order:\s*1/)
    expect(rule(short, '.splitHandle')).toMatch(/display:\s*none/)
  })

  it('spends the chips row on log instead of tap targets', () => {
    // A window this short cannot hold the row and two lines of log: the row goes,
    // and the keyboard — wider on its side — is what replaces it.
    expect(rule(short, '.quickRow')).toMatch(/display:\s*none/)
  })
})

describe('phone-width workspace', () => {
  const phone = mediaBlock('@media (max-width: 600px) and (min-height: 481px)')

  it('pins the card to the bottom edge, so the console stays in view', () => {
    const card = rule(phone, '.toolCard')
    // Off the page's flow: the case file scrolls behind the card rather than
    // carrying it out of sight on its way down.
    expect(card).toMatch(/position:\s*fixed/)
    expect(card).toMatch(/(?:^|[\s;])bottom:\s*0/)
    expect(card).toMatch(/(?:^|[\s;])left:\s*0/)
    expect(card).toMatch(/(?:^|[\s;])right:\s*0/)
    // Above the page it covers, below the sticky header and the skip link.
    const headerZIndex = Number(/\.header\s*\{[^}]*z-index:\s*(\d+)/.exec(shell)?.[1])
    const cardZIndex = Number(/z-index:\s*(\d+)/.exec(card)?.[1])
    expect(headerZIndex).toBeGreaterThan(0)
    expect(cardZIndex).toBeLessThan(headerZIndex)
    // A phone-sized share of the screen, named once as a palette token (in vh,
    // with a dvh override) that the workspace writes while the edge is dragged,
    // and no narrow-window floor left to grow it past the screen again.
    expect(card).toMatch(/height:\s*var\(--dock-share\)/)
    expect(card).toMatch(/min-height:\s*0/)
  })

  it('climbs above the on-screen keyboard so the command line stays in view', () => {
    const card = rule(phone, '.toolCard')
    // The plain bottom edge is the fallback for a browser with no visual
    // viewport; the measured strip replaces it when a keyboard is up, and the
    // card is capped at the room left under the header so lifting it by 300px
    // cannot push it behind the header instead.
    expect(card).toMatch(/(?:^|[\s;])bottom:\s*0/)
    expect(card).toMatch(/bottom:\s*var\(--keyboard-inset,\s*0px\)/)
    expect(card).toMatch(
      /max-height:\s*calc\(100dvh\s*-\s*var\(--header-height\)\s*-\s*var\(--keyboard-inset,\s*0px\)\)/,
    )
  })

  it('keeps room at the foot of the case file for the card sitting on it', () => {
    // The card covers the end of the page, so the last section needs the card's
    // own height clear under it or it can never scroll into view. Lifted above a
    // keyboard, the card starts higher, so the room it takes grows by the strip
    // the keyboard covers.
    const column = rule(phone, '.ticketColumn')
    expect(column).toMatch(/padding-bottom:[^;]*var\(--keyboard-inset,\s*0px\)/)
    const focused = rule(
      phone,
      '.ticketColumn :is(summary, button, input, textarea, select, a[href])',
    )
    expect(focused).toMatch(/scroll-margin-bottom:[^;]*var\(--keyboard-inset,\s*0px\)/)
    // The room kept and the card's own height are the same token, so the two
    // cannot drift apart: writing one share moves both.
    const cardShare = /var\((--dock-share)\)/.exec(rule(phone, '.toolCard'))?.[1]
    expect(cardShare).toBeDefined()
    expect(shareToken(rule(phone, '.ticketColumn'))).toBe(cardShare)
  })

  it('stops a focused control above the card instead of behind it', () => {
    // Focus scrolling honours scroll-margin, so a Tab down the case file lands
    // where it can be seen rather than under the pinned card.
    const margins = shareToken(
      rule(phone, '.ticketColumn :is(summary, button, input, textarea, select, a[href])'),
    )
    expect(margins).toBe('--dock-share')
  })

  it('stacks the halves in one column, with a floor under the console', () => {
    const split = rule(phone, '.toolSplitOn')
    expect(split).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/)
    // The tool's row is proportional, so a tall phone gives it more than a fixed
    // share; the console's carries a floor in rem, which grows with the text size
    // rather than shrinking the log on a small phone.
    expect(split).toMatch(/grid-template-rows:\s*minmax\(0,\s*[\d.]+fr\)\s*minmax\([\d.]+rem,\s*1fr\)/)
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

  it('takes the trade between the columns away with it', () => {
    // One column down here as well: there is no width left to trade, so the
    // divider that trades it goes at the same breakpoint the stage stacks at.
    const narrow = mediaBlock('@media (max-width: 980px)')
    expect(rule(narrow, '.stageHandle')).toMatch(/display:\s*none/)
    expect(rule(narrow, '.stage')).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/)
    // A preset moves the divider between the columns, so the strip that asks for
    // one goes with the divider it would move — and its keys read the same
    // handle's display.
    expect(rule(narrow, '.layoutPresets')).toMatch(/display:\s*none/)
    // Side by side, the trade stands at every width above that: the narrow desktop
    // block changes the heights only, and must not pin the columns back to the
    // fractions they shipped with.
    const desktop = mediaBlocks('@media (max-width: 1180px)').find((block) =>
      /(?:^|\n)\s*\.stage\s*\{/.test(block),
    )
    expect(desktop).toBeDefined()
    expect(rule(desktop ?? '', '.stage')).not.toMatch(/grid-template-columns/)
  })

  it('offers the workspace presets in the bar above the columns', () => {
    // One strip of named positions, one level out from the card's own stops: it
    // has to be in the stylesheet for the bar to draw it, and hidden where the
    // trade it changes does not exist (asserted with the stacked layout above).
    const presets = rule(css, '.layoutPresets')
    expect(presets).toMatch(/display:\s*inline-flex/)
    expect(rule(css, '.layoutPreset[aria-pressed=\'true\']')).toMatch(/background:/)
  })

  it('scrolls the quick commands sideways rather than wrapping them', () => {
    expect(rule(phone, '.quickRow')).toMatch(/flex-wrap:\s*nowrap/)
    expect(rule(phone, '.quickRow')).toMatch(/overflow-x:\s*auto/)
    expect(rule(phone, '.quickCommand')).toMatch(/flex:\s*none/)
  })

  it('folds the case file at the width this stylesheet calls a phone', () => {
    // The one breakpoint the page reads in JavaScript, because a folded section is
    // a different document tree rather than a different style. It has to be the
    // stylesheet's own phone width, or the layout and the folds disagree.
    // Any query that constrains a maximum width counts, compound ones included:
    // the phone dock also asks for a window taller than a landscape phone's.
    const breakpoints = [...css.matchAll(/@media[^{]*\(max-width: (\d+)px\)/g)].map((match) =>
      Number(match[1]),
    )
    const phone = Number(/max-width: (\d+)px/.exec(PHONE_LAYOUT_QUERY)?.[1])
    expect(phone).toBeGreaterThan(0)
    expect(breakpoints).toContain(phone)
  })

  it('folds the case file where the stylesheet docks the card on its side', () => {
    // The second window that folds, and the only other one the page reads in
    // JavaScript: the side dock's own query, so the folded column and the docked
    // card arrive together rather than on two widths that almost agree.
    const side = mediaBlock(`@media ${SHORT_LAYOUT_QUERY}`)
    expect(rule(side, '.toolCard')).toMatch(/position:\s*fixed/)
    expect(FOLDED_LAYOUT_QUERIES).toEqual([PHONE_LAYOUT_QUERY, SHORT_LAYOUT_QUERY])
  })

  it('leaves the wider layouts alone', () => {
    const narrow = mediaBlock('@media (max-width: 980px)')
    expect(narrow).not.toMatch(/splitHandle/)
    expect(css).toContain('@media (max-width: 1180px)')
  })
})
