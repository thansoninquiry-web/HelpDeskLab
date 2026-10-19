import { describe, expect, it } from 'vitest'
import type { JsonObject } from '../../../src/domain/shared/json'
import {
  pressureReport,
  type PressureLogStep,
} from '../../../src/domain/tickets/pressureReport'

function step(
  kind: PressureLogStep['kind'],
  input: JsonObject = {},
  output: JsonObject = {},
  atMs = 0,
): PressureLogStep {
  return { kind, atMs, input, output }
}

function interruption(message: string, atMs = 0): PressureLogStep {
  return step(
    'ask-user',
    { intent: 'caller-interruption' },
    { question: '', answer: message, interruption: true },
    atMs,
  )
}

describe('pressureReport', () => {
  it('counts only break-ins and names the step each one followed', () => {
    const report = pressureReport([
      step('command', { command: 'get-account mchen' }, {}, 1_000),
      interruption('No code, no questions — just unlock it.', 2_000),
      step('note', { noteKind: 'troubleshooting' }, {}, 3_000),
      interruption('Are you still there? I am on a clock.', 4_000),
      step('ask-user', { intent: 'what-error' }, { answer: 'It says locked.' }, 5_000),
    ])

    expect(report.interruptions).toBe(2)
    expect(report.beats).toEqual([
      {
        message: 'No code, no questions — just unlock it.',
        after: 'after you ran `get-account mchen`',
        atMs: 2_000,
      },
      {
        message: 'Are you still there? I am on a clock.',
        after: 'after you saved your troubleshooting note',
        atMs: 4_000,
      },
    ])
  })

  it('describes every kind of step the caller could react to', () => {
    const cases: Array<[PressureLogStep, string]> = [
      [step('command', { command: 'reset-password mchen' }), 'after you ran `reset-password mchen`'],
      [step('ask-user', { intent: 'what-error' }), 'after you asked the caller a question'],
      [step('note', { noteKind: 'customer' }), 'after you saved your customer update'],
      [step('note', { noteKind: 'resolution' }), 'after you saved your handoff note'],
      [step('verify-caller', {}, { verified: false }), 'after a failed identity check'],
      [step('verify-caller', { method: 'callback' }, { verified: true }), 'after you verified the caller'],
      [
        step('code-sent', { recipientName: 'Marcus Chen' }),
        'after you sent a verification code to Marcus Chen',
      ],
      [step('deny-caller', {}), 'after you refused the request'],
      [step('hint', {}), 'after you took a hint'],
      [step('rewind', { dropped: 3 }), 'after you un-ran 3 steps'],
    ]

    for (const [before, after] of cases) {
      expect(pressureReport([before, interruption('Do it now.')]).beats[0]?.after).toBe(after)
    }
  })

  it('anchors a first-line break-in and a repeat to the call itself', () => {
    const report = pressureReport([
      interruption('Unlock it.'),
      interruption('Still there?'),
    ])

    expect(report.beats.map((beat) => beat.after)).toEqual([
      'at the start of the call',
      'after they broke in again',
    ])
  })

  it('reads an empty log as a caller who never pressed', () => {
    expect(pressureReport([])).toEqual({ interruptions: 0, beats: [] })
  })

  it('still counts a break-in whose words were not recorded', () => {
    const report = pressureReport([step('ask-user', {}, { interruption: true })])

    expect(report.interruptions).toBe(1)
    expect(report.beats[0]?.message).toBe('The caller broke in.')
  })
})
