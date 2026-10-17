import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { JobTarget } from '../../src/domain/targets/types'
import {
  createJobTarget,
  createShareSafeExport,
  deleteJobTarget,
  loadTargetRecommendations,
  loadTargetsOverview,
  updateJobTargetStatus,
} from '../../src/app/targetsService'

vi.mock('../../src/app/persistenceService', () => ({
  getLocalDatabase: vi.fn(),
}))

function createFakeDatabase(seed: JobTarget[] = []) {
  const rows = [...seed]
  return {
    rows,
    targets: {
      list: vi.fn(async () => [...rows].sort((left, right) => right.createdAt - left.createdAt)),
      create: vi.fn(async (target: JobTarget) => {
        rows.push(target)
      }),
      findById: vi.fn(async (id: string) => rows.find((row) => row.id === id) ?? null),
      updateStatus: vi.fn(async (id: string, status: JobTarget['status'], updatedAt: number) => {
        const row = rows.find((entry) => entry.id === id)
        if (row) {
          row.status = status
          row.updatedAt = updatedAt
        }
      }),
      remove: vi.fn(async (id: string) => {
        const index = rows.findIndex((entry) => entry.id === id)
        if (index >= 0) {
          rows.splice(index, 1)
        }
      }),
    },
    scores: {
      listHistory: vi.fn(async () => [] as Array<{ scenarioId: string; total: number }>),
    },
  }
}

type FakeDatabase = ReturnType<typeof createFakeDatabase>

async function useDatabase(seed: JobTarget[] = []): Promise<FakeDatabase> {
  const persistence = await import('../../src/app/persistenceService')
  const fake = createFakeDatabase(seed)
  vi.mocked(persistence.getLocalDatabase).mockResolvedValue(
    fake as unknown as Awaited<ReturnType<typeof persistence.getLocalDatabase>>,
  )
  return fake
}

const input = {
  company: '  Northwind   Support ',
  title: ' Tier 1 Service Desk Analyst ',
  url: 'https://example.com/jobs/1',
  appliedOn: '2026-10-01',
  status: 'applied',
  rawDescription:
    'Reset passwords, troubleshoot DNS and DHCP, and document every step in the ticketing system.',
}

function seededTarget(): JobTarget {
  return {
    id: 'target-1',
    company: 'Northwind Support',
    title: 'Tier 1 Service Desk Analyst',
    url: '',
    appliedOn: null,
    status: 'applied',
    rawDescription:
      'Reset passwords, troubleshoot DNS and DHCP, and document every step in the ticketing system.',
    createdAt: 1_760_000_000_000,
    updatedAt: 1_760_000_000_000,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createJobTarget', () => {
  it('stores trimmed fields and returns extracted skills and interview questions', async () => {
    const fake = await useDatabase()

    const view = await createJobTarget(input)

    expect(fake.targets.create).toHaveBeenCalledTimes(1)
    expect(fake.rows[0]).toMatchObject({
      company: 'Northwind Support',
      title: 'Tier 1 Service Desk Analyst',
      appliedOn: '2026-10-01',
      status: 'applied',
      rawDescription: input.rawDescription,
    })
    expect(view.skills.map((skill) => skill.id)).toEqual(
      expect.arrayContaining(['password-accounts', 'dns', 'dhcp', 'ticketing']),
    )
    expect(view.questions.length).toBeGreaterThan(0)
    expect(view.descriptionPreview).not.toContain('\n')
  })

  it('rejects invalid fields before touching the database', async () => {
    const fake = await useDatabase()

    await expect(createJobTarget({ ...input, company: '   ' })).rejects.toThrow(/company/i)
    await expect(createJobTarget({ ...input, title: '' })).rejects.toThrow(/job title/i)
    await expect(createJobTarget({ ...input, url: 'not-a-url' })).rejects.toThrow(/http/i)
    await expect(createJobTarget({ ...input, appliedOn: '01/10/2026' })).rejects.toThrow(/YYYY-MM-DD/)
    await expect(createJobTarget({ ...input, status: 'ghosted' })).rejects.toThrow(/status/i)
    await expect(createJobTarget({ ...input, rawDescription: 'too short' })).rejects.toThrow(
      /at least a sentence/i,
    )
    await expect(
      createJobTarget({ ...input, rawDescription: 'x'.repeat(50_001) }),
    ).rejects.toThrow(/too long/i)

    expect(fake.targets.create).not.toHaveBeenCalled()
  })

  it('accepts an empty URL and date when the listing is only being researched', async () => {
    const fake = await useDatabase()

    await createJobTarget({ ...input, url: '', appliedOn: '', status: 'researching' })

    expect(fake.rows[0]).toMatchObject({ url: '', appliedOn: null, status: 'researching' })
  })
})

describe('targets overview and recommendations', () => {
  it('builds coverage across saved listings and weights recommendations by scores', async () => {
    const db = await useDatabase([seededTarget()])
    db.scores.listHistory.mockResolvedValue([
      { scenarioId: 'DHCP-01', total: 60 },
      { scenarioId: 'DHCP-01', total: 70 },
    ])

    const overview = await loadTargetsOverview()

    expect(overview.targets).toHaveLength(1)
    const coverage = new Map(overview.coverage.map((skill) => [skill.skill, skill]))
    expect(coverage.get('dhcp')?.listings).toBe(1)
    expect(coverage.get('printing')?.listings).toBe(0)

    const dhcp = overview.recommendations.find((entry) => entry.scenarioId === 'DHCP-01')
    expect(dhcp).toBeDefined()
    expect(dhcp?.averageScore).toBe(65)
    expect(dhcp?.weight).toBeGreaterThan(0)
  })

  it('returns no recommendations when no listings exist', async () => {
    const db = await useDatabase()

    expect(await loadTargetRecommendations()).toEqual([])
    expect(db.scores.listHistory).not.toHaveBeenCalled()
  })

  it('updates status and deletes listings through the repository', async () => {
    const fake = await useDatabase([seededTarget()])

    await updateJobTargetStatus('target-1', 'interviewing')
    expect(fake.rows[0]?.status).toBe('interviewing')

    await deleteJobTarget('target-1')
    expect(fake.rows).toEqual([])

    await expect(updateJobTargetStatus('target-1', 'nope')).rejects.toThrow(/status/i)
  })
})

describe('createShareSafeExport', () => {
  it('strips the pasted description and names the file by date', async () => {
    await useDatabase([seededTarget()])

    const file = await createShareSafeExport(Date.UTC(2026, 9, 17))

    expect(file.filename).toBe('helpdesklab-job-targets-2026-10-17.json')
    expect(file.listings).toBe(1)
    expect(file.contents).not.toContain('Reset passwords')
    expect(file.contents).toContain('"password-accounts"')
  })

  it('exports an empty listing set cleanly', async () => {
    await useDatabase()

    const file = await createShareSafeExport(0)

    expect(file.listings).toBe(0)
    expect(JSON.parse(file.contents)).toMatchObject({ version: 1, listings: [] })
  })
})
