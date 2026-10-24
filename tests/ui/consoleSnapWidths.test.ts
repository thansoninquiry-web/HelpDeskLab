// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  CONSOLE_LAYOUT_WIDTHS_REM,
  SPLIT_SNAP_REACH_REM,
  TERMINAL_LAYOUT_WIDTHS_REM,
} from '../../src/domain/tickets/splitLayout'

/**
 * The divider snaps to the widths at which a console's layout turns on, and those
 * widths belong to the console: it measures itself and stacks its list above its
 * detail when its own container query says so. So the numbers sit in two places —
 * the stylesheet that reflows the console and the list the drag reads — and this
 * is what keeps them the same number. A query added there without a width here, or
 * a width here with no query behind it, fails the build rather than quietly
 * snapping the divider to a size where nothing happens.
 */

function read(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), 'utf8')
}

const consoleStyles = read('src/ui/components/ToolConsole.module.css')
const workspaceStyles = read('src/ui/routes/workspace.module.css')
const entryStyles = read('src/ui/routes/practice.module.css')

/** The width of every `@container (max-width: …)` the console declares, in rem. */
function containerWidths(css: string): number[] {
  return [
    ...new Set(
      [...css.matchAll(/@container\s*\(max-width:\s*([\d.]+)rem\)/g)].map((match) =>
        Number(match[1]),
      ),
    ),
  ].sort((a, b) => a - b)
}

describe('the console layout widths', () => {
  it('snaps to exactly the widths the console reflows at', () => {
    const declared = containerWidths(consoleStyles)
    expect(declared.length).toBeGreaterThan(0)
    expect([...CONSOLE_LAYOUT_WIDTHS_REM]).toEqual(declared)
  })

  it('is only meaningful because the console measures its own width', () => {
    // A width read off the window would be a fact about the screen rather than
    // about the pane the divider is sizing.
    expect(consoleStyles).toMatch(/container-type:\s*inline-size/)
  })

  it('catches within less than the narrowest width it is catching on', () => {
    // A catch as wide as a console would make the divider unusable around it.
    for (const width of CONSOLE_LAYOUT_WIDTHS_REM) {
      expect(SPLIT_SNAP_REACH_REM).toBeLessThan(width)
    }
  })
})

describe('the terminal layout widths', () => {
  it('snaps to exactly the widths the log restructures at', () => {
    const declared = containerWidths(workspaceStyles)
    expect(declared.length).toBeGreaterThan(0)
    expect([...TERMINAL_LAYOUT_WIDTHS_REM]).toEqual(declared)
  })

  it('is only meaningful because the terminal measures its own pane', () => {
    // The log is handed part of the card in split view; a width read off the
    // window would say nothing about the pane the divider is sizing.
    expect(workspaceStyles).toMatch(
      /\.terminalPane\s*\{[^}]*container-type:\s*inline-size/,
    )
  })

  it('restructures the entries under the same width', () => {
    // The pane's query lives in one stylesheet and the entries' in the other, so
    // both have to name the same number for the restructure to happen at all.
    expect(containerWidths(entryStyles)).toContain(TERMINAL_LAYOUT_WIDTHS_REM[0])
    expect(entryStyles).toMatch(/\.commandLine \.prompt\s*\{[^}]*display:\s*block/)
  })
})
