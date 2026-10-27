import { conceptById } from './data/concepts'
import { incidentById } from './data/incidents'
import { buildEstate } from './logic/estate'
import { scoreNetlabAttempt, type NetlabScore } from './logic/scoring'
import type { NetlabAttemptRecord, NetlabStore, QuizAnswerRecord } from './persistence/store'
import type { AttemptState, CheckId, FixId, Incident, LabEstate } from './types'

export interface OpenResult {
  incident: Incident
  attempt: NetlabAttemptRecord
  estate: LabEstate
  /** The score of a finished attempt, so reopening shows the last result. */
  score: NetlabScore | null
}

export interface ChangeResult {
  attempt: NetlabAttemptRecord
  estate: LabEstate
  status: 'applied' | 'refused'
  summary: string
}

export interface ScoreResult {
  attempt: NetlabAttemptRecord
  estate: LabEstate
  score: NetlabScore
}

export interface AnswerResult {
  correct: boolean
  answer: string
  explanation: string
}

function parseScore(json: string | null): NetlabScore | null {
  if (!json) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(json)
    return typeof parsed === 'object' && parsed !== null ? (parsed as NetlabScore) : null
  } catch {
    return null
  }
}

function stateOf(attempt: NetlabAttemptRecord): AttemptState {
  return attempt.state
}

/**
 * The lab's use cases, written against the store rather than a page.
 *
 * Opening an incident resumes the unfinished attempt; a finished one is kept so
 * the page can show what was scored, and a new attempt starts only when the
 * learner asks for one. Every change goes through here, which is what makes the
 * action bar and the scorer read the same story.
 */
export class NetlabService {
  private readonly store: NetlabStore
  private readonly clock: () => number
  /**
   * The attempt's order is what the score reads, so two events never share a
   * timestamp even inside one millisecond: a read and the change that followed it
   * would otherwise be indistinguishable, and the diagnosis is scored on which
   * came first.
   */
  private last = 0

  constructor(store: NetlabStore, clock: () => number = () => Date.now()) {
    this.store = store
    this.clock = clock
  }

  private now(): number {
    this.last = Math.max(this.clock(), this.last + 1)
    return this.last
  }

  private incidentOrThrow(id: string): Incident {
    const incident = incidentById(id)
    if (!incident) {
      throw new Error(`Unknown networking incident: ${id}`)
    }
    return incident
  }

  async open(incidentId: string): Promise<OpenResult> {
    const incident = this.incidentOrThrow(incidentId)
    const attempt = await this.openAttempt(incident.id)
    const estate = buildEstate(incident, stateOf(attempt).fixes)
    return {
      incident,
      attempt,
      estate,
      score: attempt.finishedAt === null ? null : parseScore(attempt.scoreJson),
    }
  }

  /** Starts a fresh attempt, leaving the old one as history. */
  async restart(incidentId: string): Promise<OpenResult> {
    const incident = this.incidentOrThrow(incidentId)
    const current = await this.store.latestAttempt(incident.id)
    if (current && current.finishedAt === null) {
      // Give up on the open attempt without inventing a score for it: a retry
      // that has not been scored is history, not a zero. The clock only moves on
      // when the attempt being closed was opened on this very tick, so the new
      // attempt's id cannot collide with it.
      await this.store.close(current.id, Math.max(this.now(), current.startedAt + 1))
      this.last = Math.max(this.last, current.startedAt + 1)
    }
    const attempt = await this.openAttempt(incident.id)
    return {
      incident,
      attempt,
      estate: buildEstate(incident, stateOf(attempt).fixes),
      score: null,
    }
  }

  /**
   * The attempt to resume, or a new one.
   *
   * The id is the incident and the moment it was started, so it collides only
   * with an attempt opened on the same tick. When that happens — a restart in the
   * same millisecond — the clock is moved on rather than the row reused.
   */
  private async openAttempt(incidentId: string): Promise<NetlabAttemptRecord> {
    const at = this.now()
    const existing = await this.store.attemptById(`${incidentId}:${at}`)
    if (existing) {
      return existing.finishedAt === null
        ? existing
        : this.store.ensureAttempt(incidentId, this.stepPast(at))
    }
    return this.store.ensureAttempt(incidentId, at)
  }

  private stepPast(at: number): number {
    this.last = Math.max(this.last, at + 1)
    return this.last
  }

  /** Records a diagnostic read against the attempt, without changing the estate. */
  async recordCheck(
    attemptId: string,
    check: CheckId,
    deviceId: string,
  ): Promise<NetlabAttemptRecord | null> {
    return this.store.appendCheck(attemptId, { id: check, deviceId, at: this.now() })
  }

  async applyFix(attemptId: string, fix: FixId): Promise<ChangeResult> {
    const attempt = await this.store.attemptById(attemptId)
    if (!attempt) {
      throw new Error(`Unknown networking attempt: ${attemptId}`)
    }
    const incident = this.incidentOrThrow(attempt.incidentId)
    const estateBefore = buildEstate(incident, attempt.state.fixes)

    if (!incident.fixOptions.some((option) => option.id === fix)) {
      return {
        attempt,
        estate: estateBefore,
        status: 'refused',
        summary: `${fix} is not a change this incident offers.`,
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
    const estate = buildEstate(incident, stateOf(updated).fixes)
    const option = incident.fixOptions.find((entry) => entry.id === fix)
    return {
      attempt: updated,
      estate,
      status: 'applied',
      summary: option ? `${option.label}. ${option.detail}` : fix,
    }
  }

  async score(attemptId: string): Promise<ScoreResult> {
    const attempt = await this.store.attemptById(attemptId)
    if (!attempt) {
      throw new Error(`Unknown networking attempt: ${attemptId}`)
    }
    const incident = this.incidentOrThrow(attempt.incidentId)
    const estate = buildEstate(incident, stateOf(attempt).fixes)
    const score = scoreNetlabAttempt({
      incident,
      estate,
      checks: attempt.state.checks,
      changes: attempt.state.changes,
    })
    const saved = await this.store.saveScore(
      attempt.id,
      score.total,
      JSON.stringify(score),
      this.now(),
    )
    return {
      attempt: saved ?? attempt,
      estate,
      score,
    }
  }

  async attempts(): Promise<NetlabAttemptRecord[]> {
    return this.store.attempts()
  }

  async quizAnswers(): Promise<QuizAnswerRecord[]> {
    return this.store.quizAnswers()
  }

  async conceptReads(): Promise<Awaited<ReturnType<NetlabStore['conceptReads']>>> {
    return this.store.conceptReads()
  }

  async markConceptRead(conceptId: string): Promise<void> {
    await this.store.markConceptRead(conceptId, this.now())
  }

  async answer(conceptId: string, questionId: string, choice: string): Promise<AnswerResult> {
    const concept = conceptById(conceptId)
    const question = concept?.questions.find((entry) => entry.id === questionId)
    if (!concept || !question) {
      throw new Error(`Unknown question: ${conceptId}/${questionId}`)
    }
    const correct = choice === question.answer
    await this.store.saveAnswer(conceptId, questionId, choice, correct, this.now())
    return { correct, answer: question.answer, explanation: question.explanation }
  }

  async reset(): Promise<void> {
    await this.store.reset()
  }
}

export type { NetlabScore }
