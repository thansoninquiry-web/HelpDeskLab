import { describe, expect, it } from 'vitest'
import {
  HANDOFF_NOTE_PARTS,
  SECURITY_REPORT_MIN_LENGTH,
  missingNoteParts,
  securityReportGaps,
  securityReportShortfall,
} from '../../../src/domain/scoring/noteCoverage'

const COMPLETE =
  'Denied a request for a colleague’s password. I checked the directory and the caller’s own mailbox before refusing, and nothing was changed. Security should trace the number and warn the account owner.'

describe('what a security report has to contain', () => {
  it('accepts a report that says what was asked, what was checked, and what happens next', () => {
    expect(securityReportGaps(COMPLETE)).toBeNull()
  })

  it('reads the report in any case, because the desk writes prose', () => {
    expect(securityReportGaps(COMPLETE.toUpperCase())).toBeNull()
  })

  it('names each part the report does not say, in the close form’s words', () => {
    const gaps = securityReportGaps('Denied the request and reported it to Security.')

    expect(gaps?.missing.map((part) => part.label)).toEqual([
      'what you checked before refusing',
      'what Security should do next',
    ])
    expect(gaps?.tooShort).toBe(false)
    expect(securityReportShortfall(gaps!)).toBe(
      'This security report is not ready: it still has to say what you checked before refusing and what Security should do next.',
    )
  })

  it('treats an empty report as saying none of it, and too short to read', () => {
    const gaps = securityReportGaps('   ')

    expect(gaps?.missing.map((part) => part.id)).toEqual(['asked', 'checked', 'next'])
    expect(gaps?.tooShort).toBe(true)
    expect(securityReportShortfall(gaps!)).toContain(`${SECURITY_REPORT_MIN_LENGTH} characters`)
  })

  it('does not read “unverified” as the evidence that was checked', () => {
    // An unverified caller is what the refusal is about, not what the desk read;
    // the suffix would otherwise satisfy the checked part for free.
    const gaps = securityReportGaps(
      'Denied an unverified request and reported it to Security. Security should trace the caller.',
    )

    expect(gaps?.missing.map((part) => part.id)).toEqual(['checked'])
  })

  it('is about the parts, not only the length', () => {
    const gaps = securityReportGaps('ask checked next')

    expect(gaps?.missing).toEqual([])
    expect(gaps?.tooShort).toBe(true)
    expect(securityReportShortfall(gaps!)).toBe(
      `A security report has to be at least ${SECURITY_REPORT_MIN_LENGTH} characters, so Security can read what was refused.`,
    )
  })

  it('reads the hand-off note with the same matcher', () => {
    const note =
      'The user reported a dropped link. I checked the switch port and the DHCP scope. Tier 2 should replace the patch lead.'

    expect(missingNoteParts(note, HANDOFF_NOTE_PARTS)).toEqual([])
    expect(missingNoteParts('Fixed it.', HANDOFF_NOTE_PARTS).map((part) => part.id)).toEqual([
      'reported',
      'checked',
      'next',
    ])
  })
})
