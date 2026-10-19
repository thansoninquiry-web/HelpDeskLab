import type { JsonObject } from '../shared/json'

/**
 * Longest handoff note kept while the ticket is still open. The note is a
 * summary for the next team, not a log, so this bounds what a reload restores.
 */
export const CLOSURE_NOTE_LIMIT = 2000

/**
 * The close-in-progress state: the code the learner has chosen and the handoff
 * note they are writing. It survives a reload so a half-written close is never
 * lost, and only a closed session throws it away.
 */
export interface ClosureDraft {
  /** The chosen closure code, or null before the learner has picked one. */
  code: string | null
  note: string
}

export const EMPTY_CLOSURE_DRAFT: ClosureDraft = { code: null, note: '' }

/**
 * Reads a stored draft back into a usable one. Nothing stored is ever rejected:
 * a code this build no longer offers reads as "not chosen yet", and a note is
 * clamped to the limit so a corrupt row cannot grow without bound.
 */
export function normalizeClosureDraft(value: unknown, codes: readonly string[]): ClosureDraft {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return EMPTY_CLOSURE_DRAFT
  }

  const record = value as Record<string, unknown>
  const code = typeof record.code === 'string' && codes.includes(record.code) ? record.code : null
  const note = typeof record.note === 'string' ? record.note.slice(0, CLOSURE_NOTE_LIMIT) : ''
  return { code, note }
}

/** The form written to `sessions.closure_draft_json`. */
export function closureDraftJson(draft: ClosureDraft): JsonObject {
  return { code: draft.code, note: draft.note }
}

/** True when the draft carries nothing worth storing or restoring. */
export function isEmptyClosureDraft(draft: ClosureDraft): boolean {
  return draft.code === null && draft.note.trim().length === 0
}
