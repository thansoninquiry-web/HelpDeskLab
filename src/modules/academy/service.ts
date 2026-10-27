import { CHANGES, READS } from './data/catalog'
import { scenarioById } from './data/scenarios'
import { nextMinute } from './logic/clock'
import { scoreAcademyAttempt, type AcademyScore } from './logic/scoring'
import type { AcademyAttemptRecord, AcademyStore } from './persistence/store'
import {
  WALK_UP_AFTER,
  type AcademyMode,
  type ChangeId,
  type ChecklistId,
  type ReadId,
  type SchoolScenario,
} from './types'

export interface OpenResult {
  entry: SchoolScenario
  attempt: AcademyAttemptRecord
  score: AcademyScore | null
}

export interface WriteResult {
  attempt: AcademyAttemptRecord
  status: 'applied' | 'refused'
  summary: string
}

export interface ScoreResult {
  attempt: AcademyAttemptRecord
  score: AcademyScore
}

function parseScore(json: string | null): AcademyScore | null {
  if (!json) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(json)
    return typeof parsed === 'object' && parsed !== null ? (parsed as AcademyScore) : null
  } catch {
    return null
  }
}

/**
 * The desk's use cases, written against the store rather than a page.
 *
 * Opening a scenario resumes the unfinished visit; a finished one is kept so the
 * page can show what was scored. Every read, change, answer and checklist tick
 * goes through here, and each one writes its own minute, so the bell is part of
 * the record rather than a timer in a component.
 */
export class AcademyService {
  private readonly store: AcademyStore
  private readonly clock: () => number
  private last = 0

  constructor(store: AcademyStore, clock: () => number = () => Date.now()) {
    this.store = store
    this.clock = clock
  }

  private now(): number {
    this.last = Math.max(this.clock(), this.last + 1)
    return this.last
  }

  private scenarioOrThrow(id: string): SchoolScenario {
    const entry = scenarioById(id)
    if (!entry) {
      throw new Error(`Unknown school scenario: ${id}`)
    }
    return entry
  }

  async open(scenarioId: string, mode: AcademyMode = 'standard'): Promise<OpenResult> {
    const entry = this.scenarioOrThrow(scenarioId)
    const at = this.now()
    const existing = await this.store.latestAttempt(entry.id)
    const attempt =
      existing && existing.finishedAt === null
        ? existing
        : await this.store.ensureAttempt(entry.id, at, mode)
    return {
      entry,
      attempt,
      score: attempt.finishedAt === null ? null : parseScore(attempt.scoreJson),
    }
  }

  /** Starts a fresh visit, leaving the old one as history. */
  async restart(scenarioId: string, mode: AcademyMode = 'standard'): Promise<OpenResult> {
    const entry = this.scenarioOrThrow(scenarioId)
    const current = await this.store.latestAttempt(entry.id)
    if (current && current.finishedAt === null) {
      const at = Math.max(this.now(), current.startedAt + 1)
      await this.store.close(current.id, at)
      this.last = Math.max(this.last, at)
    }
    const attempt = await this.store.ensureAttempt(entry.id, this.now(), mode)
    return { entry, attempt, score: null }
  }

  private async attemptOrThrow(attemptId: string): Promise<AcademyAttemptRecord> {
    const attempt = await this.store.attemptById(attemptId)
    if (!attempt) {
      throw new Error(`Unknown school attempt: ${attemptId}`)
    }
    return attempt
  }

  /** The mode can change until the first action: after that the clock has started. */
  async setMode(attemptId: string, mode: AcademyMode): Promise<WriteResult> {
    const attempt = await this.attemptOrThrow(attemptId)
    const entry = this.scenarioOrThrow(attempt.scenarioId)
    const started =
      attempt.state.reads.length +
        attempt.state.changes.length +
        attempt.state.dialog.length +
        attempt.state.checklist.length >
      0
    if (attempt.finishedAt !== null) {
      return { attempt, status: 'refused', summary: 'This visit is already scored.' }
    }
    if (started) {
      return {
        attempt,
        status: 'refused',
        summary: 'The visit has started; the clock cannot be changed now.',
      }
    }
    const updated = await this.store.setMode(attempt.id, mode)
    return {
      attempt: updated ?? attempt,
      status: 'applied',
      summary:
        mode === 'rush'
          ? `${entry.bell.label}. Time pressure: reads cost 3 minutes, changes 5, and the bell has no grace.`
          : `${entry.bell.label}. Standard visit: reads cost 2 minutes and changes 3, with a 10-minute grace.`,
    }
  }

  async recordRead(attemptId: string, readId: ReadId): Promise<WriteResult> {
    const attempt = await this.attemptOrThrow(attemptId)
    const entry = this.scenarioOrThrow(attempt.scenarioId)
    const offered = entry.reads.find((record) => record.id === readId)
    if (!offered) {
      return { attempt, status: 'refused', summary: 'That read is not available in this room.' }
    }
    if (attempt.finishedAt !== null) {
      return { attempt, status: 'refused', summary: 'This visit is already scored.' }
    }
    if (attempt.state.reads.some((record) => record.id === readId)) {
      return { attempt, status: 'refused', summary: 'That read has already been taken.' }
    }
    const minute = nextMinute(attempt.state, entry, 'read')
    const updated = await this.store.appendRead(attempt.id, {
      id: readId,
      at: this.now(),
      minute,
    })
    return {
      attempt: updated ?? attempt,
      status: 'applied',
      summary: `${READS[readId].label}: ${offered.finding}`,
    }
  }

  async applyChange(attemptId: string, changeId: ChangeId): Promise<WriteResult> {
    const attempt = await this.attemptOrThrow(attemptId)
    const entry = this.scenarioOrThrow(attempt.scenarioId)
    if (!entry.changes.includes(changeId)) {
      return {
        attempt,
        status: 'refused',
        summary: `${CHANGES[changeId].label} is not offered for this scenario.`,
      }
    }
    if (attempt.finishedAt !== null) {
      return { attempt, status: 'refused', summary: 'This visit is already scored.' }
    }
    if (attempt.state.changes.some((record) => record.id === changeId)) {
      return { attempt, status: 'refused', summary: 'That change has already been made.' }
    }
    const minute = nextMinute(attempt.state, entry, 'change')
    const updated = await this.store.appendChange(attempt.id, {
      id: changeId,
      at: this.now(),
      minute,
    })
    return {
      attempt: updated ?? attempt,
      status: 'applied',
      summary: `${CHANGES[changeId].label}. ${CHANGES[changeId].detail}`,
    }
  }

  async answer(
    attemptId: string,
    nodeId: string,
    optionId: string,
  ): Promise<WriteResult> {
    const attempt = await this.attemptOrThrow(attemptId)
    const entry = this.scenarioOrThrow(attempt.scenarioId)
    const index = entry.dialog.findIndex((node) => node.id === nodeId)
    if (index < 0) {
      return { attempt, status: 'refused', summary: 'That is not a step in this conversation.' }
    }
    const node = entry.dialog[index]
    const option = node?.options.find((entry) => entry.id === optionId)
    if (!node || !option) {
      return { attempt, status: 'refused', summary: 'That reply is not on this step.' }
    }
    if (attempt.finishedAt !== null) {
      return { attempt, status: 'refused', summary: 'This visit is already scored.' }
    }
    const before = entry.dialog[index - 1]
    if (before && !attempt.state.dialog.some((record) => record.nodeId === before.id)) {
      return { attempt, status: 'refused', summary: 'Answer the earlier step first.' }
    }
    const minute = nextMinute(attempt.state, entry, 'dialog')
    const updated = await this.store.answerDialog(attempt.id, {
      nodeId,
      optionId,
      at: this.now(),
      minute,
    })
    return { attempt: updated ?? attempt, status: 'applied', summary: `You say: “${option.say}”` }
  }

  async triage(attemptId: string, optionId: string): Promise<WriteResult> {
    const attempt = await this.attemptOrThrow(attemptId)
    const entry = this.scenarioOrThrow(attempt.scenarioId)
    const walkUp = entry.walkUp
    if (!walkUp) {
      return { attempt, status: 'refused', summary: 'No one interrupted this visit.' }
    }
    const option = walkUp.options.find((entry) => entry.id === optionId)
    if (!option) {
      return { attempt, status: 'refused', summary: 'That is not one of the choices.' }
    }
    if (attempt.state.triage) {
      return { attempt, status: 'refused', summary: 'The walk-up has already been triaged.' }
    }
    const actions = attempt.state.reads.length + attempt.state.changes.length
    if (actions < WALK_UP_AFTER) {
      return {
        attempt,
        status: 'refused',
        summary: 'Nobody has interrupted yet — get into the ticket first.',
      }
    }
    if (attempt.finishedAt !== null) {
      return { attempt, status: 'refused', summary: 'This visit is already scored.' }
    }
    const minute = nextMinute(attempt.state, entry, 'walk-up', option.minutes)
    const updated = await this.store.setTriage(attempt.id, {
      walkUpId: walkUp.id,
      optionId,
      at: this.now(),
      minute,
    })
    return {
      attempt: updated ?? attempt,
      status: 'applied',
      summary: option.best
        ? `${option.label}. ${walkUp.note}`
        : `${option.label}. That took ${option.minutes} minutes off the bell.`,
    }
  }

  async tickChecklist(
    attemptId: string,
    item: ChecklistId,
    note?: string,
  ): Promise<AcademyAttemptRecord | null> {
    const attempt = await this.attemptOrThrow(attemptId)
    const entry = this.scenarioOrThrow(attempt.scenarioId)
    const minute = nextMinute(attempt.state, entry, 'checklist')
    return this.store.tickChecklist(attempt.id, item, this.now(), minute, note)
  }

  async score(attemptId: string): Promise<ScoreResult> {
    const attempt = await this.attemptOrThrow(attemptId)
    const entry = this.scenarioOrThrow(attempt.scenarioId)
    const score = scoreAcademyAttempt({ scenario: entry, state: attempt.state })
    const saved = await this.store.saveScore(
      attempt.id,
      score.total,
      JSON.stringify(score),
      this.now(),
    )
    return { attempt: saved ?? attempt, score }
  }

  async attempts(): Promise<AcademyAttemptRecord[]> {
    return this.store.attempts()
  }

  async reset(): Promise<void> {
    await this.store.reset()
  }
}

export type { AcademyScore }
