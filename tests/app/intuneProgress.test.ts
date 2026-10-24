// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openPersistence, type Persistence } from '../../src/persistence/database'
import { MemorySnapshotStore } from '../../src/persistence/snapshotStore'
import { IntuneService } from '../../src/modules/intune/service'
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

import { loadIntuneProgress } from '../../src/app/intuneProgress'
import { loadCurriculum } from '../../src/app/curriculumService'
import { loadProgress, loadProgressSummary } from '../../src/app/practiceService'

const NOW = Date.UTC(2026, 9, 24, 12, 0, 0)

let persistence: Persistence
let service: IntuneService

beforeEach(async () => {
  holder.current = await openPersistence({
    snapshotStore: new MemorySnapshotStore(),
    wasmBinary: loadWasmBinary(),
  })
  persistence = holder.current
  service = new IntuneService(persistence.intune, () => NOW)
  await persistence.intune.ensureSeeded(NOW)
})

/** Works the first ticket the way the reference does, and scores it. */
async function resolveBitlockerTicket(): Promise<void> {
  await service.review('dev-lt-2207')
  await service.act({ deviceId: 'dev-lt-2207', action: 'sync' })
  await service.score('tpl-bitlocker-off', NOW - 60_000)
}

describe('Intune work on Progress', () => {
  it('publishes a finished attempt as scored history with the app XP formula', async () => {
    await resolveBitlockerTicket()

    const feed = await loadIntuneProgress()
    expect(feed.history).toHaveLength(1)
    const entry = feed.history[0]
    expect(entry?.scenarioId).toBe('tpl-bitlocker-off')
    // Difficulty 1, passed, strong: the same terms as any ticket attempt.
    expect(entry?.xp).toBe(100)
    expect(entry?.passed).toBe(true)
  })

  it('publishes the rubric split, so a console attempt can be broken down', async () => {
    await resolveBitlockerTicket()

    const feed = await loadIntuneProgress()
    const categories = feed.history[0]?.categoryScores
    expect(categories?.diagnosis).toEqual({ earned: 10, possible: 10 })
    expect(categories?.resolution).toEqual({ earned: 75, possible: 75 })
    expect(categories?.safety).toEqual({ earned: 15, possible: 15 })
    // Nothing in the console scores notes.
    expect(categories?.documentation.possible).toBe(0)
  })

  it('puts a console attempt that fell short in the weak topics, linked to the console', async () => {
    await service.act({ deviceId: 'dev-lt-2207', action: 'wipe' })
    await service.score('tpl-bitlocker-off', NOW - 60_000)

    const progress = await loadProgress()
    const topic = progress.weakTopics.find((entry) => entry.scenarioId === 'tpl-bitlocker-off')
    expect(topic).toBeDefined()
    expect(topic?.scenarioTitle).toBe('Laptop reported as non-compliant')
    // The wipe left diagnosis, resolution and safety all at zero, so there is a
    // category to name even though no review step was taken.
    expect(topic?.weakestCategory).not.toBeNull()
    // Not a family the practice queue knows: the row has to open the console.
    expect(topic?.href).toBe('/intune/tickets')
    expect(topic?.simulator).toBe('intune')
    expect(topic?.actionLabel).toBe('Open the console')
    expect(topic?.recommendation).toContain('console ticket')
  })

  it('folds attempts into scenario stats with the family Leitner rule', async () => {
    await resolveBitlockerTicket()

    const feed = await loadIntuneProgress()
    const stats = feed.stats.find((entry) => entry.scenarioId === 'tpl-bitlocker-off')
    expect(stats?.attempts).toBe(1)
    expect(stats?.passes).toBe(1)
    expect(stats?.bestScore).toBe(100)
    expect(stats?.leitnerBox).toBe(2)
    expect(stats?.dueAt).toBe(NOW + 2 * 24 * 60 * 60 * 1000)
  })

  it('adds the attempt XP to the header summary', async () => {
    const before = await loadProgressSummary()
    await resolveBitlockerTicket()
    const after = await loadProgressSummary()

    expect(after.totalXp - before.totalXp).toBe(100)
    expect(after.rank.xp).toBe(after.totalXp)
  })

  it('shows the console scenario as a Progress row that links to the console', async () => {
    await resolveBitlockerTicket()

    const progress = await loadProgress()
    const row = progress.rows.find((entry) => entry.scenarioId === 'tpl-bitlocker-off')
    expect(row?.scenarioTitle).toBe('Laptop reported as non-compliant')
    expect(row?.href).toBe('/intune/tickets')
    expect(row?.simulator).toBe('intune')
    expect(progress.attempts).toBeGreaterThanOrEqual(1)
  })

  it('meets the two device-console requirements on Asset Management', async () => {
    const before = await loadCurriculum()
    const assetsBefore = before.modules.find((module) => module.id === 'asset-management')
    expect(assetsBefore?.requirements.map((entry) => entry.current).slice(-2)).toEqual([0, 0])

    await resolveBitlockerTicket()

    const after = await loadCurriculum()
    const assets = after.modules.find((module) => module.id === 'asset-management')
    expect(assets?.requirements.map((entry) => entry.current).slice(-2)).toEqual([1, 1])
    // At least the two console requirements. The attempt is also a scored
    // attempt, so a generic counter elsewhere can add one more.
    expect(after.met).toBeGreaterThanOrEqual((before.met ?? 0) + 2)
  })
})
