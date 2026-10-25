import { describe, expect, it } from 'vitest'
import { CURRICULUM } from '../../../src/domain/curriculum/modules'
import { lessonFor, MODULE_LESSONS } from '../../../src/domain/curriculum/lessons'
import { listVariants } from '../../../src/domain/generator'
import { INTUNE_TICKET_TEMPLATES } from '../../../src/modules/intune/tickets/templates'
import { AZURE_TICKET_TEMPLATES } from '../../../src/modules/azure/tickets/templates'

const playable = CURRICULUM.filter((module) => module.status === 'playable')
const planned = CURRICULUM.filter((module) => module.status === 'planned')

describe('module lessons', () => {
  it('teaches every module the app can practise', () => {
    const missing = playable.filter((module) => lessonFor(module.id) === null)
    expect(missing.map((module) => module.id)).toEqual([])
  })

  it('has no lesson for a module that is not built', () => {
    const orphans = planned.filter((module) => lessonFor(module.id) !== null)
    expect(orphans.map((module) => module.id)).toEqual([])
  })

  it('keeps no lesson for a module that no longer exists', () => {
    const ids = new Set(CURRICULUM.map((module) => module.id))
    expect(Object.keys(MODULE_LESSONS).filter((id) => !ids.has(id))).toEqual([])
  })

  it('keeps every lesson short enough to read in one sitting', () => {
    for (const module of playable) {
      const lesson = lessonFor(module.id)
      expect(lesson, module.id).not.toBeNull()
      if (!lesson) {
        continue
      }

      expect(lesson.concept.length, `${module.id} paragraphs`).toBeGreaterThanOrEqual(1)
      expect(lesson.concept.length, `${module.id} paragraphs`).toBeLessThanOrEqual(3)
      for (const paragraph of lesson.concept) {
        expect(paragraph.trim().length, `${module.id} paragraph`).toBeGreaterThan(80)
      }

      expect(lesson.example.steps.length, `${module.id} steps`).toBeGreaterThanOrEqual(2)
      expect(lesson.example.steps.length, `${module.id} steps`).toBeLessThanOrEqual(5)
      for (const step of lesson.example.steps) {
        expect(step.action.trim().length, `${module.id} step action`).toBeGreaterThan(0)
        expect(step.note.trim().length, `${module.id} step note`).toBeGreaterThan(20)
      }

      expect(lesson.example.title.trim().length).toBeGreaterThan(0)
      expect(lesson.example.scenario.trim().length).toBeGreaterThan(30)
      expect(lesson.example.result.trim().length).toBeGreaterThan(30)
    }
  })

  it('gives Remote Desktop a connect-to-close checklist with evidence on every step', () => {
    const flow = lessonFor('remote-desktop')?.flow
    expect(flow).toBeDefined()
    if (!flow) {
      return
    }

    // A walkthrough that starts at the session and ends at the close.
    expect(flow.steps.length, 'flow steps').toBeGreaterThanOrEqual(4)
    expect(flow.steps.length, 'flow steps').toBeLessThanOrEqual(6)
    expect(flow.steps[0]?.action.toLowerCase()).toContain('connect')
    expect(flow.steps.at(-1)?.action.toLowerCase()).toMatch(/end|close/)

    expect(flow.intro.trim().length, 'flow intro').toBeGreaterThan(30)
    expect(flow.finish.trim().length, 'flow finish').toBeGreaterThan(30)
    for (const step of flow.steps) {
      expect(step.action.trim().length, 'flow action').toBeGreaterThan(0)
      expect(step.evidence.trim().length, 'flow evidence').toBeGreaterThan(20)
    }
  })

  it('sends the learner to tickets the module actually scopes', () => {
    for (const module of playable) {
      const lesson = lessonFor(module.id)
      if (!lesson) {
        continue
      }

      if (lesson.practice.kind === 'targets') {
        // Only the interview module is judged outside the ticket queue.
        expect(module.scope, `${module.id} scope`).toEqual([])
        continue
      }

      if (lesson.practice.kind === 'intune') {
        // The console is a second simulator: its tickets are named separately
        // from the generator's families.
        expect(module.intuneTemplates, `${module.id} templates`).toContain(
          lesson.practice.templateId,
        )
        continue
      }

      if (lesson.practice.kind === 'azure') {
        // The Azure console keeps the same bargain: its templates are named
        // separately from the generator's families.
        expect(module.azureTemplates, `${module.id} templates`).toContain(
          lesson.practice.templateId,
        )
        continue
      }

      expect(lesson.practice.families.length, `${module.id} families`).toBeGreaterThan(0)
      for (const family of lesson.practice.families) {
        expect(module.scope, `${module.id} → ${family}`).toContain(family)
      }
    }
  })

  it('pins the variant a module is judged on, and only where a draw could miss it', () => {
    const pinned: string[] = []
    for (const module of playable) {
      const practice = lessonFor(module.id)?.practice
      if (!practice || practice.kind !== 'tickets' || !practice.variantId) {
        continue
      }

      pinned.push(module.id)
      // The first family is the one Practise starts; the pin has to belong to it.
      const variants = listVariants(practice.families[0] ?? '').map((entry) => entry.id)
      expect(variants, `${module.id} → ${practice.variantId}`).toContain(practice.variantId)
    }

    // Asset Management needs the held shelf; Computer Deployment needs a run
    // that can finish. Everything else can take whatever the queue draws.
    expect(pinned).toEqual(['asset-management', 'computer-deployment'])
  })

  it('keeps every command span balanced, so a step never renders half a marker', () => {
    for (const module of playable) {
      const lesson = lessonFor(module.id)
      if (!lesson) {
        continue
      }

      const lines = [
        ...lesson.concept,
        lesson.example.title,
        lesson.example.scenario,
        lesson.example.result,
        ...lesson.example.steps.flatMap((entry) => [entry.action, entry.note]),
        ...(lesson.flow
          ? [
              lesson.flow.title,
              lesson.flow.intro,
              lesson.flow.finish,
              ...lesson.flow.steps.flatMap((entry) => [entry.action, entry.evidence]),
            ]
          : []),
      ]

      for (const line of lines) {
        expect(line.split('`').length % 2, `${module.id}: ${line.slice(0, 60)}`).toBe(1)
      }
    }
  })

  it('opens Voicemails on a ticket that arrived as a message, and only there', () => {
    const asking: string[] = []
    for (const module of playable) {
      const practice = lessonFor(module.id)?.practice
      if (practice?.kind === 'tickets' && practice.arrival === 'voicemail') {
        asking.push(module.id)
      }
    }

    // The arrival is drawn from the ticket's seed, so asking for one is how the
    // module opens on the thing it teaches without pinning a family's variant.
    expect(asking).toEqual(['voicemails'])
  })

  it('sends the console modules into the console, not the ticket queue', () => {
    const consoleModules = playable.filter(
      (module) => lessonFor(module.id)?.practice.kind === 'intune',
    )
    expect(consoleModules.map((module) => module.id)).toEqual([
      'intune-compliance',
      'intune-apps',
      'intune-lifecycle',
    ])

    const azureModules = playable.filter(
      (module) => lessonFor(module.id)?.practice.kind === 'azure',
    )
    expect(azureModules.map((module) => module.id)).toEqual([
      'azure-compute',
      'azure-network',
      'azure-access',
    ])

    const azureTemplateIds = new Set(AZURE_TICKET_TEMPLATES.map((template) => template.id))
    for (const module of azureModules) {
      const practice = lessonFor(module.id)?.practice
      if (practice?.kind !== 'azure') {
        continue
      }
      expect(azureTemplateIds, `${module.id} → ${practice.templateId}`).toContain(
        practice.templateId,
      )
      expect(module.azureTemplates, `${module.id} XP templates`).toContain(
        practice.templateId,
      )
      expect(module.scope, `${module.id} families`).toEqual([])
    }

    const templateIds = new Set(INTUNE_TICKET_TEMPLATES.map((template) => template.id))
    for (const module of consoleModules) {
      const practice = lessonFor(module.id)?.practice
      if (practice?.kind !== 'intune') {
        continue
      }
      expect(templateIds, `${module.id} → ${practice.templateId}`).toContain(
        practice.templateId,
      )
      expect(module.intuneTemplates, `${module.id} XP templates`).toContain(
        practice.templateId,
      )
      expect(module.scope, `${module.id} families`).toEqual([])
    }
  })

  it('keeps the targets practice to the module that is judged on listings', () => {
    const targets = playable.filter(
      (module) => lessonFor(module.id)?.practice.kind === 'targets',
    )
    expect(targets.map((module) => module.id)).toEqual(['mock-interview'])
  })
})
