// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CONSOLE_LAYOUT_WIDTHS_REM } from '../../src/domain/tickets/splitLayout'

/**
 * A console is handed a quarter of a small card at the divider's narrowest — as
 * little as twelve rem — and no media query can see that, because the window is
 * still 1440px wide. These hold the container query that does see it: the two
 * tiers, the pieces it restacks, and the absence of a fixed floor that would be
 * wider than the pane it is drawn in. jsdom applies neither queries nor layout,
 * so the stylesheet is the artifact under test, as it is for the phone layout.
 */

const css = readFileSync(
  fileURLToPath(new URL('../../src/ui/components/ToolConsole.module.css', import.meta.url)),
  'utf8',
)

interface Declaration {
  selector: string
  prop: string
  tier: number | null
  at: number
}

/** The declarations a stylesheet makes, with the container tier each sits in. */
function declarations(text: string, offset = 0, tier: number | null = null): Declaration[] {
  const found: Declaration[] = []
  const body = text.replace(/\/\*[\s\S]*?\*\//g, (comment) => ' '.repeat(comment.length))
  let index = 0
  while (index < body.length) {
    const open = body.indexOf('{', index)
    if (open < 0) {
      break
    }
    const head = body.slice(index, open).trim()
    const close = matchingBrace(body, open)
    const container = /^@container\s*\(max-width:\s*([\d.]+)rem\)/.exec(head)
    if (head.startsWith('@')) {
      found.push(
        ...declarations(
          body.slice(open + 1, close),
          offset + open + 1,
          container ? Number(container[1]) : tier,
        ),
      )
    } else if (head) {
      const selectorText = head.startsWith('.') ? head : ''
      const inner = body.slice(open + 1, close)
      const base = offset + open + 1
      let cursor = 0
      for (const statement of inner.split(';')) {
        const colon = statement.indexOf(':')
        const prop = colon > 0 ? statement.slice(0, colon).trim() : ''
        const trimmed = statement.trim()
        if (prop && !trimmed.startsWith('/*')) {
          for (const selector of selectorText.split(',').map((one) => one.trim())) {
            if (selector) {
              found.push({ selector, prop, tier, at: base + cursor })
            }
          }
        }
        cursor += statement.length + 1
      }
    }
    index = close + 1
  }
  return found
}

/** The index of the brace that closes the one at `open`, depth-counted. */
function matchingBrace(text: string, open: number): number {
  let depth = 0
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1
    if (text[index] === '}') {
      depth -= 1
      if (depth === 0) return index
    }
  }
  throw new Error('a rule is unterminated')
}

/** The body of the container block that opens at `start`, brace-balanced. */
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
  throw new Error('a container block is unterminated')
}

function containerBody(rem: number): string {
  const start = css.indexOf(`@container (max-width: ${rem}rem)`)
  if (start < 0) {
    throw new Error(`ToolConsole.module.css has no ${rem}rem container`)
  }
  return blockBody(start)
}

describe('a console at the narrowest the divider allows', () => {
  const narrow = containerBody(20)

  it('turns at a width the divider snaps to', () => {
    // The stylesheet's query and the snap list are the same number; taking the
    // compact width out of the list would let the divider sail past the layout
    // change without catching.
    expect(CONSOLE_LAYOUT_WIDTHS_REM).toContain(20)
  })

  it('measures the pane, not the window', () => {
    expect(css).toMatch(/container-type:\s*inline-size/)
  })

  it('keeps the wider tier that stacks the list above its detail', () => {
    expect(containerBody(32)).toMatch(/\.lower\s*\{[^}]*grid-template-columns:\s*1fr/)
  })

  it('stacks every pair a quarter-card cannot hold side by side', () => {
    // A label beside its value, a picker's action beside its row, a filter beside
    // its query and a tile's fact are the four rows that become slivers.
    expect(narrow).toMatch(/\.fieldRow\s*\{[^}]*flex-direction:\s*column/)
    expect(narrow).toMatch(/\.pickerRow\s*\{[^}]*flex-direction:\s*column/)
    expect(narrow).toMatch(/\.filter\s*\{[^}]*flex-direction:\s*column/)
    expect(narrow).toMatch(/\.tileFact\s*\{[^}]*flex-direction:\s*column/)
    // The 8rem label was the widest thing in the record; it cannot be wider than
    // the pane now.
    expect(narrow).toMatch(/\.fieldRow dt\s*\{[^}]*min-width:\s*0/)
  })

  it('lets a name or a value wrap instead of ending in an ellipsis', () => {
    expect(narrow).toMatch(/\.pickerName,\s*\.pickerMeta\s*\{[^}]*white-space:\s*normal/)
    expect(narrow).toMatch(/\.fieldRow dd\s*\{[^}]*overflow-wrap:\s*anywhere/)
    expect(narrow).toMatch(/\.tileFactValue\s*\{[^}]*white-space:\s*normal/)
  })

  it('takes its declarations back from no base rule that follows it', () => {
    // A tier has the same specificity as the rule it overrides, so it can only
    // win by coming later. Every one of these declarations was dead while the
    // tier sat above the base rules, and the console kept squeezing a picker's
    // name to three letters at the narrowest the divider allows.
    const all = declarations(css)
    const reclaimed = all
      .filter((tiered) => tiered.tier !== null)
      .flatMap((tiered) =>
        all
          .filter(
            (base) =>
              base.tier === null &&
              base.selector === tiered.selector &&
              base.prop === tiered.prop &&
              base.at > tiered.at,
          )
          .map((base) => `${base.selector} { ${base.prop} } at ${base.at} beats the tier`),
      )
    expect(reclaimed).toEqual([])
  })

  it('never lets an auto-fill floor be wider than the pane', () => {
    // `minmax(11rem, 1fr)` in a 12rem console overflows by more than the pane has
    // to spare, and a console has a horizontal scrollbar rather than a divider
    // that can widen it.
    expect(css).toMatch(
      /grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(min\(11rem,\s*100%\),\s*1fr\)\)/,
    )
    expect(css).toMatch(
      /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(13rem,\s*100%\),\s*1fr\)\)/,
    )
  })
})
