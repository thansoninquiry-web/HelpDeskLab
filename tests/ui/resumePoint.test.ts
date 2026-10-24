import { describe, expect, it } from 'vitest'
import type { ResumePoint } from '../../src/app/practiceService'
import { resumeSummary, resumeWhere, stepsIn } from '../../src/ui/components/resumePoint'

function point(overrides: Partial<ResumePoint> = {}): ResumePoint {
  return { tool: null, pane: 'terminal', steps: 0, ...overrides }
}

describe('resume point wording', () => {
  it('names the console from the label set the log uses, with its article', () => {
    expect(resumeWhere(point({ tool: 'printers', pane: 'tools' }))).toBe('the Printers console')
    expect(resumeWhere(point({ tool: 'mail-admin', pane: 'tools' }))).toBe('the Mail admin console')
  })

  it('names the pane when no console was in front', () => {
    expect(resumeWhere(point({ pane: 'terminal' }))).toBe('the terminal')
    expect(resumeWhere(point({ pane: 'tools' }))).toBe('the tool picker')
  })

  it('counts the steps, and says a log with none has not started', () => {
    expect(stepsIn(0)).toBe('before the first step')
    expect(stepsIn(1)).toBe('1 step in')
    expect(stepsIn(3)).toBe('3 steps in')
  })

  it('reads as one phrase, which is what the queue prints', () => {
    expect(resumeSummary(point({ tool: 'printers', pane: 'tools', steps: 3 }))).toBe(
      'the Printers console, 3 steps in',
    )
  })
})
