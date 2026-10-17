import { describe, expect, it } from 'vitest'
import { buildCoverage, buildFamilyDemand } from '../../../src/domain/targets/coverage'
import { extractListing } from '../../../src/domain/targets/extract'
import { SKILLS } from '../../../src/domain/targets/skills'

describe('buildCoverage', () => {
  it('reports every known skill, including ones no listing asked for', () => {
    const coverage = buildCoverage([extractListing('Reset passwords and fix printer queues.')])

    expect(coverage).toHaveLength(SKILLS.length)
    expect(coverage.map((skill) => skill.skill).sort()).toEqual(SKILLS.map((skill) => skill.id).sort())
  })

  it('counts how many listings asked for each skill', () => {
    const coverage = buildCoverage([
      extractListing('Reset passwords and check DNS records.'),
      extractListing('Support password resets and DHCP scopes.'),
      extractListing('Own the ticketing system and documentation.'),
    ])
    const byId = new Map(coverage.map((skill) => [skill.skill, skill]))

    expect(byId.get('password-accounts')?.listings).toBe(2)
    expect(byId.get('dns')?.listings).toBe(1)
    expect(byId.get('printing')?.listings).toBe(0)
  })

  it('marks VPN and hardware as requested but not covered by any family', () => {
    const coverage = buildCoverage([
      extractListing('Support VPN tunnels and replace laptop hardware under warranty.'),
    ])
    const byId = new Map(coverage.map((skill) => [skill.skill, skill]))

    expect(byId.get('vpn')).toMatchObject({ listings: 1, covered: false, families: [] })
    expect(byId.get('hardware')).toMatchObject({ listings: 1, covered: false })
  })

  it('sorts most requested skills first', () => {
    const coverage = buildCoverage([
      extractListing('Printer and print queue support only.'),
      extractListing('DNS lookups plus printer queues.'),
    ])

    expect(coverage[0]?.skill).toBe('printing')
    expect(coverage[0]?.listings).toBe(2)
  })
})

describe('buildFamilyDemand', () => {
  it('aggregates mentions and distinct listings per family', () => {
    const demand = buildFamilyDemand([
      extractListing('Reset passwords for Active Directory users.'),
      extractListing('Troubleshoot DNS and DHCP leases.'),
      extractListing('Printer jams and spooler restarts.'),
    ])
    const byId = new Map(demand.map((entry) => [entry.scenarioId, entry]))

    expect(byId.get('DHCP-01')?.listings).toBe(1)
    expect(byId.get('PRN-01')?.mentions).toBeGreaterThan(0)
    expect(byId.get('PRN-01')?.skills).toContain('printing')
    expect(demand.some((entry) => entry.scenarioId === 'M365-01')).toBe(false)
    expect(demand[0]?.mentions).toBeGreaterThanOrEqual(demand[demand.length - 1]?.mentions ?? 0)
  })

  it('is empty when no listing matched a skill', () => {
    expect(buildFamilyDemand([extractListing('Drive a forklift.')])).toEqual([])
    expect(buildCoverage([]).every((skill) => skill.listings === 0)).toBe(true)
  })
})
