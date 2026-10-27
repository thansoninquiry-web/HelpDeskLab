import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from '../../src/ui/components/AppShell'

vi.mock('../../src/app/practiceService', () => ({
  loadProgressSummary: vi.fn().mockResolvedValue({
    totalXp: 420,
    rank: {
      title: 'Tier 1 technician',
      xp: 420,
      nextTitle: 'Escalation ready',
      nextAt: 800,
      percent: 15,
    },
    streakDays: 3,
  }),
}))

/**
 * The fold is CSS, and jsdom applies none, so what is tested here is the state
 * the stylesheet reads: the shell says whether the page is scrolled, and it says
 * so with the hysteresis the comment in the hook explains. Whether the compact
 * row looks right is held by the stylesheet test beside this one.
 */

function setScroll(offset: number): void {
  Object.defineProperty(window, 'scrollY', { value: offset, configurable: true })
  fireEvent.scroll(window)
}

function renderShell(): HTMLElement {
  const { container } = render(
    <MemoryRouter initialEntries={['/']}>
      <AppShell />
    </MemoryRouter>,
  )
  const shell = container.querySelector('[data-scrolled]')
  if (!(shell instanceof HTMLElement)) {
    throw new Error('the shell does not report its scroll state')
  }
  return shell
}

describe('the header while the page is scrolled', () => {
  afterEach(() => {
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
  })

  it('is whole at the top', () => {
    const shell = renderShell()

    expect(shell).toHaveAttribute('data-scrolled', 'false')
  })

  it('folds once the page has been scrolled past the row it gives back', () => {
    const shell = renderShell()

    setScroll(200)

    expect(shell).toHaveAttribute('data-scrolled', 'true')
  })

  it('stays folded inside the gap instead of flapping', () => {
    const shell = renderShell()
    setScroll(400)
    expect(shell).toHaveAttribute('data-scrolled', 'true')

    // Between the two thresholds the state is left alone: this is the band the
    // browser's own scroll anchoring lands in when the header collapses.
    setScroll(80)
    expect(shell).toHaveAttribute('data-scrolled', 'true')

    // Near the top it unfolds again, which is the restore the row comes back on.
    setScroll(20)
    expect(shell).toHaveAttribute('data-scrolled', 'false')
  })

  it('does not fold on a small scroll', () => {
    const shell = renderShell()

    setScroll(120)

    expect(shell).toHaveAttribute('data-scrolled', 'false')
  })

  it('keeps the section row in the page while it is folded', () => {
    renderShell()
    setScroll(400)

    // The fold is the stylesheet hiding the row, not the page dropping it: every
    // section is still there to be restored.
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent?.trim()),
    ).toEqual([
      'Modules',
      'Practice',
      'DSA',
      'Languages',
      'Intune',
      'Azure',
      'Networking',
      'Job targets',
      'Progress',
      'Settings',
    ])
  })
})
