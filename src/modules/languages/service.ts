import { findPracticeItem, findTrack, TRACKS } from './data/tracks'
import { summarize, trackView } from './logic/progress'
import type { LanguageStore } from './persistence/store'
import type {
  LanguageAttempt,
  LanguageOverview,
  PracticeChoice,
  PracticeItem,
  PracticeOutcome,
  PracticeSubmission,
  TrackId,
  TrackView,
} from './types'

/**
 * The module's use cases, written against the store rather than a page.
 *
 * The answer key is the item's own data, and the attempt is scored when it is
 * written, so a page cannot disagree with the bank and a stale result cannot be
 * shown after a reload.
 */
export class LanguageService {
  private readonly store: LanguageStore
  private readonly clock: () => number

  constructor(store: LanguageStore, clock: () => number = () => Date.now()) {
    this.store = store
    this.clock = clock
  }

  async overview(): Promise<LanguageOverview> {
    const [attempts, reads] = await Promise.all([this.store.attempts(), this.store.reads()])
    return summarize(TRACKS, attempts, reads)
  }

  async track(id: string): Promise<TrackView | null> {
    const track = findTrack(id)
    if (!track) return null
    const [attempts, reads] = await Promise.all([this.store.attempts(), this.store.reads()])
    return trackView(track, attempts, reads)
  }

  /** Marks a lesson read, or takes the mark back. */
  async setLessonRead(trackId: TrackId, lessonId: string, read: boolean): Promise<void> {
    const track = findTrack(trackId)
    if (!track || !track.lessons.some((lesson) => lesson.id === lessonId)) {
      throw new Error(`Unknown lesson: ${trackId}/${lessonId}`)
    }
    if (read) {
      await this.store.markRead({ trackId, lessonId, readAt: this.clock() })
    } else {
      await this.store.unmarkRead(trackId, lessonId)
    }
  }

  /**
   * Scores one answer. The outcome carries the right choice and its note, so the
   * result panel can explain a miss without owning a second copy of the key.
   */
  async submit(submission: PracticeSubmission): Promise<PracticeOutcome> {
    const track = findTrack(submission.trackId)
    if (!track) {
      throw new Error(`Unknown language track: ${submission.trackId}`)
    }
    const item = findPracticeItem(track, submission.itemId)
    if (!item) {
      throw new Error(`Unknown practice item: ${submission.trackId}/${submission.itemId}`)
    }

    const chosen = choiceOf(item, submission.choice)
    const answer = correctChoice(item)
    const correct = chosen.id === answer.id
    const createdAt = this.clock()

    const attempt: LanguageAttempt = {
      id: newId(`${submission.trackId}/${item.id}`, createdAt),
      trackId: submission.trackId,
      itemId: item.id,
      choice: chosen.id,
      correct,
      createdAt,
    }
    await this.store.appendAttempt(attempt)

    return { attempt, correct, answer, item }
  }

  async reset(trackId?: TrackId): Promise<void> {
    await this.store.reset(trackId)
  }
}

function choiceOf(item: PracticeItem, id: string): PracticeChoice {
  const choice = item.choices.find((entry) => entry.id === id)
  if (!choice) {
    throw new Error(`Unknown choice for ${item.id}: ${id}`)
  }
  return choice
}

function correctChoice(item: PracticeItem): PracticeChoice {
  const choice = item.choices.find((entry) => entry.correct)
  if (!choice) {
    // The bank test refuses this at build time; failing loudly here means a
    // hand-edited item cannot silently score every attempt wrong.
    throw new Error(`The practice item has no correct choice: ${item.id}`)
  }
  return choice
}

function newId(prefix: string, createdAt: number): string {
  const random = globalThis.crypto?.randomUUID?.()
  if (random) {
    return `${prefix}:${random}`
  }
  return `${prefix}:${createdAt}:${Math.random().toString(36).slice(2, 10)}`
}
