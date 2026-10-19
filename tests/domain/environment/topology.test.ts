import { describe, expect, it } from 'vitest'
import { createLarkspurWorld } from '../../../src/domain/environment/fixtures'
import {
  buildTopology,
  probeName,
  type TopologyCommand,
} from '../../../src/domain/environment/topology'

function command(text: string, lines: string[], atMs = 1_000): TopologyCommand {
  return { command: text, lines: lines.map((text) => ({ text })), atMs }
}

const PING_REPLY = [
  'Pinging 10.20.4.1 [10.20.4.1] with 32 bytes of data:',
  'Reply from 10.20.4.1: bytes=32 time=2ms TTL=128',
  '    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss),',
]

const PING_TIMEOUT = [
  'Pinging 10.20.4.1 [10.20.4.1] with 32 bytes of data:',
  'Request timed out.',
  '    Packets: Sent = 4, Received = 0, Lost = 4 (100% loss),',
]

function checkFor(
  topology: ReturnType<typeof buildTopology>,
  groupId: string,
  label: string,
) {
  return topology.groups
    .find((group) => group.id === groupId)
    ?.checks.find((check) => check.label === label)
}

describe('buildTopology', () => {
  const world = createLarkspurWorld()
  const current = world.devices.find((device) => device.id === world.currentDeviceId)
  const servers = world.devices.filter(
    (device) => device.kind === 'server' && device.id !== current?.id,
  )

  it('starts every link dark until a check has run', () => {
    const topology = buildTopology(world, [])
    const checks = topology.groups.flatMap((group) => group.checks)

    expect(topology.total).toBe(2 + world.sites.length + servers.length)
    expect(checks).toHaveLength(topology.total)
    expect(topology.proved).toBe(0)
    expect(topology.failed).toBe(0)
    expect(checks.every((check) => check.state === 'unknown')).toBe(true)
    expect(checks.every((check) => check.evidence === null && check.atMs === null)).toBe(true)

    expect(topology.groups.map((group) => group.kind)).toEqual([
      'origin',
      ...world.sites.map(() => 'site'),
      'servers',
    ])
    expect(topology.groups[0]?.checks.map((check) => check.label)).toEqual([
      'Adapter and lease',
      'Name resolution',
    ])
  })

  it('lights one gateway only, and only for a ping that got a reply', () => {
    const proved = buildTopology(world, [command('ping 10.20.4.1', PING_REPLY)])
    const hq = checkFor(proved, 'site:hq', 'Gateway')

    expect(hq?.state).toBe('proved')
    expect(hq?.command).toBe('ping 10.20.4.1')
    expect(hq?.evidence).toMatch(/^Reply from 10\.20\.4\.1/)
    expect(proved.proved).toBe(1)
    expect(checkFor(proved, 'site:depot', 'Gateway')?.state).toBe('unknown')

    const failed = buildTopology(world, [command('ping 10.20.4.1', PING_TIMEOUT)])
    expect(checkFor(failed, 'site:hq', 'Gateway')?.state).toBe('failed')
    expect(checkFor(failed, 'site:hq', 'Gateway')?.evidence).toMatch(/Request timed out/)
    expect(failed.failed).toBe(1)
    expect(failed.proved).toBe(0)
  })

  it('proves a server link from a ping by hostname or by address', () => {
    const reply = ['Reply from 10.20.4.25: bytes=32 time=2ms TTL=128']
    const byName = buildTopology(world, [command('ping SRV-FS01', reply)])
    expect(checkFor(byName, 'servers', 'SRV-FS01')?.state).toBe('proved')

    const byAddress = buildTopology(world, [command('ping 10.20.4.25', reply)])
    expect(checkFor(byAddress, 'servers', 'SRV-FS01')?.state).toBe('proved')
    expect(checkFor(byAddress, 'servers', 'SRV-DC01')?.state).toBe('unknown')
  })

  it('proves name resolution only when the lookup answered', () => {
    const probe = probeName(world)
    const answered = buildTopology(world, [
      command(`nslookup ${probe}`, [
        'Server:  UnKnown',
        'Address:  10.20.4.10',
        '',
        `Name:    ${probe}`,
        'Address:  10.20.4.25',
      ]),
    ])
    expect(checkFor(answered, 'origin', 'Name resolution')?.state).toBe('proved')
    expect(checkFor(answered, 'origin', 'Name resolution')?.evidence).toMatch(/^Name:/)

    const missing = buildTopology(world, [
      command(`nslookup ${probe}`, [
        'Server:  UnKnown',
        'Address:  10.20.4.53',
        '',
        `*** UnKnown can't find ${probe}: Non-existent domain`,
      ]),
    ])
    expect(checkFor(missing, 'origin', 'Name resolution')?.state).toBe('failed')
  })

  it('reads the adapter check from the interface output', () => {
    const down = buildTopology(world, [
      command('ipconfig /all', [
        'Ethernet adapter Ethernet:',
        '   Media State . . . . . . . . . . . : Media disconnected',
      ]),
    ])
    expect(checkFor(down, 'origin', 'Adapter and lease')?.state).toBe('failed')

    const up = buildTopology(world, [
      command('ipconfig /all', ['   IPv4 Address. . . . . . . . . . . : 10.20.4.58(Preferred)']),
    ])
    expect(checkFor(up, 'origin', 'Adapter and lease')?.state).toBe('proved')
  })

  it('keeps the latest result and ignores commands that test nothing', () => {
    const topology = buildTopology(world, [
      command('ping 10.20.4.1', PING_REPLY, 1),
      command('nslookup intranet.larkspur.example', ['Name:    intranet.larkspur.example'], 2),
      command('get-dhcp-scope hq', ['Scope       : HQ-Users'], 3),
      command('ping 10.20.4.1', PING_TIMEOUT, 4),
    ])

    const gateway = checkFor(topology, 'site:hq', 'Gateway')
    expect(gateway?.state).toBe('failed')
    expect(gateway?.atMs).toBe(4)
    // A lookup of some other name is not the check the map offers.
    expect(checkFor(topology, 'origin', 'Name resolution')?.state).toBe('unknown')
    expect(topology.proved).toBe(0)
    expect(topology.failed).toBe(1)
  })
})
