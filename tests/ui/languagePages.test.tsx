import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { findTrack } from '../../src/modules/languages/data/tracks'
import type { LanguageStore } from '../../src/modules/languages/persistence/store'
import { LanguageService } from '../../src/modules/languages/service'
import type { LanguageAttempt } from '../../src/modules/languages/types'

const NOW = Date.UTC(2026, 9, 24, 12, 0, 0)

const box = vi.hoisted(() => ({
  attempts: [] as LanguageAttempt[],
  reads: [] as { trackId: 'java' | 'csharp' | 'python'; lessonId: string; readAt: number }[],
}))

const store = {
  attempts: async () => [...box.attempts],
  attemptsFor: async () => [...box.attempts],
  appendAttempt: async (attempt: LanguageAttempt) => {
    box.attempts.unshift(attempt)
  },
  reads: async () => [...box.reads],
  markRead: async (record: (typeof box.reads)[number]) => {
    box.reads = box.reads.filter(
      (entry) => !(entry.trackId === record.trackId && entry.lessonId === record.lessonId),
    )
    box.reads.push(record)
  },
  unmarkRead: async (trackId: string, lessonId: string) => {
    box.reads = box.reads.filter(
      (entry) => !(entry.trackId === trackId && entry.lessonId === lessonId),
    )
  },
  reset: async () => {
    box.attempts.length = 0
    box.reads.length = 0
  },
} as unknown as LanguageStore

const service = new LanguageService(store, () => NOW)

vi.mock('../../src/app/languageService', () => ({
  getLanguageService: async () => service,
}))

import { LanguagePracticePage } from '../../src/modules/languages/ui/PracticePage'
import { LanguageLessonPage } from '../../src/modules/languages/ui/LessonPage'
import { LanguageTrackPage } from '../../src/modules/languages/ui/TrackPage'
import { LanguageTracksPage } from '../../src/modules/languages/ui/IndexPage'

const java = findTrack('java')!
const lesson = java.lessons[0]!
const item = java.practice[0]!
const secondLesson = java.lessons[1]!
const secondItem = java.practice[1]!
const firstChoice = item.choices[0]!
const csharp = findTrack('csharp')!
const python = findTrack('python')!
const csharpFirstLesson = csharp.lessons[0]!.id
const pythonFirstLesson = python.lessons[0]!.id
const csharpFirstItem = csharp.practice[0]!.id
const pythonFirstItem = python.practice[0]!.id

beforeEach(async () => {
  await service.reset()
})

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/languages" element={<LanguageTracksPage />} />
        <Route path="/languages/:trackId" element={<LanguageTrackPage />} />
        <Route path="/languages/:trackId/lessons/:lessonId" element={<LanguageLessonPage />} />
        <Route path="/languages/:trackId/practice/:itemId" element={<LanguagePracticePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('the track picker', () => {
  it('lists all three tracks with their tallies', async () => {
    renderAt('/languages')

    expect(await screen.findByRole('heading', { level: 1, name: 'Language tracks' })).toBeInTheDocument()
    for (const name of ['Java', 'C# / .NET', 'Python']) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument()
    }
    expect(screen.getByText(/of 12 lessons read/)).toBeInTheDocument()
    expect(screen.getByText(/of 15 drills solved/)).toBeInTheDocument()
    expect(screen.getByText(/JDK 21/)).toBeInTheDocument()
  })

  it('gives every track a button to read it and a button to practice it', async () => {
    renderAt('/languages')

    const read = await screen.findAllByRole('link', { name: 'Read the track' })
    const practice = screen.getAllByRole('link', { name: 'Practice' })
    expect(read.map((link) => link.getAttribute('href'))).toEqual([
      `/languages/java/lessons/${lesson.id}`,
      `/languages/csharp/lessons/${csharpFirstLesson}`,
      `/languages/python/lessons/${pythonFirstLesson}`,
    ])
    expect(practice.map((link) => link.getAttribute('href'))).toEqual([
      `/languages/java/practice/${item.id}`,
      `/languages/csharp/practice/${csharpFirstItem}`,
      `/languages/python/practice/${pythonFirstItem}`,
    ])
  })
})

describe('one track', () => {
  it('lists the lessons in order and the drills with their state', async () => {
    renderAt('/languages/java')

    expect(await screen.findByRole('heading', { level: 1, name: 'Java' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Lessons' })).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: `1. ${lesson.title}` }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('Not read yet')).toHaveLength(java.lessons.length)
    expect(screen.getByRole('link', { name: item.title })).toBeInTheDocument()
    expect(screen.getAllByText('Not tried yet')).toHaveLength(java.practice.length)
  })

  it('offers a button that starts the reading and one that starts the drills', async () => {
    renderAt('/languages/java')

    const reading = await screen.findByRole('link', { name: 'Start reading' })
    const practicing = screen.getByRole('link', { name: 'Start practicing' })
    expect(reading).toHaveAttribute('href', `/languages/java/lessons/${lesson.id}`)
    expect(practicing).toHaveAttribute('href', `/languages/java/practice/${item.id}`)
  })

  it('moves both buttons on to the next unfinished step', async () => {
    await service.setLessonRead('java', lesson.id, true)
    const answer = item.choices.find((choice) => choice.correct)!
    await service.submit({ trackId: 'java', itemId: item.id, choice: answer.id })

    renderAt('/languages/java')

    expect(
      await screen.findByRole('link', { name: 'Continue reading' }),
    ).toHaveAttribute('href', `/languages/java/lessons/${secondLesson.id}`)
    expect(screen.getByRole('link', { name: 'Continue practicing' })).toHaveAttribute(
      'href',
      `/languages/java/practice/${secondItem.id}`,
    )
  })

  it('says a drill was tried when it was, without claiming it solved', async () => {
    const wrong = item.choices.find((choice) => !choice.correct)!
    await service.submit({ trackId: 'java', itemId: item.id, choice: wrong.id })

    renderAt('/languages/java')

    expect(await screen.findByText('Tried 1 time')).toBeInTheDocument()
    expect(screen.queryByText(/^Solved/)).not.toBeInTheDocument()
  })

  it('says so when the track does not exist', async () => {
    renderAt('/languages/cobol')
    expect(await screen.findByRole('heading', { level: 1, name: 'No such track' })).toBeInTheDocument()
  })
})

describe('one lesson', () => {
  it('renders the lesson prose, its code and the takeaway', async () => {
    renderAt(`/languages/java/lessons/${lesson.id}`)

    expect(await screen.findByRole('heading', { level: 1, name: lesson.title })).toBeInTheDocument()
    expect(screen.getByText(lesson.summary)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Remember this' })).toBeInTheDocument()
    expect(screen.getByText(lesson.takeaway)).toBeInTheDocument()
    expect(screen.getByText(/Lesson 1 of 4/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark as read' })).toBeInTheDocument()
  })

  it('puts a button under the lesson that opens the practice', async () => {
    renderAt(`/languages/java/lessons/${lesson.id}`)

    expect(
      await screen.findByRole('link', { name: 'Practice this language →' }),
    ).toHaveAttribute('href', `/languages/java/practice/${item.id}`)
  })

  it('marks the lesson read, shows the date, and undoes it', async () => {
    renderAt(`/languages/java/lessons/${lesson.id}`)

    fireEvent.click(await screen.findByRole('button', { name: 'Mark as read' }))

    const undo = await screen.findByRole('button', { name: 'Marked read — undo' })
    expect(screen.getByText(/^Read \w{3} 24$/)).toBeInTheDocument()
    expect(box.reads).toHaveLength(1)

    fireEvent.click(undo)
    await waitFor(() => expect(box.reads).toHaveLength(0))
    expect(await screen.findByRole('button', { name: 'Mark as read' })).toBeInTheDocument()
  })

  it('shows the neighbouring lessons and says so when one is missing', async () => {
    renderAt(`/languages/java/lessons/${lesson.id}`)
    expect(
      await screen.findByRole('link', { name: `${secondLesson.title} →` }),
    ).toBeInTheDocument()

    renderAt('/languages/java/lessons/no-such-lesson')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'No such lesson' }),
    ).toBeInTheDocument()
  })
})

describe('one drill', () => {
  it('keeps the check disabled until an answer is chosen', async () => {
    renderAt(`/languages/java/practice/${item.id}`)

    const check = await screen.findByRole('button', { name: 'Check answer' })
    expect(check).toBeDisabled()

    fireEvent.click(screen.getByRole('radio', { name: firstChoice.label }))
    expect(check).toBeEnabled()
  })

  it('explains a wrong answer, names the right one and prints the rule', async () => {
    const wrong = item.choices.find((choice) => !choice.correct)!
    renderAt(`/languages/java/practice/${item.id}`)

    fireEvent.click(await screen.findByRole('radio', { name: wrong.label }))
    fireEvent.click(screen.getByRole('button', { name: 'Check answer' }))

    expect(await screen.findByRole('heading', { level: 2, name: 'Not quite' })).toBeInTheDocument()
    expect(screen.getByText(wrong.note)).toBeInTheDocument()
    expect(screen.getByText(/Rule to remember/)).toBeInTheDocument()
    expect(screen.getByText(item.rule)).toBeInTheDocument()
    expect(box.attempts[0]?.correct).toBe(false)
  })

  it('says right and offers another try when the answer is correct', async () => {
    const answer = item.choices.find((choice) => choice.correct)!
    renderAt(`/languages/java/practice/${item.id}`)

    fireEvent.click(await screen.findByRole('radio', { name: answer.label }))
    fireEvent.click(screen.getByRole('button', { name: 'Check answer' }))

    expect(await screen.findByRole('heading', { level: 2, name: 'Right' })).toBeInTheDocument()
    expect(box.attempts[0]?.correct).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Try it again' }))
    expect(await screen.findByRole('button', { name: 'Check answer' })).toBeDisabled()
    // The attempt is on the record even after the form is cleared.
    expect(box.attempts).toHaveLength(1)
  })

  it('says so when the drill does not exist', async () => {
    renderAt('/languages/java/practice/no-such-drill')
    expect(await screen.findByRole('heading', { level: 1, name: 'No such drill' })).toBeInTheDocument()
  })
})
