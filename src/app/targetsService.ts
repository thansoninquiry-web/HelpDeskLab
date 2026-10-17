import { buildCoverage, buildFamilyDemand } from '../domain/targets/coverage'
import { buildShareSafeExport } from '../domain/targets/export'
import { extractListing } from '../domain/targets/extract'
import { interviewQuestions } from '../domain/targets/interview'
import { recommendFamilies, type FamilyAverage } from '../domain/targets/recommend'
import type {
  FamilySignal,
  InterviewQuestion,
  JobStatus,
  JobTarget,
  ListingExtract,
  SkillCoverage,
  SkillId,
  TargetRecommendation,
} from '../domain/targets/types'
import { JOB_STATUSES } from '../domain/targets/types'

export type { JobStatus, TargetRecommendation } from '../domain/targets/types'
export { JOB_STATUSES } from '../domain/targets/types'
import { getLocalDatabase } from './persistenceService'

export interface JobTargetSkillView {
  id: SkillId
  label: string
  mentions: number
  families: readonly string[]
  tools: readonly string[]
}

export interface JobTargetView {
  id: string
  company: string
  title: string
  url: string
  appliedOn: string | null
  status: JobStatus
  createdAt: number
  updatedAt: number
  /** Local preview only. The raw text never leaves this device via export. */
  descriptionPreview: string
  skills: JobTargetSkillView[]
  families: FamilySignal[]
  tools: string[]
  questions: InterviewQuestion[]
}

export interface TargetsOverview {
  targets: JobTargetView[]
  coverage: SkillCoverage[]
  recommendations: TargetRecommendation[]
}

export interface JobTargetInput {
  company: string
  title: string
  url: string
  appliedOn: string
  status: string
  rawDescription: string
}

const MAX_DESCRIPTION_LENGTH = 50_000
const MIN_DESCRIPTION_LENGTH = 30
const MAX_NAME_LENGTH = 120

function clean(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function parseAppliedOn(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return null
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed) || Number.isNaN(Date.parse(trimmed))) {
    throw new Error('Enter the application date as YYYY-MM-DD, or leave it empty.')
  }
  return trimmed
}

function parseStatus(value: string): JobStatus {
  if (!(JOB_STATUSES as readonly string[]).includes(value)) {
    throw new Error('Choose a valid listing status.')
  }
  return value as JobStatus
}

function preview(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > 180 ? `${flat.slice(0, 177)}…` : flat
}

function extractFor(target: JobTarget): ListingExtract {
  return extractListing(target.rawDescription)
}

function toView(target: JobTarget): JobTargetView {
  const extract = extractFor(target)
  const topSkills = extract.skills.slice(0, 3).map((skill) => skill.skill)
  return {
    id: target.id,
    company: target.company,
    title: target.title,
    url: target.url,
    appliedOn: target.appliedOn,
    status: target.status,
    createdAt: target.createdAt,
    updatedAt: target.updatedAt,
    descriptionPreview: preview(target.rawDescription),
    skills: extract.skills.map((skill) => ({
      id: skill.skill,
      label: skill.label,
      mentions: skill.mentions,
      families: skill.families,
      tools: skill.tools,
    })),
    families: extract.families,
    tools: extract.tools,
    questions: interviewQuestions(topSkills),
  }
}

async function database() {
  return getLocalDatabase()
}

async function familyAverages(): Promise<FamilyAverage[]> {
  const db = await database()
  const history = await db.scores.listHistory()
  const totals = new Map<string, { total: number; count: number }>()

  for (const entry of history) {
    const current = totals.get(entry.scenarioId) ?? { total: 0, count: 0 }
    current.total += entry.total
    current.count += 1
    totals.set(entry.scenarioId, current)
  }

  return [...totals.entries()].map(([scenarioId, entry]) => ({
    scenarioId,
    averageScore: Math.round(entry.total / entry.count),
  }))
}

/** Weighted by listing demand and current scores; empty until a listing exists. */
export async function loadTargetRecommendations(): Promise<TargetRecommendation[]> {
  const db = await database()
  const targets = await db.targets.list()
  if (targets.length === 0) {
    return []
  }

  const demand = buildFamilyDemand(targets.map(extractFor))
  return recommendFamilies(demand, await familyAverages())
}

export async function createJobTarget(input: JobTargetInput): Promise<JobTargetView> {
  const company = clean(input.company)
  const title = clean(input.title)
  const url = input.url.trim()
  const rawDescription = input.rawDescription.trim()

  if (company.length === 0 || company.length > MAX_NAME_LENGTH) {
    throw new Error('Enter the company name (up to 120 characters).')
  }
  if (title.length === 0 || title.length > MAX_NAME_LENGTH) {
    throw new Error('Enter the job title (up to 120 characters).')
  }
  if (url.length > 0 && !/^https?:\/\/\S+$/i.test(url)) {
    throw new Error('Enter a full http(s) URL, or leave it empty.')
  }
  if (rawDescription.length < MIN_DESCRIPTION_LENGTH) {
    throw new Error('Paste at least a sentence of the listing so skills can be extracted.')
  }
  if (rawDescription.length > MAX_DESCRIPTION_LENGTH) {
    throw new Error('That listing is too long to store. Paste the requirements section only.')
  }

  const now = Date.now()
  const target: JobTarget = {
    id: crypto.randomUUID(),
    company,
    title,
    url,
    appliedOn: parseAppliedOn(input.appliedOn),
    status: parseStatus(input.status),
    rawDescription,
    createdAt: now,
    updatedAt: now,
  }

  const db = await database()
  await db.targets.create(target)
  return toView(target)
}

export async function listJobTargets(): Promise<JobTarget[]> {
  const db = await database()
  return db.targets.list()
}

export async function loadTargetsOverview(): Promise<TargetsOverview> {
  const db = await database()
  const targets = await db.targets.list()
  const extracts = targets.map(extractFor)

  return {
    targets: targets.map(toView),
    coverage: buildCoverage(extracts),
    recommendations: extracts.length === 0
      ? []
      : recommendFamilies(buildFamilyDemand(extracts), await familyAverages()),
  }
}

export async function updateJobTargetStatus(id: string, status: string): Promise<void> {
  const db = await database()
  await db.targets.updateStatus(id, parseStatus(status), Date.now())
}

export async function deleteJobTarget(id: string): Promise<void> {
  const db = await database()
  await db.targets.remove(id)
}

export interface ShareSafeExportFile {
  filename: string
  contents: string
  listings: number
}

/**
 * Strips the pasted listing text. This is the file to attach to a demo or share
 * with a mentor; the full database backup stays local.
 */
export async function createShareSafeExport(now = Date.now()): Promise<ShareSafeExportFile> {
  const db = await database()
  const targets = await db.targets.list()
  const entries = targets.map((target) => ({ target, extract: extractFor(target) }))
  const payload = buildShareSafeExport(entries, now)
  const date = new Date(now).toISOString().slice(0, 10)

  return {
    filename: `helpdesklab-job-targets-${date}.json`,
    contents: JSON.stringify(payload, null, 2),
    listings: payload.listings.length,
  }
}
