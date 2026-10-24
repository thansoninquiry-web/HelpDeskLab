// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { stepSwitcherIndex, switcherMatches, switcherTokens } from '../../src/ui/routes/toolSwitcher'

/**
 * The switcher's list, as the two sums it is made of: what a query narrows the
 * open tools to, and where the arrows are in what is left. The panel is drawn in
 * the strip's order and the search is forgiving on purpose — a learner reaching
 * for a tool that is scrolled out of the strip should not have to remember how
 * the card labels it.
 */

const open = [
  { id: 'directory' as const, label: 'Directory' },
  { id: 'mail-admin' as const, label: 'Mail Admin' },
  { id: 'mail-security' as const, label: 'Mail Security' },
  { id: 'printers' as const, label: 'Printers' },
]

describe('switcherMatches', () => {
  it('is the strip until something is typed', () => {
    expect(switcherMatches(open, '')).toEqual(open)
    expect(switcherMatches(open, '   ')).toEqual(open)
    expect(switcherMatches(open, '\t')).toEqual(open)
  })

  it('finds a tool by any part of its name, without case', () => {
    expect(switcherMatches(open, 'pri')).toEqual([open[3]])
    expect(switcherMatches(open, 'DIRECT')).toEqual([open[0]])
    expect(switcherMatches(open, '  printers  ')).toEqual([open[3]])
  })

  it('wants every word, in any order and any part of the name', () => {
    expect(switcherMatches(open, 'mail sec')).toEqual([open[2]])
    expect(switcherMatches(open, 'admin mail')).toEqual([open[1]])
    expect(switcherMatches(open, 'mail')).toEqual([open[1], open[2]])
  })

  it('reads a console id as words too, so its own spelling is allowed', () => {
    expect(switcherMatches(open, 'mail-admin')).toEqual([open[1]])
    expect(switcherMatches(open, 'mail admin')).toEqual([open[1]])
  })

  it('keeps the strip’s order when more than one tool matches', () => {
    expect(switcherMatches(open, 'e')).toEqual([open[0], open[2], open[3]])
    expect(switcherMatches(open, 'r')).toEqual([open[0], open[2], open[3]])
  })

  it('answers with nothing when nothing matches', () => {
    expect(switcherMatches(open, 'zebra')).toEqual([])
    expect(switcherMatches(open, 'mail zebra')).toEqual([])
  })

  it('finds nothing in an empty strip', () => {
    expect(switcherMatches([], 'mail')).toEqual([])
  })

  it('reads a query as the words it is made of', () => {
    expect(switcherTokens('  Mail   Admin ')).toEqual(['mail', 'admin'])
    expect(switcherTokens('')).toEqual([])
  })
})

describe('stepSwitcherIndex', () => {
  it('walks down and up the list', () => {
    expect(stepSwitcherIndex(0, 1, 4)).toBe(1)
    expect(stepSwitcherIndex(2, -1, 4)).toBe(1)
  })

  it('wraps at both ends, so the list is a ring', () => {
    expect(stepSwitcherIndex(3, 1, 4)).toBe(0)
    expect(stepSwitcherIndex(0, -1, 4)).toBe(3)
  })

  it('keeps the only place in a list of one', () => {
    expect(stepSwitcherIndex(0, 1, 1)).toBe(0)
    expect(stepSwitcherIndex(0, -1, 1)).toBe(0)
  })

  it('has nowhere to be in a list that has emptied', () => {
    expect(stepSwitcherIndex(2, 1, 0)).toBe(0)
    expect(stepSwitcherIndex(0, -1, 0)).toBe(0)
  })

  it('starts at the top when the highlight is outside the list it is in', () => {
    expect(stepSwitcherIndex(9, 1, 3)).toBe(1)
    expect(stepSwitcherIndex(-1, 1, 3)).toBe(1)
  })

  it('takes a step longer than the list, forwards or back', () => {
    expect(stepSwitcherIndex(0, 7, 4)).toBe(3)
    expect(stepSwitcherIndex(1, -7, 4)).toBe(2)
  })
})
