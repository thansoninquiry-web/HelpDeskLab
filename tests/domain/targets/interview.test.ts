import { describe, expect, it } from 'vitest'
import { interviewQuestions } from '../../../src/domain/targets/interview'
import type { SkillId } from '../../../src/domain/targets/types'

describe('interviewQuestions', () => {
  it('builds questions and a "what this tests" note per matched skill', () => {
    const questions = interviewQuestions(['dns', 'printing'])

    expect(questions.map((question) => question.skill)).toEqual([
      'dns',
      'dns',
      'printing',
      'printing',
    ])
    for (const question of questions) {
      expect(question.question.length).toBeGreaterThan(20)
      expect(question.tests.length).toBeGreaterThan(20)
      expect(question.id).toMatch(/^(dns|printing)-[12]$/)
    }
  })

  it('is deterministic for the same skill order', () => {
    const first = interviewQuestions(['m365-email', 'customer-service'])
    const second = interviewQuestions(['m365-email', 'customer-service'])

    expect(first).toEqual(second)
    expect(first.map((question) => question.id)).toEqual([
      'm365-email-1',
      'm365-email-2',
      'customer-service-1',
      'customer-service-2',
    ])
  })

  it('honours the per-skill limit and dedupes repeated skills', () => {
    const questions = interviewQuestions(['networking', 'networking'], 1)

    expect(questions).toHaveLength(1)
    expect(questions[0]?.skill).toBe('networking')
  })

  it('ignores unknown skills instead of throwing', () => {
    expect(interviewQuestions(['made-up-skill' as SkillId])).toEqual([])
    expect(interviewQuestions([])).toEqual([])
  })
})
