import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CurriculumView, ModuleView } from '../../src/app/curriculumService'
import {
  CURRICULUM,
  emptyEvidence,
  moduleProgress,
  type ModuleEvidence,
} from '../../src/domain/curriculum/modules'
import { lessonFor } from '../../src/domain/curriculum/lessons'
import { DashboardPage } from '../../src/ui/routes/DashboardPage'

vi.mock('../../src/app/curriculumService', () => ({
  loadCurriculum: vi.fn(),
}))

vi.mock('../../src/app/practiceService', () => ({
  startModulePractice: vi.fn(),
}))

function buildView(input: Partial<ModuleEvidence> = {}): CurriculumView {
  const evidence: ModuleEvidence = { ...emptyEvidence(), ...input }
  const progressById: Record<string, ReturnType<typeof moduleProgress>> = {}

  const modules: ModuleView[] = CURRICULUM.map((module) => {
    const progress = moduleProgress(module, evidence)
    progressById[module.id] = progress
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
  })

  const playable = modules.filter((module) => module.status === 'playable')
  const met = playable.reduce((total, module) => total + module.met, 0)
  const total = playable.reduce((sum, module) => sum + module.total, 0)
  const next = playable.find((module) => !module.complete) ?? null

  return {
    modules,
    playable: playable.length,
    complete: playable.filter((module) => module.complete).length,
    met,
    total,
    percent: total === 0 ? 0 : Math.floor((met / total) * 100),
    next: next && progressById[next.id] ? next : null,
  }
}

function renderPage() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  )
}

beforeEach(async () => {
  const service = await import('../../src/app/curriculumService')
  vi.mocked(service.loadCurriculum).mockResolvedValue(buildView())
  const practice = await import('../../src/app/practiceService')
  vi.mocked(practice.startModulePractice).mockResolvedValue({ sessionId: 'session-1' } as never)
})

describe('Dashboard modules', () => {
  it('lists the nineteen course modules in order', async () => {
    renderPage()

    expect(await screen.findByText('19 playable · 19 total')).toBeInTheDocument()

    const items = await screen.findAllByRole('listitem')
    const moduleItems = items.filter((item) => item.querySelector('h3'))
    expect(moduleItems).toHaveLength(19)
    expect(moduleItems[0]).toHaveTextContent('Your First Shift')
    expect(moduleItems[6]).toHaveTextContent('Directory (Active Directory)')
    expect(moduleItems[15]).toHaveTextContent('Mock Interview')
    expect(moduleItems[16]).toHaveTextContent('Intune: Device Compliance')
    expect(moduleItems[18]).toHaveTextContent('Intune: Device Lifecycle')
  })

  it('shows Remote Desktop as a module to work through, with its own requirements', async () => {
    renderPage()

    const toggle = await screen.findByRole('button', { name: /Remote Desktop/ })
    expect(toggle).toHaveTextContent('Not started')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Open a support session to a user’s machine')).toBeInTheDocument()
    expect(screen.getByText('Read the machine before you change it')).toBeInTheDocument()
    expect(
      screen.getByText('Record what you changed while you were on the machine'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Not in this build/i)).not.toBeInTheDocument()
  })

  it('opens the next unfinished module and shows its requirements', async () => {
    renderPage()

    const toggle = await screen.findByRole('button', { name: /Your First Shift/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Close one ticket with a passing score')).toBeInTheDocument()
    expect(screen.getByText('Leave a troubleshooting note in your own words')).toBeInTheDocument()
    expect(screen.getAllByText('0 / 1').length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: 'Lesson' })).toHaveAttribute(
      'href',
      '/modules/first-shift',
    )
    expect(screen.getByRole('button', { name: 'Practise' })).toBeInTheDocument()
  })

  it('starts the module\'s own ticket instead of the whole queue', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Practise' }))

    const practice = await import('../../src/app/practiceService')
    expect(practice.startModulePractice).toHaveBeenCalledWith('first-shift')
  })

  it('collapses and reopens a module from its heading button', async () => {
    renderPage()

    const toggle = await screen.findByRole('button', { name: /Your First Shift/ })
    fireEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Close one ticket with a passing score')).not.toBeInTheDocument()

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Close one ticket with a passing score')).toBeInTheDocument()
  })

  it('lists Voicemails among the modules that can be worked', async () => {
    renderPage()

    expect(await screen.queryAllByText('Planned')).toHaveLength(0)

    fireEvent.click(await screen.findByRole('button', { name: /Voicemails/ }))

    expect(screen.getByText('Close a ticket that arrived as a voicemail')).toBeInTheDocument()
    expect(screen.getByText('Ring the caller back from the message')).toBeInTheDocument()
    expect(screen.queryByText(/Not in this build/i)).not.toBeInTheDocument()
    // A playable module carries a way in: the lesson, and the Practise button.
    const lessonLinks = screen
      .getAllByRole('link', { name: 'Lesson' })
      .map((link) => link.getAttribute('href'))
    expect(lessonLinks).toContain('/modules/voicemails')
  })

  it('marks completed modules and opens the next one instead', async () => {
    const service = await import('../../src/app/curriculumService')
    vi.mocked(service.loadCurriculum).mockResolvedValue(
      buildView({ passedAttempts: 3, troubleshootingNotes: 3, customerNotes: 2, resolutionNotes: 1 }),
    )
    renderPage()

    expect(await screen.findAllByText('Complete')).toHaveLength(2)
    const firstModule = screen.getByRole('button', { name: /Your First Shift/ })
    expect(firstModule).toHaveTextContent('Complete')
    expect(firstModule).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: /The Ticket Queue/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  it('reports a loader failure instead of an empty list', async () => {
    const service = await import('../../src/app/curriculumService')
    vi.mocked(service.loadCurriculum).mockRejectedValue(new Error('IndexedDB is unavailable'))

    renderPage()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('IndexedDB is unavailable')
    expect(screen.queryAllByRole('button', { name: /Your First Shift/ })).toHaveLength(0)
  })
})
