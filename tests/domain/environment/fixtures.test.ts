import { describe, expect, it } from 'vitest'
import { BASE_CLOCK, ensureWorldState, createLarkspurWorld } from '../../../src/domain/environment/fixtures'
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

  it('fills the directory with staff accounts that stay unambiguous', () => {
    const world = createLarkspurWorld()

    // The named accounts the tickets are built on, plus the rest of the org.
    expect(world.users.length).toBe(108)
    const staff = world.users.filter((user) => user.id.startsWith('u-staff-'))
    expect(staff).toHaveLength(100)

    // A lookup by account, address, or name has to land on exactly one person,
    // because that is how the directory and the audited commands resolve one.
    for (const field of ['samAccountName', 'email', 'displayName'] as const) {
      const values = world.users.map((user) => user[field].toLowerCase())
      expect(new Set(values).size, field).toBe(values.length)
    }
    const employeeIds = world.users.map((user) => user.employeeId)
    expect(new Set(employeeIds).size).toBe(employeeIds.length)

    // Each one is a tenant account, a mailbox, and a member of the estate-wide group.
    const tenantAccounts = new Set(world.m365.accounts.map((account) => account.userId))
    const mailboxes = new Set(world.mail.mailboxes.map((mailbox) => mailbox.userId))
    const allUsers = world.groups.find((group) => group.name === 'FS-All-Users')
    for (const user of staff) {
      expect(tenantAccounts.has(user.id)).toBe(true)
      expect(mailboxes.has(user.id)).toBe(true)
      expect(allUsers?.members).toContain(user.id)
      expect(user.managerName.length).toBeGreaterThan(0)
      expect(world.sites.some((site) => site.id === user.siteId)).toBe(true)
      // No machine is assigned, which is what keeps ticket draws as they were.
      expect(
        world.devices.some(
          (device) => device.assignedUserId === user.id || device.loggedInUserId === user.id,
        ),
      ).toBe(false)
    }

    // A lived-in directory: most people can work, a few cannot, and an account
    // only says its password expired when the date it carries says so too.
    const lockedOrDisabled = staff.filter((user) => user.status !== 'active')
    expect(lockedOrDisabled.length).toBeGreaterThan(0)
    expect(lockedOrDisabled.length).toBeLessThan(staff.length / 5)
    const expired = staff.filter((user) => user.passwordExpired)
    expect(expired.length).toBeGreaterThan(0)
    expect(expired.length).toBeLessThan(staff.length / 4)

    const dayMs = 24 * 60 * 60 * 1000
    const ageDays = (user: (typeof staff)[number]): number =>
      (BASE_CLOCK - (user.passwordLastChangedAt ?? 0)) / dayMs
    for (const user of staff) {
      if (user.status === 'disabled') {
        // Someone who has left has no password change on record, as in the
        // named accounts.
        expect(user.passwordLastChangedAt).toBeNull()
        continue
      }
      expect(ageDays(user)).toBeGreaterThan(0)
    }
    // The flag partitions the accounts by the date on the record: every expired
    // password is older than every one still current, so the two never disagree.
    const current = staff.filter((user) => !user.passwordExpired && user.status !== 'disabled')
    expect(Math.min(...expired.map(ageDays))).toBeGreaterThan(Math.max(...current.map(ageDays)))

    // Same build, same people: the walk is fixed, not random.
    expect(createLarkspurWorld().users).toEqual(world.users)
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
