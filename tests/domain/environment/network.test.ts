import { describe, expect, it } from 'vitest'
import { createLarkspurWorld } from '../../../src/domain/environment/fixtures'
import {
  canReachAddress,
  isPortOpen,
  nextDhcpAddress,
  resolveName,
} from '../../../src/domain/environment/network'
import type { Device } from '../../../src/domain/environment/types'

function currentDevice(world = createLarkspurWorld()): Device {
  const device = world.devices.find((candidate) => candidate.id === world.currentDeviceId)
  if (!device) {
    throw new Error('fixture has no current device')
  }
  return device
}

describe('resolveName', () => {
  it('resolves internal names through the configured DNS servers', () => {
    const world = createLarkspurWorld()
    const answer = resolveName(world, currentDevice(world), 'Intranet.Larkspur.Example.')
    expect(answer).toEqual({ ok: true, address: '10.20.4.20', server: '10.20.4.10' })
  })

  it('fails to resolve when the configured DNS server does not exist', () => {
    const world = createLarkspurWorld()
    const device = currentDevice(world)
    device.dnsServers = ['10.20.4.53']

    expect(resolveName(world, device, 'intranet.larkspur.example')).toEqual({
      ok: false,
      reason: 'server-unreachable',
    })
  })

  it('reports different failures for link, configuration, and unknown names', () => {
    const world = createLarkspurWorld()
    const device = currentDevice(world)

    expect(resolveName(world, device, 'intranet.larkspur.example.')).toMatchObject({ ok: true })

    device.linkUp = false
    expect(resolveName(world, device, 'intranet.larkspur.example')).toEqual({
      ok: false,
      reason: 'link-down',
    })

    device.linkUp = true
    device.dnsServers = []
    expect(resolveName(world, device, 'intranet.larkspur.example')).toEqual({
      ok: false,
      reason: 'no-dns',
    })

    device.dnsServers = ['10.20.4.10']
    expect(resolveName(world, device, 'nothing.larkspur.example')).toEqual({
      ok: false,
      reason: 'nxdomain',
    })
  })

  it('keeps public resolvers from answering for the internal zone', () => {
    const world = createLarkspurWorld()
    const device = currentDevice(world)

    expect(resolveName(world, device, 'intranet.larkspur.example', '1.1.1.1')).toEqual({
      ok: false,
      reason: 'nxdomain',
    })
    expect(resolveName(world, device, 'www.example.com', '1.1.1.1')).toMatchObject({
      ok: true,
      address: '203.0.113.10',
    })
  })
})

describe('reachability', () => {
  it('treats internal addresses as reachable and public ones as WAN dependent', () => {
    const world = createLarkspurWorld()
    const device = currentDevice(world)

    expect(canReachAddress(world, device, '10.20.4.25')).toBe(true)
    expect(canReachAddress(world, device, '1.1.1.1')).toBe(true)

    world.network.wanUp = false
    expect(canReachAddress(world, device, '1.1.1.1')).toBe(false)
    expect(canReachAddress(world, device, '10.20.4.25')).toBe(true)
  })
})

describe('dhcp and ports', () => {
  it('allocates a deterministic in-subnet address', () => {
    const world = createLarkspurWorld()
    const site = world.sites[0]
    if (!site) {
      throw new Error('fixture has no sites')
    }

    const first = nextDhcpAddress(site, 'lt-4471')
    expect(first.startsWith('10.20.4.')).toBe(true)
    expect(nextDhcpAddress(site, 'lt-4471')).toBe(first)
    expect(nextDhcpAddress(site, 'lt-4472')).not.toBe(first)
  })

  it('opens realistic ports per target type', () => {
    const world = createLarkspurWorld()
    const device = currentDevice(world)

    expect(isPortOpen(world, device, '10.20.4.25', 445)).toBe(true)
    expect(isPortOpen(world, device, '10.20.4.25', 8080)).toBe(false)
    expect(isPortOpen(world, device, '203.0.113.10', 443)).toBe(true)

    world.network.wanUp = false
    expect(isPortOpen(world, device, '203.0.113.10', 443)).toBe(false)
  })
})
