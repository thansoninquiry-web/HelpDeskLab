import { describe, expect, it } from 'vitest'
import { CASES, caseById, verifyCase } from '../../../src/modules/desktop/data/cases'
import { buildEstate } from '../../../src/modules/desktop/logic/estate'
import { commandFor, runTool } from '../../../src/modules/desktop/logic/tools'
import { scoreDesktopAttempt, type DesktopAttempt } from '../../../src/modules/desktop/logic/scoring'
import type { ChecklistRecord, DesktopCase, FixId } from '../../../src/modules/desktop/types'

/**
 * The bench's own checks: every case resolves on its reference path, the reads
 * its evidence names are the reads the tools record, and the two rules the
 * module exists to teach — look before touching, and back the data up first —
 * are what the scorer actually enforces.
 */

const NOTE = 'Replaced the failing part and confirmed the machine with the user.'

function attemptFor(
  entry: DesktopCase,
  fixes: readonly FixId[] = entry.expectedFix,
  options: { checks?: boolean; checklist?: ChecklistRecord[] } = {},
): DesktopAttempt {
  const estate = buildEstate(entry, fixes)
  const checks =
    options.checks === false
      ? []
      : entry.evidence.map((evidence, index) => ({
          id: evidence.check,
          on: evidence.on ?? 'os',
          at: index + 1,
        }))
  const checklist: ChecklistRecord[] =
    options.checklist ??
    [
      { id: 'verify-user', at: 1 },
      { id: 'backup', at: 2 },
      { id: 'document', at: 500, note: NOTE },
      { id: 'follow-up', at: 501 },
    ]
  return {
    entry,
    estate,
    checks,
    changes: fixes.map((fix, index) => ({ fix, at: 10 + index })),
    checklist,
  }
}

describe('the desktop bench', () => {
  it('covers the categories the module was asked for', () => {
    const categories = new Set(CASES.map((entry) => entry.category))
    expect([...categories].sort()).toEqual([
      'application',
      'hardware',
      'legacy',
      'quickbooks',
      'windows',
    ])
    // Ten hardware cases, Windows 10 and 11, legacy, Office/printing, QuickBooks.
    expect(CASES.filter((entry) => entry.category === 'hardware')).toHaveLength(10)
    expect(CASES.filter((entry) => entry.edition === 'Windows 10').length).toBeGreaterThan(0)
    expect(CASES.filter((entry) => entry.edition === 'Windows 11').length).toBeGreaterThan(0)
    expect(CASES.filter((entry) => entry.category === 'legacy').length).toBeGreaterThanOrEqual(3)
  })

  it('has unique ids, a verification and a reference path inside its own options', () => {
    const ids = CASES.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const entry of CASES) {
      expect(() => verifyCase(entry, buildEstate(entry, []))).not.toThrow()
      expect(entry.expectedFix.length).toBeGreaterThan(0)
      for (const fix of entry.expectedFix) {
        expect(
          entry.fixOptions.some((option) => option.id === fix),
          `${entry.id} expects ${fix} but does not offer it`,
        ).toBe(true)
      }
      expect(entry.evidence.length).toBeGreaterThan(0)
    }
  })

  it('resolves every case on its reference path', () => {
    for (const entry of CASES) {
      expect(
        verifyCase(entry, buildEstate(entry, entry.expectedFix)),
        `${entry.id} does not resolve on its reference path`,
      ).toBe(true)
    }
  })

  it('does not consider any case resolved before a change', () => {
    for (const entry of CASES) {
      expect(verifyCase(entry, buildEstate(entry, [])), `${entry.id} starts resolved`).toBe(false)
    }
  })

  it('scores a complete, careful attempt at 100 and a pass', () => {
    for (const entry of CASES) {
      const score = scoreDesktopAttempt(attemptFor(entry))
      expect(score.total, `${entry.id} should score 100`).toBe(100)
      expect(score.passed, `${entry.id} should pass`).toBe(true)
      expect(score.resolved, `${entry.id} should be resolved`).toBe(true)
    }
  })

  it('will not pass a correct fix made without a single read', () => {
    const entry = caseById('failing-drive') as DesktopCase
    const score = scoreDesktopAttempt(
      attemptFor(entry, entry.expectedFix, { checks: false, checklist: [] }),
    )
    expect(score.total).toBeLessThan(75)
    expect(score.passed).toBe(false)
    expect(score.items.find((item) => item.id === 'sequence')?.passed).toBe(false)
  })

  it('fails an attempt that put the data at risk before backing it up', () => {
    const entry = caseById('failing-drive') as DesktopCase
    const score = scoreDesktopAttempt(
      attemptFor(entry, entry.expectedFix, {
        checklist: [
          { id: 'verify-user', at: 1 },
          { id: 'backup', at: 50 },
          { id: 'document', at: 60, note: NOTE },
          { id: 'follow-up', at: 61 },
        ],
      }),
    )
    // The fix is right and the machine ends up healthy, but the rule is the rule.
    expect(score.resolved).toBe(true)
    expect(score.criticalSafety).toBe(true)
    expect(score.passed).toBe(false)
    expect(score.items.find((item) => item.id === 'check-backup')?.earned).toBe(0)
  })

  it('charges for a change the case did not call for', () => {
    const entry = caseById('cmos-clock-reset') as DesktopCase
    const careful = scoreDesktopAttempt(attemptFor(entry))
    const guess = scoreDesktopAttempt(
      attemptFor(entry, [...entry.expectedFix, 'replace-motherboard']),
    )
    expect(guess.total).toBeLessThan(careful.total)
    expect(guess.criticalSafety).toBe(true)
  })

  it('records the read its evidence names for every case in the bank', () => {
    for (const entry of CASES) {
      const estate = buildEstate(entry, [])
      for (const evidence of entry.evidence) {
        const on = evidence.on ?? 'os'
        const outcome = runTool({ estate, subject: entry.subject }, commandFor(evidence.check, on))
        expect(outcome.check, `${entry.id}: ${evidence.check} was not recorded`).toBe(
          evidence.check,
        )
        expect(outcome.on, `${entry.id}: ${evidence.check} recorded against the wrong thing`).toBe(
          on,
        )
        expect(outcome.lines.length).toBeGreaterThan(0)
      }
    }
  })

  it('reads the dead supply as dead and the failing module by name', () => {
    const psu = caseById('no-post-psu') as DesktopCase
    const psuOut = runTool({ estate: buildEstate(psu, []), subject: 'psu' }, 'test psu')
    expect(psuOut.lines.map((entry) => entry.text).join('\n')).toContain('0.00 V')

    const memory = caseById('no-post-memory') as DesktopCase
    const bad = runTool({ estate: buildEstate(memory, []), subject: 'ram-2' }, 'memtest ram-2')
    expect(bad.lines.map((entry) => entry.text).join('\n')).toContain('FAIL')
    const good = runTool({ estate: buildEstate(memory, []), subject: 'ram-1' }, 'memtest ram-1')
    expect(good.lines.map((entry) => entry.text).join('\n')).toContain('PASS')
  })

  it('runs the Windows and application tools against the machine', () => {
    const driver = caseById('win10-driver-regression') as DesktopCase
    const devices = runTool({ estate: buildEstate(driver, []), subject: 'os' }, 'devmgmt')
    expect(devices.lines.map((entry) => entry.text).join('\n')).toContain('not started')

    const queue = caseById('printer-queue-stuck') as DesktopCase
    const print = runTool({ estate: buildEstate(queue, []), subject: 'printer' }, 'print queue')
    expect(print.lines.map((entry) => entry.text).join('\n')).toContain('Jobs in queue: 4')

    const qb = caseById('qb-license') as DesktopCase
    const licence = runTool(
      { estate: buildEstate(qb, []), subject: 'quickbooks' },
      'quickbooks /license',
    )
    expect(licence.lines.map((entry) => entry.text).join('\n')).toContain('expired')
  })

  it('keeps changes out of the console', () => {
    const entry = caseById('keyboard-keys') as DesktopCase
    const outcome = runTool({ estate: buildEstate(entry, []), subject: 'keyboard' }, 'replace keyboard')
    expect(outcome.check).toBeUndefined()
    expect(outcome.lines.map((line) => line.text).join('\n')).toContain(
      'Changes are made with the bench buttons',
    )
  })
})
