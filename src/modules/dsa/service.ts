import { DSA_PROBLEMS, findDsaProblem } from './data/problems'
import { buildOverview, lastChoices } from './logic/progress'
import type { DsaStore } from './persistence/store'
import type {
  DsaAttempt,
  DsaChoice,
  DsaOutcome,
  DsaOverview,
  DsaProblem,
  DsaProblemView,
  DsaSubmission,
} from './types'

/**
 * The module's use cases, written against the store rather than against a page.
 *
 * Everything the practice loop needs is decided here: which answer is right is
 * the problem's own data, so a page cannot disagree with the answer key, and an
 * attempt is scored the moment it is written rather than when it is read.
 */
export class DsaService {
  private readonly store: DsaStore
  private readonly clock: () => number

  constructor(store: DsaStore, clock: () => number = () => Date.now()) {
    this.store = store
    this.clock = clock
  }

  /** The library: the whole bank, with what has been tried and solved. */
  async overview(): Promise<DsaOverview> {
    return buildOverview(DSA_PROBLEMS, await this.store.attempts())
  }

  async problem(id: string): Promise<DsaProblemView | null> {
    const problem = findDsaProblem(id)
    if (!problem) {
      return null
    }
    const [draft, attempts] = await Promise.all([
      this.store.draft(id),
      this.store.attemptsFor(id),
    ])
    return { problem, draft, attempts }
  }

  async saveDraft(problemId: string, code: string): Promise<void> {
    if (!findDsaProblem(problemId)) {
      throw new Error(`Unknown DSA problem: ${problemId}`)
    }
    await this.store.saveDraft({ problemId, code, updatedAt: this.clock() })
  }

  /**
   * Scores a submitted answer and records the attempt.
   *
   * Both steps have to be right for the problem to count as solved. The result
   * carries the correct choices and their notes, so the page can explain the
   * missed one without owning a second copy of the answer key.
   */
  async submit(submission: DsaSubmission): Promise<DsaOutcome> {
    const problem = findDsaProblem(submission.problemId)
    if (!problem) {
      throw new Error(`Unknown DSA problem: ${submission.problemId}`)
    }

    const patternChoice = choiceOf(problem.patterns, submission.patternChoice, 'approach')
    const edgeChoice = choiceOf(problem.edges, submission.edgeChoice, 'edge case')
    const pattern = correctChoice(problem.patterns)
    const edge = correctChoice(problem.edges)
    const patternCorrect = patternChoice.id === pattern.id
    const edgeCorrect = edgeChoice.id === edge.id
    const solved = patternCorrect && edgeCorrect
    const createdAt = this.clock()

    const attempt: DsaAttempt = {
      id: newId(problem.id, createdAt),
      problemId: problem.id,
      patternChoice: patternChoice.id,
      edgeChoice: edgeChoice.id,
      solved,
      hintsUsed: Math.min(Math.max(0, submission.hintsUsed), problem.hints.length),
      code: submission.code,
      createdAt,
    }
    await this.store.appendAttempt(attempt)

    return { attempt, solved, patternCorrect, edgeCorrect, pattern, edge }
  }

  /** Where a returning learner left off: their last answers and hand-written code. */
  async resume(id: string): Promise<{ choices: DsaAttempt | null; draft: string | null }> {
    const [attempts, draft] = await Promise.all([
      this.store.attemptsFor(id),
      this.store.draft(id),
    ])
    return { choices: lastChoices(attempts), draft }
  }

  async reset(): Promise<void> {
    await this.store.reset()
  }
}

function choiceOf(choices: readonly DsaChoice[], id: string, kind: string): DsaChoice {
  const choice = choices.find((entry) => entry.id === id)
  if (!choice) {
    throw new Error(`Unknown ${kind} choice: ${id}`)
  }
  return choice
}

function correctChoice(choices: readonly DsaChoice[]): DsaChoice {
  const choice = choices.find((entry) => entry.correct)
  if (!choice) {
    // The bank test refuses this at build time; failing loudly here means a
    // hand-edited bank cannot silently score every attempt wrong.
    throw new Error('The problem has no correct choice')
  }
  return choice
}

function newId(problemId: string, createdAt: number): string {
  const random = globalThis.crypto?.randomUUID?.()
  if (random) {
    return `${problemId}:${random}`
  }
  return `${problemId}:${createdAt}:${Math.random().toString(36).slice(2, 10)}`
}

export type { DsaProblem }
