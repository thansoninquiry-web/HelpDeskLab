import { errorLine, line, mutedLine } from '../output'
import type { Device, DirectoryUser, OutputLine, SiteId, StockItem, World } from '../types'
import type { CommandContext, CommandDefinition, CommandOutcome } from './types'
import { failed, succeeded, usageFailure } from './types'

/**
 * The asset register, read as a command rather than only as a projection.
 *
 * Asset Management shows the estate as a list, but a list is not evidence: a
 * learner who reads who holds a machine from a console has to be able to point
 * at that read in the ticket log. This lookup is the audited form of the same
 * record, and the console's read button runs it.
 *
 * It is deliberately read-only. Procurement facts — purchase date, lease end,
 * warranty — are still not modelled, so the lookup prints what the fleet and the
 * shelf actually report and nothing more.
 */

const KIND_LABELS: Record<Device['kind'], string> = {
  laptop: 'Laptop',
  desktop: 'Desktop',
  server: 'Server',
}

const STATE_LABELS: Record<StockItem['state'], string> = {
  ready: 'Ready to go out',
  'needs-image': 'Needs imaging',
  'awaiting-parts': 'Waiting on parts',
  quarantined: 'Held, do not issue',
}

function siteName(world: World, siteId: SiteId): string {
  return world.sites.find((site) => site.id === siteId)?.name ?? siteId
}

function byNeedle(value: string): string {
  return value.trim().toLowerCase()
}

/** In-service machines answer to their hostname or their register id. */
function findDevice(world: World, needle: string): Device | undefined {
  return world.devices.find(
    (device) =>
      device.hostname.toLowerCase() === needle || device.id.toLowerCase() === needle,
  )
}

/** Shelf machines only have a tag, so the tag is the lookup. */
function findStock(world: World, needle: string): StockItem | undefined {
  return world.stock.find((item) => item.id.toLowerCase() === needle)
}

function holderOf(world: World, device: Device): DirectoryUser | null {
  const holderId = device.assignedUserId ?? device.loggedInUserId
  return holderId ? (world.users.find((user) => user.id === holderId) ?? null) : null
}

function describeDevice(context: CommandContext, device: Device): OutputLine[] {
  const holder = holderOf(context.world, device)
  const signedIn = device.loggedInUserId
    ? (context.world.users.find((user) => user.id === device.loggedInUserId) ?? null)
    : null
  const updates =
    device.lastUpdateDays === 0
      ? 'Installed today'
      : `${device.lastUpdateDays} day${device.lastUpdateDays === 1 ? '' : 's'} ago`

  return [
    line(`Asset tag       : ${device.hostname}`),
    line(`State           : In service${device.id === context.world.currentDeviceId ? ' · this machine' : ''}`),
    line(`Kind            : ${KIND_LABELS[device.kind]}`),
    line(`Site            : ${siteName(context.world, device.siteId)}`),
    line(`Operating system: ${device.os}`),
    line(
      `Holder          : ${
        holder ? `${holder.displayName} · ${holder.department} (${holder.samAccountName})` : 'Unassigned'
      }`,
    ),
    line(
      `Signed in       : ${signedIn ? `${signedIn.displayName} (${signedIn.samAccountName})` : 'Nobody'}`,
    ),
    line(`Domain joined   : ${device.domainJoined ? 'Yes' : 'No'}`),
    line(
      `Address         : ${
        device.ipAddress ?? 'No usable address'
      } (${device.ipMode === 'dhcp' ? 'DHCP' : 'static'})`,
    ),
    line(`MAC address     : ${device.macAddress}`),
    line(`Disk free       : ${device.diskFreePercent}%`),
    line(`Last updates    : ${updates}`),
    line(`Pending reboot  : ${device.pendingReboot ? 'Yes' : 'No'}`),
    mutedLine('A register read answers who holds the machine and where it is. It is not a check of the machine.'),
  ]
}

function describeStock(context: CommandContext, item: StockItem): OutputLine[] {
  const task = context.world.deploymentTasks.find((entry) => entry.assetTag === item.id)
  const shipment = context.world.shipments.find(
    (entry) =>
      entry.assetTag?.toLowerCase() === item.id.toLowerCase() && entry.state !== 'delivered',
  )

  return [
    line(`Asset tag       : ${item.id}`),
    line('State           : On a spare shelf'),
    line(`Kind            : ${KIND_LABELS[item.kind]}`),
    line(`Model           : ${item.model}`),
    line(`Site            : ${siteName(context.world, item.siteId)}`),
    line(`Shelf state     : ${STATE_LABELS[item.state]}`),
    line(`Days on shelf   : ${item.daysOnShelf}`),
    line(`Shelf note      : ${item.notes}`),
    line(
      `Deployment      : ${task ? `${task.state} · ${task.step}` : 'No imaging run is booked against this tag'}`,
    ),
    line(
      `Shipment        : ${
        shipment
          ? `${shipment.id} · ${shipment.direction} · ${shipment.state}`
          : 'Not on any open shipment'
      }`,
    ),
    line('Holder          : Unassigned — a machine on the shelf is not issued yet'),
    mutedLine('A shelf machine can only be issued once the shelf says ready. Read the hold before promising a date.'),
  ]
}

function getAsset(context: CommandContext): CommandOutcome {
  const target = context.args[0]
  if (!target || context.args.length > 1) {
    return usageFailure('get-asset <assetTag>')
  }

  const needle = byNeedle(target)
  const device = findDevice(context.world, needle)
  if (device) {
    return succeeded(describeDevice(context, device))
  }

  const item = findStock(context.world, needle)
  if (item) {
    return succeeded(describeStock(context, item))
  }

  const tag = context.world.stock[0]?.id
  return failed([
    errorLine(`No machine in the register matches '${target}'.`),
    mutedLine(
      tag
        ? `Look a machine up by hostname, or a shelf machine by tag such as ${tag}.`
        : 'Look a machine up by hostname or shelf tag.',
    ),
  ])
}

export const assetCommands: readonly CommandDefinition[] = [
  {
    name: 'get-asset',
    aliases: [],
    group: 'assets',
    access: 'read',
    usage: 'get-asset <assetTag>',
    summary: 'Read one machine’s register record, holder, and shelf history',
    run: getAsset,
  },
]
