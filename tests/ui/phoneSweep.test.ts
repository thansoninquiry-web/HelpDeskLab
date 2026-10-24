// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The phone sweep found two ways a route widened a window narrower than 360px:
 * the header's fifth section was sliced by the edge, and the Settings price
 * select pushed the page sideways because a long option set the field's
 * minimum width. The header's fix is held by the wrapping cases in
 * `appShellNarrow.test.ts`; this holds the field's, read from the stylesheet
 * because jsdom has no layout to measure.
 */

function read(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), 'utf8')
}

const pages = read('src/ui/routes/pages.module.css')

/** The declarations of the rule starting at `selector`, in source order. */
function block(css: string, selector: string): string {
  const start = css.indexOf(selector)
  if (start < 0) {
    throw new Error(`no rule for ${selector}`)
  }
  const open = css.indexOf('{', start)
  const close = css.indexOf('}', open)
  if (open < 0 || close < 0) {
    throw new Error(`the rule for ${selector} is unterminated`)
  }
  return css.slice(open + 1, close)
}

describe('a field at phone width', () => {
  it('lets the field shrink inside its row', () => {
    expect(block(pages, '.field {')).toMatch(/min-width:\s*0/)
  })

  it('sizes the control to the field, not to its longest option', () => {
    // The select that overflowed carried an option naming every family, so its
    // intrinsic width was far wider than the column. Both halves are needed:
    // width to fill the field, min-width so the intrinsic minimum cannot win.
    expect(pages).toMatch(/\.field input,\s*\n\.field select\s*\{/)
    const control = block(pages, '.field input,')
    expect(control).toMatch(/width:\s*100%/)
    expect(control).toMatch(/min-width:\s*0/)
  })
})
