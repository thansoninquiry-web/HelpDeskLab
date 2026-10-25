import type { ScoreHistoryEntry } from './types'

export interface RankTier {
  title: string
  /** Lifetime XP needed to reach this tier. */
  at: number
}

/**
 * A progression ladder drawn from service-desk job titles rather than the
 * reference product's paid rank names. XP is earned once per scored attempt.
 */
const FIRST_TIER: RankTier = { title: 'Trainee', at: 0 }

export const RANK_TIERS: readonly RankTier[] = [
  FIRST_TIER,
  { title: 'Service desk analyst', at: 300 },
  { title: 'Tier 1 technician', at: 800 },
  { title: 'Escalation ready', at: 1500 },
  { title: 'Floor lead', at: 2600 },
  { title: 'Incident owner', at: 4200 },
]

export interface RankProgress {
  title: string
  xp: number
  nextTitle: string | null
  nextAt: number | null
  /** Progress toward the next tier, 0–100. 100 when the ladder is complete. */
  percent: number
}

export function rankForXp(xp: number): RankProgress {
  const total = Math.max(0, Math.round(xp))
  let index = 0
  for (let candidate = 0; candidate < RANK_TIERS.length; candidate += 1) {
    const tier = RANK_TIERS[candidate]
    if (tier && total >= tier.at) {
      index = candidate
    }
  }

  const current = RANK_TIERS[index] ?? FIRST_TIER
  const next = RANK_TIERS[index + 1]

  return {
    title: current.title,
    xp: total,
    nextTitle: next?.title ?? null,
    nextAt: next?.at ?? null,
    percent: next ? Math.min(100, Math.round(((total - current.at) / (next.at - current.at)) * 100)) : 100,
  }
}

function localDayKey(ms: number): string {
  const date = new Date(ms)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

/**
 * Counts consecutive local days with a scored attempt. A streak survives until
 * the end of the day after the last attempt, so it is not lost at midnight
 * before the learner has had a chance to practice.
 */
export function streakFromTimestamps(timestamps: readonly number[], now: number): number {
  if (timestamps.length === 0) {
    return 0
  }

  const days = new Set(timestamps.map(localDayKey))
  const cursor = new Date(now)
  if (!days.has(localDayKey(cursor.getTime()))) {
    cursor.setDate(cursor.getDate() - 1)
    if (!days.has(localDayKey(cursor.getTime()))) {
      return 0
    }
  }

  let streak = 0
  while (days.has(localDayKey(cursor.getTime()))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

export interface ProgressSummary {
  totalXp: number
  rank: RankProgress
  streakDays: number
}

export function summarizeHistory(
  history: readonly ScoreHistoryEntry[],
  now: number,
): ProgressSummary {
  const totalXp = history.reduce((total, entry) => total + entry.xp, 0)
  return {
    totalXp,
    rank: rankForXp(totalXp),
    streakDays: streakFromTimestamps(
      history.map((entry) => entry.computedAt),
      now,
    ),
  }
}
