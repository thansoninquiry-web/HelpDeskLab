export interface SectionReading {
  id: string
  /** The section's top in viewport pixels, as the browser measured it. */
  top: number
}

/**
 * Which section of a long page is being read: the last one whose top has scrolled
 * up past the reading line, in the order the page lists them.
 *
 * A page still above every section reads as the first one, because arriving at
 * the top *is* reading the top — and a page with no sections reads as none.
 *
 * The reading line belongs to the page rather than to this function: it depends
 * on how tall the sticky header is, which is a stylesheet's business. Passing it
 * in keeps the rule testable without a layout engine.
 */
export function sectionAt(
  sections: readonly SectionReading[],
  readingLine: number,
): string | null {
  let current: string | null = sections[0]?.id ?? null

  for (const section of sections) {
    if (section.top > readingLine) {
      break
    }
    current = section.id
  }

  return current
}
