import type { DsaAttempt, DsaOverview, DsaProblem, DsaProblemProgress } from '../types'

/** The progress map a library page reads: one row per problem that has been tried. */
export function summarizeAttempts(
  attempts: readonly DsaAttempt[],
): Record<string, DsaProblemProgress> {
  const progress: Record<string, DsaProblemProgress> = {}
  for (const attempt of attempts) {
    const current = progress[attempt.problemId] ?? {
      attempts: 0,
      solved: false,
      lastAttemptAt: null,
    }
    current.attempts += 1
    current.solved = current.solved || attempt.solved
    current.lastAttemptAt = Math.max(current.lastAttemptAt ?? 0, attempt.createdAt)
    progress[attempt.problemId] = current
  }
  return progress
}

export function buildOverview(
  problems: readonly DsaProblem[],
  attempts: readonly DsaAttempt[],
): DsaOverview {
  const progress = summarizeAttempts(attempts)
  let solved = 0
  let attempted = 0
  for (const problem of problems) {
    const entry = progress[problem.id]
    if (entry?.solved) solved += 1
    if (entry) attempted += 1
  }
  return { problems, progress, solved, attempted, total: problems.length }
}

/** Every topic once, alphabetically, for the library's filter. */
export function listTopics(problems: readonly DsaProblem[]): string[] {
  const topics = new Set<string>()
  for (const problem of problems) {
    for (const topic of problem.topics) topics.add(topic)
  }
  return [...topics].sort((left, right) => left.localeCompare(right))
}

/**
 * The library's filter, kept out of the page so the rule can be tested without
 * a DOM. `solved` is the learner's map; an untried problem reads as unsolved.
 */
export function filterProblems(
  overview: DsaOverview,
  filters: {
    query?: string
    difficulty?: string
    topic?: string
    unsolvedOnly?: boolean
  },
): DsaProblem[] {
  const needle = (filters.query ?? '').trim().toLowerCase()
  return overview.problems.filter((problem) => {
    const progress = overview.progress[problem.id]
    if (filters.difficulty && filters.difficulty !== 'all') {
      if (problem.difficulty !== filters.difficulty) return false
    }
    if (filters.topic && filters.topic !== 'all') {
      if (!problem.topics.includes(filters.topic)) return false
    }
    if (filters.unsolvedOnly && progress?.solved) return false
    if (needle.length === 0) return true
    return (
      problem.title.toLowerCase().includes(needle) ||
      problem.summary.toLowerCase().includes(needle) ||
      problem.topics.some((topic) => topic.includes(needle))
    )
  })
}

/** The choice ids of the latest attempt, which is where a returning learner starts. */
export function lastChoices(attempts: readonly DsaAttempt[]): DsaAttempt | null {
  if (attempts.length === 0) return null
  return [...attempts].sort((left, right) => right.createdAt - left.createdAt)[0] ?? null
}
