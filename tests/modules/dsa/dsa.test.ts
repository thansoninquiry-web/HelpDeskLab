// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { DSA_PROBLEMS, findDsaProblem } from '../../../src/modules/dsa/data/problems'
import { DSA_PATTERN_GROUPS, findPatternEntry } from '../../../src/modules/dsa/data/patterns'
import { buildOverview, filterProblems, listTopics } from '../../../src/modules/dsa/logic/progress'
import { DsaService } from '../../../src/modules/dsa/service'
import type { DsaDraftRecord } from '../../../src/modules/dsa/persistence/store'
import { DsaStore } from '../../../src/modules/dsa/persistence/store'
import type { DsaAttempt } from '../../../src/modules/dsa/types'
import { openPersistence } from '../../../src/persistence/database'
import { SCHEMA_VERSION } from '../../../src/persistence/schema'
import { MemorySnapshotStore } from '../../../src/persistence/snapshotStore'
import { loadWasmBinary } from '../../helpers/sqlite'

const NOW = Date.UTC(2026, 9, 24, 12, 0, 0)

/**
 * The reference answers are the answer key, so they have to run.
 *
 * Every approach is evaluated in this Node process — the app itself never
 * evaluates anything — and every check in the bank is applied to it. A typo in a
 * printed solution then fails the suite rather than teaching a wrong answer.
 */
function loadApproach(code: string): (...args: unknown[]) => unknown {
  const name = /function\s+([A-Za-z0-9_]+)\s*\(/.exec(code)?.[1]
  if (!name) {
    throw new Error('An approach does not declare a named function')
  }
  const factory = new Function(`${code}\nreturn ${name};`) as () => (...args: unknown[]) => unknown
  return factory()
}

/** Arguments are JSON, so a structured copy is enough to stop one check bleeding into the next. */
function cloneArgs(args: readonly unknown[]): unknown[] {
  return JSON.parse(JSON.stringify(args)) as unknown[]
}

describe('the problem bank', () => {
  it('holds seventeen problems with unique ids and a difficulty mix', () => {
    expect(DSA_PROBLEMS).toHaveLength(17)
    expect(new Set(DSA_PROBLEMS.map((problem) => problem.id)).size).toBe(DSA_PROBLEMS.length)
    const difficulties = new Set(DSA_PROBLEMS.map((problem) => problem.difficulty))
    expect(difficulties).toEqual(new Set(['easy', 'medium', 'hard']))
  })

  it('gives every problem exactly one right approach and one right edge case', () => {
    for (const problem of DSA_PROBLEMS) {
      expect(problem.patterns, `${problem.id} patterns`).toHaveLength(4)
      expect(problem.patterns.filter((choice) => choice.correct)).toHaveLength(1)
      expect(problem.edges, `${problem.id} edges`).toHaveLength(3)
      expect(problem.edges.filter((choice) => choice.correct)).toHaveLength(1)
      for (const choice of [...problem.patterns, ...problem.edges]) {
        expect(choice.note.length, `${problem.id} → ${choice.id} note`).toBeGreaterThan(20)
      }
    }
  })

  it('has enough written material to teach from', () => {
    for (const problem of DSA_PROBLEMS) {
      expect(problem.statement.length, `${problem.id} statement`).toBeGreaterThan(0)
      expect(problem.examples.length, `${problem.id} examples`).toBeGreaterThanOrEqual(3)
      expect(problem.constraints.length, `${problem.id} constraints`).toBeGreaterThanOrEqual(3)
      expect(problem.cues.length, `${problem.id} cues`).toBeGreaterThanOrEqual(3)
      expect(problem.hints.length, `${problem.id} hints`).toBeGreaterThanOrEqual(2)
      expect(problem.approaches.length, `${problem.id} approaches`).toBeGreaterThanOrEqual(2)
      expect(problem.topics.length, `${problem.id} topics`).toBeGreaterThan(0)
      expect(problem.starter, `${problem.id} starter`).toContain('function')
    }
  })

  it('runs every reference approach against every check in its problem', () => {
    for (const problem of DSA_PROBLEMS) {
      expect(problem.checks.length, `${problem.id} checks`).toBeGreaterThanOrEqual(3)
      for (const approach of problem.approaches) {
        const run = loadApproach(approach.code)
        for (const check of problem.checks) {
          const result = run(...cloneArgs(check.args))
          expect(
            result,
            `${problem.id} · ${approach.name} · ${JSON.stringify(check.args)}`,
          ).toEqual(check.expected)
        }
      }
    }
  })

  it('keeps the edge-case answer distinct from the approach answer', () => {
    for (const problem of DSA_PROBLEMS) {
      const patternIds = new Set(problem.patterns.map((choice) => choice.id))
      for (const choice of problem.edges) {
        expect(patternIds.has(choice.id), `${problem.id} → ${choice.id}`).toBe(false)
      }
    }
  })
})

describe('the pattern sheet', () => {
  it('groups the cues without repeating one, and names a cost for every tool', () => {
    const ids = new Set<string>()
    for (const group of DSA_PATTERN_GROUPS) {
      expect(group.title.length, group.id).toBeGreaterThan(0)
      expect(group.entries.length, group.id).toBeGreaterThan(0)
      for (const entry of group.entries) {
        expect(ids.has(entry.id), `${entry.id} appears twice`).toBe(false)
        ids.add(entry.id)
        expect(entry.cue.length, entry.id).toBeGreaterThan(0)
        expect(entry.why.length, entry.id).toBeGreaterThan(0)
        expect(entry.tools.length, entry.id).toBeGreaterThan(0)
        for (const tool of entry.tools) {
          expect(tool.name.length, `${entry.id} tool`).toBeGreaterThan(0)
          expect(tool.time.length, `${entry.id} → ${tool.name} time`).toBeGreaterThan(0)
          expect(tool.note.length, `${entry.id} → ${tool.name} note`).toBeGreaterThan(20)
        }
      }
    }
    expect(findPatternEntry('sorted-input')?.cue).toBe('The input is sorted')
    expect(findPatternEntry('no-such-cue')).toBeUndefined()
  })

  it('links only to problems that exist, and leaves no problem untaught', () => {
    const linked = new Set<string>()
    for (const group of DSA_PATTERN_GROUPS) {
      for (const entry of group.entries) {
        for (const tool of entry.tools) {
          if (!tool.problemId) continue
          expect(
            findDsaProblem(tool.problemId),
            `${entry.id} → ${tool.name} links to ${tool.problemId}`,
          ).toBeDefined()
          linked.add(tool.problemId)
        }
      }
    }
    const untaught = DSA_PROBLEMS.filter((problem) => !linked.has(problem.id))
    expect(untaught.map((problem) => problem.id)).toEqual([])
  })
})

describe('the library filters', () => {
  const overview = buildOverview(DSA_PROBLEMS, [])

  it('lists every topic once, alphabetically', () => {
    const topics = listTopics(DSA_PROBLEMS)
    expect(new Set(topics).size).toBe(topics.length)
    expect([...topics].sort((left, right) => left.localeCompare(right))).toEqual(topics)
  })

  it('narrows by difficulty, topic and a search term', () => {
    expect(filterProblems(overview, { difficulty: 'hard' })).toHaveLength(2)
    expect(filterProblems(overview, { topic: 'dynamic programming' })).toHaveLength(2)
    const found = filterProblems(overview, { query: 'voucher' })
    expect(found.map((problem) => problem.id)).toContain('fewest-coins')
    expect(filterProblems(overview, { query: 'no such thing' })).toHaveLength(0)
  })

  it('hides solved problems when asked, and keeps untried ones', () => {
    const solved: DsaAttempt = {
      id: 'a',
      problemId: 'pair-sum-sorted',
      patternChoice: 'two-pointers',
      edgeChoice: 'duplicates',
      solved: true,
      hintsUsed: 0,
      code: null,
      createdAt: NOW,
    }
    const withOne = buildOverview(DSA_PROBLEMS, [solved])
    const unsolved = filterProblems(withOne, { unsolvedOnly: true })
    expect(unsolved).toHaveLength(DSA_PROBLEMS.length - 1)
    expect(unsolved.some((problem) => problem.id === 'pair-sum-sorted')).toBe(false)
  })
})

describe('DsaService', () => {
  let persistence: Awaited<ReturnType<typeof openPersistence>>
  let service: DsaService

  beforeEach(async () => {
    persistence = await openPersistence({
      snapshotStore: new MemorySnapshotStore(),
      wasmBinary: loadWasmBinary(),
    })
    service = new DsaService(persistence.dsa, () => NOW)
  })

  it('declares itself wrong until both answers match, then records the solve', async () => {
    const problem = findDsaProblem('pair-sum-sorted')
    expect(problem).toBeDefined()

    const missed = await service.submit({
      problemId: 'pair-sum-sorted',
      patternChoice: 'two-pointers',
      edgeChoice: 'negative',
      hintsUsed: 0,
      code: null,
    })
    expect(missed.solved).toBe(false)
    expect(missed.patternCorrect).toBe(true)
    expect(missed.edgeCorrect).toBe(false)

    const solved = await service.submit({
      problemId: 'pair-sum-sorted',
      patternChoice: 'two-pointers',
      edgeChoice: 'duplicates',
      hintsUsed: 1,
      code: 'function pairIndices() { return [] }',
    })
    expect(solved.solved).toBe(true)

    const overview = await service.overview()
    expect(overview.solved).toBe(1)
    expect(overview.attempted).toBe(1)
    expect(overview.progress['pair-sum-sorted']).toEqual({
      attempts: 2,
      solved: true,
      lastAttemptAt: NOW,
    })
  })

  it('persists the draft and returns it with the attempts', async () => {
    await service.saveDraft('rotated-log', 'function findRotatedIndex() {}')
    await service.submit({
      problemId: 'rotated-log',
      patternChoice: 'modified-binary-search',
      edgeChoice: 'no-rotation',
      hintsUsed: 0,
      code: null,
    })

    const view = await service.problem('rotated-log')
    expect(view?.draft).toBe('function findRotatedIndex() {}')
    expect(view?.attempts).toHaveLength(1)
    expect(view?.attempts[0]?.solved).toBe(true)
    // Newest first, which is what the page opens the radios on.
    expect(view?.attempts[0]?.patternChoice).toBe('modified-binary-search')
  })

  it('answers a problem that is not in the bank with null', async () => {
    expect(await service.problem('not-a-problem')).toBeNull()
    await expect(
      service.submit({
        problemId: 'not-a-problem',
        patternChoice: 'x',
        edgeChoice: 'y',
        hintsUsed: 0,
        code: null,
      }),
    ).rejects.toThrow('Unknown DSA problem')
  })

  it('refuses a choice that the problem does not offer', async () => {
    await expect(
      service.submit({
        problemId: 'pair-sum-sorted',
        patternChoice: 'greedy-from-the-middle',
        edgeChoice: 'duplicates',
        hintsUsed: 0,
        code: null,
      }),
    ).rejects.toThrow('Unknown approach choice')
  })

  it('clamps hints to the number the problem has', async () => {
    const outcome = await service.submit({
      problemId: 'balanced-route',
      patternChoice: 'stack',
      edgeChoice: 'empty-stack-closer',
      hintsUsed: 99,
      code: null,
    })
    const problem = findDsaProblem('balanced-route')
    expect(outcome.attempt.hintsUsed).toBe(problem?.hints.length)
  })

  it('clears attempts and drafts on reset', async () => {
    await service.saveDraft('grid-exit', 'draft')
    await service.submit({
      problemId: 'grid-exit',
      patternChoice: 'bfs',
      edgeChoice: 'start-is-exit',
      hintsUsed: 0,
      code: null,
    })
    await service.reset()

    const overview = await service.overview()
    expect(overview.solved).toBe(0)
    expect(overview.attempted).toBe(0)
    expect((await service.problem('grid-exit'))?.draft).toBeNull()
  })
})

describe('DsaStore against the in-memory database', () => {
  it('round-trips a draft and an attempt through SQLite', async () => {
    const persistence = await openPersistence({
      snapshotStore: new MemorySnapshotStore(),
      wasmBinary: loadWasmBinary(),
    })
    const store = persistence.dsa
    const draft: DsaDraftRecord = { problemId: 'cluster-count', code: 'draft?', updatedAt: NOW }
    await store.saveDraft(draft)
    expect(await store.draft('cluster-count')).toBe('draft?')

    const attempt: DsaAttempt = {
      id: 'cluster-count:1',
      problemId: 'cluster-count',
      patternChoice: 'flood-fill',
      edgeChoice: 'diagonal',
      solved: true,
      hintsUsed: 2,
      code: null,
      createdAt: NOW,
    }
    await store.appendAttempt(attempt)
    expect(await store.attempts()).toEqual([attempt])
    expect(await store.attemptsFor('cluster-count')).toEqual([attempt])
    expect(await store.attemptsFor('fewest-coins')).toEqual([])

    await store.reset()
    expect(await store.attempts()).toEqual([])
    expect(await store.draft('cluster-count')).toBeNull()
  })

  it('is exported as part of the persistence handle', async () => {
    const persistence = await openPersistence({
      snapshotStore: new MemorySnapshotStore(),
      wasmBinary: loadWasmBinary(),
    })
    expect(persistence.dsa).toBeInstanceOf(DsaStore)
    expect(persistence.schemaVersion()).toBe(SCHEMA_VERSION)
  })
})
