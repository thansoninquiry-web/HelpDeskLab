// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * On a phone the Remote Desktop tool is a desktop inside a docked card, and for
 * a while it was a strip of wallpaper: the card took 55% of the screen, which
 * left the pane about 230px at 390×844, while the fake screen asked for 540px.
 * The taskbar — the way into an app once a window is open — sat below the pane's
 * fold, with whichever window was open.
 *
 * jsdom applies no media queries, so this is read out of the stylesheets the way
 * `workspaceNarrow.test.ts` reads the dock: the card takes more of the screen
 * while a machine's desktop is on it, the desktop fills the height it is given,
 * and the case file keeps room for the taller card so its last section still
 * scrolls clear. Both shares are palette tokens now, because the learner can drag
 * the edge to a third one.
 */

function read(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), 'utf8')
}

const workspace = read('src/ui/routes/workspace.module.css')
const desktopSheet = read('src/ui/components/FakeDesktop.module.css')
const desktopComponent = read('src/ui/components/FakeDesktop.tsx')
const palette = read('src/ui/styles/tokens.css')

const PHONE_DOCK = '@media (max-width: 600px) and (min-height: 481px)'

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

/** The declarations of one rule inside a block, by its exact selector. */
function rule(block: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(block)
  if (!match?.[1]) throw new Error(`no rule for ${selector}`)
  return match[1]
}

/** The share of the screen a rule measures itself against, as the token it names. */
function shareToken(declarations: string): string | undefined {
  return /var\(\s*(--dock-share[a-z-]*)\s*\)/.exec(declarations)?.[1]
}

/** One palette declaration's value, latest wins, as the cascade would read it. */
function paletteValue(name: string): string | undefined {
  return [...palette.matchAll(new RegExp(`(?:^|[\\s;])${name}:\\s*([^;]+)`, 'g'))].at(-1)?.[1]?.trim()
}

describe('a remote desktop on a phone', () => {
  const dock = mediaBlock(workspace, PHONE_DOCK)
  const desktopDock = mediaBlock(desktopSheet, PHONE_DOCK)
  // The icons and the window are sized by width rather than by the dock: a phone
  // is narrow whether or not the card is pinned to its bottom edge.
  const desktopNarrow = mediaBlock(desktopSheet, '@media (max-width: 700px)')

  it('takes more of the screen while a desktop is open than for a log', () => {
    const share = shareToken(rule(dock, '.toolCard'))
    const desktopShare = shareToken(rule(dock, '.toolCard:has([data-desktop])'))
    expect(share).toBe('--dock-share')
    expect(desktopShare).toBe('--dock-share-desktop')

    // The numbers themselves live in the palette; the desktop's is the larger.
    const log = Number.parseFloat(paletteValue('--dock-share') ?? '')
    const desktop = Number.parseFloat(paletteValue('--dock-share-desktop') ?? '')
    expect(log).toBeGreaterThan(0)
    expect(desktop).toBeGreaterThan(log)
    // And each is written in both units, so a browser without `dvh` keeps the
    // `vh` line rather than an undefined token.
    expect(palette).toMatch(/--dock-share:\s*[\d.]+vh/)
    expect(palette).toMatch(/--dock-share:\s*[\d.]+dvh/)
    expect(palette).toMatch(/--dock-share-desktop:\s*[\d.]+vh/)
    expect(palette).toMatch(/--dock-share-desktop:\s*[\d.]+dvh/)
  })

  it('keeps the case file clear of the taller card', () => {
    // The reserve at the foot of the column and the control scroll margins name
    // the same share the card does: a card that covers the end of the page
    // without room kept for it makes the last section unreachable.
    const cardShare = shareToken(rule(dock, '.toolCard:has([data-desktop])'))
    expect(cardShare).toBe('--dock-share-desktop')
    expect(shareToken(rule(dock, '.stage:has([data-desktop]) .ticketColumn'))).toBe(cardShare)
    expect(
      shareToken(
        rule(
          dock,
          '.stage:has([data-desktop]) .ticketColumn :is(summary, button, input, textarea, select, a[href])',
        ),
      ),
    ).toBe(cardShare)
  })

  it('resizes from the card’s own edge, drawn only in the dock', () => {
    // The edge is the third divider: hidden everywhere, drawn above the card on
    // a phone, and as tall as a finger needs.
    expect(workspace).toMatch(/\.dockHandle\s*\{\s*display:\s*none/)
    const handle = rule(dock, '.dockHandle')
    expect(handle).toMatch(/display:\s*flex/)
    expect(handle).toMatch(/cursor:\s*ns-resize/)
    // A drag on the edge must not scroll the page under it.
    expect(handle).toMatch(/touch-action:\s*none/)
  })

  it('draws the desktop’s icons instead of typing them', () => {
    // A typed glyph — ▤, ⚙, 🖨 — is only as present as the font the browser
    // falls back to. A phone whose chain missed one showed an empty tile, and the
    // desktop became a blue rectangle with no way into an app. Every tile in the
    // desktop, the Start menu and the Control Panel is drawn now, the way the
    // rest of the shell's icons are.
    // The prose is allowed to name the characters it replaced; the code is not.
    const code = desktopComponent.replace(/\/\*[\s\S]*?\*\//g, ' ')
    // Listed one by one: a printer emoji is a surrogate pair, which no character
    // class should carry.
    for (const glyph of ['▣', '▤', '▦', '◎', '❯', '⚙', '↻', '🖨']) {
      expect(code, `${glyph} is still typed into the desktop`).not.toContain(glyph)
    }
    expect(code).toMatch(/<Glyph name=\{entry\.glyph\}/)
    expect(code).toMatch(/<Glyph name="printer" size=\{24\}/)

    // And the tile is a box around the drawing, not a font size for one.
    expect(rule(desktopSheet, '.iconGlyph')).not.toMatch(/font-size:/)
    expect(rule(desktopSheet, '.startIcon')).not.toMatch(/font-size:/)
  })

  it('offers the edge as a bar to catch rather than a hairline', () => {
    const bar = rule(dock, '.dockHandle')
    // Tall enough to see and to put a thumb on, with the grip drawn larger than
    // the 3px line it was — this is the only way to trade page for console here.
    expect(bar).toMatch(/height:\s*1\.5rem/)
    expect(rule(dock, '.dockHandleGrip')).toMatch(/height:\s*4px/)
    // The overlap: the sixth of a rem the bar grew comes out of the head's own
    // padding, so the console keeps the lines it had (held by phoneLog.test.ts).
    expect(bar).toMatch(/margin-bottom:\s*-0\.4rem/)
    // A drag must not select the head's text under the finger.
    expect(bar).toMatch(/user-select:\s*none/)
    expect(rule(dock, '.dockHandle[data-dragging=\'true\']')).toMatch(/background:/)
    // The share is written on the bar while it is held, and nowhere at rest.
    expect(rule(dock, '.dockHandleShare')).toMatch(/opacity:\s*0/)
    expect(rule(dock, ".dockHandle[data-dragging='true'] .dockHandleShare")).toMatch(
      /opacity:\s*1/,
    )
  })

  it('fills the pane it is docked in instead of asking for a taller screen', () => {
    // The pane is a known height (the card's less its chrome), so the desktop
    // takes it. A fixed height here is the bug: it overflows the pane and leaves
    // the taskbar under the fold.
    const desktop = rule(desktopDock, '.desktop')
    expect(desktop).toMatch(/height:\s*100%/)
    expect(desktop).toMatch(/min-height:\s*0/)

    const screen = rule(desktopDock, '.screen')
    expect(screen).toMatch(/flex:\s*1/)
    expect(screen).toMatch(/height:\s*auto/)
    expect(screen).toMatch(/min-height:\s*0/)
    // No pixel height at all: that is the 520px the dock could not hold.
    expect(screen).not.toMatch(/height:\s*[\d.]+px/)
  })

  it('marks the desktop in the DOM so the dock can find it', () => {
    // The card's taller share is `:has([data-desktop])`, which matches nothing
    // unless the component says so on the section it renders.
    expect(desktopComponent).toMatch(/data-desktop=""/)
  })

  it('shows the desktop’s icons at phone width instead of hiding them', () => {
    // They are the second way into an app beside Start, and with nothing open the
    // desktop was a blue rectangle without them.
    const icons = rule(desktopNarrow, '.icons')
    expect(icons).not.toMatch(/display:\s*none/)
    expect(icons).toMatch(/grid-template-columns:\s*repeat\(3/)
  })

  it('keeps the Start menu inside the screen', () => {
    // The menu opens upward from the taskbar. On a docked desktop it is taller
    // than the screen, so without a ceiling its first actions leave the top of
    // the screen — the one way into an app that a phone has.
    const menu = rule(desktopSheet, '.startMenu')
    expect(menu).toMatch(/max-height:\s*calc\(100% - [\d.]+rem\)/)
    expect(menu).toMatch(/overflow:\s*auto/)
  })
})
