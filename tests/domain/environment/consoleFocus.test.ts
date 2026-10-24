import { describe, expect, it } from 'vitest'
import {
  MAX_CONSOLE_QUERY,
  consoleFocusFor,
  consoleFocusJson,
  focusConsole,
  isEmptyConsoleFocusMap,
  normalizeConsoleFocus,
} from '../../../src/domain/environment/consoleFocus'

const CONSOLES = ['directory', 'printers', 'mail-admin']

describe('normalizeConsoleFocus', () => {
  it('reads a stored search and record back as they were written', () => {
    const stored = { directory: { query: 'kira', selectedId: 'user:kira-khan' } }

    expect(normalizeConsoleFocus(stored, CONSOLES)).toEqual(stored)
  })

  it('drops a console this build no longer offers rather than failing', () => {
    const stored = {
      directory: { query: 'kira', selectedId: null },
      'retired-console': { query: 'anything', selectedId: null },
    }

    expect(normalizeConsoleFocus(stored, CONSOLES)).toEqual({
      directory: { query: 'kira', selectedId: null },
    })
  })

  it('reads nothing at all as nothing rather than as a broken row', () => {
    expect(normalizeConsoleFocus(null, CONSOLES)).toEqual({})
    expect(normalizeConsoleFocus('directory', CONSOLES)).toEqual({})
    expect(normalizeConsoleFocus(['directory'], CONSOLES)).toEqual({})
    // A console whose entry is not an object has nothing to restore.
    expect(normalizeConsoleFocus({ directory: 'kira' }, CONSOLES)).toEqual({})
  })

  it('keeps only the parts that are text, and a blank console is no console', () => {
    // A query that is not a string is not a search; a record id that is not one
    // is not a record. Either way the console opens on its list.
    expect(normalizeConsoleFocus({ directory: { query: 42, selectedId: 7 } }, CONSOLES)).toEqual({})
    expect(normalizeConsoleFocus({ printers: { query: '', selectedId: null } }, CONSOLES)).toEqual(
      {},
    )
    // One half is enough to be worth restoring: a record opened without a search.
    expect(normalizeConsoleFocus({ directory: { selectedId: 'user:kira-khan' } }, CONSOLES)).toEqual(
      { directory: { query: '', selectedId: 'user:kira-khan' } },
    )
    // An empty string is no record, rather than a record named by nothing.
    expect(normalizeConsoleFocus({ directory: { query: 'kira', selectedId: '' } }, CONSOLES)).toEqual(
      { directory: { query: 'kira', selectedId: null } },
    )
  })

  it('caps a stored search at the length a query is allowed to be', () => {
    const long = 'a'.repeat(MAX_CONSOLE_QUERY + 40)

    expect(normalizeConsoleFocus({ directory: { query: long } }, CONSOLES)).toEqual({
      directory: { query: 'a'.repeat(MAX_CONSOLE_QUERY), selectedId: null },
    })
  })
})

describe('focusConsole', () => {
  it('sets one console without touching the others', () => {
    const start = { directory: { query: 'kira', selectedId: null } }
    const next = focusConsole(start, 'printers', { query: 'lobby', selectedId: 'printer:1' })

    expect(next).toEqual({
      directory: { query: 'kira', selectedId: null },
      printers: { query: 'lobby', selectedId: 'printer:1' },
    })
    // The map is replaced, not mutated, so React sees a new value.
    expect(start).toEqual({ directory: { query: 'kira', selectedId: null } })
  })

  it('takes a console out again when it is left clear', () => {
    const start = { directory: { query: 'kira', selectedId: 'user:kira-khan' } }

    expect(focusConsole(start, 'directory', { query: '', selectedId: null })).toEqual({})
    expect(isEmptyConsoleFocusMap(focusConsole(start, 'directory', { query: '', selectedId: null })))
      .toBe(true)
  })

  it('returns the same map when nothing moved, so a pause costs no write', () => {
    const start = { directory: { query: 'kira', selectedId: null } }

    expect(focusConsole(start, 'directory', { query: 'kira', selectedId: null })).toBe(start)
    expect(focusConsole({}, 'directory', { query: '', selectedId: null })).toEqual({})
  })

  it('caps and normalises what it is handed, so the map is always storable', () => {
    expect(focusConsole({}, 'directory', { query: 'b'.repeat(MAX_CONSOLE_QUERY + 10), selectedId: '' }))
      .toEqual({ directory: { query: 'b'.repeat(MAX_CONSOLE_QUERY), selectedId: null } })
  })
})

describe('consoleFocusFor', () => {
  it('names the focus of the console asked for, and nothing for a console with none', () => {
    const map = { directory: { query: 'kira', selectedId: null } }

    expect(consoleFocusFor(map, 'directory')).toEqual({ query: 'kira', selectedId: null })
    expect(consoleFocusFor(map, 'printers')).toBeNull()
    expect(consoleFocusFor(map, null)).toBeNull()
  })
})

describe('consoleFocusJson', () => {
  it('round-trips a map through storage unchanged', () => {
    const map = {
      directory: { query: 'kira', selectedId: 'user:kira-khan' },
      printers: { query: '', selectedId: 'printer:lobby' },
    }

    expect(normalizeConsoleFocus(consoleFocusJson(map), CONSOLES)).toEqual(map)
  })

  it('writes an empty map as an empty object rather than inventing a console', () => {
    expect(consoleFocusJson({})).toEqual({})
  })
})
