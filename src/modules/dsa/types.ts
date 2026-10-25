import type { JsonValue } from '../../domain/shared/json'

/**
 * A DSA practice problem, written for this lab rather than scraped from a judge.
 *
 * The practice loop is a decision, not a code submission: the app asks which
 * approach fits and what it costs, and which edge case that approach must
 * handle. That is the interview skill the sheet on the wall tests — "the input
 * is sorted, so binary search is O(log n) and two pointers is O(n)" — and it
 * needs no evaluator, which matters because the shipped policy forbids one.
 * The editor is still there to write the answer out by hand; the reference
 * solutions are the thing to check it against.
 */

export type DsaDifficulty = 'easy' | 'medium' | 'hard'

export interface DsaExample {
  input: string
  output: string
  explanation?: string
}

/** One answer on a multiple-choice step, with the reason it is or is not right. */
export interface DsaChoice {
  id: string
  label: string
  /** Shown once the learner has answered: why this one wins, or why it loses. */
  note: string
  correct: boolean
}

/** A worked answer in the shape a good forum reply takes. */
export interface DsaApproach {
  name: string
  time: string
  space: string
  idea: string
  code: string
  /** When this answer is the better of the two, in a sentence. */
  tradeoff: string
}

/** A machine-checkable pair, used to prove the reference code is not a sketch. */
export interface DsaCheck {
  args: readonly JsonValue[]
  expected: JsonValue
}

export interface DsaProblem {
  id: string
  title: string
  difficulty: DsaDifficulty
  topics: readonly string[]
  /** The one-line pitch the library shows. */
  summary: string
  statement: readonly string[]
  examples: readonly DsaExample[]
  constraints: readonly string[]
  /** What an interviewer expects the learner to notice before writing anything. */
  cues: readonly string[]
  /** Approach and cost, four candidates with exactly one right answer. */
  patterns: readonly DsaChoice[]
  /** The case that breaks the chosen approach, three candidates with one right answer. */
  edges: readonly DsaChoice[]
  hints: readonly string[]
  approaches: readonly DsaApproach[]
  starter: string
  /** Runs every approach against the examples; the bank test proves it passes. */
  checks: readonly DsaCheck[]
}

/** One technique the sheet licenses for a cue, with what it costs. */
export interface DsaPatternTool {
  name: string
  time: string
  space?: string
  /** When this is the tool to reach for, in a sentence. */
  note: string
  /** The problem in this bank that drills it, when there is one. */
  problemId?: string
}

/** A cue and the techniques it points at — one row of the sheet. */
export interface DsaPatternEntry {
  id: string
  /** The thing noticed in the question, in the sheet's own voice. */
  cue: string
  /** Why the cue matter, in one line. */
  why: string
  tools: readonly DsaPatternTool[]
}

export interface DsaPatternGroup {
  id: string
  title: string
  entries: readonly DsaPatternEntry[]
}

export interface DsaAttempt {
  id: string
  problemId: string
  patternChoice: string
  edgeChoice: string
  solved: boolean
  hintsUsed: number
  code: string | null
  createdAt: number
}

export interface DsaProblemProgress {
  attempts: number
  solved: boolean
  lastAttemptAt: number | null
}

export interface DsaOverview {
  problems: readonly DsaProblem[]
  progress: Record<string, DsaProblemProgress>
  solved: number
  attempted: number
  total: number
}

export interface DsaProblemView {
  problem: DsaProblem
  draft: string | null
  attempts: readonly DsaAttempt[]
}

/** The answer to one submitted attempt, with the reasons for every choice. */
export interface DsaOutcome {
  attempt: DsaAttempt
  solved: boolean
  patternCorrect: boolean
  edgeCorrect: boolean
  /** The right answers, so the result panel can explain the misses. */
  pattern: DsaChoice
  edge: DsaChoice
}

export interface DsaSubmission {
  problemId: string
  patternChoice: string
  edgeChoice: string
  hintsUsed: number
  code: string | null
}
