import { describe, expect, it } from 'vitest'
import { CONSOLE_DEFINITIONS } from '../../../src/domain/environment/console'
import {
  CONSOLE_IDS,
  consoleEntries,
  findConsoleActionForCommand,
} from '../../../src/domain/environment/consoles'
import { createLarkspurWorld } from '../../../src/domain/environment/fixtures'

describe('consoleEntries', () => {
  const world = createLarkspurWorld()

  it('projects every registered console into the shared shape', () => {
    for (const consoleId of CONSOLE_IDS) {
      const entries = consoleEntries(world, consoleId)

      expect(entries.length).toBeGreaterThan(0)
      expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length)
      for (const entry of entries) {
        expect(entry.title.length).toBeGreaterThan(0)
        // Read-only records are allowed — the runbook shelf and the inventory
        // shelves have no command behind them — but they have to say so, so an
        // empty action list can never be mistaken for a wired-up console.
        if (entry.actions.length === 0) {
          expect(entry.note?.length ?? 0).toBeGreaterThan(0)
        }
      }
    }
  })

  it('offers a grid only where the records read as tiles, and names facts they all have', () => {
    for (const consoleId of CONSOLE_IDS) {
      const definition = CONSOLE_DEFINITIONS[consoleId]
      const tileFacts = definition.tileFacts ?? []

      if (!definition.showsGrid) {
        // Tiles' facts without the view that shows them are a declaration that
        // nothing reads.
        expect(tileFacts, consoleId).toEqual([])
        continue
      }

      expect(tileFacts.length, consoleId).toBeGreaterThan(0)
      for (const entry of consoleEntries(world, consoleId)) {
        for (const label of tileFacts) {
          const fact = entry.facts.find((candidate) => candidate.label === label)
          // A declared fact has to exist on every record, or the tile it lands
          // on is a blank square rather than a smaller record.
          expect(fact?.value.length, `${consoleId}/${entry.id}/${label}`).toBeGreaterThan(0)
        }
      }
    }
  })

  it('gives the directory the grid, and the facts a scan of it needs', () => {
    expect(CONSOLE_DEFINITIONS.directory.showsGrid).toBe(true)
    expect(CONSOLE_DEFINITIONS.directory.tileFacts).toEqual(['Employee ID', 'Site'])
  })

  it('keeps each console to the records it owns', () => {
    const accounts = new Set(world.users.map((user) => user.samAccountName))
    expect(consoleEntries(world, 'directory').every((entry) => accounts.has(entry.id))).toBe(true)

    expect(consoleEntries(world, 'shares').map((entry) => entry.id).sort()).toEqual(
      world.shares.map((share) => share.id).sort(),
    )

    const printers = consoleEntries(world, 'printers')
    expect(printers[0]?.id).toBe(world.currentDeviceId)
    expect(printers.map((entry) => entry.id)).toContain(world.printers[0]?.id)
  })

  it('offers an audited register read on every asset record', () => {
    const entries = consoleEntries(world, 'assets')

    for (const entry of entries) {
      expect(entry.actions, entry.id).toHaveLength(1)
      expect(entry.actions[0]?.command(entry.id)).toBe(`get-asset ${entry.id}`)
    }

    // Both halves of the register — in service and on a shelf — read through it.
    expect(entries.some((entry) => entry.id === world.devices[0]?.id)).toBe(true)
    expect(entries.some((entry) => entry.id === world.stock[0]?.id)).toBe(true)
    expect(findConsoleActionForCommand(world, 'get-asset SHELF-DT-0102')).toMatchObject({
      consoleId: 'assets',
      entryId: 'SHELF-DT-0102',
      actionId: 'asset-read',
      args: [],
    })
  })
})

describe('findConsoleActionForCommand', () => {
  const world = createLarkspurWorld()

  it('finds the action that runs an exact command', () => {
    expect(findConsoleActionForCommand(world, 'get-dhcp-scope hq')).toMatchObject({
      consoleId: 'server-room',
      entryId: 'hq',
      actionId: 'site-scope',
      args: [],
    })
    expect(findConsoleActionForCommand(world, 'restart-spooler')).toMatchObject({
      consoleId: 'printers',
      actionId: 'spooler-restart',
    })
    expect(findConsoleActionForCommand(world, 'ipconfig /all')).toMatchObject({
      consoleId: 'server-room',
      actionId: 'machine-adapter',
    })
  })

  it('reads the supplied values back out of the command', () => {
    expect(findConsoleActionForCommand(world, 'remove-dhcp-lease depot 10.20.8.41')).toMatchObject({
      consoleId: 'server-room',
      entryId: 'depot',
      actionId: 'site-release-lease',
      args: ['10.20.8.41'],
    })
    expect(findConsoleActionForCommand(world, 'add-group-member FS-Finance-RW mchen')).toMatchObject({
      consoleId: 'shares',
      actionId: 'share-grant',
      args: ['FS-Finance-RW', 'mchen'],
    })
  })

  it('refuses a command that no action produces exactly', () => {
    // Half of the command, an extra word, an account that is not listed, and a
    // command outside every console.
    expect(findConsoleActionForCommand(world, 'remove-dhcp-lease hq')).toBeNull()
    expect(findConsoleActionForCommand(world, 'remove-dhcp-lease hq 10.20.4.40 extra')).toBeNull()
    expect(findConsoleActionForCommand(world, 'unlock-account nobody-here')).toBeNull()
    expect(findConsoleActionForCommand(world, 'shutdown /r')).toBeNull()
  })
})
