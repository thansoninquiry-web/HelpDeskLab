import type { ConsoleAction, ConsoleEntry } from './console'
import type { Device, Printer, World } from './types'

/**
 * The Printers projection: the printing estate a desk can see before it touches
 * anything, plus the machine it is sitting at.
 *
 * Printer state, the jobs a printer holds, and the local spooler's state are all
 * absent — those are what the checks below report, so they land in the ticket log
 * as evidence instead of appearing for free.
 */

const NOTE =
  'Printer state, held jobs, and the spooler are not listed here: every action runs a real command, so the evidence lands in the ticket log.'

function listAction(): ConsoleAction {
  return {
    id: 'printer-list',
    label: 'Show every printer',
    detail: 'The printers this organization publishes, with their state.',
    command: () => 'get-printers',
  }
}

function printerEntry(world: World, printer: Printer): ConsoleEntry {
  const site = world.sites.find((candidate) => candidate.id === printer.siteId)

  return {
    id: printer.id,
    icon: 'printer',
    title: printer.name,
    subtitle: `${site?.name ?? printer.siteId} · ${printer.model}`,
    facts: [
      { label: 'Site', value: site?.name ?? printer.siteId },
      { label: 'Model', value: printer.model },
      { label: 'Address', value: printer.ipAddress },
      { label: 'Shared as', value: printer.shareName },
    ],
    groups: [],
    actions: [
      listAction(),
      {
        id: 'printer-queue',
        label: 'Inspect the queue',
        detail: `Jobs held against ${printer.name}, and whether it is taking work.`,
        command: () => `get-printqueue ${printer.name}`,
      },
      {
        id: 'printer-clear',
        label: 'Clear the queue',
        detail: `Drop every job waiting on ${printer.name} so it can be re-sent.`,
        command: () => `clear-printqueue ${printer.name}`,
      },
    ],
    note: NOTE,
  }
}

/**
 * The machine the session is connected to, because the spooler and the queue a
 * learner sees first are local to it.
 */
function currentMachineEntry(world: World, device: Device): ConsoleEntry {
  const site = world.sites.find((candidate) => candidate.id === device.siteId)

  return {
    id: device.id,
    icon: 'machine',
    title: device.hostname,
    subtitle: `This machine · ${site?.name ?? device.siteId}`,
    facts: [
      { label: 'Site', value: site?.name ?? device.siteId },
      { label: 'Operating system', value: device.os },
    ],
    groups: [],
    actions: [
      listAction(),
      {
        id: 'spooler-queue',
        label: 'Inspect the local queue',
        detail: 'What this machine is still trying to print.',
        command: () => 'get-printqueue',
      },
      {
        id: 'spooler-restart',
        label: 'Restart the local spooler',
        detail: 'Stop and start the print service on this machine.',
        command: () => 'restart-spooler',
      },
    ],
    note: NOTE,
  }
}

/** This machine first, then every printer by name. */
export function printersConsoleEntries(world: World): ConsoleEntry[] {
  const current = world.devices.find((device) => device.id === world.currentDeviceId) ?? null
  const printers = [...world.printers].sort((left, right) => left.name.localeCompare(right.name))

  const entries: ConsoleEntry[] = current ? [currentMachineEntry(world, current)] : []
  entries.push(...printers.map((printer) => printerEntry(world, printer)))

  return entries
}
