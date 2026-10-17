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
