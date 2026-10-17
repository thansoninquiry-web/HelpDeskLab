import { describe, expect, it } from 'vitest'
import { buildShareSafeExport, SHARE_EXPORT_FORMAT } from '../../../src/domain/targets/export'
import { extractListing } from '../../../src/domain/targets/extract'
import { makeJobTarget } from '../../helpers/factories'

describe('buildShareSafeExport', () => {
  it('includes derived skills but never the pasted listing text', () => {
    const target = makeJobTarget({
      rawDescription:
        'CONFIDENTIAL-RECRUITER-NOTE Reset passwords, check DNS, and document the fix in the ticketing system.',
    })
    const payload = buildShareSafeExport(
      [{ target, extract: extractListing(target.rawDescription) }],
      Date.UTC(2026, 9, 17),
    )
    const json = JSON.stringify(payload)

    expect(json).not.toContain('CONFIDENTIAL-RECRUITER-NOTE')
    expect(json).not.toContain('Reset passwords')
    expect(payload.listings[0]).toMatchObject({
      company: 'Northwind Support',
      title: 'Tier 1 Service Desk Analyst',
      url: 'https://example.com/jobs/1',
      appliedOn: '2026-10-01',
      status: 'applied',
    })
    expect(payload.listings[0]?.skills).toContain('password-accounts')
    expect(payload.listings[0]?.families.length).toBeGreaterThan(0)
    expect(payload.format).toBe(SHARE_EXPORT_FORMAT)
    expect(payload.version).toBe(1)
    expect(payload.exportedAt).toBe(Date.UTC(2026, 9, 17))
  })

  it('keeps an unapplied listing shareable and supports an empty export', () => {
    const target = makeJobTarget({ url: '', appliedOn: null, status: 'researching' })
    const payload = buildShareSafeExport(
      [{ target, extract: extractListing(target.rawDescription) }],
      1,
    )

    expect(payload.listings[0]).toMatchObject({ url: '', appliedOn: null, status: 'researching' })
    expect(buildShareSafeExport([], 1).listings).toEqual([])
  })
})
