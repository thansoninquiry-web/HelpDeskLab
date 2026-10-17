import { describe, expect, it } from 'vitest'
import { ensureWorldState, createLarkspurWorld } from '../../../src/domain/environment/fixtures'
import type { DhcpScope, World } from '../../../src/domain/environment/types'

describe('world fixtures', () => {
  it('gives every site a DHCP scope and every user a tenant account', () => {
    const world = createLarkspurWorld()

    expect(world.dhcpScopes.map((scope) => scope.siteId).sort()).toEqual([
      'depot',
      'hq',
      'warehouse',
    ])
    expect(world.m365.accounts).toHaveLength(world.users.length)
    expect(world.shares.length).toBeGreaterThan(0)
    expect(world.groups.some((group) => group.name === 'FS-Finance-RW')).toBe(true)
  })

  it('backfills the M6 collections on a session saved by an earlier build', () => {
    const legacy = createLarkspurWorld() as unknown as {
      dhcpScopes?: DhcpScope[]
      m365?: World['m365']
      shares?: World['shares']
      groups?: World['groups']
    }
    delete legacy.dhcpScopes
    delete legacy.m365
    delete legacy.shares
    delete legacy.groups

    const restored = ensureWorldState(legacy as unknown as World)

    expect(restored.dhcpScopes).toHaveLength(3)
    expect(restored.m365.accounts.length).toBeGreaterThan(0)
    expect(restored.shares).toEqual([])
    expect(restored.groups).toEqual([])
  })

  it('leaves a complete world untouched', () => {
    const world = createLarkspurWorld()
    const before = JSON.stringify(world)

    expect(ensureWorldState(world)).toBe(world)
    expect(JSON.stringify(world)).toBe(before)
  })
})
