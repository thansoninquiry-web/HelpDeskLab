// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { findTrack, TRACKS } from '../../../src/modules/languages/data/tracks'
import {
  lessonEntries,
  practiceEntries,
  summarize,
  trackProgress,
  trackView,
} from '../../../src/modules/languages/logic/progress'
import { LanguageStore } from '../../../src/modules/languages/persistence/store'
import { LanguageService } from '../../../src/modules/languages/service'
import type {
  LanguageLesson,
  LanguageTrack,
  PracticeChoice,
  PracticeItem,
} from '../../../src/modules/languages/types'
import { runMigrations } from '../../../src/persistence/migrations'
import { createSqliteDriver, type SqliteDriver } from '../../../src/persistence/sqlite'
import { loadWasmBinary } from '../../helpers/sqlite'

const NOW = Date.UTC(2026, 9, 24, 12, 0, 0)

function track(id: string): LanguageTrack {
  const found = findTrack(id)
  if (!found) throw new Error(`missing track ${id}`)
  return found
}

// The tests index into arrays the compiler considers open-ended; these helpers
// fail with the reason rather than a TypeError in the middle of an assertion.
function lessonAt(entry: LanguageTrack, index = 0): LanguageLesson {
  const lesson = entry.lessons[index]
  if (!lesson) throw new Error(`missing lesson ${index} in ${entry.id}`)
  return lesson
}

function itemAt(entry: LanguageTrack, index = 0): PracticeItem {
  const item = entry.practice[index]
  if (!item) throw new Error(`missing practice item ${index} in ${entry.id}`)
  return item
}

function choiceWhere(item: PracticeItem, correct: boolean): PracticeChoice {
  const choice = item.choices.find((entry) => entry.correct === correct)
  if (!choice) throw new Error(`no ${correct ? 'right' : 'wrong'} answer in ${item.id}`)
  return choice
}

describe('the track bank', () => {
  it('holds the three tracks, each with lessons and drills', () => {
    expect(TRACKS.map((entry) => entry.id)).toEqual(['java', 'csharp', 'python'])
    for (const entry of TRACKS) {
      expect(entry.name.length).toBeGreaterThan(0)
      expect(entry.runtime.length).toBeGreaterThan(0)
      expect(entry.blurb.length).toBeGreaterThan(40)
      expect(entry.canDo.length).toBeGreaterThanOrEqual(3)
      expect(entry.lessons.length).toBeGreaterThanOrEqual(4)
      expect(entry.practice.length).toBeGreaterThanOrEqual(5)
    }
  })

  it('gives every lesson a shape a page can render', () => {
    for (const entry of TRACKS) {
      const ids = new Set<string>()
      for (const lesson of entry.lessons) {
        expect(lesson.id).toBe(lesson.id.toLowerCase())
        expect(ids.has(lesson.id)).toBe(false)
        ids.add(lesson.id)
        expect(lesson.title.length).toBeGreaterThan(0)
        expect(lesson.summary.length).toBeGreaterThan(40)
        expect(lesson.minutes).toBeGreaterThan(0)
        expect(lesson.sections.length).toBeGreaterThanOrEqual(3)
        expect(lesson.takeaway.length).toBeGreaterThan(40)
        for (const section of lesson.sections) {
          expect(section.body.length).toBeGreaterThan(0)
          expect(section.body.every((paragraph) => paragraph.length > 20)).toBe(true)
          if (section.code) {
            expect(section.code.source.length).toBeGreaterThan(20)
          }
        }
        // A lesson without a code sample is a page of prose pretending to be a
        // language lesson, so each one has to show the runtime.
        expect(lesson.sections.some((section) => section.code)).toBe(true)
      }
    }
  })

  it('gives every drill exactly one right answer with a reason for each option', () => {
    for (const entry of TRACKS) {
      const ids = new Set<string>()
      for (const item of entry.practice) {
        expect(ids.has(item.id)).toBe(false)
        ids.add(item.id)
        expect(item.topic.length).toBeGreaterThan(0)
        expect(item.question.length).toBeGreaterThan(10)
        expect(item.code.length).toBeGreaterThan(20)
        expect(item.rule.length).toBeGreaterThan(30)
        expect(item.choices.length).toBeGreaterThanOrEqual(3)
        expect(item.choices.filter((choice) => choice.correct)).toHaveLength(1)

        const choiceIds = new Set(item.choices.map((choice) => choice.id))
        expect(choiceIds.size).toBe(item.choices.length)
        for (const choice of item.choices) {
          expect(choice.label.length).toBeGreaterThan(0)
          // Every option explains itself: the wrong ones are the teaching.
          expect(choice.note.length).toBeGreaterThan(30)
        }
      }
    }
  })

  it('asks a different question in every drill', () => {
    const seen = new Set<string>()
    for (const entry of TRACKS) {
      for (const item of entry.practice) {
        expect(seen.has(item.title)).toBe(false)
        seen.add(item.title)
      }
    }
    expect(seen.size).toBe(TRACKS.reduce((total, entry) => total + entry.practice.length, 0))
  })
})

describe('progress folding', () => {
  const java = track('java')
  const firstLesson = lessonAt(java)
  const firstItem = itemAt(java)

  it('counts a lesson read once, however many rows share it', () => {
    const progress = trackProgress(
      java,
      [],
      [
        { lessonId: firstLesson.id, readAt: NOW },
        { lessonId: firstLesson.id, readAt: NOW + 1 },
      ],
    )
    expect(progress.lessonsRead).toBe(1)
    expect(progress.lessonsTotal).toBe(java.lessons.length)
  })

  it('counts a solved drill once and a wrong answer as an attempt', () => {
    const progress = trackProgress(
      java,
      [
        {
          id: 'a',
          trackId: 'java',
          itemId: firstItem.id,
          choice: firstItem.choices.find((choice) => choice.correct)!.id,
          correct: true,
          createdAt: NOW,
        },
        {
          id: 'b',
          trackId: 'java',
          itemId: firstItem.id,
          choice: firstItem.choices.find((choice) => !choice.correct)!.id,
          correct: false,
          createdAt: NOW + 1,
        },
        {
          id: 'c',
          trackId: 'java',
          itemId: firstItem.id,
          choice: firstItem.choices.find((choice) => choice.correct)!.id,
          correct: true,
          createdAt: NOW + 2,
        },
      ],
      [],
    )
    expect(progress.practiceAttempted).toBe(1)
    expect(progress.practiceSolved).toBe(1)
  })

  it('ignores other tracks’ rows when folding one track', () => {
    const csharp = track('csharp')
    const reads = [{ lessonId: lessonAt(csharp).id, readAt: NOW }]
    expect(trackProgress(java, [], reads).lessonsRead).toBe(0)
    expect(trackProgress(csharp, [], reads).lessonsRead).toBe(1)
  })

  it('lists lessons in course order with their read mark', () => {
    const entries = lessonEntries(java, [{ lessonId: firstLesson.id, readAt: NOW }])
    expect(entries.map((entry) => entry.lesson.id)).toEqual(java.lessons.map((lesson) => lesson.id))
    expect(entries[0]?.readAt).toBe(NOW)
    expect(entries[1]?.readAt).toBeNull()
  })

  it('summarises every track once', () => {
    const overview = summarize(TRACKS, [], [])
    expect(overview.tracks).toHaveLength(3)
    expect(overview.lessonsRead).toBe(0)
    expect(overview.lessonsTotal).toBe(
      TRACKS.reduce((total, entry) => total + entry.lessons.length, 0),
    )
    expect(overview.practiceTotal).toBe(
      TRACKS.reduce((total, entry) => total + entry.practice.length, 0),
    )
  })

  it('records the latest try on a practice row', () => {
    const rows = practiceEntries(java, [
      {
        id: 'a',
        trackId: 'java',
        itemId: firstItem.id,
        choice: 'x',
        correct: false,
        createdAt: NOW,
      },
      {
        id: 'b',
        trackId: 'java',
        itemId: firstItem.id,
        choice: 'y',
        correct: true,
        createdAt: NOW + 5,
      },
    ])
    expect(rows[0]?.attempts).toBe(2)
    expect(rows[0]?.solved).toBe(true)
    expect(rows[0]?.lastAttemptAt).toBe(NOW + 5)
    expect(rows[1]?.attempts).toBe(0)
  })
})

describe('the language service', () => {
  let db: SqliteDriver
  let service: LanguageService

  beforeEach(async () => {
    db = await createSqliteDriver(undefined, { wasmBinary: loadWasmBinary() })
    runMigrations(db)
    const store = new LanguageStore({
      read: async (operation) => operation(db),
      write: async (operation) => operation(db),
    })
    service = new LanguageService(store, () => NOW)
  })

  it('scores the right answer and stores the attempt', async () => {
    const item = itemAt(track('java'))
    const answer = choiceWhere(item, true)

    const outcome = await service.submit({
      trackId: 'java',
      itemId: item.id,
      choice: answer.id,
    })

    expect(outcome.correct).toBe(true)
    expect(outcome.answer.id).toBe(answer.id)
    expect(outcome.attempt.createdAt).toBe(NOW)

    const view = await service.track('java')
    expect(view?.attempts).toHaveLength(1)
    expect(view?.progress.practiceSolved).toBe(1)
  })

  it('explains a wrong answer with the right one, and does not count it solved', async () => {
    const item = itemAt(track('python'))
    const wrong = choiceWhere(item, false)

    const outcome = await service.submit({
      trackId: 'python',
      itemId: item.id,
      choice: wrong.id,
    })

    expect(outcome.correct).toBe(false)
    expect(outcome.answer.correct).toBe(true)
    expect(outcome.answer.note.length).toBeGreaterThan(30)

    const view = await service.track('python')
    expect(view?.progress.practiceAttempted).toBe(1)
    expect(view?.progress.practiceSolved).toBe(0)
  })

  it('marks a lesson read and takes the mark back', async () => {
    const lesson = lessonAt(track('java'))

    await service.setLessonRead('java', lesson.id, true)
    let view = await service.track('java')
    expect(view?.reads).toHaveLength(1)
    expect(view?.progress.lessonsRead).toBe(1)

    await service.setLessonRead('java', lesson.id, false)
    view = await service.track('java')
    expect(view?.reads).toHaveLength(0)
    expect(view?.progress.lessonsRead).toBe(0)
  })

  it('refuses a track, a lesson, an item or a choice that is not in the bank', async () => {
    await expect(service.track('cobol')).resolves.toBeNull()
    await expect(service.setLessonRead('java', 'no-such-lesson', true)).rejects.toThrow(
      /Unknown lesson/,
    )
    await expect(
      service.submit({ trackId: 'java', itemId: 'no-such-item', choice: 'x' }),
    ).rejects.toThrow(/Unknown practice item/)
    const item = itemAt(track('java'))
    await expect(
      service.submit({ trackId: 'java', itemId: item.id, choice: 'no-such-choice' }),
    ).rejects.toThrow(/Unknown choice/)
  })

  it('clears one track without touching the others', async () => {
    const javaItem = itemAt(track('java'))
    const pythonItem = itemAt(track('python'))

    await service.submit({
      trackId: 'java',
      itemId: javaItem.id,
      choice: javaItem.choices.find((choice) => choice.correct)!.id,
    })
    await service.submit({
      trackId: 'python',
      itemId: pythonItem.id,
      choice: pythonItem.choices.find((choice) => choice.correct)!.id,
    })

    await service.reset('java')

    const overview = await service.overview()
    const java = overview.tracks.find((entry) => entry.track.id === 'java')
    const python = overview.tracks.find((entry) => entry.track.id === 'python')
    expect(java?.progress.practiceSolved).toBe(0)
    expect(python?.progress.practiceSolved).toBe(1)
  })

  it('gives a page the rows it renders, from one track view', async () => {
    const java = track('java')
    const view = trackView(java, [], [])
    expect(view.track.id).toBe('java')
    expect(view.reads).toEqual([])
    expect(view.progress.practiceTotal).toBe(java.practice.length)
  })
})
