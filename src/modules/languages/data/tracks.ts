import type { LanguageTrack, PracticeItem, TrackId } from '../types'
import { CSHARP_TRACK } from './csharp'
import { JAVA_TRACK } from './java'
import { PYTHON_TRACK } from './python'

/** Every track, in the order the picker shows them. */
export const TRACKS: readonly LanguageTrack[] = [JAVA_TRACK, CSHARP_TRACK, PYTHON_TRACK]

export function findTrack(id: string): LanguageTrack | null {
  return TRACKS.find((track) => track.id === id) ?? null
}

export function isTrackId(id: string): id is TrackId {
  return TRACKS.some((track) => track.id === id)
}

export function findLesson(track: LanguageTrack, lessonId: string) {
  return track.lessons.find((lesson) => lesson.id === lessonId) ?? null
}

export function findPracticeItem(track: LanguageTrack, itemId: string): PracticeItem | null {
  return track.practice.find((item) => item.id === itemId) ?? null
}

/** Every practice topic once, in the track's own order. */
export function trackTopics(track: LanguageTrack): string[] {
  const seen: string[] = []
  for (const item of track.practice) {
    if (!seen.includes(item.topic)) seen.push(item.topic)
  }
  return seen
}
