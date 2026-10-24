import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TargetsOverview } from '../../src/app/targetsService'
import { JobTargetsPage } from '../../src/ui/routes/JobTargetsPage'

vi.mock('../../src/app/settingsService', () => ({
  loadTargetsFilter: vi.fn(),
  saveTargetsFilter: vi.fn(),
}))

vi.mock('../../src/app/targetsService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/app/targetsService')>()),
  loadTargetsOverview: vi.fn(),
  createJobTarget: vi.fn(),
  updateJobTargetStatus: vi.fn(),
  deleteJobTarget: vi.fn(),
  createShareSafeExport: vi.fn(),
}))

const overview: TargetsOverview = {
  targets: [
    {
      id: 'target-1',
      company: 'Northwind Support',
      title: 'Tier 1 Service Desk Analyst',
      url: 'https://example.com/jobs/1',
      appliedOn: '2026-10-01',
      status: 'applied',
      createdAt: 1_760_000_000_000,
      updatedAt: 1_760_000_000_000,
      descriptionPreview: 'Reset passwords, check DNS, and keep the ticket notes current.',
      skills: [
        {
          id: 'password-accounts',
          label: 'Passwords and account access',
          mentions: 2,
          families: ['PWD-01'],
          tools: ['reset-password'],
        },
        { id: 'vpn', label: 'VPN and remote access', mentions: 1, families: [], tools: [] },
      ],
      families: [{ scenarioId: 'PWD-01', mentions: 2, skills: ['password-accounts'] }],
      tools: ['reset-password'],
      questions: [
        {
          id: 'password-accounts-1',
          skill: 'password-accounts',
          question: 'A user says they are locked out but insists their password is correct.',
          tests: 'Whether you separate lockout from expiry.',
        },
      ],
    },
  ],
  coverage: [
    {
      skill: 'password-accounts',
      label: 'Passwords and account access',
      listings: 1,
      mentions: 2,
      families: ['PWD-01'],
      tools: ['reset-password'],
      covered: true,
    },
    {
      skill: 'vpn',
      label: 'VPN and remote access',
      listings: 1,
      mentions: 1,
      families: [],
      tools: [],
      covered: false,
    },
  ],
  recommendations: [
    {
      scenarioId: 'PWD-01',
      title: 'Password and account access',
      demand: 2,
      averageScore: null,
      weight: 200,
      reason: '1 target listing mentions this · not played yet',
    },
  ],
}

async function setOverview(value: TargetsOverview) {
  const service = await import('../../src/app/targetsService')
  vi.mocked(service.loadTargetsOverview).mockResolvedValue(value)
}

function renderPage() {
  return render(
    <MemoryRouter>
      <JobTargetsPage />
    </MemoryRouter>,
  )
}

beforeEach(async () => {
  const service = await import('../../src/app/targetsService')
  const settings = await import('../../src/app/settingsService')
  vi.clearAllMocks()
  vi.mocked(settings.loadTargetsFilter).mockResolvedValue('all')
  vi.mocked(settings.saveTargetsFilter).mockImplementation(async (filter) => filter)
  vi.mocked(service.loadTargetsOverview).mockResolvedValue(overview)
  vi.mocked(service.createJobTarget).mockResolvedValue(overview.targets[0]!)
  vi.mocked(service.createShareSafeExport).mockResolvedValue({
    filename: 'helpdesklab-job-targets-2026-10-17.json',
    contents: '{"format":"helpdesklab-job-targets"}',
    listings: 1,
  })
})

describe('JobTargetsPage', () => {
  it('reopens on the filter it was left on, and remembers a new one', async () => {
    const settings = await import('../../src/app/settingsService')
    vi.mocked(settings.loadTargetsFilter).mockResolvedValue('applied')

    renderPage()

    const listings = await screen.findByRole('region', { name: 'Saved listings' })
    // Restored before the list settles, so the filter is the one that was set
    // rather than 'all' and then a jump.
    expect(within(listings).getByLabelText('Status')).toHaveValue('applied')
    expect(
      await within(listings).findByRole('heading', {
        level: 3,
        name: 'Tier 1 Service Desk Analyst',
      }),
    ).toBeInTheDocument()

    fireEvent.change(within(listings).getByLabelText('Status'), {
      target: { value: 'closed' },
    })

    await waitFor(() => expect(settings.saveTargetsFilter).toHaveBeenCalledWith('closed'))
    expect(within(listings).getByText('No listings with that status.')).toBeInTheDocument()
  })

  it('shows every listing when the stored filter will not read', async () => {
    const settings = await import('../../src/app/settingsService')
    vi.mocked(settings.loadTargetsFilter).mockRejectedValue(new Error('settings are gone'))

    renderPage()

    const listings = await screen.findByRole('region', { name: 'Saved listings' })
    expect(within(listings).getByLabelText('Status')).toHaveValue('all')
    expect(
      await within(listings).findByRole('heading', {
        level: 3,
        name: 'Tier 1 Service Desk Analyst',
      }),
    ).toBeInTheDocument()
  })

  it('shows saved listings with extracted skills, practice links, and interview prep', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { level: 3, name: 'Tier 1 Service Desk Analyst' }))
      .toBeInTheDocument()
    expect(screen.getByText(/Northwind Support · applied 2026-10-01/)).toBeInTheDocument()
    expect(screen.getAllByText('Passwords and account access').length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: 'Open listing' })).toHaveAttribute(
      'href',
      'https://example.com/jobs/1',
    )
    expect(screen.getByRole('link', { name: 'PWD-01' })).toHaveAttribute(
      'href',
      '/practice?family=PWD-01',
    )
    expect(screen.getByText(/Interview prep · 1\s+question/)).toBeInTheDocument()
    expect(screen.getByText(/What this tests:/)).toBeInTheDocument()
  })

  it('reports which requested skills the lab does not practice yet', async () => {
    renderPage()

    expect(await screen.findByRole('region', { name: 'Skills coverage' })).toBeInTheDocument()
    expect(screen.getByText('2 requested · 1 practised here')).toBeInTheDocument()
    expect(screen.getByText('Not covered yet')).toBeInTheDocument()
    const focusLinks = screen.getAllByRole('link', { name: /PWD-01/ })
    expect(focusLinks.length).toBeGreaterThan(0)
    for (const link of focusLinks) {
      expect(link).toHaveAttribute('href', '/practice?family=PWD-01')
    }
  })

  it('saves the pasted listing with the entered status and date', async () => {
    const service = await import('../../src/app/targetsService')
    renderPage()

    fireEvent.change(screen.getByLabelText('Company'), { target: { value: 'Contoso Care' } })
    fireEvent.change(screen.getByLabelText('Job title'), {
      target: { value: 'Help Desk Technician' },
    })
    fireEvent.change(screen.getByLabelText('Listing text'), {
      target: {
        value: 'Troubleshoot printing and document fixes in the ticketing system.',
      },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save listing' }))

    await waitFor(() => {
      expect(service.createJobTarget).toHaveBeenCalledWith(
        expect.objectContaining({
          company: 'Contoso Care',
          title: 'Help Desk Technician',
          status: 'applied',
          rawDescription:
            'Troubleshoot printing and document fixes in the ticketing system.',
        }),
      )
    })
    expect(await service.loadTargetsOverview).toHaveBeenCalledTimes(2)
  })

  it('downloads the share-safe export and says what was removed', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Export for sharing' }))

    expect(
      await screen.findByText('Exported 1 listing without any pasted text.'),
    ).toBeInTheDocument()
  })

  it('explains the empty state and disables export', async () => {
    await setOverview({ targets: [], coverage: [], recommendations: [] })
    renderPage()

    expect(await screen.findByText(/No listings yet/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export for sharing' })).toBeDisabled()
    expect(screen.queryByRole('region', { name: 'Skills coverage' })).not.toBeInTheDocument()
  })

  it('shows the service error when a listing cannot be saved', async () => {
    const service = await import('../../src/app/targetsService')
    vi.mocked(service.createJobTarget).mockRejectedValue(
      new Error('Enter the company name (up to 120 characters).'),
    )
    renderPage()

    fireEvent.change(screen.getByLabelText('Company'), { target: { value: 'Contoso' } })
    fireEvent.change(screen.getByLabelText('Job title'), { target: { value: 'Technician' } })
    fireEvent.change(screen.getByLabelText('Listing text'), {
      target: { value: 'Short but pasted listing text.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save listing' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter the company name')
  })
})
