import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { AcademyTutorialPage } from '../../src/modules/academy/ui/TutorialPage'
import { DesktopTutorialPage } from '../../src/modules/desktop/ui/TutorialPage'
import { NetlabTutorialPage } from '../../src/modules/netlab/ui/TutorialPage'

/**
 * The tutorial is one page per simulator, rendered from data. The checks are the
 * ones a learner would notice: the heading, the numbered steps, where the marks
 * come from, and a practice link that opens the case the page just described.
 */

const PAGES = [
  {
    name: 'networking lab',
    render: () => <NetlabTutorialPage />,
    heading: /Work an incident from the report down to the wire/i,
    step: /Read the report and put a boundary around the fault/i,
    practice: '/networking/incidents/one-pc-no-internet',
    practiceLabel: 'Open the one-PC incident',
  },
  {
    name: 'desktop bench',
    render: () => <DesktopTutorialPage />,
    heading: /Work a machine, not a parts catalogue/i,
    step: /Start from the symptom, not the part list/i,
    practice: '/desktop/cases/cmos-clock-reset',
    practiceLabel: 'Open the CMOS case',
  },
  {
    name: 'school desk',
    render: () => <AcademyTutorialPage />,
    heading: /Run a school visit before the bell/i,
    step: /Read the bell before the room/i,
    practice: '/academy/cases/projector-no-signal',
    practiceLabel: 'Open the projector visit',
  },
]

describe('a simulator tutorial', () => {
  for (const page of PAGES) {
    it(`walks the ${page.name} from the report to the note`, () => {
      render(<MemoryRouter>{page.render()}</MemoryRouter>)

      expect(screen.getByRole('heading', { level: 1, name: page.heading })).toBeTruthy()
      expect(screen.getByText(page.step)).toBeTruthy()
      expect(screen.getByRole('heading', { name: 'Where the marks come from' })).toBeTruthy()
      expect(screen.getByRole('heading', { name: 'The first mistakes' })).toBeTruthy()

      const practice = screen.getByRole('link', {
        name: page.practiceLabel,
      }) as HTMLAnchorElement
      expect(practice.getAttribute('href')).toBe(page.practice)

      // The module's own tabs are on the page, so the tutorial is part of it
      // rather than a dead end.
      expect(screen.getAllByRole('link', { name: 'Tutorial' }).length).toBeGreaterThan(0)
    })
  }
})
