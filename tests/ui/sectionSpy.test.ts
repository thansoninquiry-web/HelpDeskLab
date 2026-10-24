import { describe, expect, it } from 'vitest'
import { sectionAt } from '../../src/ui/routes/sectionSpy'

/** Sections in document order, tops in viewport pixels. */
function sections(...tops: number[]): { id: string; top: number }[] {
  return tops.map((top, index) => ({ id: `section-${index + 1}`, top }))
}

describe('the section being read', () => {
  it('is the first one when the page is above them all', () => {
    expect(sectionAt(sections(400, 1200, 2000), 96)).toBe('section-1')
  })

  it('is the last one whose top has passed the reading line', () => {
    expect(sectionAt(sections(-3000, -1200, -40, 600), 96)).toBe('section-3')
  })

  it('counts a heading exactly on the line as read', () => {
    expect(sectionAt(sections(-800, 96, 700), 96)).toBe('section-2')
  })

  it('stays on the section above while the gap below it is what is on screen', () => {
    // The next heading is 30px below the line: still reading the one above.
    expect(sectionAt(sections(-500, 126), 96)).toBe('section-1')
  })

  it('is the last section when the page has been scrolled to the end', () => {
    expect(sectionAt(sections(-4000, -3200, -2400), 96)).toBe('section-3')
  })

  it('is nothing at all on a page with no sections', () => {
    expect(sectionAt([], 96)).toBeNull()
  })
})
