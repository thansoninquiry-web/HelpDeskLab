import type { ScenarioId } from '../tickets/types'

export type JobStatus = 'researching' | 'applied' | 'interviewing' | 'offer' | 'closed'

export const JOB_STATUSES: readonly JobStatus[] = [
  'researching',
  'applied',
  'interviewing',
  'offer',
  'closed',
]

export interface JobTarget {
  id: string
  company: string
  title: string
  url: string
  /** ISO date (YYYY-MM-DD) or null when the user has not applied yet. */
  appliedOn: string | null
  status: JobStatus
  /** Kept locally only; never part of a share-safe export. */
  rawDescription: string
  createdAt: number
  updatedAt: number
}

export interface NewJobTarget {
  company: string
  title: string
  url: string
  appliedOn: string | null
  status: JobStatus
  rawDescription: string
}

export type SkillId =
  | 'password-accounts'
  | 'active-directory'
  | 'networking'
  | 'dns'
  | 'dhcp'
  | 'vpn'
  | 'printing'
  | 'm365-email'
  | 'hardware'
  | 'remote-support'
  | 'ticketing'
  | 'customer-service'

export interface SkillDefinition {
  id: SkillId
  label: string
  /** Scenario families that exercise this skill. Empty means not covered yet. */
  families: readonly ScenarioId[]
  /** Simulated tools that practice the skill. */
  tools: readonly string[]
  /** Lowercase phrases matched against the listing text. */
  keywords: readonly string[]
}

/** One skill found in one listing. */
export interface SkillMatch {
  skill: SkillId
  label: string
  /** Number of distinct phrases from the skill that appear in the text. */
  mentions: number
  matched: readonly string[]
  families: readonly ScenarioId[]
  tools: readonly string[]
}

/** A family weighted by how often matched skills point at it. */
export interface FamilySignal {
  scenarioId: ScenarioId
  mentions: number
  skills: readonly SkillId[]
}

export interface ListingExtract {
  skills: SkillMatch[]
  families: FamilySignal[]
  tools: string[]
  wordCount: number
}

export interface SkillCoverage {
  skill: SkillId
  label: string
  /** How many listings asked for this skill. */
  listings: number
  /** Total phrase hits across every listing. */
  mentions: number
  families: readonly ScenarioId[]
  tools: readonly string[]
  covered: boolean
}

export interface FamilyDemand {
  scenarioId: ScenarioId
  /** Total skill-weight mentions across all listings. */
  mentions: number
  /** Listings that mention at least one skill mapping to this family. */
  listings: number
  skills: readonly SkillId[]
}

export interface TargetRecommendation {
  scenarioId: ScenarioId
  title: string
  demand: number
  averageScore: number | null
  /** Higher means a stronger match between demand and current weakness. */
  weight: number
  reason: string
}

export interface InterviewQuestion {
  id: string
  skill: SkillId
  question: string
  /** What the interviewer is actually probing for. */
  tests: string
}
