import { findFamily } from '../generator'
import type { FamilyDemand, TargetRecommendation } from './types'

export interface FamilyAverage {
  scenarioId: string
  averageScore: number | null
}

const UNPLAYED_WEAKNESS = 50

/**
 * Demand comes from the listings; weakness comes from the score history. An
 * unplayed family sits in the middle, so a heavily requested family the learner
 * has never tried still beats a rarely requested family they already score well.
 */
export function recommendFamilies(
  demand: readonly FamilyDemand[],
  averages: readonly FamilyAverage[],
  limit = 3,
): TargetRecommendation[] {
  const averageById = new Map(averages.map((entry) => [entry.scenarioId, entry.averageScore]))

  return demand
    .map((entry) => {
      const average = averageById.get(entry.scenarioId) ?? null
      const weakness = average === null ? UNPLAYED_WEAKNESS : Math.max(0, 100 - average)
      const weight = entry.mentions * (50 + weakness)
      const played = average === null ? 'not played yet' : `your average is ${average}`

      return {
        scenarioId: entry.scenarioId,
        title: findFamily(entry.scenarioId)?.title ?? entry.scenarioId,
        demand: entry.mentions,
        averageScore: average,
        weight,
        reason: `${entry.listings} target listing${entry.listings === 1 ? '' : 's'} ${entry.listings === 1 ? 'mentions' : 'mention'} this · ${played}`,
      }
    })
    .sort(
      (left, right) =>
        right.weight - left.weight ||
        right.demand - left.demand ||
        left.scenarioId.localeCompare(right.scenarioId),
    )
    .slice(0, Math.max(0, limit))
}
