import { SKILLS } from './skills'
import type { FamilySignal, ListingExtract, SkillMatch } from './types'
import type { ScenarioId } from '../tickets/types'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function phrasePattern(phrase: string): RegExp {
  const escaped = escapeRegExp(phrase)
  const left = /^[a-z0-9]/.test(phrase) ? '\\b' : ''
  const right = /[a-z0-9]$/.test(phrase) ? '\\b' : ''
  return new RegExp(`${left}${escaped}${right}`, 'gi')
}

export function normalizeListingText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Counts each phrase at most once per listing: a job ad that says "printer"
 * five times still asks for printing once, which keeps coverage readable.
 */
export function extractListing(rawText: string): ListingExtract {
  const text = normalizeListingText(rawText)
  const skills: SkillMatch[] = []

  for (const skill of SKILLS) {
    const matched = skill.keywords.filter((keyword) => phrasePattern(keyword).test(text))
    if (matched.length === 0) {
      continue
    }
    skills.push({
      skill: skill.id,
      label: skill.label,
      mentions: matched.length,
      matched,
      families: skill.families,
      tools: skill.tools,
    })
  }

  const familyWeights = new Map<ScenarioId, { mentions: number; skills: Set<string> }>()
  for (const skill of skills) {
    for (const family of skill.families) {
      const entry = familyWeights.get(family) ?? { mentions: 0, skills: new Set<string>() }
      entry.mentions += skill.mentions
      entry.skills.add(skill.skill)
      familyWeights.set(family, entry)
    }
  }

  const families: FamilySignal[] = [...familyWeights.entries()]
    .map(([scenarioId, entry]) => ({
      scenarioId,
      mentions: entry.mentions,
      skills: [...entry.skills] as FamilySignal['skills'],
    }))
    .sort(
      (left, right) =>
        right.mentions - left.mentions || left.scenarioId.localeCompare(right.scenarioId),
    )

  const tools = [...new Set(skills.flatMap((skill) => skill.tools))].sort((left, right) =>
    left.localeCompare(right),
  )

  return {
    skills: skills.sort(
      (left, right) => right.mentions - left.mentions || left.skill.localeCompare(right.skill),
    ),
    families,
    tools,
    wordCount: text.length === 0 ? 0 : text.split(' ').length,
  }
}
