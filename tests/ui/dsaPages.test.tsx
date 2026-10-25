import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DsaAttempt } from '../../src/modules/dsa/types'
import type { DsaStore } from '../../src/modules/dsa/persistence/store'
import { DsaService } from '../../src/modules/dsa/service'

const NOW = Date.UTC(2026, 9, 24, 12, 0, 0)

const box = vi.hoisted(() => ({
  attempts: [] as DsaAttempt[],
  drafts: {} as Record<string, string>,
}))

/** A real service over an in-memory store: the page is tested against its own logic. */
const store = {
  attempts: async () => [...box.attempts],
  attemptsFor: async (problemId: string) =>
    box.attempts
      .filter((attempt) => attempt.problemId === problemId)
      .sort((left, right) => right.createdAt - left.createdAt),
  draft: async (problemId: string) => box.drafts[problemId] ?? null,
  saveDraft: async (record: { problemId: string; code: string }) => {
    box.drafts[record.problemId] = record.code
  },
  appendAttempt: async (attempt: DsaAttempt) => {
    box.attempts.unshift(attempt)
  },
  reset: async () => {
    box.attempts.length = 0
    for (const key of Object.keys(box.drafts)) delete box.drafts[key]
  },
} as unknown as DsaStore

const service = new DsaService(store, () => NOW)

vi.mock('../../src/app/dsaService', () => ({
  getDsaService: async () => service,
}))

import { DsaPatternsPage } from '../../src/modules/dsa/ui/PatternsPage'
import { DsaProblemPage } from '../../src/modules/dsa/ui/ProblemPage'
import { DsaProblemsPage } from '../../src/modules/dsa/ui/ProblemsPage'

beforeEach(async () => {
  await service.reset()
})

function renderLibrary() {
  return render(
    <MemoryRouter initialEntries={['/dsa']}>
      <DsaProblemsPage />
    </MemoryRouter>,
  )
}

function renderProblem(problemId: string) {
  return render(
    <MemoryRouter initialEntries={[`/dsa/${problemId}`]}>
      <Routes>
        <Route path="/dsa/:problemId" element={<DsaProblemPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('the algorithm library', () => {
  it('lists every problem and says what has been tried', async () => {
    renderLibrary()

    expect(await screen.findByRole('heading', { name: 'Algorithm practice' })).toBeTruthy()
    const list = await screen.findByRole('list', { name: 'Problems' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(17)
    expect(within(list).getByText('Two entries that meet the target')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('0 of 17 solved')
    expect(screen.getAllByText('Not started')).toHaveLength(17)
  })

  it('narrows by difficulty and by a search term', async () => {
    renderLibrary()
    const list = await screen.findByRole('list', { name: 'Problems' })

    fireEvent.change(screen.getByLabelText('Difficulty'), { target: { value: 'hard' } })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(within(list).getByText('The smallest badge number nobody has')).toBeTruthy()
    expect(within(list).getByText('The peak in every shift window')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Difficulty'), { target: { value: 'all' } })
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'voucher' } })
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
    expect(within(list).getByText('The fewest vouchers for a total')).toBeTruthy()
  })

  it('shows a solved problem as solved after a recorded attempt', async () => {
    await service.submit({
      problemId: 'pair-sum-sorted',
      patternChoice: 'two-pointers',
      edgeChoice: 'duplicates',
      hintsUsed: 0,
      code: null,
    })

    renderLibrary()
    const list = await screen.findByRole('list', { name: 'Problems' })
    expect(within(list).getByText('Solved')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('1 of 17 solved')
  })
})

describe('one problem', () => {
  it('keeps the check button disabled until both questions are answered', async () => {
    renderProblem('pair-sum-sorted')

    expect(await screen.findByRole('heading', { name: 'Two entries that meet the target' })).toBeTruthy()
    const check = screen.getByRole('button', { name: 'Check answers' }) as HTMLButtonElement
    expect(check.disabled).toBe(true)

    fireEvent.click(screen.getByRole('radio', { name: /Two pointers from both ends/ }))
    expect(check.disabled).toBe(true)

    fireEvent.click(screen.getByRole('radio', { name: /The same amount twice/ }))
    expect(check.disabled).toBe(false)
  })

  it('solves on both right answers and opens the reference answers', async () => {
    renderProblem('pair-sum-sorted')
    await screen.findByRole('heading', { name: 'Two entries that meet the target' })

    fireEvent.click(screen.getByRole('radio', { name: /Two pointers from both ends/ }))
    fireEvent.click(screen.getByRole('radio', { name: /The same amount twice/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Check answers' }))

    expect(await screen.findByText('Solved — both answers match')).toBeTruthy()
    // The solved attempt reveals both written-up answers without another click.
    expect(await screen.findByRole('heading', { name: 'Walk in from both ends' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Binary-search each entry' })).toBeTruthy()
    // And the earlier-attempt history now has a row.
    expect(screen.getByText('Earlier attempts')).toBeTruthy()
    expect(box.attempts).toHaveLength(1)
    expect(box.attempts[0]?.solved).toBe(true)
  })

  it('explains a right approach with the wrong edge case instead of counting it solved', async () => {
    renderProblem('pair-sum-sorted')
    await screen.findByRole('heading', { name: 'Two entries that meet the target' })

    fireEvent.click(screen.getByRole('radio', { name: /Two pointers from both ends/ }))
    fireEvent.click(screen.getByRole('radio', { name: /Negative amounts in the ledger/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Check answers' }))

    expect(await screen.findByText('Not solved yet')).toBeTruthy()
    expect(screen.getByText('Not the one that bites')).toBeTruthy()
    // The right edge case's note is printed even though it was not chosen.
    expect(screen.getByText(/Two equal rows are a valid pair/)).toBeTruthy()
    expect(box.attempts[0]?.solved).toBe(false)
  })

  it('reveals hints and saves the hand-written draft', async () => {
    renderProblem('unique-run')
    await screen.findByRole('heading', { name: 'The longest stretch without a repeat' })

    fireEvent.click(screen.getByRole('button', { name: 'Show hint 1 of 2' }))
    expect(
      screen.getByText(/If the window is valid and the next id repeats/),
    ).toBeTruthy()

    fireEvent.change(screen.getByLabelText(/Your answer, written out/), {
      target: { value: 'function longestUniqueRun(ids) { return ids.length }' },
    })

    await waitFor(
      () => {
        expect(box.drafts['unique-run']).toBe(
          'function longestUniqueRun(ids) { return ids.length }',
        )
      },
      { timeout: 3000 },
    )
  })

  it('opens the pattern sheet from the library and links each cue to a problem', async () => {
    const { unmount } = renderLibrary()
    const sheetLink = await screen.findByRole('link', { name: 'The pattern sheet' })
    expect(sheetLink.getAttribute('href')).toBe('/dsa/patterns')
    unmount()

    render(
      <MemoryRouter initialEntries={['/dsa/patterns']}>
        <DsaPatternsPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Pattern sheet' })).toBeTruthy()
    expect(screen.getByText('The input is sorted')).toBeTruthy()
    expect(screen.getByText('The input is a binary search tree')).toBeTruthy()
    // Every cue's technique carries its cost, including the caveats.
    expect(screen.getByText('O(n) average, O(n squared) worst')).toBeTruthy()
    const practice = screen.getByRole('link', {
      name: 'Practice: Two entries that meet the target',
    })
    expect(practice.getAttribute('href')).toBe('/dsa/pair-sum-sorted')
  })

  it('answers a slug that is not in the bank with a way back', async () => {
    renderProblem('not-a-problem')
    expect(await screen.findByText('No such problem')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to algorithm practice' })).toBeTruthy()
  })
})
