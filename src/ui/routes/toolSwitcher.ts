import type { ConsoleId } from '../../app/practiceService'

/**
 * The sums the open-tool switcher does on its own list, kept out of the component
 * so the list's order and its wrap can be tested without rendering anything.
 *
 * The switcher exists because the strip can be a signpost: with more tools open
 * than fit, the ends fade and the middle is scrolled past, so a name can be on
 * the card without being reachable by tabbing. Typing part of a name is the way
 * to reach it, and these are the two questions that typing asks — which names
 * still match, and which one the arrows are on.
 */

/** One open tool, as the switcher names it. */
export interface SwitchCandidate {
  id: ConsoleId
  label: string
}

/**
 * What a query is compared as: trimmed, and without case. A query of spaces is
 * no query — the list before anyone types is the strip, in its own order.
 */
export function switcherTokens(query: string): string[] {
  return query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean)
}

/**
 * The candidates every word of the query appears in, in the strip's order.
 *
 * A word may be found in the name, in the id as it is written, or in the id with
 * its hyphens read as spaces, so `mail admin` finds Mail Admin and `mail-admin`
 * does too. Words are required in any order and in any part of the name, so
 * `admin mail` works as well as the order the tool is called by — a switcher that
 * only matched from the start would make the learner remember how the card
 * labels things.
 */
export function switcherMatches(
  tools: readonly SwitchCandidate[],
  query: string,
): SwitchCandidate[] {
  const tokens = switcherTokens(query)
  if (tokens.length === 0) {
    return [...tools]
  }
  return tools.filter((tool) => {
    const haystack = `${tool.label} ${tool.id} ${tool.id.replace(/-/g, ' ')}`.toLowerCase()
    return tokens.every((token) => haystack.includes(token))
  })
}

/**
 * Where the arrow keys put the highlight, wrapping at both ends so the list is a
 * ring: pressing Up on the first tool lands on the last, which is how a list
 * shorter than the strip stays usable without a scroll. A list that has emptied
 * — a query that matches nothing — has only one place to be.
 */
export function stepSwitcherIndex(current: number, delta: number, count: number): number {
  if (count <= 0) {
    return 0
  }
  const start = current < 0 || current >= count ? 0 : current
  // A step longer than the list lands inside it, even a step backwards.
  return (((start + delta) % count) + count) % count
}
