import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModuleLessonView, ModuleView } from '../../src/app/curriculumService'
import {
  CURRICULUM,
  emptyEvidence,
  moduleProgress,
  type ModuleEvidence,
} from '../../src/domain/curriculum/modules'
import { lessonFor } from '../../src/domain/curriculum/lessons'
import { ModuleLessonPage } from '../../src/ui/routes/ModuleLessonPage'

vi.mock('../../src/app/curriculumService', () => ({
  loadModuleLesson: vi.fn(),
}))

vi.mock('../../src/app/practiceService', () => ({
  startModulePractice: vi.fn(),
}))

function moduleView(moduleId: string, evidence: Partial<ModuleEvidence> = {}): ModuleView {
  const module = CURRICULUM.find((entry) => entry.id === moduleId)
  if (!module) {
    throw new Error(`No module ${moduleId}`)
  }

  const progress = moduleProgress(module, { ...emptyEvidence(), ...evidence })
  const requirements = progress.requirements.map((entry) => ({
    ...entry,
    progressLabel: `${Math.min(entry.current, entry.target)} / ${entry.target}`,
  }))

  return {
    id: module.id,
    number: module.number,
    title: module.title,
    summary: module.summary,
    status: module.status,
    met: progress.met,
    total: progress.total,
    percent: progress.percent,
    complete: progress.complete,
    xp: module.scope.length > 0 ? 40 : 0,
    practice: lessonFor(module.id)?.practice.kind ?? null,
    nextRequirement: requirements.find((entry) => !entry.met) ?? null,
    requirements,
    note: module.note ?? null,
  }
}

function lessonView(moduleId: string, evidence: Partial<ModuleEvidence> = {}): ModuleLessonView {
  const lesson = lessonFor(moduleId)
  if (!lesson) {
    throw new Error(`No lesson for ${moduleId}`)
  }
  return { module: moduleView(moduleId, evidence), lesson }
}

function renderLesson(moduleId = 'first-shift') {
  return render(
    <MemoryRouter initialEntries={[`/modules/${moduleId}`]}>
      <Routes>
        <Route path="/modules/:moduleId" element={<ModuleLessonPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(async () => {
  const service = await import('../../src/app/curriculumService')
  vi.mocked(service.loadModuleLesson).mockResolvedValue(lessonView('first-shift'))
  const practice = await import('../../src/app/practiceService')
  vi.mocked(practice.startModulePractice).mockResolvedValue({ sessionId: 'session-1' } as never)
})

describe('module lesson page', () => {
  it('teaches the concept, the example, and where the tickets are', async () => {
    renderLesson()

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Your First Shift' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Module 01 · Lesson/)).toBeInTheDocument()

    // The idea: every paragraph of the lesson, in order.
    const lesson = lessonFor('first-shift')
    expect(lesson).not.toBeNull()
    for (const paragraph of lesson?.concept ?? []) {
      expect(screen.getByText(paragraph)).toBeInTheDocument()
    }

    // One worked example, with its steps in the order they happen.
    expect(
      screen.getByRole('heading', { level: 2, name: 'One worked example' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: lesson?.example.title ?? '' })).toBeInTheDocument()
    const steps = screen.getAllByRole('listitem').filter((item) => item.closest('ol'))
    expect(steps).toHaveLength(lesson?.example.steps.length ?? 0)
    expect(steps[0]).toHaveTextContent(lesson?.example.steps[0]?.action ?? '')
    // A command is set as code, not left with its markers in the sentence.
    const command = screen.getByText('get-account mchen')
    expect(command.tagName).toBe('CODE')
    expect(steps[0]).not.toHaveTextContent('`')

    // The way in: this module's own ticket, the family it starts on, and the queue.
    expect(screen.getByRole('button', { name: 'Practise this module' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Accounts tickets' })).toHaveAttribute(
      'href',
      '/practice?family=PWD-01',
    )
    expect(screen.getByRole('link', { name: 'Whole queue' })).toHaveAttribute('href', '/practice')
    expect(screen.getByRole('link', { name: '← All modules' })).toHaveAttribute('href', '/')
    // Only a lesson that declares a flow gets the checklist.
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('walks Remote Desktop from connecting to closing with the evidence it leaves', async () => {
    const service = await import('../../src/app/curriculumService')
    vi.mocked(service.loadModuleLesson).mockResolvedValue(lessonView('remote-desktop'))

    renderLesson('remote-desktop')

    const flow = lessonFor('remote-desktop')?.flow
    expect(flow).toBeDefined()
    if (!flow) {
      return
    }

    const section = await screen.findByRole('region', { name: flow.title })
    expect(
      screen.getByRole('heading', { level: 1, name: 'Remote Desktop' }),
    ).toBeInTheDocument()

    // One checkbox per step, and every step states what the log should show.
    const boxes = within(section).getAllByRole('checkbox')
    expect(boxes).toHaveLength(flow.steps.length)
    expect(
      within(section).getByText(`0 of ${flow.steps.length} checked`),
    ).toBeInTheDocument()
    expect(within(section).getByText(/A session opened on that machine/)).toBeInTheDocument()
    expect(
      within(section).getByText('Before you close', { selector: 'span' }),
    ).toBeInTheDocument()

    fireEvent.click(boxes[0]!)
    expect(
      within(section).getByText(`1 of ${flow.steps.length} checked`),
    ).toBeInTheDocument()
    // Checking is reading guidance, not tracked progress: the log is scored.
    expect(within(section).getByText(/not scored/)).toBeInTheDocument()
  })

  it('opens a ticket for the module and goes straight to it', async () => {
    render(
      <MemoryRouter initialEntries={['/modules/first-shift']}>
        <Routes>
          <Route path="/modules/:moduleId" element={<ModuleLessonPage />} />
          <Route path="/ticket/:sessionId" element={<p>ticket workspace</p>} />
        </Routes>
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Practise this module' }))

    const practice = await import('../../src/app/practiceService')
    expect(practice.startModulePractice).toHaveBeenCalledWith('first-shift')
    expect(await screen.findByText('ticket workspace')).toBeInTheDocument()
  })

  it('shows the exit criteria with the progress already made', async () => {
    const service = await import('../../src/app/curriculumService')
    vi.mocked(service.loadModuleLesson).mockResolvedValue(
      lessonView('first-shift', { passedAttempts: 1 }),
    )

    renderLesson()

    expect(await screen.findByText('Close one ticket with a passing score')).toBeInTheDocument()
    // One of three requirements met, shown in the header and beside the row.
    expect(screen.getByText('1/3 requirements')).toBeInTheDocument()
    expect(screen.getAllByText('1 / 1').length).toBeGreaterThan(0)
    expect(screen.getByText('40 XP earned on these tickets')).toBeInTheDocument()
  })

  it('offers the job targets for the module judged on listings', async () => {
    const service = await import('../../src/app/curriculumService')
    vi.mocked(service.loadModuleLesson).mockResolvedValue(lessonView('mock-interview'))

    renderLesson('mock-interview')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Mock Interview' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Job targets' })).toHaveAttribute('href', '/targets')
    expect(screen.queryByRole('link', { name: /tickets$/ })).not.toBeInTheDocument()
  })

  it('says so when a module has no lesson, and offers the way back', async () => {
    const service = await import('../../src/app/curriculumService')
    vi.mocked(service.loadModuleLesson).mockResolvedValue(null)

    renderLesson('voicemails')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Lesson not available' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to the modules' })).toHaveAttribute('href', '/')
  })

  it('reports a failure instead of a blank page', async () => {
    const service = await import('../../src/app/curriculumService')
    vi.mocked(service.loadModuleLesson).mockRejectedValue(new Error('IndexedDB is unavailable'))

    renderLesson()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('IndexedDB is unavailable')
  })
})
