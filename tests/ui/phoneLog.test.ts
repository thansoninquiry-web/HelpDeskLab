import { describe, expect, it } from 'vitest'
import { TEXT_SIZES } from '../../src/domain/appearance/textSize'
import {
  PHONE_VIEWPORTS,
  TEXT_SIZE_SCALES,
  dockLayout,
  dockModeFor,
} from '../helpers/phoneDock'

/**
 * A console line is the unit this audit counts in. One line is a message that
 * has already scrolled away from the prompt it answers; two is the smallest log
 * a learner can read *and* work in — the last command and what it said. The
 * dock's floor is written as chrome plus two lines for exactly that reason, and
 * this suite holds the floor to it at every real phone, at every text size, in
 * both pane states.
 *
 * The geometry comes from `tests/helpers/phoneDock.ts`, which reads the numbers
 * out of the stylesheets: a card that shrinks, a floor that is lowered, a chrome
 * row that grows or a scale that is raised all fail here rather than in someone's
 * hand on a 320px phone.
 */
const READABLE_LINES = 2

describe('the docked console on a phone', () => {
  it('is docked on every viewport this audit claims to cover', () => {
    for (const viewport of PHONE_VIEWPORTS) {
      expect(
        dockModeFor(viewport),
        `${viewport.device} (${viewport.width}×${viewport.height}) is not docked`,
      ).not.toBeNull()
    }
  })

  it('has a root scale for every text size Settings offers', () => {
    for (const size of TEXT_SIZES) {
      expect(TEXT_SIZE_SCALES.has(size), `${size} has no --ui-scale`).toBe(true)
    }
  })

  it('docks nothing on a desktop window', () => {
    expect(dockLayout({ width: 1280, height: 900 }, 'default', true)).toBeNull()
  })

  describe.each(PHONE_VIEWPORTS.map((viewport) => [viewport.device, viewport] as const))(
    '%s',
    (_device, viewport) => {
      it.each(TEXT_SIZES.map((size) => [size, size] as const))(
        'keeps two lines of log at %s text',
        (_label, textSize) => {
          for (const split of [true, false]) {
            const pane = split ? 'split view' : 'console pane'
            const layout = dockLayout(viewport, textSize, split)
            expect(layout, `${pane} is not measured`).not.toBeNull()
            if (layout === null) continue

            const where = `${pane}, ${textSize} text, ${viewport.width}×${viewport.height}`
            const detail =
              `${where}: card ${layout.card.toFixed(1)}px, head ${layout.head.toFixed(1)}px, ` +
              `console ${layout.console.toFixed(1)}px, chips ${layout.chips.toFixed(1)}px, ` +
              `command ${layout.command.toFixed(1)}px leaves the log ` +
              `${layout.log.toFixed(1)}px = ${layout.lines.toFixed(2)} lines of ${layout.line.toFixed(1)}px`

            expect(layout.lines, detail).toBeGreaterThanOrEqual(READABLE_LINES)
            // The log is a real scroll viewport, not a sliver: it must at least
            // hold the two lines the floor promises.
            expect(layout.log, detail).toBeGreaterThanOrEqual(READABLE_LINES * layout.line)
          }
        },
      )
    },
  )
})
