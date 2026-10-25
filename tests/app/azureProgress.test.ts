// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openPersistence, type Persistence } from '../../src/persistence/database'
import { MemorySnapshotStore } from '../../src/persistence/snapshotStore'
import { AzureService } from '../../src/modules/azure/service'
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

import { loadAzureProgress } from '../../src/app/azureProgress'
import { loadCurriculum } from '../../src/app/curriculumService'
import { loadProgress, loadProgressSummary } from '../../src/app/practiceService'

const NOW = Date.UTC(2026, 9, 24, 12, 0, 0)

let persistence: Persistence
let service: AzureService

beforeEach(async () => {
  holder.current = await openPersistence({
    snapshotStore: new MemorySnapshotStore(),
    wasmBinary: loadWasmBinary(),
  })
  persistence = holder.current
  service = new AzureService(persistence.azure, () => NOW)
  await persistence.azure.ensureSeeded()
})

/** Works the first ticket the way the reference does, and scores it. */
async function startStoppedMachine(): Promise<void> {
  await service.review('res-vm-fin-01')
  await service.act({ resourceId: 'res-vm-fin-01', action: 'start' })
  await service.score('tpl-vm-stopped', NOW - 60_000)
}

describe('Azure work on Progress', () => {
  it('publishes a finished attempt as scored history with the app XP formula', async () => {
    await startStoppedMachine()

    const feed = await loadAzureProgress()
    expect(feed.history).toHaveLength(1)
    const entry = feed.history[0]
    expect(entry?.scenarioId).toBe('tpl-vm-stopped')
    // Difficulty 1, passed, strong: the same terms as any ticket attempt.
    expect(entry?.xp).toBe(100)
    expect(entry?.passed).toBe(true)
  })

  it('publishes the rubric split, so a console attempt can be broken down', async () => {
    await startStoppedMachine()

    const feed = await loadAzureProgress()
    const categories = feed.history[0]?.categoryScores
    expect(categories?.diagnosis).toEqual({ earned: 10, possible: 10 })
    expect(categories?.resolution).toEqual({ earned: 75, possible: 75 })
    expect(categories?.safety).toEqual({ earned: 15, possible: 15 })
    // Nothing in the console scores notes.
    expect(categories?.documentation.possible).toBe(0)
  })

  it('puts an Azure attempt that fell short in the weak topics, linked to its console', async () => {
    await service.act({ resourceId: 'res-st-apps', action: 'delete-vm' })
    await service.score('tpl-storage-public', NOW - 60_000)

    const progress = await loadProgress()
    const topic = progress.weakTopics.find((entry) => entry.scenarioId === 'tpl-storage-public')
    expect(topic).toBeDefined()
    expect(topic?.scenarioTitle).toBe('Blob links work without signing in')
    // No read and no safety mark, so the weakest category is one of the two at
    // zero rather than a category that was partly earned.
    expect(['diagnosis', 'safety']).toContain(topic?.weakestCategory?.category)
    // Not a family the practice queue knows: the row has to open the console.
    expect(topic?.href).toBe('/azure/tickets')
    expect(topic?.simulator).toBe('azure')
    expect(topic?.actionLabel).toBe('Open the console')
  })

  it('folds attempts into scenario stats with the family Leitner rule', async () => {
    await startStoppedMachine()

    const feed = await loadAzureProgress()
    const stats = feed.stats.find((entry) => entry.scenarioId === 'tpl-vm-stopped')
    expect(stats?.attempts).toBe(1)
    expect(stats?.passes).toBe(1)
    expect(stats?.bestScore).toBe(100)
    expect(stats?.leitnerBox).toBe(2)
    expect(stats?.dueAt).toBe(NOW + 2 * 24 * 60 * 60 * 1000)
  })

  it('publishes the read step and the decisions the Azure course reads', async () => {
    await startStoppedMachine()

    const feed = await loadAzureProgress()
    expect(feed.evidence.readBeforeFix).toBe(1)
    expect(feed.evidence.perfectDiagnosis).toBe(1)
    expect(feed.evidence.perfectSafety).toBe(1)
    expect(feed.evidence.passesByTemplate['tpl-vm-stopped']).toBe(1)

    const view = await loadCurriculum()
    const compute = view.modules.find((module) => module.id === 'azure-compute')
    expect(compute?.requirements.map((entry) => entry.current)).toEqual([1, 1, 0, 0, 1])
    expect(compute?.complete).toBe(false)
    // XP follows the templates the module names, as ticket modules follow scope.
    expect(compute?.xp).toBe(100)
  })

  it('reads one closed exposure ticket as one security decision', async () => {
    await service.review('res-st-apps')
    await service.act({ resourceId: 'res-st-apps', action: 'restrict-public-access' })
    await service.score('tpl-storage-public', NOW - 60_000)

    const view = await loadCurriculum()
    const access = view.modules.find((module) => module.id === 'azure-access')
    // Anonymous reads are closed; retention, protocol and the role are open, and
    // one of the three capstone decisions is on file.
    expect(access?.requirements.map((entry) => entry.current)).toEqual([1, 0, 0, 0, 1])
  })

  it('adds the attempt XP to the header summary', async () => {
    const before = await loadProgressSummary()
    await startStoppedMachine()
    const after = await loadProgressSummary()

    expect(after.totalXp - before.totalXp).toBe(100)
    expect(after.rank.xp).toBe(after.totalXp)
  })

  it('shows the console scenario as a Progress row that links to the console', async () => {
    await startStoppedMachine()

    const progress = await loadProgress()
    const row = progress.rows.find((entry) => entry.scenarioId === 'tpl-vm-stopped')
    expect(row?.scenarioTitle).toBe('Finance box is down after the weekend')
    expect(row?.href).toBe('/azure/tickets')
    expect(row?.simulator).toBe('azure')
  })
})
