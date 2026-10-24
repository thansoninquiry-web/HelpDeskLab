import { errorLine, line, mutedLine, successLine } from '../output'
import { stockPolicy } from '../policy'
import { stockStateLabel } from '../stock'
import type { Device, Site, StockItem, StockState, World } from '../types'
import type { CommandContext, CommandDefinition, CommandOutcome } from './types'
import { failed, succeeded, usageFailure } from './types'

/**
 * The PC shelf. A machine that is ready can be booked out to the person waiting
 * for it; one that is not ready is never issued, whatever the ticket asks for.
 * Booking a machine out is a real handover: it leaves the shelf and appears on
 * the asset register as a device held by that account.
 */

/** What can leave first, and what must not leave at all. */
const STATE_ORDER: readonly StockState[] = ['ready', 'needs-image', 'awaiting-parts', 'quarantined']

function resolveSite(context: CommandContext, value: string): Site | undefined {
  const needle = value.trim().toLowerCase()
  return context.world.sites.find(
    (site) => site.id.toLowerCase() === needle || site.name.toLowerCase() === needle,
  )
}

function findStock(world: World, value: string): StockItem | undefined {
  const needle = value.trim().toLowerCase()
  return world.stock.find((item) => item.id.toLowerCase() === needle)
}

/** The hostname a tag becomes once the machine is issued, e.g. SHELF-DT-0101. */
function hostnameFor(item: StockItem): string {
  return item.id.replace(/^SHELF-/i, '').toUpperCase()
}

/** The register id for the issued machine, e.g. dt-0101. */
function deviceIdFor(item: StockItem): string {
  return item.id.replace(/^SHELF-/i, '').toLowerCase()
}

/**
 * A unique MAC for a machine that has just been issued. Derived from the tag so
 * a replay of the same command lands on the same address, and walked forward
 * past any address already on the register so two tag hashes cannot collide.
 */
function macFor(world: World, tag: string): string {
  let byte = 0
  for (const character of tag) {
    byte = (byte * 31 + character.charCodeAt(0)) % 256
  }
  for (let step = 0; step < 256; step += 1) {
    const candidate = `00-1A-2B-3F-${byte.toString(16).toUpperCase().padStart(2, '0')}`
    if (!world.devices.some((device) => device.macAddress === candidate)) {
      return candidate
    }
    byte = (byte + 1) % 256
  }
  return '00-1A-2B-3F-FF'
}

function shelved(world: World, siteId: string): StockItem[] {
  return world.stock
    .filter((item) => item.siteId === siteId)
    .sort((left, right) => {
      const byState = STATE_ORDER.indexOf(left.state) - STATE_ORDER.indexOf(right.state)
      return byState !== 0
        ? byState
        : right.daysOnShelf - left.daysOnShelf || left.id.localeCompare(right.id)
    })
}

function getShelf(context: CommandContext): CommandOutcome {
  const target = context.args[0]
  if (!target || context.args.length > 1) {
    return usageFailure('get-shelf <site>')
  }

  const site = resolveSite(context, target)
  if (!site) {
    return failed([
      errorLine(`Unknown site '${target}'.`),
      mutedLine(`Known sites: ${context.world.sites.map((entry) => entry.id).join(', ')}`),
    ])
  }

  const items = shelved(context.world, site.id)
  const output = [
    line(`Shelf         : ${site.name} (${site.id})`),
    line(`Machines held : ${items.length}`),
    ...STATE_ORDER.map((state) =>
      line(
        `${stockStateLabel(state).padEnd(18)}: ${items.filter((item) => item.state === state).length}`,
      ),
    ),
  ]

  if (items.length === 0) {
    output.push(mutedLine('Nothing is on this site’s shelf.'))
    return succeeded(output)
  }

  output.push(line())
  for (const item of items) {
    const task = context.world.deploymentTasks.find((entry) => entry.assetTag === item.id)
    output.push(
      line(`${item.id} · ${item.kind} · ${item.model}`),
      line(`  State      : ${stockStateLabel(item.state)}`),
      line(`  Days held  : ${item.daysOnShelf}`),
      line(`  Shelf note : ${item.notes}`),
      line(
        `  Deployment : ${task ? `${task.state} · ${task.step}` : 'no run booked against this tag'}`,
      ),
    )
  }

  output.push(
    mutedLine('Only a ready machine can be issued, and issuing one does not clear a hold on it.'),
  )
  return succeeded(output)
}

function bookShelfMachine(context: CommandContext): CommandOutcome {
  const [tagArg, samArg] = context.args
  if (!tagArg || !samArg || context.args.length > 2) {
    return usageFailure('book-shelf-machine <assetTag> <samAccountName>')
  }

  const item = findStock(context.world, tagArg)
  if (!item) {
    return failed([
      errorLine(`No machine with the tag '${tagArg}' is on a shelf.`),
      mutedLine(`Tags on the shelves: ${context.world.stock.map((entry) => entry.id).join(', ')}`),
    ])
  }

  // The state of the machine is the shelf's own decision about it, and the
  // imaging run reads the same rule: `stockPolicy` is what "held" and "waiting
  // on parts" stop, written once for both commands.
  const unavailable = stockPolicy(item, 'issue')
  if (unavailable) {
    return failed(unavailable.lines)
  }

  // A machine already on a prepared or moving outbound shipment is not on the
  // shelf to hand over, whatever the shelf record still says.
  const travelling = context.world.shipments.find(
    (shipment) =>
      shipment.assetTag?.toLowerCase() === item.id.toLowerCase() &&
      shipment.direction === 'outbound' &&
      shipment.state !== 'delivered',
  )
  if (travelling) {
    return failed([
      errorLine(`${item.id} is booked out on ${travelling.id} (${travelling.carrier}).`),
      mutedLine('A machine on a truck is not a handover. Clear the shipment or pick another tag.'),
    ])
  }

  const needle = samArg.trim().toLowerCase()
  const user = context.world.users.find((candidate) => candidate.samAccountName.toLowerCase() === needle)
  if (!user) {
    return failed([
      errorLine(`No account '${samArg}' exists in the directory.`),
      mutedLine('Book the machine to the account the ticket names, not to whoever asks for it.'),
    ])
  }

  const held = context.world.devices.find((device) => device.assignedUserId === user.id)
  if (held) {
    return failed([
      errorLine(`${user.displayName} already holds ${held.hostname}.`),
      mutedLine('A replacement is a swap, not a second machine: check the register first.'),
    ])
  }

  const site = context.world.sites.find((candidate) => candidate.id === item.siteId)
  const device: Device = {
    id: deviceIdFor(item),
    hostname: hostnameFor(item),
    kind: item.kind,
    siteId: item.siteId,
    os: item.kind === 'desktop' ? 'Windows 11 Enterprise 23H2' : 'Windows 11 Pro 23H2',
    adapterDescription:
      item.kind === 'desktop'
        ? 'Realtek PCIe GbE Family Controller'
        : 'Intel(R) Wi-Fi 6E AX211 160MHz',
    macAddress: macFor(context.world, item.id),
    assignedUserId: user.id,
    loggedInUserId: null,
    linkUp: true,
    ipMode: 'dhcp',
    ipAddress: null,
    subnetMask: null,
    gateway: null,
    dnsServers: [...(site?.dnsServers ?? [])],
    dhcpLease: null,
    domainJoined: true,
    spoolerStatus: 'running',
    defaultPrinterId: null,
    pendingReboot: false,
    diskFreePercent: 100,
    lastUpdateDays: 0,
  }

  context.world.devices.push(device)
  context.world.stock = context.world.stock.filter((entry) => entry.id !== item.id)

  return succeeded(
    [
      successLine(`Issued ${item.id} to ${user.displayName} (${user.samAccountName}).`),
      line(`Hostname      : ${device.hostname}`),
      line(`Site          : ${site?.name ?? item.siteId}`),
      line(`Model         : ${item.model}`),
      line(`Register      : ${stockStateLabel('ready')} → in service, holder ${user.samAccountName}`),
      mutedLine('The machine has left the shelf. Record the tag and the holder in the ticket note.'),
    ],
    [
      {
        type: 'machine_issued',
        target: item.id,
        details: { hostname: device.hostname, samAccountName: user.samAccountName },
      },
    ],
  )
}

function holdShelfMachine(context: CommandContext): CommandOutcome {
  const [tagArg, reasonArg] = context.args
  if (!tagArg || !reasonArg || context.args.length > 2) {
    return usageFailure('hold-shelf-machine <assetTag> <reason>')
  }

  const reason = reasonArg.trim()
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{2,23}$/.test(reason)) {
    return failed([
      errorLine('Give one word for the reason, such as damage or parts.'),
      mutedLine('Usage: hold-shelf-machine <assetTag> <reason>'),
    ])
  }

  const item = findStock(context.world, tagArg)
  if (!item) {
    return failed([
      errorLine(`No machine with the tag '${tagArg}' is on a shelf.`),
      mutedLine(`Tags on the shelves: ${context.world.stock.map((entry) => entry.id).join(', ')}`),
    ])
  }

  if (item.state === 'quarantined') {
    return succeeded([
      mutedLine(`${item.id} is already held: ${item.notes}`),
      mutedLine('A second hold says nothing new, so nothing is recorded.'),
    ])
  }

  item.state = 'quarantined'
  item.notes = `Held by the desk: ${reason}.`

  return succeeded(
    [
      successLine(`Held ${item.id} on the shelf.`),
      line(`Shelf note : ${item.notes}`),
      mutedLine('A held machine is not issued. Whoever owns the fault clears the hold.'),
    ],
    [{ type: 'shelf_held', target: item.id, details: { reason } }],
  )
}

export const shelfCommands: readonly CommandDefinition[] = [
  {
    name: 'get-shelf',
    aliases: [],
    group: 'shelf',
    access: 'read',
    usage: 'get-shelf <site>',
    summary: 'Read a site’s spare shelf, with each machine’s state and note',
    run: getShelf,
  },
  {
    name: 'book-shelf-machine',
    aliases: [],
    group: 'shelf',
    access: 'change',
    usage: 'book-shelf-machine <assetTag> <samAccountName>',
    summary: 'Issue a ready shelf machine to a directory account',
    run: bookShelfMachine,
  },
  {
    name: 'hold-shelf-machine',
    aliases: [],
    group: 'shelf',
    access: 'change',
    usage: 'hold-shelf-machine <assetTag> <reason>',
    summary: 'Hold a shelf machine for damage or parts so it cannot be issued',
    run: holdShelfMachine,
  },
]
