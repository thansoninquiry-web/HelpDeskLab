import { describe, expect, it } from 'vitest'
import { findCommand } from '../../../src/domain/environment/commands'
import { searchConsoleEntries } from '../../../src/domain/environment/console'
import { createLarkspurWorld } from '../../../src/domain/environment/fixtures'
import { serverRoomConsoleEntries } from '../../../src/domain/environment/serverRoom'

describe('serverRoomConsoleEntries', () => {
  const world = createLarkspurWorld()
  const entries = serverRoomConsoleEntries(world)
  const current = world.devices.find((device) => device.id === world.currentDeviceId)
  const servers = world.devices.filter((device) => device.kind === 'server')

  it('lists this machine first, then every site, then every other server', () => {
    expect(entries[0]?.id).toBe(current?.id)
    expect(entries[0]?.subtitle).toMatch(/^This machine/)

    const ids = entries.map((entry) => entry.id)
    for (const site of world.sites) {
      expect(ids).toContain(site.id)
    }
    for (const server of servers) {
      if (server.id === current?.id) {
        continue
      }
      expect(ids).toContain(server.id)
    }
    expect(ids).toHaveLength(world.sites.length + servers.length + 1)
  })

  it('carries inventory facts only: no link, lease, or address state', () => {
    for (const entry of entries) {
      expect(Object.keys(entry).sort()).toEqual([
        'actions',
        'facts',
        'groups',
        'id',
        'note',
        'subtitle',
        'title',
      ])
      expect(entry.note).toMatch(/not listed here/)
    }

    // A machine's own address, and the DNS servers a site should be serving, are
    // exactly what the checks are for.
    for (const device of world.devices) {
      const entry = entries.find((candidate) => candidate.id === device.id)
      if (!entry || !device.ipAddress) {
        continue
      }
      expect(JSON.stringify(entry)).not.toContain(device.ipAddress)
    }
    for (const site of world.sites) {
      const entry = entries.find((candidate) => candidate.id === site.id)
      expect(entry).toBeDefined()
      for (const dnsServer of site.dnsServers) {
        expect(JSON.stringify(entry)).not.toContain(dnsServer)
      }
    }

    const leased = world.dhcpScopes.flatMap((scope) => scope.leases.map((lease) => lease.address))
    expect(leased.length).toBeGreaterThan(0)
    for (const address of leased) {
      expect(JSON.stringify(entries)).not.toContain(address)
    }
  })

  it('lists each site inventory without turning it into a state readout', () => {
    const hq = entries.find((entry) => entry.id === 'hq')
    expect(hq?.facts.map((fact) => fact.label)).toEqual([
      'Subnet',
      'Gateway',
      'DHCP server',
      'Devices',
    ])
    const devices = hq?.groups[0]?.items ?? []
    expect(devices.length).toBeGreaterThan(0)
    expect(devices.every((item) => item.split(' · ').length === 3)).toBe(true)
  })

  it('maps every action onto a registered command for its own entry', () => {
    for (const entry of entries) {
      expect(entry.actions.length).toBeGreaterThan(0)
      for (const action of entry.actions) {
        const command = action.command(entry.id)
        const [name] = command.split(' ')
        expect(findCommand(name ?? '')).toBeDefined()
      }
    }

    const hq = entries.find((entry) => entry.id === 'hq')
    expect(hq?.actions.find((action) => action.id === 'site-scope')?.command('hq')).toBe(
      'get-dhcp-scope hq',
    )
    const server = servers.find((device) => device.id !== current?.id)
    const serverEntry = entries.find((entry) => entry.id === server?.id)
    expect(serverEntry?.actions.find((action) => action.id === 'server-ping')?.command('x')).toBe(
      `ping ${server?.hostname}`,
    )
  })

  it('searches by site, hostname, subnet, and MAC address', () => {
    expect(searchConsoleEntries(entries, '   ')).toHaveLength(entries.length)
    expect(searchConsoleEntries(entries, 'WAREHOUSE').map((entry) => entry.id)).toContain(
      'warehouse',
    )
    expect(searchConsoleEntries(entries, 'srv-fs01').map((entry) => entry.id)).toContain('srv-fs01')
    expect(searchConsoleEntries(entries, '10.20.12.0').map((entry) => entry.id)).toContain(
      'warehouse',
    )

    const server = servers[0]
    expect(server).toBeDefined()
    expect(
      searchConsoleEntries(entries, server?.macAddress ?? '').map((entry) => entry.id),
    ).toContain(server?.id)
    expect(searchConsoleEntries(entries, 'zzz-no-such-thing')).toEqual([])
  })
})
