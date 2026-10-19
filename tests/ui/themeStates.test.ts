import { afterEach, describe, expect, it } from 'vitest'
import {
  contrastRatio,
  declarationsFor,
  pairForElement,
  pairForState,
  prepareRules,
  type Palette,
  type StyleRule,
} from '../helpers/themeAudit'

const palette: Palette = {
  name: 'dark',
  tokens: new Map([
    ['--text', '#dbe6f2'],
    ['--panel', '#080d15'],
    ['--accent', '#38cdea'],
    ['--accent-soft', '#08222e'],
    ['--warning-text', '#fcd34d'],
  ]),
}

const rules: StyleRule[] = [
  {
    file: 'probe.module.css',
    selector: '.probe',
    declarations: [
      ['color', 'var(--text)'],
      ['background', 'var(--panel)'],
    ],
    theme: 'both',
  },
  {
    file: 'probe.module.css',
    selector: '.probe:hover',
    declarations: [
      ['color', 'var(--accent)'],
      ['background', 'var(--accent-soft)'],
    ],
    theme: 'both',
  },
  {
    file: 'probe.module.css',
    selector: '.probe:focus-visible',
    declarations: [['color', 'var(--warning-text)']],
    theme: 'both',
  },
  {
    file: 'probe.module.css',
    selector: '.probe:disabled',
    declarations: [['opacity', '0.5']],
    theme: 'both',
  },
]

const index = prepareRules(
  { dark: palette, light: palette, rules, tokenReferences: [] },
  { 'probe.module.css': { probe: 'probe_generated' } },
)

function probe(): Element {
  document.body.innerHTML = '<button class="probe_generated" type="button">Probe</button>'
  const element = document.querySelector('.probe_generated')
  if (!element) {
    throw new Error('The probe button did not render.')
  }
  return element
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('the interactive-state pass', () => {
  it('reads the resting pair when no state applies', () => {
    const element = probe()
    declarationsFor(element, 'dark', index)
    const pair = pairForElement(element, palette)

    expect(pair?.text).toBe('var(--text)')
    expect(pair?.surface).toBe('var(--panel)')
  })

  it('lays the hover rule over the resting one', () => {
    const pair = pairForState(probe(), palette, 'dark', index, 'hover')

    expect(pair?.text).toBe('var(--accent)')
    expect(pair?.surface).toBe('var(--accent-soft)')
    expect(pair?.where).toContain('[hover]')
  })

  it('lays the focus-visible colour over the resting surface', () => {
    const pair = pairForState(probe(), palette, 'dark', index, 'focus-visible')

    expect(pair?.text).toBe('var(--warning-text)')
    expect(pair?.surface).toBe('var(--panel)')
    expect(pair?.where).toContain('[focus-visible]')
  })

  it('dims the text a disabled control fades, so the ratio it checks is the visible one', () => {
    const element = probe()
    const disabled = pairForState(element, palette, 'dark', index, 'disabled')
    declarationsFor(element, 'dark', index)
    const resting = pairForElement(element, palette)

    expect(resting?.textColour).toBeDefined()
    expect(disabled?.textColour).toBeDefined()
    expect(disabled?.surfaceColour).toBeDefined()
    expect(disabled?.where).toContain('[disabled]')

    const restingRatio = contrastRatio(resting!.textColour!, resting!.surfaceColour!)
    const disabledRatio = contrastRatio(disabled!.textColour!, disabled!.surfaceColour!)
    expect(disabledRatio).toBeLessThan(restingRatio)
  })
})
