// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { loadThemeAudit, type StyleRule } from '../helpers/themeAudit'
import {
  globalFocusGaps,
  outlineSuppressionGaps,
  readUiStylesheets,
  reducedMotionGaps,
} from '../helpers/a11yAudit'

/**
 * The half of the accessibility audit that lives in the stylesheets: the focus
 * ring, and the promise that the workspace stops moving for anyone whose
 * operating system asks it to.
 *
 * Both are checked where they are declared rather than where they are rendered,
 * because that is where the mistake is made — an outline switched off in one rule
 * and drawn in none, or a motion reset that loses to the rule it is meant to
 * override. Each check carries the sample that must be recognised as broken, so
 * a matcher that stops matching fails instead of passing quietly.
 */

const sheets = readUiStylesheets()
const audit = loadThemeAudit()

function rule(selector: string, declarations: Array<[string, string]>): StyleRule {
  return { file: 'probe.module.css', selector, declarations, theme: 'both' }
}

function sheet(css: string) {
  return [{ file: 'probe.css', css }]
}

describe('the focus ring', () => {
  it('draws one rule that reaches every control it did not itself style', () => {
    expect(globalFocusGaps(sheets)).toEqual([])
  })

  it('reads the sheets it is meant to check', () => {
    expect(sheets.length).toBeGreaterThanOrEqual(12)
    expect(sheets.some((entry) => entry.file.endsWith('global.css'))).toBe(true)
  })

  it('still recognises a focus rule that draws nothing', () => {
    expect(globalFocusGaps(sheet(':focus-visible { outline: none; }'))).toEqual([
      'probe.css → :focus-visible draws no visible outline',
    ])
    expect(globalFocusGaps(sheet(':focus-visible { box-shadow: 0 0 0 2px transparent; }'))).toHaveLength(1)
    // And a sheet with no unscoped rule at all is a gap, not a pass.
    expect(globalFocusGaps(sheet('.probe:focus-visible { outline: 2px solid red; }'))).toEqual([
      'no unscoped :focus-visible rule: a control with no focus style of its own has none',
    ])
    expect(globalFocusGaps(sheet(':focus-visible { outline: 2px solid var(--accent); }'))).toEqual([])
  })

  it('accepts an outline switched off only where something else appears', () => {
    expect(outlineSuppressionGaps(audit.rules)).toEqual([])
  })

  it('still recognises a control that switches its outline off and draws nothing', () => {
    const gaps = outlineSuppressionGaps([
      rule('.ghost', [['outline', 'none']]),
      rule('.ghost:hover', [['color', 'red']]),
      rule('.other:focus-visible', [['outline', '2px solid var(--accent)']]),
    ])

    expect(gaps).toEqual([
      {
        file: 'probe.module.css',
        selector: '.ghost',
        reason: 'the outline is switched off with no :focus-visible replacement',
      },
    ])
  })

  it('accepts the two shapes that do replace it', () => {
    // The focus rule draws something else itself.
    expect(
      outlineSuppressionGaps([
        rule('.tile:focus-visible', [
          ['outline', 'none'],
          ['background-color', 'var(--accent-soft)'],
        ]),
      ]),
    ).toEqual([])

    // Or a companion rule for the same subject draws the ring.
    expect(
      outlineSuppressionGaps([
        rule('.tile', [['outline', 'none']]),
        rule('.tile:focus-visible', [['outline', '2px solid var(--accent)']]),
      ]),
    ).toEqual([])

    // The handle that hands its ring to the grip inside it.
    expect(
      outlineSuppressionGaps([
        rule('.handle:focus-visible', [['outline', 'none']]),
        rule('.handle:focus-visible .grip', [['background-color', 'var(--accent)']]),
      ]),
    ).toEqual([])

    // A companion that only suppresses is not a replacement — both halves are
    // gaps, because the suppressing rule cancels the global ring on its subject.
    expect(
      outlineSuppressionGaps([
        rule('.tile', [['outline', 'none']]),
        rule('.tile:focus-visible', [['outline', '0']]),
      ]).map((gap) => gap.selector),
    ).toEqual(['.tile', '.tile:focus-visible'])
  })
})

describe('reduced motion', () => {
  it('stops the workspace moving when the operating system asks it to', () => {
    expect(reducedMotionGaps(sheets)).toEqual([])
  })

  it('finds motion worth neutralizing, so the block is not judged over an empty sheet set', () => {
    const declarations = sheets.reduce(
      (total, entry) => total + (entry.css.match(/transition|animation/g)?.length ?? 0),
      0,
    )

    expect(declarations).toBeGreaterThan(20)
  })

  it('still recognises a block that is missing, blind, or beatable', () => {
    expect(reducedMotionGaps(sheet('.probe { transition: color 120ms; }'))).toEqual([
      'no prefers-reduced-motion block, with 1 transition or animation declarations in the sheets',
    ])

    // A block that does not reach every element cannot stop a component's motion.
    expect(
      reducedMotionGaps(
        sheet(
          '@media (prefers-reduced-motion: reduce) {\n  .probe {\n    transition-duration: 0.01ms !important;\n    animation-duration: 0.01ms !important;\n  }\n}\n.probe { transition: color 120ms; }',
        ),
      ),
    ).toEqual(['the reduced-motion block does not reach every element: no universal selector in it'])

    // A duration without !important loses to the rule it is meant to override.
    expect(
      reducedMotionGaps(
        sheet(
          '@media (prefers-reduced-motion: reduce) {\n  *,\n  *::before {\n    transition-duration: 0.01ms;\n    animation-duration: 0.01ms !important;\n  }\n}',
        ),
      ),
    ).toEqual([
      'the reduced-motion block sets transition-duration without !important, so a component rule wins',
    ])

    // A loop has to be stopped too, not just shortened.
    expect(
      reducedMotionGaps(
        sheet(
          '@media (prefers-reduced-motion: reduce) {\n  *,\n  *::before,\n  *::after {\n    transition-duration: 0.01ms !important;\n    animation-duration: 0.01ms !important;\n  }\n}\n.probe { animation: spin 2s infinite; }',
        ),
      ),
    ).toEqual(['an animation repeats forever and the reduced-motion block does not stop it'])

    expect(
      reducedMotionGaps(
        sheet(
          '@media (prefers-reduced-motion: reduce) {\n  *,\n  *::before,\n  *::after {\n    transition-duration: 0.01ms !important;\n    animation-duration: 0.01ms !important;\n    animation-iteration-count: 1 !important;\n  }\n}\n.probe { animation: spin 2s infinite; }',
        ),
      ),
    ).toEqual([])

    // A component rule that shouts as loudly cannot be overridden by the reset.
    expect(
      reducedMotionGaps(
        sheet(
          '@media (prefers-reduced-motion: reduce) {\n  *,\n  *::before,\n  *::after {\n    transition-duration: 0.01ms !important;\n    animation-duration: 0.01ms !important;\n  }\n}\n.probe { transition-duration: 5s !important; }',
        ),
      ),
    ).toEqual([
      'probe.css → transition-duration is declared !important outside the reduced-motion block, so the reset cannot stop it',
    ])
  })
})
