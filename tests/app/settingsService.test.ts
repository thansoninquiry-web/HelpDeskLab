// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openPersistence, type Persistence } from '../../src/persistence/database'
import { MemorySnapshotStore } from '../../src/persistence/snapshotStore'
import { loadWasmBinary } from '../helpers/sqlite'

const holder = vi.hoisted(() => ({ current: null as Persistence | null }))

vi.mock('../../src/app/persistenceService', () => ({
  getLocalDatabase: async () => {
    if (!holder.current) {
      throw new Error('Test database is not ready')
    }
    return holder.current
  },
}))

import { HINT_BUDGET_LIMIT, HINT_CAP_LIMIT, HINT_COST_LIMIT } from '../../src/domain/scoring/policy'
import {
  clearFamilyHintPolicy,
  defaultHintPolicy,
  describeHintPolicy,
  examHintPolicy,
  hintPolicyLimits,
  loadExamMode,
  loadHintPolicy,
  loadHintTargets,
  loadSplitView,
  resolveHintPolicy,
  resolveHintPricing,
  saveExamMode,
  saveFamilyHintPolicy,
  saveHintPolicy,
  saveSplitView,
  validateHintPolicy,
} from '../../src/app/settingsService'

let store: MemorySnapshotStore

beforeEach(async () => {
  store = new MemorySnapshotStore()
  holder.current = await openPersistence({ snapshotStore: store, wasmBinary: loadWasmBinary() })
})

describe('hint settings', () => {
  it('starts on the standard price', async () => {
    expect(defaultHintPolicy()).toEqual({ perHint: 5, cap: 15, budget: 0 })
    expect(await loadHintPolicy()).toEqual({ perHint: 5, cap: 15, budget: 0 })
  })

  it('reads back the policy it saved, even after the app is reopened', async () => {
    expect(await saveHintPolicy({ perHint: 12, cap: 36, budget: 0 })).toEqual({ perHint: 12, cap: 36, budget: 0 })
    expect(await loadHintPolicy()).toEqual({ perHint: 12, cap: 36, budget: 0 })

    await holder.current?.close()
    holder.current = await openPersistence({ snapshotStore: store, wasmBinary: loadWasmBinary() })

    expect(await loadHintPolicy()).toEqual({ perHint: 12, cap: 36, budget: 0 })
  })

  it('accepts free hints', async () => {
    expect(await saveHintPolicy({ perHint: 0, cap: 0, budget: 0 })).toEqual({ perHint: 0, cap: 0, budget: 0 })
    expect(await loadHintPolicy()).toEqual({ perHint: 0, cap: 0, budget: 0 })
    expect(describeHintPolicy({ perHint: 0, cap: 0, budget: 0 })).toMatch(/hints are free/i)
  })

  it('refuses numbers the game cannot play with', async () => {
    await expect(saveHintPolicy({ perHint: 10, cap: 5, budget: 0 })).rejects.toThrow(
      /cap cannot be lower than one hint/i,
    )
    await expect(saveHintPolicy({ perHint: 0, cap: 15, budget: 0 })).rejects.toThrow(/free hints/i)
    await expect(saveHintPolicy({ perHint: 2.5, cap: 10, budget: 0 })).rejects.toThrow(/whole numbers/i)
    await expect(saveHintPolicy({ perHint: -1, cap: 0, budget: 0 })).rejects.toThrow(/negative/i)
    await expect(saveHintPolicy({ perHint: HINT_COST_LIMIT + 1, cap: 200, budget: 0 })).rejects.toThrow(
      /cannot cost more/i,
    )
    // A refused save changes nothing.
    expect(await loadHintPolicy()).toEqual({ perHint: 5, cap: 15, budget: 0 })
  })

  it('clamps a policy edited outside the app instead of failing to open', async () => {
    const db = holder.current
    if (!db) {
      throw new Error('Test database is missing')
    }

    await db.settings.set('hintPolicy', { perHint: 999, cap: 3, budget: 0 })
    expect(await loadHintPolicy()).toEqual({ perHint: HINT_COST_LIMIT, cap: HINT_COST_LIMIT, budget: 0 })

    await db.settings.set('hintPolicy', 'five points')
    expect(await loadHintPolicy()).toEqual({ perHint: 5, cap: 15, budget: 0 })

    await db.settings.set('hintPolicy', { perHint: 0, cap: 40, budget: 0 })
    expect(await loadHintPolicy()).toEqual({ perHint: 0, cap: 0, budget: 0 })
  })

  it('tells the learner what the policy means in plain words', () => {
    expect(describeHintPolicy({ perHint: 5, cap: 15, budget: 0 })).toBe(
      'Each hint costs 5 points of diagnostic reasoning, up to 15 points on a ticket; after that they are free.',
    )
    expect(describeHintPolicy({ perHint: 1, cap: 1, budget: 0 })).toMatch(/costs 1 point .* up to 1 point on a ticket/)
  })

  it('exposes the bounds and the first reason a policy is unusable', () => {
    expect(hintPolicyLimits()).toEqual({
      perHint: HINT_COST_LIMIT,
      cap: HINT_CAP_LIMIT,
      budget: HINT_BUDGET_LIMIT,
    })
    expect(validateHintPolicy({ perHint: 5, cap: 15, budget: 0 })).toBeNull()
    expect(validateHintPolicy({ perHint: 5, cap: 4, budget: 0 })).toMatch(/cap cannot be lower/i)
  })

  it('rations hints with a budget that survives a reopen', async () => {
    expect(await saveHintPolicy({ perHint: 5, cap: 15, budget: 3 })).toEqual({
      perHint: 5,
      cap: 15,
      budget: 3,
    })

    await holder.current?.close()
    holder.current = await openPersistence({ snapshotStore: store, wasmBinary: loadWasmBinary() })

    expect(await loadHintPolicy()).toEqual({ perHint: 5, cap: 15, budget: 3 })
  })

  it('refuses a budget the game cannot play with', async () => {
    await expect(saveHintPolicy({ perHint: 5, cap: 15, budget: -2 })).rejects.toThrow(
      /budget cannot be negative/i,
    )
    await expect(
      saveHintPolicy({ perHint: 5, cap: 15, budget: HINT_BUDGET_LIMIT + 1 }),
    ).rejects.toThrow(/more than/i)
    expect(await loadHintPolicy()).toEqual({ perHint: 5, cap: 15, budget: 0 })
  })

  it('treats settings saved before the budget existed as unlimited', async () => {
    const db = holder.current
    if (!db) {
      throw new Error('Test database is missing')
    }

    await db.settings.set('hintPolicy', { perHint: 8, cap: 24 })
    expect(await loadHintPolicy()).toEqual({ perHint: 8, cap: 24, budget: 0 })
  })

  it('starts every scenario family on the default', async () => {
    const targets = await loadHintTargets()

    expect(targets[0]?.id).toBeNull()
    expect(targets[0]?.policy).toEqual({ perHint: 5, cap: 15, budget: 0 })
    expect(targets.length).toBeGreaterThan(1)
    expect(targets.slice(1).every((target) => !target.own)).toBe(true)
    expect(targets.every((target) => target.policy.perHint === 5)).toBe(true)
    expect(await resolveHintPolicy('PWD-01')).toEqual({ perHint: 5, cap: 15, budget: 0 })
  })

  it('prices one family without touching the default or its neighbours', async () => {
    await saveFamilyHintPolicy('PWD-01', { perHint: 2, cap: 6, budget: 3 })

    expect(await resolveHintPolicy('PWD-01')).toEqual({ perHint: 2, cap: 6, budget: 3 })
    expect(await resolveHintPolicy('NET-01')).toEqual({ perHint: 5, cap: 15, budget: 0 })
    expect(await loadHintPolicy()).toEqual({ perHint: 5, cap: 15, budget: 0 })

    await holder.current?.close()
    holder.current = await openPersistence({ snapshotStore: store, wasmBinary: loadWasmBinary() })

    const targets = await loadHintTargets()
    const identity = targets.find((target) => target.id === 'PWD-01')
    expect(identity?.own).toBe(true)
    expect(identity?.policy).toEqual({ perHint: 2, cap: 6, budget: 3 })
    expect(targets.find((target) => target.id === 'NET-01')?.own).toBe(false)
  })

  it('gives the default to every family without a price of its own', async () => {
    await saveHintPolicy({ perHint: 12, cap: 36, budget: 1 })

    expect(await resolveHintPolicy('PRN-01')).toEqual({ perHint: 12, cap: 36, budget: 1 })
    // A family added by a later build is priced the same way: nothing names it.
    expect(await resolveHintPolicy('FUTURE-01')).toEqual({ perHint: 12, cap: 36, budget: 1 })
  })

  it('hands a family back to the default when its own price is dropped', async () => {
    await saveFamilyHintPolicy('NET-01', { perHint: 1, cap: 24, budget: 0 })

    expect(await clearFamilyHintPolicy('NET-01')).toEqual({ perHint: 5, cap: 15, budget: 0 })
    expect(await resolveHintPolicy('NET-01')).toEqual({ perHint: 5, cap: 15, budget: 0 })
    expect((await loadHintTargets()).find((target) => target.id === 'NET-01')?.own).toBe(false)

    await holder.current?.close()
    holder.current = await openPersistence({ snapshotStore: store, wasmBinary: loadWasmBinary() })
    expect(await resolveHintPolicy('NET-01')).toEqual({ perHint: 5, cap: 15, budget: 0 })

    // Dropping a price a family never had changes nothing.
    expect(await clearFamilyHintPolicy('NET-01')).toEqual({ perHint: 5, cap: 15, budget: 0 })
  })

  it('refuses a family price the game cannot play with, and a family that does not exist', async () => {
    await expect(
      saveFamilyHintPolicy('PWD-01', { perHint: 10, cap: 5, budget: 0 }),
    ).rejects.toThrow(/cap cannot be lower/i)
    await expect(
      saveFamilyHintPolicy('NOPE-01', { perHint: 5, cap: 15, budget: 0 }),
    ).rejects.toThrow(/scenario family/i)
    await expect(clearFamilyHintPolicy('NOPE-01')).rejects.toThrow(/scenario family/i)

    expect(await resolveHintPolicy('PWD-01')).toEqual({ perHint: 5, cap: 15, budget: 0 })
  })

  it('records where an attempt’s price came from and what it departed from', async () => {
    await saveHintPolicy({ perHint: 2, cap: 6, budget: 0 })
    await saveFamilyHintPolicy('PWD-01', { perHint: 3, cap: 9, budget: 1 })

    expect(await resolveHintPricing('PWD-01', false)).toEqual({
      policy: { perHint: 3, cap: 9, budget: 1 },
      source: 'family',
      familyId: 'PWD-01',
      defaultPolicy: { perHint: 2, cap: 6, budget: 0 },
    })
    expect(await resolveHintPricing('NET-01', false)).toEqual({
      policy: { perHint: 2, cap: 6, budget: 0 },
      source: 'default',
      familyId: null,
      defaultPolicy: { perHint: 2, cap: 6, budget: 0 },
    })

    // An exam names no family, but keeps the default it did not use.
    expect(await resolveHintPricing('PWD-01', true)).toEqual({
      policy: { perHint: 5, cap: 15, budget: 0 },
      source: 'exam',
      familyId: null,
      defaultPolicy: { perHint: 2, cap: 6, budget: 0 },
    })
  })

  it('reads a price saved before families existed as the default for all of them', async () => {
    const db = holder.current
    if (!db) {
      throw new Error('Test database is missing')
    }

    await db.settings.set('hintPolicy', { perHint: 3, cap: 9, budget: 0 })

    expect(await loadHintPolicy()).toEqual({ perHint: 3, cap: 9, budget: 0 })
    expect(await resolveHintPolicy('FS-01')).toEqual({ perHint: 3, cap: 9, budget: 0 })

    // Pricing one family keeps the migrated default instead of resetting it.
    await saveFamilyHintPolicy('FS-01', { perHint: 1, cap: 1, budget: 0 })
    expect(await loadHintPolicy()).toEqual({ perHint: 3, cap: 9, budget: 0 })
    expect(await resolveHintPolicy('FS-01')).toEqual({ perHint: 1, cap: 1, budget: 0 })
  })

  it('clamps a stored catalogue edited outside the app instead of failing to open', async () => {
    const db = holder.current
    if (!db) {
      throw new Error('Test database is missing')
    }

    await db.settings.set('hintPolicies', {
      default: { perHint: 999, cap: 3 },
      families: { 'PWD-01': { perHint: 2.7, cap: 9_999 }, 'NET-01': 7 },
    })

    expect(await loadHintPolicy()).toEqual({ perHint: HINT_COST_LIMIT, cap: HINT_COST_LIMIT, budget: 0 })
    expect(await resolveHintPolicy('PWD-01')).toEqual({ perHint: 2, cap: HINT_CAP_LIMIT, budget: 0 })
    expect(await resolveHintPolicy('NET-01')).toEqual({ perHint: 5, cap: 15, budget: 0 })
  })

  it('starts with hints available', async () => {
    expect(await loadExamMode()).toBe(false)
  })

  it('remembers that new attempts should be exams, and forgets on request', async () => {
    expect(await saveExamMode(true)).toBe(true)
    expect(await loadExamMode()).toBe(true)

    await holder.current?.close()
    holder.current = await openPersistence({ snapshotStore: store, wasmBinary: loadWasmBinary() })

    expect(await loadExamMode()).toBe(true)
    expect(await saveExamMode(false)).toBe(false)
    expect(await loadExamMode()).toBe(false)
  })

  it('keeps the exam price and the learner price apart', async () => {
    await saveHintPolicy({ perHint: 0, cap: 0, budget: 4 })
    await saveExamMode(true)

    // The exam pins the standard rate; the learner's own price is left alone.
    expect(examHintPolicy()).toEqual({ perHint: 5, cap: 15, budget: 0 })
    expect(await loadHintPolicy()).toEqual({ perHint: 0, cap: 0, budget: 4 })
  })

  it('reads a mode edited outside the app as off rather than failing to open', async () => {
    const db = holder.current
    if (!db) {
      throw new Error('Test database is missing')
    }

    await db.settings.set('examMode', 'yes')
    expect(await loadExamMode()).toBe(false)

    await db.settings.set('examMode', { on: 'true' })
    expect(await loadExamMode()).toBe(false)

    await db.settings.set('examMode', { on: true })
    expect(await loadExamMode()).toBe(true)
  })

  it('opens the workspace in the tab layout until the learner picks a split', async () => {
    expect(await loadSplitView()).toBe(false)
    expect(await saveSplitView(true)).toBe(true)
    expect(await loadSplitView()).toBe(true)
    expect(await saveSplitView(false)).toBe(false)
    expect(await loadSplitView()).toBe(false)
  })

  it('keeps the split across a reopen, and across every ticket', async () => {
    await saveSplitView(true)

    await holder.current?.close()
    holder.current = await openPersistence({ snapshotStore: store, wasmBinary: loadWasmBinary() })

    // Nothing on an attempt carries this: it is the learner's taste in layout.
    expect(await loadSplitView()).toBe(true)
  })

  it('reads a layout edited outside the app as the tab layout rather than failing', async () => {
    const db = holder.current
    if (!db) {
      throw new Error('Test database is missing')
    }

    await db.settings.set('splitView', 'on')
    expect(await loadSplitView()).toBe(false)

    await db.settings.set('splitView', { on: 'true' })
    expect(await loadSplitView()).toBe(false)

    await db.settings.set('splitView', { on: true })
    expect(await loadSplitView()).toBe(true)
  })

  it('spells the budget out beside the price', () => {
    expect(describeHintPolicy({ perHint: 5, cap: 15, budget: 3 })).toBe(
      'Each hint costs 5 points of diagnostic reasoning, up to 15 points on a ticket; after that they are free. Each attempt may take up to 3 hints.',
    )
    expect(describeHintPolicy({ perHint: 0, cap: 0, budget: 1 })).toBe(
      'Hints are free on this device: every rung you reveal costs 0 points. Each attempt may take up to 1 hint.',
    )
  })
})
