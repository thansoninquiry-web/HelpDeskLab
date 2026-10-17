import type { ScenarioId } from '../tickets/types'
import type { JobStatus, JobTarget, ListingExtract, SkillId } from './types'

export const SHARE_EXPORT_FORMAT = 'helpdesklab-job-targets'

export interface ShareSafeListing {
  company: string
  title: string
  url: string
  appliedOn: string | null
  status: JobStatus
  skills: SkillId[]
  families: ScenarioId[]
}

export interface ShareSafeExport {
  format: typeof SHARE_EXPORT_FORMAT
  version: 1
  exportedAt: number
  listings: ShareSafeListing[]
}

/**
 * Deliberately drops `rawDescription`: the stored listing text never leaves the
 * local database through this export, only the derived skills and families do.
 */
export function buildShareSafeExport(
  entries: ReadonlyArray<{ target: JobTarget; extract: ListingExtract }>,
  exportedAt: number,
): ShareSafeExport {
  return {
    format: SHARE_EXPORT_FORMAT,
    version: 1,
    exportedAt,
    listings: entries.map(({ target, extract }) => ({
      company: target.company,
      title: target.title,
      url: target.url,
      appliedOn: target.appliedOn,
      status: target.status,
      skills: extract.skills.map((skill) => skill.skill),
      families: extract.families.map((family) => family.scenarioId),
    })),
  }
}
