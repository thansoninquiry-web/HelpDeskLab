import { describe, expect, it } from 'vitest'
import { extractListing, normalizeListingText } from '../../../src/domain/targets/extract'

const LISTING = `Tier 1 Service Desk Analyst

You will reset passwords and unlock accounts for Active Directory users.
Diagnose DNS lookups, DHCP leases and VPN connectivity for remote staff.
Keep documentation in the ticketing system and explain fixes in plain language.`

describe('extractListing', () => {
  it('maps listing text to skills, families, and simulated tools', () => {
    const extract = extractListing(LISTING)
    const skills = new Map(extract.skills.map((skill) => [skill.skill, skill]))

    expect([...skills.keys()]).toEqual(
      expect.arrayContaining([
        'password-accounts',
        'active-directory',
        'dns',
        'dhcp',
        'vpn',
        'ticketing',
      ]),
    )
    expect(skills.get('password-accounts')?.mentions).toBeGreaterThan(0)
    expect(skills.get('dns')?.families).toEqual(['NET-01', 'DHCP-01'])
    expect(extract.tools).toEqual(expect.arrayContaining(['nslookup', 'reset-password', 'note']))
    expect(extract.families.map((family) => family.scenarioId)).toEqual(
      expect.arrayContaining(['NET-01', 'DHCP-01', 'PWD-01']),
    )
    expect(extract.wordCount).toBeGreaterThan(20)
  })

  it('matches keywords regardless of case and spacing', () => {
    const extract = extractListing('PRINTER   jams\nand   SPOOLER service restarts')
    const printing = extract.skills.find((skill) => skill.skill === 'printing')

    expect(printing?.mentions).toBeGreaterThanOrEqual(2)
    expect(extract.families[0]?.scenarioId).toBe('PRN-01')
  })

  it('counts each phrase once per listing so repetition does not inflate coverage', () => {
    const once = extractListing('Troubleshoot VPN tunnels.')
    const repeated = extractListing('Troubleshoot VPN tunnels. VPN. VPN. VPN tunnels again.')

    expect(repeated.skills).toEqual(once.skills)
  })

  it('does not match inside unrelated words', () => {
    const extract = extractListing('We print the weekly newsletter and scan documents for the team.')
    expect(extract.skills.map((skill) => skill.skill)).not.toContain('printing')
  })

  it('returns no skills for empty or unrelated text', () => {
    expect(extractListing('').skills).toEqual([])
    expect(extractListing('   \n  ').skills).toEqual([])
    expect(extractListing('Drive a forklift on the night shift.').skills).toEqual([])
  })

  it('normalizes whitespace before counting words', () => {
    expect(normalizeListingText('  Reset\n\nPasswords   today ')).toBe('reset passwords today')
  })
})
