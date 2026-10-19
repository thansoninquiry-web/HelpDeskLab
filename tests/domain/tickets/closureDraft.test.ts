import { describe, expect, it } from 'vitest'
import {
  CLOSURE_NOTE_LIMIT,
  EMPTY_CLOSURE_DRAFT,
  closureDraftJson,
  isEmptyClosureDraft,
  normalizeClosureDraft,
} from '../../../src/domain/tickets/closureDraft'

const CODES = ['resolved-remote', 'escalated-tier2']

describe('normalizeClosureDraft', () => {
  it('keeps a code the build offers and the note as it was written', () => {
    const draft = normalizeClosureDraft(
      { code: 'escalated-tier2', note: 'Locked out three times; needs the identity team.' },
      CODES,
    )

    expect(draft).toEqual({
      code: 'escalated-tier2',
      note: 'Locked out three times; needs the identity team.',
    })
  })

  it('reads a code this build no longer offers as not chosen yet', () => {
    expect(normalizeClosureDraft({ code: 'retired-code', note: 'kept' }, CODES)).toEqual({
      code: null,
      note: 'kept',
    })
  })

  it('reads anything that is not a draft as empty', () => {
    for (const stored of [null, undefined, 'resolved-remote', 7, ['resolved-remote']]) {
      expect(normalizeClosureDraft(stored, CODES)).toBe(EMPTY_CLOSURE_DRAFT)
    }
  })

  it('ignores fields of the wrong type instead of failing the reload', () => {
    expect(normalizeClosureDraft({ code: 42, note: ['nope'] }, CODES)).toEqual({
      code: null,
      note: '',
    })
  })

  it('clamps a note that is longer than the form allows', () => {
    const stored = normalizeClosureDraft({ code: null, note: 'x'.repeat(5000) }, CODES)

    expect(stored.note).toHaveLength(CLOSURE_NOTE_LIMIT)
  })
})

describe('closureDraftJson', () => {
  it('round-trips through storage unchanged', () => {
    const draft = { code: 'resolved-remote', note: 'Rebooted the spooler and reprinted.' }

    expect(normalizeClosureDraft(closureDraftJson(draft), CODES)).toEqual(draft)
  })

  it('keeps an unchosen code as null rather than inventing one', () => {
    expect(closureDraftJson(EMPTY_CLOSURE_DRAFT)).toEqual({ code: null, note: '' })
  })
})

describe('isEmptyClosureDraft', () => {
  it('treats whitespace as nothing worth storing', () => {
    expect(isEmptyClosureDraft({ code: null, note: '   \n ' })).toBe(true)
  })

  it('keeps a draft that has a note or a chosen code', () => {
    expect(isEmptyClosureDraft({ code: null, note: 'Checked the printer.' })).toBe(false)
    expect(isEmptyClosureDraft({ code: 'escalated-tier2', note: '' })).toBe(false)
  })
})
