import { describe, expect, it } from 'vitest'
import { COMMANDS } from '../../../src/domain/environment/commands'
import type { CommandDefinition } from '../../../src/domain/environment/commands/types'
import { createLarkspurWorld } from '../../../src/domain/environment/fixtures'
import { commandPolicy, stockPolicy } from '../../../src/domain/environment/policy'
import { applyCommand } from '../../../src/domain/environment/reducer'
import type { CommandResult, Device, StockItem, World } from '../../../src/domain/environment/types'

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

function stockIn(world: World, id: string): StockItem {
  const item = world.stock.find((candidate) => candidate.id === id)
  if (!item) {
    throw new Error(`stock not found: ${id}`)
  }
  return item
}

function definitionNamed(name: string): CommandDefinition {
  const definition = COMMANDS.find((command) => command.name === name)
  if (!definition) {
    throw new Error(`command not found: ${name}`)
  }
  return definition
}

/** The machine the desk's own terminal runs on. */
function deskDevice(world: World): Device {
  return deviceIn(world, world.currentDeviceId)
}

/** A printer at a machine's site, as the queue commands resolve one by name. */
function printerAt(world: World, device: Device): string {
  const printer = world.printers.find((candidate) => candidate.siteId === device.siteId)
  if (!printer) {
    throw new Error(`no printer at ${device.siteId}`)
  }
  return printer.name
}

/** Another user machine, so a remote command has a target that is not the desk's. */
function otherDevice(world: World, siteId: string): Device {
  const device = world.devices.find(
    (candidate) => candidate.siteId === siteId && candidate.kind !== 'server' && candidate.assignedUserId,
  )
  if (!device) {
    throw new Error(`no user machine at ${siteId}`)
  }
  return device
}

describe('the rules a command cannot walk over', () => {
  it('names the rule that answered, so a test can name the decision', () => {
    const world = createLarkspurWorld()
    world.refusal = { reason: 'unverified-identity', label: 'Could not verify who is calling', atMs: 0 }

    const refusal = commandPolicy({
      world,
      device: deskDevice(world),
      definition: definitionNamed('unlock-account'),
    })

    expect(refusal?.rule).toBe('request-refused')
    expect(refusal?.lines.map((line) => line.text).join('\n')).toMatch(/will not run/i)
  })

  it('stops the queue work the spooler flag names, and nothing else', () => {
    const stopped = COMMANDS.filter((command) => command.needsSpooler === true).map((c) => c.name)

    // The flag is the list: a command added with it is covered by the rule
    // without a second place to say what a stopped spooler stops.
    expect(stopped.length).toBeGreaterThan(0)
    expect(stopped).toContain('get-printqueue')
    expect(stopped).toContain('clear-printqueue')
    expect(stopped).toContain('remote-clear-printqueue')

    // Listing printers is the diagnostic, so it is deliberately left off the
    // flag: a stopped service has to be visible somewhere before it can be fixed.
    expect(stopped).not.toContain('get-printers')
    expect(stopped).not.toContain('restart-spooler')
    expect(stopped).not.toContain('remote-restart-spooler')
  })

  it('blocks reading and clearing a queue while the spooler is stopped', () => {
    const world = createLarkspurWorld()
    deskDevice(world).spoolerStatus = 'stopped'
    const printer = printerAt(world, deskDevice(world))

    const read = applyCommand(world, `get-printqueue ${printer}`)
    expect(read.ok).toBe(false)
    expect(text(read)).toMatch(/Print Spooler on LT-4471 is stopped/)
    expect(text(read)).toMatch(/Start it first: restart-spooler/)

    // The same decision stops clearing a queue. Reading a queue and clearing one
    // both go through the service that is stopped, so one rule covers both.
    const cleared = applyCommand(world, `clear-printqueue ${printer}`)
    expect(cleared.ok).toBe(false)
    expect(text(cleared)).toMatch(/Print Spooler on LT-4471 is stopped/)
    expect(text(cleared)).toMatch(/Start it first: restart-spooler/)

    // Nothing moved, and the way out works: start the service and the queue is
    // there to read again.
    const restarted = applyCommand(cleared.world, 'restart-spooler')
    expect(restarted.effects).toEqual([{ type: 'spooler_restarted', target: 'LT-4471' }])
    expect(applyCommand(restarted.world, `get-printqueue ${printer}`).ok).toBe(true)
  })

  it('reads the target machine, not the desk machine a remote command was typed at', () => {
    const world = createLarkspurWorld()
    const desk = deskDevice(world)
    const target = otherDevice(world, world.sites[1]?.id ?? '')
    const printer = printerAt(world, target)
    target.spoolerStatus = 'stopped'

    // The queue belongs to a desktop the desk is connected to, so the session is
    // opened first: what is left to answer is the target's own service.
    const connected = applyCommand(world, `connect-remote ${target.hostname}`)
    const refused = applyCommand(
      connected.world,
      `remote-clear-printqueue ${target.hostname} ${printer}`,
    )
    expect(refused.ok).toBe(false)
    expect(text(refused)).toMatch(new RegExp(`Print Spooler on ${target.hostname} is stopped`))
    expect(text(refused)).toMatch(new RegExp(`remote-restart-spooler ${target.hostname}`))

    // The desk's own machine is running, so the rule can only have read the
    // machine the queue belongs to.
    expect(desk.spoolerStatus).toBe('running')
  })

  it('leaves the diagnostic that shows the stopped service alone', () => {
    const world = createLarkspurWorld()
    deskDevice(world).spoolerStatus = 'stopped'

    const listed = applyCommand(world, 'get-printers')

    expect(listed.ok).toBe(true)
    expect(text(listed)).toMatch(/Print Spooler service on this device is stopped/)
  })

  it('asks every command the same question, and stops only what a rule names', () => {
    const world = createLarkspurWorld()
    world.refusal = { reason: 'pressure', label: 'Used urgency to skip the checks', atMs: 0 }
    const device = deskDevice(world)

    for (const command of COMMANDS) {
      const refusal = commandPolicy({ world, device, definition: command })

      if (command.changesAccount === true) {
        expect(refusal?.rule, command.name).toBe('request-refused')
      } else if (command.needsSpooler === true) {
        continue
      } else {
        expect(refusal, command.name).toBeNull()
      }
    }
  })
})

describe('the desktop a command has to be connected to', () => {
  it('names the desktop actions with the flag, and gives each one a target to resolve', () => {
    const gated = COMMANDS.filter((command) => command.needsRemoteSession === true).map(
      (command) => command.name,
    )

    // The flag is the list: a desktop action added with it is gated without a
    // second place to say what needs a session.
    expect(gated.sort()).toEqual([
      'remote-check-updates',
      'remote-cleanup',
      'remote-clear-printqueue',
      'remote-flush-dns',
      'remote-renew-lease',
      'remote-restart-spooler',
      'remote-set-default-printer',
      'remote-sign-out',
      'use-remote-session',
    ])

    // A session without a machine would be a rule about the desk's own machine.
    for (const command of COMMANDS.filter((candidate) => candidate.needsRemoteSession === true)) {
      expect(command.targetDevice, command.name).toBeTypeOf('function')
    }

    // What needs a machine rather than a desktop stays off the flag.
    for (const name of ['get-remote-machine', 'reboot-remote', 'connect-remote', 'end-remote-session']) {
      expect(gated, name).not.toContain(name)
    }
  })

  it('refuses the desktop action until the machine it names has a session', () => {
    const world = createLarkspurWorld()
    const target = otherDevice(world, world.sites[1]?.id ?? '')

    const refusal = commandPolicy({
      world,
      device: deskDevice(world),
      definition: definitionNamed('remote-flush-dns'),
      target: definitionNamed('remote-flush-dns').targetDevice?.(world, [target.hostname]),
    })

    expect(refusal?.rule).toBe('no-live-session')
    const output = refusal?.lines.map((line) => line.text).join('\n') ?? ''
    expect(output).toMatch(new RegExp(`No active remote session is open on ${target.hostname}`))
    expect(output).toMatch(new RegExp(`Open one first: connect-remote ${target.hostname}`))

    // The session has to be to the machine named. The fixture keeps one live on
    // LT-8813 and the desk's own machine has none, so neither stands in for the
    // machine the command is aimed at.
    const live = createLarkspurWorld()
    const session = live.remoteSessions.find((candidate) => candidate.state === 'active')
    if (!session) throw new Error('the fixture has no live session')
    const definition = definitionNamed('remote-flush-dns')

    expect(
      commandPolicy({
        world: live,
        device: deskDevice(live),
        definition,
        target: deviceIn(live, session.machineId),
      }),
    ).toBeNull()
    expect(
      commandPolicy({
        world: live,
        device: deskDevice(live),
        definition,
        target: deviceIn(live, 'lt-9901'),
      })?.rule,
    ).toBe('no-live-session')
  })

  it('is asked before the spooler, so the way out is a command the desk can run', () => {
    const world = createLarkspurWorld()
    const target = otherDevice(world, world.sites[1]?.id ?? '')
    target.spoolerStatus = 'stopped'

    const refused = applyCommand(
      world,
      `remote-clear-printqueue ${target.hostname} ${printerAt(world, target)}`,
    )
    const output = text(refused)

    expect(refused.ok).toBe(false)
    expect(output).toMatch(/No active remote session is open on/)
    // The spooler message would name a restart that is itself gated.
    expect(output).not.toMatch(/Print Spooler .* is stopped/)
  })

  it('lets the same command through once the session is open, on the resolved target', () => {
    const world = createLarkspurWorld()
    const target = otherDevice(world, world.sites[1]?.id ?? '')
    const connected = applyCommand(world, `connect-remote ${target.hostname}`)

    const flushed = applyCommand(connected.world, `remote-flush-dns ${target.hostname}`)

    expect(flushed.ok).toBe(true)
    expect(flushed.effects).toEqual([{ type: 'dns_cache_flushed', target: target.hostname }])
  })

  it('answers a machine that is not a desktop with its kind, not with a session', () => {
    const world = createLarkspurWorld()
    const server = world.devices.find((device) => device.kind === 'server')
    if (!server) throw new Error('the fixture has no server')

    const refused = applyCommand(world, `remote-flush-dns ${server.hostname}`)

    expect(refused.ok).toBe(false)
    expect(text(refused)).toMatch(new RegExp(`${server.hostname} is a server`))
    expect(text(refused)).not.toMatch(/remote session is open/)
  })

  it('leaves the reads and the restart alone', () => {
    const world = createLarkspurWorld()
    const target = otherDevice(world, world.sites[1]?.id ?? '')

    expect(applyCommand(world, `get-remote-machine ${target.hostname}`).ok).toBe(true)
    expect(applyCommand(world, 'get-sessions').ok).toBe(true)

    // A restart is management of a machine the desk can name, so it answers
    // "nothing pending" rather than asking for a session.
    const reboot = applyCommand(world, `reboot-remote ${target.hostname}`)
    expect(reboot.ok).toBe(true)
    expect(text(reboot)).toMatch(/No restart is pending/)
  })
})

describe('what the shelf record stops', () => {
  it('lets a ready machine be imaged and issued', () => {
    const world = createLarkspurWorld()
    const item = stockIn(world, 'SHELF-DT-0101')
    item.state = 'ready'

    expect(stockPolicy(item, 'issue')).toBeNull()
    expect(stockPolicy(item, 'image')).toBeNull()
  })

  it('stops a machine that needs imaging from leaving the shelf, but not from being imaged', () => {
    const world = createLarkspurWorld()
    const item = stockIn(world, 'SHELF-DT-0101')
    item.state = 'needs-image'

    const refused = stockPolicy(item, 'issue')
    expect(refused?.rule).toBe('stock-not-available')
    expect(refused?.lines.map((line) => line.text).join('\n')).toMatch(
      /Finish an imaging run first: start-deployment SHELF-DT-0101/,
    )
    expect(stockPolicy(item, 'image')).toBeNull()
  })

  it('stops a hold and a parts wait from both, naming the hold as the reason', () => {
    const world = createLarkspurWorld()
    const item = stockIn(world, 'SHELF-DT-0101')

    item.state = 'quarantined'
    item.notes = 'Held by the desk: damage.'
    for (const intent of ['issue', 'image'] as const) {
      const refused = stockPolicy(item, intent)
      expect(refused?.rule, intent).toBe('stock-not-available')
      expect(refused?.lines.map((line) => line.text).join('\n'), intent).toMatch(/damage/)
    }

    item.state = 'awaiting-parts'
    item.notes = 'Waiting on a keyboard.'
    for (const intent of ['issue', 'image'] as const) {
      expect(stockPolicy(item, intent)?.lines.map((line) => line.text).join('\n'), intent).toMatch(
        /keyboard/,
      )
    }
  })

  it('answers the shelf command and the imaging run from the one rule', () => {
    const world = createLarkspurWorld()
    // A machine with a sequence against it, because the imaging run answers its
    // own preconditions — is there a deployment booked — before the hold.
    const tag = world.deploymentTasks[0]?.assetTag ?? ''
    const item = stockIn(world, tag)
    item.state = 'quarantined'
    item.notes = 'Held by the desk: damage.'

    const booking = applyCommand(world, `book-shelf-machine ${tag} dwhitfield`)
    const imaging = applyCommand(world, `start-deployment ${tag}`)

    // Both are refused, and both refuse because of the same held machine.
    expect(booking.ok).toBe(false)
    expect(imaging.ok).toBe(false)
    expect(text(booking)).toMatch(new RegExp(`${tag} cannot be issued`))
    expect(text(imaging)).toMatch(new RegExp(`${tag} is held`))
    expect(text(imaging)).toMatch(/Resolve the hold first/)
  })
})
