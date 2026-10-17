import { describe, expect, it } from 'vitest'
import { recommendFamilies } from '../../../src/domain/targets/recommend'
import type { FamilyDemand } from '../../../src/domain/targets/types'

function demand(scenarioId: string, mentions: number, listings = 1): FamilyDemand {
  return { scenarioId: scenarioId as FamilyDemand['scenarioId'], mentions, listings, skills: [] }
}

describe('recommendFamilies', () => {
  it('weights demand against how weakly the learner scores', () => {
    const recommendations = recommendFamilies(
      [demand('NET-01', 5, 2), demand('M365-01', 2, 1)],
      [{ scenarioId: 'NET-01', averageScore: 90 }],
    )

    // NET-01: 5 mentions * (50 + 10 weakness) = 300
    // M365-01: 2 mentions * (50 + 50 unplayed) = 200
    expect(recommendations.map((entry) => entry.scenarioId)).toEqual(['NET-01', 'M365-01'])
    expect(recommendations[0]?.weight).toBe(300)
    expect(recommendations[0]?.reason).toContain('your average is 90')
    expect(recommendations[1]?.reason).toContain('not played yet')
  })

  it('lets a weaker family outrank slightly more requested work', () => {
    const recommendations = recommendFamilies(
      [demand('FS-01', 3, 2), demand('PWD-01', 2, 1)],
      [
        { scenarioId: 'FS-01', averageScore: 96 },
        { scenarioId: 'PWD-01', averageScore: 40 },
      ],
    )

    expect(recommendations.map((entry) => entry.scenarioId)).toEqual(['PWD-01', 'FS-01'])
  })

  it('caps the list and keeps the highest weights', () => {
    const recommendations = recommendFamilies(
      [demand('PRN-01', 1), demand('DHCP-01', 4), demand('NET-01', 2)],
      [],
      2,
    )

    expect(recommendations).toHaveLength(2)
    expect(recommendations[0]?.scenarioId).toBe('DHCP-01')
    expect(recommendations[1]?.scenarioId).toBe('NET-01')
  })

  it('uses the family title and a readable listing reason', () => {
    const [recommendation] = recommendFamilies([demand('PRN-01', 3, 1)], [])

    expect(recommendation?.title).not.toBe('PRN-01')
    expect(recommendation?.reason).toContain('1 target listing mentions this')
  })

  it('returns nothing when there is no demand', () => {
    expect(recommendFamilies([], [{ scenarioId: 'NET-01', averageScore: 50 }])).toEqual([])
  })
})
