import type {
  LanguageAttempt,
  LanguageOverview,
  LanguageTrack,
  LessonEntry,
  LessonRead,
  PracticeEntry,
  TrackProgress,
  TrackSummary,
  TrackView,
} from '../types'

/**
 * Progress is folded from the two tables rather than stored as a flag, so
 * clearing an attempt or importing an older backup moves every number on the
 * page.
 */
export function trackProgress(
  track: LanguageTrack,
  attempts: readonly LanguageAttempt[],
  reads: readonly LessonRead[],
): TrackProgress {
  const own = attemptsOf(track, attempts)
  const lessonIds = new Set(track.lessons.map((lesson) => lesson.id))
  const readLessons = new Set(
    reads.map((read) => read.lessonId).filter((lessonId) => lessonIds.has(lessonId)),
  )

  const attempted = new Set(own.map((attempt) => attempt.itemId))
  const solved = new Set(own.filter((attempt) => attempt.correct).map((attempt) => attempt.itemId))

  return {
    lessonsRead: readLessons.size,
    lessonsTotal: track.lessons.length,
    practiceAttempted: attempted.size,
    practiceSolved: solved.size,
    practiceTotal: track.practice.length,
  }
}

function attemptsOf(
  track: LanguageTrack,
  attempts: readonly LanguageAttempt[],
): LanguageAttempt[] {
  return attempts.filter((attempt) => attempt.trackId === track.id)
}

export function lessonEntries(
  track: LanguageTrack,
  reads: readonly LessonRead[],
): LessonEntry[] {
  return track.lessons.map((lesson) => {
    const read = reads.find((entry) => entry.lessonId === lesson.id)
    return { lesson, readAt: read?.readAt ?? null }
  })
}

export function practiceEntries(
  track: LanguageTrack,
  attempts: readonly LanguageAttempt[],
): PracticeEntry[] {
  const own = attemptsOf(track, attempts)
  return track.practice.map((item) => {
    const itemAttempts = own.filter((attempt) => attempt.itemId === item.id)
    return {
      item,
      attempts: itemAttempts.length,
      solved: itemAttempts.some((attempt) => attempt.correct),
      lastAttemptAt:
        itemAttempts.length === 0
          ? null
          : Math.max(...itemAttempts.map((attempt) => attempt.createdAt)),
    }
  })
}

export function summarize(
  tracks: readonly LanguageTrack[],
  attempts: readonly LanguageAttempt[],
  reads: readonly LessonRead[],
): LanguageOverview {
  const summaries: TrackSummary[] = tracks.map((track) => ({
    track,
    progress: trackProgress(track, attempts, reads),
  }))

  const total = (pick: (progress: TrackProgress) => number) =>
    summaries.reduce((sum, entry) => sum + pick(entry.progress), 0)

  return {
    tracks: summaries,
    lessonsRead: total((progress) => progress.lessonsRead),
    lessonsTotal: total((progress) => progress.lessonsTotal),
    practiceSolved: total((progress) => progress.practiceSolved),
    practiceTotal: total((progress) => progress.practiceTotal),
  }
}

export function trackView(
  track: LanguageTrack,
  attempts: readonly LanguageAttempt[],
  reads: readonly LessonRead[],
): TrackView {
  const lessonIds = new Set(track.lessons.map((lesson) => lesson.id))
  return {
    track,
    progress: trackProgress(track, attempts, reads),
    reads: reads.filter((read) => lessonIds.has(read.lessonId)),
    attempts: attemptsOf(track, attempts),
  }
}
