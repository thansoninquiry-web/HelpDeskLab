import { isJsonObject, type JsonObject } from '../shared/json'
import type { ConsoleId } from './console'

/**
 * Where the learner was inside one console: the search they had typed and the
 * record they had open.
 *
 * The tab remembers *which console* was being worked in; this remembers what it
 * was showing. It belongs to the attempt rather than to the device for the same
 * reason the tabs do: a ticket reopened tomorrow should land on the machine the
 * desk was on, and a ticket for another caller should not inherit it.
 */
export interface ConsoleFocus {
  /** What was typed into the console's search box, exactly as it was left. */
  query: string
  /** The record that was open in front, or null when only the list was showing. */
  selectedId: string | null
}

/**
 * The focus of every console this attempt has been worked in, keyed by console
 * id. Consoles with nothing typed and no record open are absent rather than
 * stored empty, so an attempt that never searched has no row of its own to keep.
 */
export type ConsoleFocusMap = Readonly<Partial<Record<ConsoleId, ConsoleFocus>>>

/**
 * A search is a filter, not a document: a typed query is kept as typed but
 * capped, so a row cannot grow without bound. A query longer than this is kept
 * up to its first 120 characters — the same text the learner would have seen in
 * the box on a phone.
 */
export const MAX_CONSOLE_QUERY = 120

/** True when the focus carries nothing worth storing or restoring. */
export function isEmptyConsoleFocus(focus: ConsoleFocus | null): boolean {
  return focus === null || (focus.query.length === 0 && focus.selectedId === null)
}

/** True when no console has anything to restore. */
export function isEmptyConsoleFocusMap(focus: ConsoleFocusMap): boolean {
  return Object.keys(focus).length === 0
}

/**
 * Reads a stored map, keeping only what this build can restore.
 *
 * A row is JSON written by an earlier build, so anything can be in it: a console
 * this build no longer offers (dropped), a record id that is not a string, a
 * query that is not a string, a console with nothing in it (dropped, so a row
 * that has been emptied does not reopen as an empty one). Nothing here can tell
 * whether a stored record still exists — the console's entries are built from
 * the world, which is read later — so an id for a record that has gone is kept
 * and simply finds nothing to show.
 */
export function normalizeConsoleFocus(
  value: unknown,
  consoleIds: readonly string[],
): ConsoleFocusMap {
  const stored: Record<string, ConsoleFocus> = {}
  if (!isJsonObject(value)) {
    return stored
  }

  const known = new Set(consoleIds)
  for (const [consoleId, raw] of Object.entries(value)) {
    if (!known.has(consoleId) || !isJsonObject(raw)) {
      continue
    }
    const query =
      typeof raw.query === 'string' ? raw.query.slice(0, MAX_CONSOLE_QUERY) : ''
    const selectedId =
      typeof raw.selectedId === 'string' && raw.selectedId.length > 0
        ? raw.selectedId
        : null
    const focus: ConsoleFocus = { query, selectedId }
    if (!isEmptyConsoleFocus(focus)) {
      stored[consoleId] = focus
    }
  }
  return stored
}

/** The focus stored for one console, or null when it was never worked in. */
export function consoleFocusFor(
  focus: ConsoleFocusMap,
  consoleId: string | null | undefined,
): ConsoleFocus | null {
  if (consoleId === null || consoleId === undefined) {
    return null
  }
  return focus[consoleId as ConsoleId] ?? null
}

/**
 * The map with one console's focus set to what it is showing now, or taken out
 * again when it is blank. A console that was searched and then cleared leaves no
 * entry behind, which is what keeps the map honest about what is worth restoring.
 */
export function focusConsole(
  focus: ConsoleFocusMap,
  consoleId: ConsoleId,
  next: ConsoleFocus,
): ConsoleFocusMap {
  const capped: ConsoleFocus = {
    query: next.query.slice(0, MAX_CONSOLE_QUERY),
    selectedId: next.selectedId === '' ? null : next.selectedId,
  }
  if (isEmptyConsoleFocus(capped)) {
    if (focus[consoleId] === undefined) {
      return focus
    }
    const remaining = { ...focus }
    delete remaining[consoleId]
    return remaining
  }
  const current = focus[consoleId]
  if (
    current !== undefined &&
    current.query === capped.query &&
    current.selectedId === capped.selectedId
  ) {
    return focus
  }
  return { ...focus, [consoleId]: capped }
}

/** The form written to `sessions.console_focus_json`. */
export function consoleFocusJson(focus: ConsoleFocusMap): JsonObject {
  const json: JsonObject = {}
  for (const [consoleId, entry] of Object.entries(focus)) {
    if (entry === undefined) {
      continue
    }
    json[consoleId] = { query: entry.query, selectedId: entry.selectedId }
  }
  return json
}
