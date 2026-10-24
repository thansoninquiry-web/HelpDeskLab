import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProgressSummary } from '../../src/app/practiceService'
import { AppShell } from '../../src/ui/components/AppShell'
import { loadProgressSummary } from '../../src/app/practiceService'

vi.mock('../../src/app/practiceService', () => ({
  loadProgressSummary: vi.fn(),
}))

/**
 * The phone score popover. jsdom applies no media queries, so both faces are in
 * the tree at once — the chip the wide header shows and the button the phone
 * header shows. What is tested here is the behaviour a finger gets: the button
 * names the score before it is pressed, one press opens the panel with the rank
 * and the streak, and the panel goes when its reason does.
 */

const summary: ProgressSummary = {
  totalXp: 420,
  rank: {
    title: 'Tier 1 technician',
    xp: 420,
    nextTitle: 'Escalation ready',
    nextAt: 800,
    percent: 15,
  },
  streakDays: 3,
}

function mockSummary(value: ProgressSummary = summary): void {
  vi.mocked(loadProgressSummary).mockResolvedValue(value)
}

function renderShell() {
  render(
    <MemoryRouter initialEntries={['/']}>
      <AppShell />
    </MemoryRouter>,
  )
}

async function openPopover(): Promise<HTMLElement> {
  renderShell()
  const trigger = await screen.findByRole('button', { name: /Score: 420 XP/ })
  fireEvent.click(trigger)

  const panelId = trigger.getAttribute('aria-controls')
  if (!panelId) {
    throw new Error('the open trigger does not point at its panel')
  }
  const panel = document.getElementById(panelId)
  if (!(panel instanceof HTMLElement)) {
    throw new Error('the panel the trigger names is not on the page')
  }
  return panel
}

describe('the score on a phone', () => {
  beforeEach(() => {
    mockSummary()
  })

  it('keeps the written-out chip for the wide header', async () => {
    renderShell()

    expect(await screen.findByText('420 XP')).toBeInTheDocument()
    expect(screen.getByText('Tier 1 technician')).toBeInTheDocument()
    expect(screen.getByText('3-day streak')).toBeInTheDocument()
  })

  it('names the score on the button, so nothing has to be opened to read it', async () => {
    renderShell()

    const trigger = await screen.findByRole('button', {
      name: 'Score: 420 XP, Tier 1 technician. Open the score summary.',
    })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    // A dangling reference is worse than none: the panel does not exist yet.
    expect(trigger).not.toHaveAttribute('aria-controls')
  })

  it('opens the panel on one press, with XP, rank, gap to the next tier, and streak', async () => {
    const panel = await openPopover()
    const trigger = screen.getByRole('button', { name: /Open the score summary/ })

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(within(panel).getByText('420 XP')).toBeInTheDocument()
    expect(within(panel).getByText('Tier 1 technician')).toBeInTheDocument()
    expect(within(panel).getByText('380 XP to Escalation ready')).toBeInTheDocument()
    expect(within(panel).getByText('3-day streak')).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: 'See the progress page' })).toHaveAttribute(
      'href',
      '/progress',
    )
  })

  it('says the end of the ladder and the empty streak in words', async () => {
    mockSummary({
      totalXp: 1600,
      rank: {
        title: 'Shift lead',
        xp: 1600,
        nextTitle: null,
        nextAt: null,
        percent: 100,
      },
      streakDays: 0,
    })

    renderShell()
    const trigger = await screen.findByRole('button', { name: /Score: 1600 XP, Shift lead/ })
    fireEvent.click(trigger)
    const panel = document.getElementById(trigger.getAttribute('aria-controls') ?? '')

    expect(panel && within(panel).getByText('Top rank reached')).toBeTruthy()
    expect(
      panel && within(panel).getByText('No streak yet — one scored attempt starts one.'),
    ).toBeTruthy()
  })

  it('closes on a second press', async () => {
    await openPopover()
    const trigger = screen.getByRole('button', { name: /Open the score summary/ })

    fireEvent.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('380 XP to Escalation ready')).not.toBeInTheDocument()
  })

  it('closes on Escape and hands the focus back to the button that opened it', async () => {
    await openPopover()
    const trigger = screen.getByRole('button', { name: /Open the score summary/ })
    trigger.focus()

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.queryByText('380 XP to Escalation ready')).not.toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
  })

  it('closes on a press outside it, and not on a press inside it', async () => {
    const panel = await openPopover()

    fireEvent.pointerDown(within(panel).getByText('Tier 1 technician'))
    expect(screen.getByText('380 XP to Escalation ready')).toBeInTheDocument()

    fireEvent.pointerDown(document.body)
    expect(screen.queryByText('380 XP to Escalation ready')).not.toBeInTheDocument()
  })

  it('closes when the page scrolls, because that folds the header under it', async () => {
    await openPopover()

    fireEvent.scroll(window)

    expect(screen.queryByText('380 XP to Escalation ready')).not.toBeInTheDocument()
  })

  it('closes when the next section opens', async () => {
    await openPopover()

    fireEvent.click(screen.getByRole('link', { name: 'Progress' }))

    expect(screen.queryByText('380 XP to Escalation ready')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Open the score summary/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })
})
