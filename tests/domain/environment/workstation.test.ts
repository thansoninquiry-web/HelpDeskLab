import { describe, expect, it } from 'vitest'
import { createLarkspurWorld } from '../../../src/domain/environment/fixtures'
import { applyCommand } from '../../../src/domain/environment/reducer'
import type { CommandResult, World } from '../../../src/domain/environment/types'

function text(result: CommandResult): string {
  return result.lines.map((entry) => entry.text).join('\n')
}

function deviceIn(world: World, id: string) {
  const device = world.devices.find((candidate) => candidate.id === id)
  if (!device) {
    throw new Error(`device not found: ${id}`)
  }
  return device
}

describe('workstation shell', () => {
  it('answers hostname, whoami, version, and echo from the simulated machine', () => {
    const world = createLarkspurWorld()

    expect(text(applyCommand(world, 'hostname'))).toBe('LT-4471')
    expect(text(applyCommand(world, 'whoami'))).toBe('larkspur\\dwhitfield')
    expect(text(applyCommand(world, 'ver'))).toContain('Microsoft Windows')
    expect(text(applyCommand(world, 'echo reset the password'))).toBe('reset the password')
  })

  it('reads the profile folder and its hosts file', () => {
    const world = createLarkspurWorld()

    const listing = text(applyCommand(world, 'dir'))
    expect(listing).toContain('Directory of C:\\Users\\dwhitfield')
    expect(listing).toContain('hosts.txt')

    const hosts = text(applyCommand(world, 'type hosts'))
    expect(hosts).toContain('127.0.0.1')
    expect(hosts).toContain(world.domain)

    const missing = applyCommand(world, 'type nope.txt')
    expect(missing.ok).toBe(false)
    expect(text(missing)).toContain('cannot find the file')
  })

  it('reports system facts from the device, site, and domain', () => {
    const world = createLarkspurWorld()
    const output = text(applyCommand(world, 'systeminfo'))

    expect(output).toContain('LT-4471')
    expect(output).toContain('Windows 11 Enterprise 23H2')
    expect(output).toContain('Larkspur HQ')
    expect(output).toContain(world.domain)
    expect(output).toContain('Intel(R) Wi-Fi 6E AX211 160MHz')
    expect(output).toContain('10.20.4.57')
  })

  it('shows the spooler process only while the spooler is running', () => {
    const world = createLarkspurWorld()
    expect(text(applyCommand(world, 'tasklist'))).toContain('spoolsv.exe')

    deviceIn(world, 'lt-4471').spoolerStatus = 'stopped'
    expect(text(applyCommand(world, 'tasklist'))).not.toContain('spoolsv.exe')
  })

  it('reports no connections on a dead link and established ones when up', () => {
    const world = createLarkspurWorld()
    const connected = text(applyCommand(world, 'netstat'))
    expect(connected).toContain('ESTABLISHED')
    expect(connected).toContain('10.20.4.57')

    deviceIn(world, 'lt-4471').linkUp = false
    const disconnected = text(applyCommand(world, 'netstat'))
    expect(disconnected).toContain('No active connections')
  })

  it('traces a private host and times out beyond a broken WAN', () => {
    const world = createLarkspurWorld()
    const good = text(applyCommand(world, 'tracert intranet.larkspur.example'))
    expect(good).toContain('Tracing route to intranet.larkspur.example')
    expect(good).toContain('10.20.4.1')
    expect(good).toContain('Trace complete')

    world.network.wanUp = false
    const broken = text(applyCommand(world, 'tracert 8.8.8.8'))
    expect(broken).toContain('Request timed out')
    expect(broken).toContain('Trace incomplete')

    const unknown = applyCommand(world, 'tracert not-a-host')
    expect(unknown.ok).toBe(false)
    expect(text(unknown)).toMatch(/Unable to resolve/i)
  })

  it('lists and reads domain accounts, and refuses account creation', () => {
    const world = createLarkspurWorld()

    const all = text(applyCommand(world, 'net user'))
    expect(all).toContain('User accounts for \\\\LT-4471')
    expect(all).toContain('dwhitfield')

    const one = text(applyCommand(world, 'net user dwhitfield'))
    expect(one).toContain('Full Name')
    expect(one).toContain('Account active')
    expect(one).toContain('The command completed successfully.')

    const denied = applyCommand(world, 'net user helpdesk /add')
    expect(denied.ok).toBe(false)
    expect(text(denied)).toMatch(/Access denied/i)
  })

  it('documents the new commands in help', () => {
    const overview = text(applyCommand(createLarkspurWorld(), 'help'))
    expect(overview).toContain('Workstation')
    expect(overview).toContain('systeminfo')
    expect(overview).toContain('tracert')

    const topic = text(applyCommand(createLarkspurWorld(), 'help tracert'))
    expect(topic).toContain('Usage: tracert')
  })
})
