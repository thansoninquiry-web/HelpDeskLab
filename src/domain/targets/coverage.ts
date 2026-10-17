import { SKILLS } from './skills'
import type { FamilyDemand, ListingExtract, SkillCoverage } from './types'

/** One row per skill, whether or not it was ever requested. */
export function buildCoverage(extracts: readonly ListingExtract[]): SkillCoverage[] {
  return SKILLS.map((definition) => {
    let listings = 0
    let mentions = 0

    for (const extract of extracts) {
      const match = extract.skills.find((skill) => skill.skill === definition.id)
      if (!match) {
        continue
      }
      listings += 1
      mentions += match.mentions
    }

    return {
      skill: definition.id,
      label: definition.label,
      listings,
      mentions,
      families: definition.families,
      tools: definition.tools,
      covered: definition.families.length > 0,
    }
  }).sort(
    (left, right) =>
      right.listings - left.listings ||
      right.mentions - left.mentions ||
      SKILLS.findIndex((skill) => skill.id === left.skill) -
        SKILLS.findIndex((skill) => skill.id === right.skill),
  )
}

/** How strongly each family is requested across the listings. */
export function buildFamilyDemand(extracts: readonly ListingExtract[]): FamilyDemand[] {
  const families = new Map<string, { mentions: number; listings: number; skills: Set<string> }>()

  for (const extract of extracts) {
    for (const signal of extract.families) {
      const entry = families.get(signal.scenarioId) ?? {
        mentions: 0,
        listings: 0,
        skills: new Set<string>(),
      }
      entry.mentions += signal.mentions
      entry.listings += 1
      for (const skill of signal.skills) {
        entry.skills.add(skill)
      }
      families.set(signal.scenarioId, entry)
    }
  }

  return [...families.entries()]
    .map(([scenarioId, entry]) => ({
      scenarioId,
      mentions: entry.mentions,
      listings: entry.listings,
      skills: [...entry.skills] as FamilyDemand['skills'],
    }))
    .sort(
      (left, right) =>
        right.mentions - left.mentions || left.scenarioId.localeCompare(right.scenarioId),
    )
}
