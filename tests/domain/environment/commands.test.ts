import { describe, expect, it } from 'vitest'
import { BASE_CLOCK, CLOCK_STEP_MS, createLarkspurWorld } from '../../../src/domain/environment/fixtures'
import { resolveName } from '../../../src/domain/environment/network'
import { applyCommand } from '../../../src/domain/environment/reducer'
import type { CommandResult, Device, World } from '../../../src/domain/environment/types'

function text(result: CommandResult): string {
  return result.lines.map((entry) => entry.text).join('\n')
}

function deviceIn(world: World, id: string): Device {
  const device = world.devices.find((candidate) => candidate.id === id)
  if (!device) {
    throw new Error(`device not found: ${id}`)
  }
  return device
}

describe('ipconfig', () => {
  it('prints adapter configuration and advances the clock', () => {
    const world = createLarkspurWorld()
    const result = applyCommand(world, 'ipconfig /all')

    const output = text(result)
    expect(output).toContain('10.20.4.57(Preferred)')
    expect(output).toContain('10.20.4.1')
    expect(output).toContain('DNS Servers')
    expect(output).toContain('DHCP Enabled')
    expect(output).toContain('Lease Expires')
    expect(result.world.clock).toBe(BASE_CLOCK + CLOCK_STEP_MS)
    expect(world.clock).toBe(BASE_CLOCK)
    expect(result.ok).toBe(true)
  })

  it('flushes the DNS cache with an effect', () => {
    const result = applyCommand(createLarkspurWorld(), 'ipconfig /flushdns')

    expect(text(result)).toMatch(/flushed/i)
    expect(result.effects).toEqual([
      { type: 'dns_cache_flushed', target: 'LT-4471' },
    ])
  })

  it('renews a broken DHCP lease and repairs name resolution', () => {
    const world = createLarkspurWorld()
    const device = deviceIn(world, 'lt-4471')
    device.ipAddress = '169.254.22.10'
    device.dnsServers = []

    const result = applyCommand(world, 'ipconfig /renew')
    const renewed = deviceIn(result.world, 'lt-4471')

    expect(renewed.ipAddress?.startsWith('10.20.4.')).toBe(true)
    expect(renewed.dnsServers).toEqual(['10.20.4.10', '10.20.4.11'])
    expect(renewed.dhcpLease?.obtainedAt).toBe(BASE_CLOCK + CLOCK_STEP_MS)
    expect(result.effects[0]?.type).toBe('lease_renewed')
    expect(device.ipAddress).toBe('169.254.22.10')

    const answer = resolveName(result.world, renewed, 'lt-4471.larkspur.example')
    expect(answer).toMatchObject({ ok: true, address: renewed.ipAddress })
  })

  it('refuses to renew a static adapter', () => {
    const world = createLarkspurWorld()
    world.currentDeviceId = 'lt-8813'

    const result = applyCommand(world, 'ipconfig /renew')

    expect(result.ok).toBe(false)
    expect(text(result)).toMatch(/no adapter is in the state permissible/i)
  })

  it('rejects unknown options with usage', () => {
    const result = applyCommand(createLarkspurWorld(), 'ipconfig /bogus')

    expect(result.ok).toBe(false)
    expect(text(result)).toContain('Usage: ipconfig')
  })
})

describe('ping', () => {
  it('resolves a name and reports replies', () => {
    const result = applyCommand(createLarkspurWorld(), 'ping intranet.larkspur.example')
    const output = text(result)

    expect(output).toContain('Pinging intranet.larkspur.example [10.20.4.20]')
    expect(output).toContain('Reply from 10.20.4.20')
    expect(output).toContain('Lost = 0 (0% loss)')
    expect(result.ok).toBe(true)
  })

  it('reports name resolution failure but still reaches literal addresses', () => {
    const world = createLarkspurWorld()
    deviceIn(world, 'lt-4471').dnsServers = ['10.20.4.53']

    const failed = applyCommand(world, 'ping intranet.larkspur.example')
    expect(text(failed)).toMatch(/could not find host/i)

    const literal = applyCommand(world, 'ping 1.1.1.1')
    expect(text(literal)).toContain('Reply from 1.1.1.1')
  })

  it('times out when the WAN is down', () => {
    const world = createLarkspurWorld()
    world.network.wanUp = false
    deviceIn(world, 'lt-4471').dnsServers = ['1.1.1.1']

    const result = applyCommand(world, 'ping 1.1.1.1')

    expect(text(result)).toContain('Request timed out.')
    expect(text(result)).toContain('100% loss')
  })

  it('requires a host argument', () => {
    const result = applyCommand(createLarkspurWorld(), 'ping')
    expect(result.ok).toBe(false)
    expect(text(result)).toContain('Usage: ping')
  })
})

describe('nslookup', () => {
  it('reports the resolved record', () => {
    const result = applyCommand(createLarkspurWorld(), 'nslookup fileserver.larkspur.example')

    expect(text(result)).toContain('Server:  UnKnown')
    expect(text(result)).toContain('Address:  10.20.4.25')
    expect(result.ok).toBe(true)
  })

  it('times out against an unknown server', () => {
    const result = applyCommand(createLarkspurWorld(), 'nslookup intranet.larkspur.example 10.20.4.53')

    expect(text(result)).toMatch(/DNS request timed out/i)
  })

  it('reports a non-existent domain', () => {
    const result = applyCommand(createLarkspurWorld(), 'nslookup nothing.larkspur.example')

    expect(text(result)).toMatch(/Non-existent domain/i)
  })
})

describe('set-dns and Test-NetConnection', () => {
  it('changes DNS servers and records the effect', () => {
    const result = applyCommand(createLarkspurWorld(), 'set-dns 10.20.4.10 10.20.4.11')

    expect(result.effects[0]).toMatchObject({ type: 'dns_changed', target: 'LT-4471' })
    expect(deviceIn(result.world, 'lt-4471').dnsServers).toEqual(['10.20.4.10', '10.20.4.11'])

    const after = applyCommand(result.world, 'nslookup intranet')
    expect(text(after)).toContain('Address:  10.20.4.20')
  })

  it('rejects invalid DNS addresses', () => {
    const result = applyCommand(createLarkspurWorld(), 'set-dns not-an-ip')
    expect(result.ok).toBe(false)
    expect(text(result)).toContain('Invalid IPv4 address')
  })

  it('supports positional and named Test-NetConnection arguments', () => {
    const positional = applyCommand(createLarkspurWorld(), 'Test-NetConnection fileserver.larkspur.example 445')
    expect(text(positional)).toContain('TcpTestSucceeded : True')

    const named = applyCommand(createLarkspurWorld(), 'tnc -ComputerName fileserver.larkspur.example -Port 445')
    expect(text(named)).toContain('TcpTestSucceeded : True')

    const closed = applyCommand(createLarkspurWorld(), 'Test-NetConnection fileserver.larkspur.example -Port 8080')
    expect(text(closed)).toContain('TcpTestSucceeded : False')
  })

  it('fails cleanly on bad parameters', () => {
    const missingHost = applyCommand(createLarkspurWorld(), 'Test-NetConnection')
    expect(missingHost.ok).toBe(false)

    const badPort = applyCommand(createLarkspurWorld(), 'Test-NetConnection fileserver.larkspur.example -Port abc')
    expect(badPort.ok).toBe(false)
  })
})

describe('a refused request', () => {
  function refusedWorld(): World {
    return {
      ...createLarkspurWorld(),
      refusal: { reason: 'third-party-request', label: 'Asked for someone else’s account', atMs: BASE_CLOCK },
    }
  }

  it('will not change an account once the desk has refused the request', () => {
    const world = refusedWorld()
    const before = world.users.find((user) => user.samAccountName === 'mchen')?.status
    const result = applyCommand(world, 'unlock-account mchen')

    expect(result.ok).toBe(false)
    expect(result.effects).toEqual([])
    expect(text(result)).toMatch(/refused on this ticket/i)
    expect(text(result)).toMatch(/asked for someone else’s account/i)
    // Nothing moved, and the world it was handed is untouched.
    expect(result.world.users.find((user) => user.samAccountName === 'mchen')?.status).toBe(before)
    expect(world.users.find((user) => user.samAccountName === 'mchen')?.status).toBe(before)
  })

  it('holds back every account-changing tool, not just the one the request named', () => {
    const refused = refusedWorld()

    for (const input of [
      'reset-password asingh',
      'reset-mfa asingh',
      'unblock-signin asingh',
      'add-group-member Operations mchen',
      'remove-share-deny Operations mchen',
    ]) {
      const result = applyCommand(refused, input)
      expect(result.ok, input).toBe(false)
      expect(result.effects, input).toEqual([])
    }
  })

  it('still lets the desk read, and still runs the commands a refusal does not cover', () => {
    const refused = refusedWorld()

    const lookup = applyCommand(refused, 'get-account mchen')
    expect(lookup.ok).toBe(true)
    expect(text(lookup)).toMatch(/samAccountName\s+: mchen/)

    // A printer or a lease has nothing to do with the refused account work.
    const spooler = applyCommand(refused, 'restart-spooler')
    expect(spooler.ok).toBe(true)
  })

  it('runs the same commands when no refusal is recorded', () => {
    const allowed = applyCommand(createLarkspurWorld(), 'unlock-account mchen')

    expect(allowed.ok).toBe(true)
    expect(allowed.effects).toEqual([{ type: 'account_unlocked', target: 'mchen' }])
  })
})

describe('identity commands', () => {
  it('unlocks a locked account and reports repeats', () => {
    const first = applyCommand(createLarkspurWorld(), 'unlock-account mchen')
    expect(first.effects).toEqual([{ type: 'account_unlocked', target: 'mchen' }])
    expect(deviceIn(first.world, 'lt-4472').loggedInUserId).toBe('u-marcus')

    const repeat = applyCommand(first.world, 'unlock-account mchen')
    expect(repeat.effects).toEqual([])
    expect(text(repeat)).toMatch(/not locked out/i)
  })

  it('resets an expired password and clears the expiry', () => {
    const result = applyCommand(createLarkspurWorld(), 'reset-password asingh')

    expect(result.effects[0]).toMatchObject({
      type: 'password_reset',
      target: 'asingh',
      details: { verifiedCaller: false },
    })
    expect(result.world.users.find((user) => user.samAccountName === 'asingh')?.passwordExpired).toBe(false)
    expect(text(result)).toMatch(/No password is entered or stored/i)
  })

  it('rejects unknown and disabled accounts', () => {
    const unknown = applyCommand(createLarkspurWorld(), 'unlock-account ghost')
    expect(unknown.ok).toBe(false)

    const disabled = applyCommand(createLarkspurWorld(), 'reset-password jortiz')
    expect(disabled.ok).toBe(false)
    expect(text(disabled)).toMatch(/disabled/i)
  })

  it('shows whoami and hostname for the current machine', () => {
    expect(text(applyCommand(createLarkspurWorld(), 'whoami'))).toBe('larkspur\\dwhitfield')
    expect(text(applyCommand(createLarkspurWorld(), 'hostname'))).toBe('LT-4471')

    const world = createLarkspurWorld()
    world.currentDeviceId = 'srv-dc01'
    const server = applyCommand(world, 'whoami')
    expect(server.ok).toBe(false)
  })
})

describe('help, errors, and determinism', () => {
  it('lists tools and documents a single command', () => {
    const overview = applyCommand(createLarkspurWorld(), 'help')
    expect(text(overview)).toContain('ipconfig')
    expect(text(overview)).toContain('reset-password')

    const topic = applyCommand(createLarkspurWorld(), 'help ipconfig')
    expect(text(topic)).toContain('Usage: ipconfig')

    const unknown = applyCommand(createLarkspurWorld(), 'help nope')
    expect(unknown.ok).toBe(false)
  })

  it('handles unknown and empty input', () => {
    const unknown = applyCommand(createLarkspurWorld(), 'frobnicate')
    expect(unknown.ok).toBe(false)
    expect(text(unknown)).toMatch(/not recognized/i)

    const world = createLarkspurWorld()
    const empty = applyCommand(world, '   ')
    expect(empty.world).toBe(world)
    expect(empty.ok).toBe(false)
  })

  it('is deterministic and keeps the world JSON-serializable', () => {
    const first = applyCommand(createLarkspurWorld(), 'ipconfig /all')
    const second = applyCommand(createLarkspurWorld(), 'ipconfig /all')

    expect(JSON.stringify(first.world)).toBe(JSON.stringify(second.world))
    expect(JSON.parse(JSON.stringify(first.world))).toEqual(first.world)
  })
})

describe('DHCP scope commands', () => {
  function scopeFor(world: World, siteId: string) {
    const scope = world.dhcpScopes.find((entry) => entry.siteId === siteId)
    if (!scope) {
      throw new Error(`no scope for ${siteId}`)
    }
    return scope
  }

  function fillScope(world: World, siteId: string) {
    const scope = scopeFor(world, siteId)
    const start = Number(scope.startAddress.split('.')[3])
    const end = Number(scope.endAddress.split('.')[3])
    const base = scope.startAddress.split('.').slice(0, 3).join('.')
    const used = new Set(scope.leases.map((lease) => lease.address))

    for (let octet = start; octet <= end; octet += 1) {
      const address = `${base}.${octet}`
      if (used.has(address) || scope.exclusions.includes(address)) {
        continue
      }
      scope.leases.push({
        address,
        hostname: `LT-LOAN-${octet}`,
        state: 'stale',
        expiresAt: world.clock - 3_600_000,
      })
    }
  }

  it('reports scope options, capacity, and the lease table', () => {
    const result = applyCommand(createLarkspurWorld(), 'get-dhcp-scope hq')

    expect(result.ok).toBe(true)
    expect(text(result)).toContain('Scope       : HQ-Users')
    expect(text(result)).toContain('Range       : 10.20.4.40 - 10.20.4.199')
    expect(text(result)).toContain('Option 006  : 10.20.4.10, 10.20.4.11')
    expect(text(result)).toMatch(/available/)
  })

  it('removes a stale lease and refuses to remove an active one', () => {
    const world = createLarkspurWorld()
    scopeFor(world, 'hq').leases.push({
      address: '10.20.4.150',
      hostname: 'LT-LOAN-01',
      state: 'stale',
      expiresAt: world.clock - 3_600_000,
    })

    const removed = applyCommand(world, 'remove-dhcp-lease hq 10.20.4.150')

    expect(removed.ok).toBe(true)
    expect(removed.effects).toEqual([
      {
        type: 'dhcp_lease_removed',
        target: 'hq/10.20.4.150',
        details: { hostname: 'LT-LOAN-01', scope: 'HQ-Users' },
      },
    ])
    expect(scopeFor(removed.world, 'hq').leases.some((lease) => lease.address === '10.20.4.150')).toBe(
      false,
    )

    const active = applyCommand(world, 'remove-dhcp-lease hq 10.20.4.57')
    expect(active.ok).toBe(false)
    expect(text(active)).toMatch(/active lease/i)
  })

  it('fails a renewal instead of inventing an address when the scope is full', () => {
    const world = createLarkspurWorld()
    fillScope(world, 'hq')
    const device = deviceIn(world, 'lt-4471')
    device.ipAddress = '169.254.30.10'
    device.gateway = null
    device.dnsServers = []
    device.dhcpLease = null

    const result = applyCommand(world, 'ipconfig /renew')

    expect(result.ok).toBe(false)
    expect(text(result)).toMatch(/no free addresses/i)
    expect(deviceIn(result.world, 'lt-4471').ipAddress).toBe('169.254.30.10')

    const stale = scopeFor(result.world, 'hq').leases.find((lease) => lease.state === 'stale')
    expect(stale).toBeDefined()

    const freed = applyCommand(result.world, `remove-dhcp-lease hq ${stale?.address ?? ''}`)
    expect(freed.ok).toBe(true)
    const renewed = applyCommand(freed.world, 'ipconfig /renew')
    expect(renewed.ok).toBe(true)
    expect(renewed.effects[0]?.type).toBe('lease_renewed')
  })

  it('rejects unknown sites and addresses', () => {
    const world = createLarkspurWorld()

    expect(applyCommand(world, 'get-dhcp-scope atlantis').ok).toBe(false)
    expect(applyCommand(world, 'remove-dhcp-lease hq 10.20.4.250').ok).toBe(false)
    expect(applyCommand(world, 'get-dhcp-scope').ok).toBe(false)
  })
})

describe('Microsoft 365 commands', () => {
  it('shows the sign-in error, MFA state, and block state', () => {
    const world = createLarkspurWorld()
    const account = world.m365.accounts.find((entry) => entry.userId === 'u-dana')
    if (!account) {
      throw new Error('missing tenant account')
    }
    account.signInBlocked = true
    account.lastSignInError = 'AADSTS50053'

    const output = text(applyCommand(world, 'get-signin-log dwhitfield'))

    expect(output).toContain('MFA registered  : True (authenticator)')
    expect(output).toContain('Sign-in blocked : True')
    expect(output).toContain('AADSTS50053')
  })

  it('unblocks sign-in and records the effect', () => {
    const world = createLarkspurWorld()
    const account = world.m365.accounts.find((entry) => entry.userId === 'u-dana')
    if (!account) {
      throw new Error('missing tenant account')
    }
    account.signInBlocked = true
    account.lastSignInError = 'AADSTS50053'

    const result = applyCommand(world, 'unblock-signin dwhitfield')

    expect(result.ok).toBe(true)
    expect(result.effects).toEqual([{ type: 'signin_unblocked', target: 'dwhitfield' }])
    const updated = result.world.m365.accounts.find((entry) => entry.userId === 'u-dana')
    expect(updated?.signInBlocked).toBe(false)
    expect(updated?.lastSignInError).toBeNull()
  })

  it('clears registered MFA methods but not for disabled accounts', () => {
    const world = createLarkspurWorld()
    const reset = applyCommand(world, 'reset-mfa dwhitfield')

    expect(reset.ok).toBe(true)
    expect(reset.effects[0]).toMatchObject({ type: 'mfa_reset', target: 'dwhitfield' })
    const account = reset.world.m365.accounts.find((entry) => entry.userId === 'u-dana')
    expect(account?.mfaRegistered).toBe(false)
    expect(account?.mfaMethod).toBe('none')

    const disabled = applyCommand(world, 'reset-mfa jortiz')
    expect(disabled.ok).toBe(false)
    expect(text(disabled)).toMatch(/disabled/i)

    const repeat = applyCommand(reset.world, 'reset-mfa dwhitfield')
    expect(repeat.effects).toEqual([])
    expect(text(repeat)).toMatch(/no mfa methods/i)
  })
})

describe('file share commands', () => {
  it('reports effective access and the group behind it', () => {
    const output = text(applyCommand(createLarkspurWorld(), 'get-share-access Finance dwhitfield'))

    expect(output).toContain('Effective   : Change')
    expect(output).toContain('FS-Finance-RW')
    expect(output).toContain('Entries')
  })

  it('shows read-only access when the read-write group is missing', () => {
    const world = createLarkspurWorld()
    const group = world.groups.find((entry) => entry.name === 'FS-Finance-RW')
    if (!group) {
      throw new Error('missing group')
    }
    group.members = group.members.filter((id) => id !== 'u-dana')

    const output = text(applyCommand(world, 'get-share-access Finance dwhitfield'))
    expect(output).toContain('Effective   : Read')
    expect(output).toMatch(/Reason\s+: Allowed through LARKSPUR.FS-All-Users\./)

    const added = applyCommand(world, 'add-group-member FS-Finance-RW dwhitfield')
    expect(added.effects).toEqual([
      { type: 'group_member_added', target: 'FS-Finance-RW/dwhitfield' },
    ])
    expect(text(applyCommand(added.world, 'get-share-access Finance dwhitfield'))).toContain(
      'Effective   : Change',
    )
  })

  it('reports and removes an explicit deny', () => {
    const world = createLarkspurWorld()
    const share = world.shares.find((entry) => entry.name === 'Finance')
    if (!share) {
      throw new Error('missing share')
    }
    share.grants.push({
      principal: { kind: 'user', samAccountName: 'dwhitfield' },
      access: 'read',
      allow: false,
    })

    const denied = text(applyCommand(world, 'get-share-access Finance dwhitfield'))
    expect(denied).toContain('Effective   : Denied')
    expect(denied).toContain('Explicit Deny')

    const removed = applyCommand(world, 'remove-share-deny Finance dwhitfield')
    expect(removed.ok).toBe(true)
    expect(removed.effects).toEqual([
      { type: 'share_deny_removed', target: 'Finance/dwhitfield' },
    ])
    expect(text(applyCommand(removed.world, 'get-share-access Finance dwhitfield'))).toContain(
      'Effective   : Change',
    )
  })

  it('rejects unknown shares, groups, and users', () => {
    const world = createLarkspurWorld()

    expect(applyCommand(world, 'get-share-access Payroll').ok).toBe(false)
    expect(applyCommand(world, 'add-group-member FS-Nope dwhitfield').ok).toBe(false)
    expect(applyCommand(world, 'add-group-member FS-All-Users ghost').ok).toBe(false)
    expect(applyCommand(world, 'remove-share-deny Finance ghost').ok).toBe(false)
  })
})

describe('asset lookup', () => {
  it('reads an in-service machine by hostname with its holder and state', () => {
    const result = applyCommand(createLarkspurWorld(), 'get-asset LT-4471')
    const output = text(result)

    expect(result.ok).toBe(true)
    expect(output).toContain('Asset tag       : LT-4471')
    expect(output).toContain('State           : In service')
    expect(output).toContain('Dana Whitfield · Finance (dwhitfield)')
    expect(output).toContain('Domain joined   : Yes')
    expect(output).toContain('10.20.4.57 (DHCP)')
    expect(result.effects).toEqual([])
  })

  it('accepts the register id as well as the hostname', () => {
    const byId = applyCommand(createLarkspurWorld(), 'get-asset lt-4471')
    expect(byId.ok).toBe(true)
    expect(text(byId)).toContain('LT-4471')
  })

  it('reads a shelf machine with its run, its note, and any open shipment', () => {
    const world = createLarkspurWorld()
    const queued = applyCommand(world, 'get-asset SHELF-DT-0102')
    const output = text(queued)

    expect(queued.ok).toBe(true)
    expect(output).toContain('State           : On a spare shelf')
    expect(output).toContain('Shelf state     : Needs imaging')
    expect(output).toContain('Deployment      : queued')
    expect(output).toContain('Shipment        : Not on any open shipment')
    expect(output).toContain('Wiped, waiting for an imaging slot.')

    const shipped = text(applyCommand(world, 'get-asset SHELF-DT-0101'))
    expect(shipped).toContain('LSP-8845 · outbound · preparing')
  })

  it('fails on a tag the register does not hold, and on a missing argument', () => {
    const missing = applyCommand(createLarkspurWorld(), 'get-asset SHELF-9999')
    expect(missing.ok).toBe(false)
    expect(text(missing)).toMatch(/no machine in the register matches/i)
    expect(text(missing)).toContain('SHELF-DT-0101')

    expect(applyCommand(createLarkspurWorld(), 'get-asset').ok).toBe(false)
    expect(applyCommand(createLarkspurWorld(), 'get-asset LT-4471 extra').ok).toBe(false)
  })
})

describe('pc shelf commands', () => {
  it('reads a bay by state, with the note behind each machine', () => {
    const result = applyCommand(createLarkspurWorld(), 'get-shelf hq')
    const output = text(result)

    expect(result.ok).toBe(true)
    expect(output).toContain('Larkspur HQ')
    expect(output).toContain('Machines held : 4')
    expect(output).toMatch(/Ready to go out\s+: 2/)
    expect(output).toContain('SHELF-LT-0117')
    expect(output).toContain('Battery replaced when it came back.')
    expect(output).toContain('SHELF-LT-0118')
    expect(output).toMatch(/Waiting on parts/)

    expect(applyCommand(createLarkspurWorld(), 'get-shelf nowhere').ok).toBe(false)
    expect(applyCommand(createLarkspurWorld(), 'get-shelf').ok).toBe(false)
  })

  it('issues a ready machine and puts it on the register under its holder', () => {
    const world = createLarkspurWorld()
    const starter = world.users.find((user) => user.id.startsWith('u-staff-'))
    if (!starter) {
      throw new Error('missing staff account')
    }

    const result = applyCommand(world, `book-shelf-machine SHELF-LT-0203 ${starter.samAccountName}`)

    expect(result.ok).toBe(true)
    expect(result.effects).toEqual([
      {
        type: 'machine_issued',
        target: 'SHELF-LT-0203',
        details: { hostname: 'LT-0203', samAccountName: starter.samAccountName },
      },
    ])
    const issued = result.world.devices.find((device) => device.hostname === 'LT-0203')
    expect(issued).toMatchObject({
      id: 'lt-0203',
      siteId: 'depot',
      kind: 'laptop',
      assignedUserId: starter.id,
      domainJoined: true,
    })
    expect(issued?.macAddress).toMatch(/^00-1A-2B-3F-[0-9A-F]{2}$/)
    expect(result.world.stock.some((item) => item.id === 'SHELF-LT-0203')).toBe(false)
    // The source world is untouched.
    expect(world.stock.some((item) => item.id === 'SHELF-LT-0203')).toBe(true)
  })

  it('refuses a machine that is not ready, unknown holders, and second machines', () => {
    const world = createLarkspurWorld()
    const starter = world.users.find((user) => user.id.startsWith('u-staff-'))
    if (!starter) {
      throw new Error('missing staff account')
    }

    const needsImage = applyCommand(world, `book-shelf-machine SHELF-DT-0102 ${starter.samAccountName}`)
    expect(needsImage.ok).toBe(false)
    expect(text(needsImage)).toMatch(/needs imaging/i)

    const held = applyCommand(world, `book-shelf-machine SHELF-LT-0204 ${starter.samAccountName}`)
    expect(held.ok).toBe(false)
    expect(text(held)).toMatch(/held, do not issue|cannot be issued/i)

    const unknown = applyCommand(world, 'book-shelf-machine SHELF-LT-0203 ghost')
    expect(unknown.ok).toBe(false)

    // A return in transit does not hold the machine back; the holder does.
    const second = applyCommand(world, 'book-shelf-machine SHELF-DT-0301 dwhitfield')
    expect(second.ok).toBe(false)
    expect(text(second)).toMatch(/already holds/i)
  })

  it('refuses a machine that is out on an outbound shipment', () => {
    const world = createLarkspurWorld()
    const starter = world.users.find((user) => user.id.startsWith('u-staff-'))
    if (!starter) {
      throw new Error('missing staff account')
    }

    const result = applyCommand(world, `book-shelf-machine SHELF-DT-0101 ${starter.samAccountName}`)

    expect(result.ok).toBe(false)
    expect(text(result)).toContain('LSP-8845')
  })

  it('holds a machine so it cannot be issued, once', () => {
    const result = applyCommand(createLarkspurWorld(), 'hold-shelf-machine SHELF-LT-0118 damage')

    expect(result.ok).toBe(true)
    expect(result.effects).toEqual([
      { type: 'shelf_held', target: 'SHELF-LT-0118', details: { reason: 'damage' } },
    ])
    const held = result.world.stock.find((item) => item.id === 'SHELF-LT-0118')
    expect(held?.state).toBe('quarantined')
    expect(held?.notes).toContain('damage')

    const repeat = applyCommand(result.world, 'hold-shelf-machine SHELF-LT-0118 damage')
    expect(repeat.ok).toBe(true)
    expect(repeat.effects).toEqual([])

    expect(applyCommand(createLarkspurWorld(), 'hold-shelf-machine SHELF-LT-0118').ok).toBe(false)
  })
})

describe('shipping commands', () => {
  it('reads the board with the late movements first', () => {
    const result = applyCommand(createLarkspurWorld(), 'get-shipments')
    const output = text(result)

    expect(result.ok).toBe(true)
    expect(output).toContain('Shipments : 5')
    expect(output).toContain('Delayed    : 1')
    const delayed = output.indexOf('LSP-8830')
    const preparing = output.indexOf('LSP-8845')
    expect(delayed).toBeGreaterThan(0)
    expect(delayed).toBeLessThan(preparing)

    const one = applyCommand(createLarkspurWorld(), 'get-shipment LSP-8830')
    expect(text(one)).toContain('Ridgeway Couriers')
    expect(text(one)).toMatch(/Shelf state : quarantined/)
    expect(applyCommand(createLarkspurWorld(), 'get-shipment LSP-0000').ok).toBe(false)
  })

  it('prints a return label without moving the shipment', () => {
    const world = createLarkspurWorld()
    const result = applyCommand(world, 'print-shipping-label LSP-8830')

    expect(result.ok).toBe(true)
    expect(text(result)).toContain('RETURN  LSP-8830')
    expect(text(result)).toMatch(/moves nothing/i)
    expect(result.effects).toEqual([])
    expect(result.world.shipments.find((entry) => entry.id === 'LSP-8830')?.state).toBe('delayed')

    const delivered = applyCommand(world, 'print-shipping-label LSP-8831')
    expect(text(delivered)).toMatch(/already delivered/i)
  })

  it('dispatches a prepared shipment but not a delayed one', () => {
    const result = applyCommand(createLarkspurWorld(), 'dispatch-shipment LSP-8845')

    expect(result.ok).toBe(true)
    expect(result.effects[0]).toMatchObject({ type: 'shipment_dispatched', target: 'LSP-8845' })
    const shipped = result.world.shipments.find((entry) => entry.id === 'LSP-8845')
    expect(shipped?.state).toBe('in-transit')
    expect(shipped?.lastEvent).toMatch(/Collected by Northwind Freight/)

    const delayed = applyCommand(createLarkspurWorld(), 'dispatch-shipment LSP-8830')
    expect(delayed.ok).toBe(false)
    expect(text(delayed)).toMatch(/rebook it first/i)

    const again = applyCommand(result.world, 'dispatch-shipment LSP-8845')
    expect(again.ok).toBe(true)
    expect(again.effects).toEqual([])
  })

  it('records delivery only for a shipment that left the building', () => {
    const result = applyCommand(createLarkspurWorld(), 'deliver-shipment LSP-8842')

    expect(result.ok).toBe(true)
    expect(result.effects[0]).toMatchObject({ type: 'shipment_delivered', target: 'LSP-8842' })
    expect(result.world.shipments.find((entry) => entry.id === 'LSP-8842')?.state).toBe('delivered')

    const preparing = applyCommand(createLarkspurWorld(), 'deliver-shipment LSP-8845')
    expect(preparing.ok).toBe(false)
    expect(text(preparing)).toMatch(/has not been collected/i)

    const delayed = applyCommand(createLarkspurWorld(), 'deliver-shipment LSP-8830')
    expect(delayed.ok).toBe(false)
    expect(text(delayed)).toMatch(/never left/i)
  })

  it('rebooks a missed collection with a new due date', () => {
    const result = applyCommand(createLarkspurWorld(), 'rebook-shipment LSP-8830 2')

    expect(result.ok).toBe(true)
    expect(result.effects).toEqual([
      { type: 'shipment_rebooked', target: 'LSP-8830', details: { days: 2 } },
    ])
    const rebooked = result.world.shipments.find((entry) => entry.id === 'LSP-8830')
    expect(rebooked?.state).toBe('preparing')
    expect(rebooked?.dueOn).toBe(BASE_CLOCK + CLOCK_STEP_MS + 2 * 24 * 60 * 60 * 1000)
    expect(rebooked?.lastEvent).toMatch(/Rebooked with Ridgeway Couriers/)

    expect(applyCommand(createLarkspurWorld(), 'rebook-shipment LSP-8842 2').ok).toBe(false)
    expect(applyCommand(createLarkspurWorld(), 'rebook-shipment LSP-8830 0').ok).toBe(false)
    expect(applyCommand(createLarkspurWorld(), 'rebook-shipment LSP-8830 soon').ok).toBe(false)
  })
})
