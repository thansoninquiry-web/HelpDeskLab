/**
 * The three language tracks, and the shape of everything in them.
 *
 * A track is a short course and a drill in one folder: lessons explain how the
 * runtime actually behaves, and practice asks a question about a snippet whose
 * answer is a fact about that runtime rather than a matter of taste. Nothing is
 * compiled or executed — the shipped policy forbids an evaluator, and every
 * snippet here is small enough that reading it is the skill being practised.
 */

export type TrackId = 'java' | 'csharp' | 'python'

/** How hard the question is for someone who has read the track's lessons. */
export type PracticeLevel = 'warm-up' | 'core' | 'sharp'

export interface CodeSample {
  source: string
  /** What the reader is looking at, when the snippet needs an introduction. */
  caption?: string
}

export interface LessonSection {
  heading?: string
  body: readonly string[]
  code?: CodeSample
  /** A caution that belongs beside the section rather than in the prose. */
  note?: string
}

export interface LanguageLesson {
  id: string
  title: string
  summary: string
  /** An honest reading time in minutes. */
  minutes: number
  sections: readonly LessonSection[]
  /** The one sentence the lesson should leave behind. */
  takeaway: string
}

/** One answer, with the reason it is or is not right. */
export interface PracticeChoice {
  id: string
  label: string
  note: string
  correct: boolean
}

export interface PracticeItem {
  id: string
  title: string
  /** The language feature the question turns on, for the track's filter. */
  topic: string
  level: PracticeLevel
  /** The question itself, asked once. */
  question: string
  code: string
  choices: readonly PracticeChoice[]
  /** The rule to remember, shown after answering. */
  rule: string
  /** The corrected form, when seeing it written out is the clearest answer. */
  reference?: string
}

export interface LanguageTrack {
  id: TrackId
  name: string
  /** The runtime the snippets are written against. */
  runtime: string
  /** One line for the picker. */
  blurb: string
  /** What finishing the track leaves a learner able to do. */
  canDo: readonly string[]
  lessons: readonly LanguageLesson[]
  practice: readonly PracticeItem[]
}

export interface LanguageAttempt {
  id: string
  trackId: TrackId
  itemId: string
  choice: string
  correct: boolean
  createdAt: number
}

export interface TrackProgress {
  lessonsRead: number
  lessonsTotal: number
  practiceAttempted: number
  practiceSolved: number
  practiceTotal: number
}

export interface TrackSummary {
  track: LanguageTrack
  progress: TrackProgress
}

export interface LessonRead {
  lessonId: string
  readAt: number
}

export interface TrackView {
  track: LanguageTrack
  progress: TrackProgress
  reads: readonly LessonRead[]
  attempts: readonly LanguageAttempt[]
}

export interface LanguageOverview {
  tracks: readonly TrackSummary[]
  lessonsRead: number
  lessonsTotal: number
  practiceSolved: number
  practiceTotal: number
}

export interface PracticeSubmission {
  trackId: TrackId
  itemId: string
  choice: string
}

export interface PracticeOutcome {
  attempt: LanguageAttempt
  correct: boolean
  /** The right answer and its note, so the page needs no second copy. */
  answer: PracticeChoice
  item: PracticeItem
}

/** One row on a track page: a lesson with whether it has been read. */
export interface LessonEntry {
  lesson: LanguageLesson
  readAt: number | null
}

/** One row on a track page: a practice item with its latest state. */
export interface PracticeEntry {
  item: PracticeItem
  attempts: number
  solved: boolean
  lastAttemptAt: number | null
}
