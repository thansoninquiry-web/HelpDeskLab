import { caseById } from './data/cases'
import { buildEstate } from './logic/estate'
import { scoreDesktopAttempt, type DesktopScore } from './logic/scoring'
import type { DesktopAttemptRecord, DesktopStore } from './persistence/store'
import type {
  AttemptState,
  BenchEstate,
  CheckId,
  ChecklistId,
  DesktopCase,
  FixId,
} from './types'

export interface OpenResult {
  entry: DesktopCase
  attempt: DesktopAttemptRecord
  estate: BenchEstate
  /** The score of a finished attempt, so reopening shows the last result. */
  score: DesktopScore | null
}

export interface ChangeResult {
  attempt: DesktopAttemptRecord
  estate: BenchEstate
  status: 'applied' | 'refused'
  summary: string
}

export interface ScoreResult {
  attempt: DesktopAttemptRecord
  estate: BenchEstate
  score: DesktopScore
}

function parseScore(json: string | null): DesktopScore | null {
  if (!json) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(json)
    return typeof parsed === 'object' && parsed !== null ? (parsed as DesktopScore) : null
  } catch {
    return null
  }
}

function stateOf(attempt: DesktopAttemptRecord): AttemptState {
  return attempt.state
}

/**
 * The bench's use cases, written against the store rather than a page.
 *
 * Opening a case resumes the unfinished attempt; a finished one is kept so the
 * page can show what was scored. Every change and every checklist tick goes
 * through here, which is what makes the action bar, the checklist and the scorer
 * read one story.
 */
export class DesktopService {
  private readonly store: DesktopStore
  private readonly clock: () => number
  /**
   * Events are ordered by time, and the score reads that order — a read and the
   * change that followed it in the same millisecond would otherwise be
   * indistinguishable.
   */
  private last = 0

  constructor(store: DesktopStore, clock: () => number = () => Date.now()) {
    this.store = store
    this.clock = clock
  }

  private now(): number {
    this.last = Math.max(this.clock(), this.last + 1)
    return this.last
  }

  private caseOrThrow(id: string): DesktopCase {
    const entry = caseById(id)
    if (!entry) {
      throw new Error(`Unknown desktop case: ${id}`)
    }
    return entry
  }

  async open(caseId: string): Promise<OpenResult> {
    const entry = this.caseOrThrow(caseId)
    const attempt = await this.openAttempt(entry.id)
    const estate = buildEstate(entry, stateOf(attempt).fixes)
    return {
      entry,
      attempt,
      estate,
      score: attempt.finishedAt === null ? null : parseScore(attempt.scoreJson),
    }
  }

  /** Starts a fresh attempt, leaving the old one as history. */
  async restart(caseId: string): Promise<OpenResult> {
    const entry = this.caseOrThrow(caseId)
    const current = await this.store.latestAttempt(entry.id)
    if (current && current.finishedAt === null) {
      await this.store.close(current.id, Math.max(this.now(), current.startedAt + 1))
      this.last = Math.max(this.last, current.startedAt + 1)
    }
    const attempt = await this.openAttempt(entry.id)
    return {
      entry,
      attempt,
      estate: buildEstate(entry, stateOf(attempt).fixes),
      score: null,
    }
  }

  private async openAttempt(caseId: string): Promise<DesktopAttemptRecord> {
    const at = this.now()
    const existing = await this.store.attemptById(`${caseId}:${at}`)
    if (existing) {
      return existing.finishedAt === null
        ? existing
        : this.store.ensureAttempt(caseId, this.stepPast(at))
    }
    return this.store.ensureAttempt(caseId, at)
  }

  private stepPast(at: number): number {
    this.last = Math.max(this.last, at + 1)
    return this.last
  }

  /** Records a read against the attempt, without changing the machine. */
  async recordCheck(
    attemptId: string,
    check: CheckId,
    on: string,
  ): Promise<DesktopAttemptRecord | null> {
    return this.store.appendCheck(attemptId, { id: check, on, at: this.now() })
  }

  async applyFix(attemptId: string, fix: FixId): Promise<ChangeResult> {
    const attempt = await this.store.attemptById(attemptId)
    if (!attempt) {
      throw new Error(`Unknown desktop attempt: ${attemptId}`)
    }
    const entry = this.caseOrThrow(attempt.caseId)
    const estateBefore = buildEstate(entry, attempt.state.fixes)

    if (!entry.fixOptions.some((option) => option.id === fix)) {
      return {
        attempt,
        estate: estateBefore,
        status: 'refused',
        summary: `${fix} is not a change this case offers.`,
      }
    }
    if (attempt.state.fixes.includes(fix)) {
      return {
        attempt,
        estate: estateBefore,
        status: 'refused',
        summary: 'That change has already been made for this attempt.',
      }
    }

    const updated = await this.store.appendChange(attemptId, { fix, at: this.now() })
    if (!updated) {
      throw new Error(`The attempt disappeared while it was being changed: ${attemptId}`)
    }
    const option = entry.fixOptions.find((entry) => entry.id === fix)
    return {
      attempt: updated,
      estate: buildEstate(entry, stateOf(updated).fixes),
      status: 'applied',
      summary: option ? `${option.label}. ${option.detail}` : fix,
    }
  }

  async tickChecklist(
    attemptId: string,
    item: ChecklistId,
    note?: string,
  ): Promise<DesktopAttemptRecord | null> {
    return this.store.tickChecklist(attemptId, item, this.now(), note)
  }

  async score(attemptId: string): Promise<ScoreResult> {
    const attempt = await this.store.attemptById(attemptId)
    if (!attempt) {
      throw new Error(`Unknown desktop attempt: ${attemptId}`)
    }
    const entry = this.caseOrThrow(attempt.caseId)
    const estate = buildEstate(entry, stateOf(attempt).fixes)
    const score = scoreDesktopAttempt({
      entry,
      estate,
      checks: attempt.state.checks,
      changes: attempt.state.changes,
      checklist: attempt.state.checklist,
    })
    const saved = await this.store.saveScore(
      attempt.id,
      score.total,
      JSON.stringify(score),
      this.now(),
    )
    return { attempt: saved ?? attempt, estate, score }
  }

  async attempts(): Promise<DesktopAttemptRecord[]> {
    return this.store.attempts()
  }

  async reset(): Promise<void> {
    await this.store.reset()
  }
}

export type { DesktopScore }
