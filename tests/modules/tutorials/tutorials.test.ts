import { describe, expect, it } from 'vitest'
import { ACADEMY_TUTORIAL } from '../../../src/modules/academy/data/tutorial'
import { DESKTOP_TUTORIAL } from '../../../src/modules/desktop/data/tutorial'
import { NETLAB_TUTORIAL } from '../../../src/modules/netlab/data/tutorial'
import { SCENARIOS } from '../../../src/modules/academy/data/scenarios'
import { CASES } from '../../../src/modules/desktop/data/cases'
import { INCIDENTS } from '../../../src/modules/netlab/data/incidents'

/**
 * The three tutorials are content, so the checks are about the content: enough
 * steps to walk a piece of work, a reason for each one, a link that goes where it
 * says, and a practice entry that names something the module actually has.
 */

const TUTORIALS = [
  {
    tutorial: NETLAB_TUTORIAL,
    prefix: '/networking',
    practiceIds: INCIDENTS.map((entry) => entry.id),
  },
  {
    tutorial: DESKTOP_TUTORIAL,
    prefix: '/desktop',
    practiceIds: CASES.map((entry) => entry.id),
  },
  {
    tutorial: ACADEMY_TUTORIAL,
    prefix: '/academy',
    practiceIds: SCENARIOS.map((entry) => entry.id),
  },
] as const

describe('the simulator tutorials', () => {
  it('walks each surface in at least six steps, each with an action and a reason', () => {
    for (const { tutorial } of TUTORIALS) {
      expect(tutorial.steps.length, tutorial.surface).toBeGreaterThanOrEqual(6)
      expect(tutorial.minutes, tutorial.surface).toBeGreaterThan(0)
      expect(tutorial.before.length, tutorial.surface).toBeGreaterThan(0)
      expect(tutorial.scoring.length, tutorial.surface).toBeGreaterThan(0)
      expect(tutorial.mistakes.length, tutorial.surface).toBeGreaterThan(0)
      expect(new Set(tutorial.steps.map((step) => step.title)).size).toBe(tutorial.steps.length)
      for (const step of tutorial.steps) {
        expect(step.action.length, `${tutorial.surface}: ${step.title}`).toBeGreaterThan(60)
        expect(step.why.length, `${tutorial.surface}: ${step.title}`).toBeGreaterThan(60)
      }
    }
  })

  it('keeps every link inside its own module and starts the practice case it names', () => {
    for (const { tutorial, prefix, practiceIds } of TUTORIALS) {
      const links = [
        tutorial.practice,
        tutorial.home,
        ...tutorial.steps.flatMap((step) => (step.link ? [step.link] : [])),
      ]
      for (const link of links) {
        expect(
          link.to === prefix || link.to.startsWith(`${prefix}/`),
          `${tutorial.surface}: ${link.to}`,
        ).toBe(true)
        expect(link.label.length, link.to).toBeGreaterThan(3)
      }

      const practiceId = tutorial.practice.to.split('/').at(-1) ?? ''
      expect(practiceIds, `${tutorial.surface} practice target`).toContain(practiceId)
    }
  })

  it('states the surface, and both wording rules the product relies on', () => {
    for (const { tutorial } of TUTORIALS) {
      expect(tutorial.surface.length).toBeGreaterThan(0)
      expect(tutorial.title).not.toMatch(/tutorial/i)
      expect(tutorial.lede.length).toBeGreaterThan(80)
      // The pack's writing standard: no borrowed marketing, and practice one way.
      for (const step of tutorial.steps) {
        expect(`${step.action} ${step.why}`).not.toMatch(/\bpractise\b/i)
      }
    }
    expect(TUTORIALS[2]?.tutorial.before.join(' ')).toMatch(/fictional/i)
    expect(TUTORIALS[1]?.tutorial.before.join(' ')).toMatch(/simulated/i)
  })

  it('tells the learner where the marks are, not only what to click', () => {
    for (const { tutorial } of TUTORIALS) {
      expect(tutorial.scoring.length).toBeGreaterThanOrEqual(4)
      for (const row of tutorial.scoring) {
        expect(row.label.trim().length).toBeGreaterThan(0)
        expect(row.detail.length).toBeGreaterThan(20)
      }
    }
  })
})
