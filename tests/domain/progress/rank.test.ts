import { describe, expect, it } from 'vitest'
import { rankForXp, summarizeHistory, streakFromTimestamps } from '../../../src/domain/progress/rank'
import type { ScoreHistoryEntry } from '../../../src/domain/progress/types'

function localDay(day: number, hour = 9): number {
  return new Date(2026, 9, day, hour).getTime()
}

function entry(computedAt: number, xp: number, overrides: Partial<ScoreHistoryEntry> = {}): ScoreHistoryEntry {
  return {
    scenarioId: 'NET-01',
    variantId: 'bad-static-dns',
    total: 80,
    passed: true,
    computedAt,
    xp,
    categoryScores: null,
    ...overrides,
  }
}

describe('rankForXp', () => {
  it('starts at Trainee and moves up at each threshold', () => {
    expect(rankForXp(0).title).toBe('Trainee')
    expect(rankForXp(299).title).toBe('Trainee')
    expect(rankForXp(300).title).toBe('Service desk analyst')
    expect(rankForXp(800).title).toBe('Tier 1 technician')
  })

  it('reports progress toward the next tier and caps at the top', () => {
    const mid = rankForXp(550)
    expect(mid.nextTitle).toBe('Tier 1 technician')
    expect(mid.nextAt).toBe(800)
    expect(mid.percent).toBe(50)

    const top = rankForXp(10_000)
    expect(top.title).toBe('Incident owner')
    expect(top.nextTitle).toBeNull()
    expect(top.nextAt).toBeNull()
    expect(top.percent).toBe(100)
  })
})

describe('streakFromTimestamps', () => {
  it('counts consecutive local days ending today', () => {
    expect(streakFromTimestamps([localDay(15), localDay(16), localDay(17)], localDay(17, 18))).toBe(3)
  })

  it('keeps yesterday’s streak alive until the end of today', () => {
    expect(streakFromTimestamps([localDay(15), localDay(16)], localDay(17, 23))).toBe(2)
  })

  it('breaks after a missed day and ignores empty history', () => {
    expect(streakFromTimestamps([localDay(14), localDay(15)], localDay(17, 9))).toBe(0)
    expect(streakFromTimestamps([], localDay(17, 9))).toBe(0)
  })
})

describe('summarizeHistory', () => {
  it('adds XP once per attempt and derives rank and streak', () => {
    const summary = summarizeHistory(
      [entry(localDay(16), 100), entry(localDay(17), 250)],
      localDay(17, 20),
    )

    expect(summary.totalXp).toBe(350)
    expect(summary.rank.title).toBe('Service desk analyst')
    expect(summary.streakDays).toBe(2)
  })
})
