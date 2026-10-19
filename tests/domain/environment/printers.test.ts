import { describe, expect, it } from 'vitest'
import { findCommand } from '../../../src/domain/environment/commands'
import { searchConsoleEntries } from '../../../src/domain/environment/console'
import { createLarkspurWorld } from '../../../src/domain/environment/fixtures'
import { printersConsoleEntries } from '../../../src/domain/environment/printers'

describe('printersConsoleEntries', () => {
  const world = createLarkspurWorld()
  const entries = printersConsoleEntries(world)

  it('lists this machine first, then every printer by name', () => {
    expect(entries).toHaveLength(world.printers.length + 1)
    expect(entries[0]?.id).toBe(world.currentDeviceId)
    expect(entries[0]?.subtitle).toMatch(/^This machine/)

    expect(entries.slice(1).map((entry) => entry.title)).toEqual(
      world.printers.map((printer) => printer.name).sort((left, right) => left.localeCompare(right)),
    )
  })

  it('carries inventory facts only: no printer, job, or spooler state', () => {
    const json = JSON.stringify(entries)

    for (const printer of world.printers) {
      expect(json).not.toContain(printer.status)
      for (const job of printer.jobs) {
        expect(json).not.toContain(job.document)
        expect(json).not.toContain(job.owner)
      }
    }
    for (const device of world.devices) {
      expect(json).not.toContain(device.spoolerStatus)
    }
    for (const entry of entries) {
      expect(entry.note).toMatch(/not listed here/)
      expect(Object.keys(entry).sort()).toEqual([
        'actions',
        'facts',
        'groups',
        'id',
        'note',
        'subtitle',
        'title',
      ])
    }
  })

  it('maps every action onto a registered command for its own entry', () => {
    for (const entry of entries) {
      for (const action of entry.actions) {
        const command = action.command(
          entry.id,
          action.args?.map(() => 'x'),
        )
        const [name] = command.split(' ')
        expect(findCommand(name ?? '')).toBeDefined()
      }
    }

    const printer = world.printers[0]
    const printerEntry = entries.find((entry) => entry.id === printer?.id)
    expect(printerEntry?.actions.find((action) => action.id === 'printer-queue')?.command('x')).toBe(
      `get-printqueue ${printer?.name}`,
    )
    expect(printerEntry?.actions.find((action) => action.id === 'printer-clear')?.command('x')).toBe(
      `clear-printqueue ${printer?.name}`,
    )
    expect(entries[0]?.actions.find((action) => action.id === 'spooler-queue')?.command('x')).toBe(
      'get-printqueue',
    )
  })

  it('searches by printer, site, model, and share', () => {
    expect(searchConsoleEntries(entries, '   ')).toHaveLength(entries.length)

    const printer = world.printers[0]
    expect(printer).toBeDefined()
    if (!printer) {
      return
    }

    const site = world.sites.find((candidate) => candidate.id === printer.siteId)
    expect(
      searchConsoleEntries(entries, printer.name.toLowerCase()).map((entry) => entry.id),
    ).toContain(printer.id)
    expect(searchConsoleEntries(entries, printer.shareName).map((entry) => entry.id)).toContain(
      printer.id,
    )
    expect(searchConsoleEntries(entries, printer.model).map((entry) => entry.id)).toContain(
      printer.id,
    )
    expect(
      searchConsoleEntries(entries, site?.name ?? '').map((entry) => entry.id),
    ).toContain(printer.id)
    expect(searchConsoleEntries(entries, 'zzz-no-such-printer')).toEqual([])
  })
})
