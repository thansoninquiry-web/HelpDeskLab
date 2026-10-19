import type { ConsoleAction, ConsoleEntry } from './console'
import type { Device, DeviceKind, SiteId, StockItem, World } from './types'

/**
 * The asset register: every machine the estate knows about, in service or on a
 * shelf, with the facts the fleet actually reports.
 *
 * Deliberately absent: purchase date, lease end, and warranty. Those are
 * procurement records the world does not model yet, and inventing them would put
 * numbers in front of a learner that no command could ever confirm.
 */

const KIND_LABELS: Record<DeviceKind, string> = {
  laptop: 'Laptop',
  desktop: 'Desktop',
  server: 'Server',
}

const NOTE =
  'Procurement records — purchase date, lease end, and warranty — are not modelled yet. The register holds what the fleet reports: who holds a machine, where it is, and its last known state. Opening a record here changes nothing; reading it with the button below logs the lookup like any other command.'

/** The audited form of the record on screen: the same lookup every other read uses. */
function readAction(): ConsoleAction {
  return {
    id: 'asset-read',
    label: 'Read the register',
    detail: 'Run the audited register lookup for this machine and put it in the ticket log.',
    command: (entryId) => `get-asset ${entryId}`,
  }
}

function siteName(world: World, siteId: SiteId): string {
  return world.sites.find((site) => site.id === siteId)?.name ?? siteId
}

function holderLabel(world: World, device: Device): string {
  const holderId = device.assignedUserId ?? device.loggedInUserId
  if (!holderId) {
    return 'Unassigned'
  }
  const user = world.users.find((candidate) => candidate.id === holderId)
  return user ? `${user.displayName} · ${user.department}` : holderId
}

function deviceEntry(world: World, device: Device): ConsoleEntry {
  const current = device.id === world.currentDeviceId

  return {
    id: device.id,
    title: device.hostname,
    subtitle: `${siteName(world, device.siteId)} · ${KIND_LABELS[device.kind]}${current ? ' · this machine' : ''}`,
    facts: [
      { label: 'Asset tag', value: device.hostname },
      { label: 'Site', value: siteName(world, device.siteId) },
      { label: 'Kind', value: KIND_LABELS[device.kind] },
      { label: 'Operating system', value: device.os },
      { label: 'Holder', value: holderLabel(world, device) },
      { label: 'Joined to the domain', value: device.domainJoined ? 'Yes' : 'No' },
      { label: 'Disk free', value: `${device.diskFreePercent}%` },
      {
        label: 'Last updated',
        value:
          device.lastUpdateDays === 0 ? 'Today' : `${device.lastUpdateDays} day${device.lastUpdateDays === 1 ? '' : 's'} ago`,
      },
      { label: 'Pending reboot', value: device.pendingReboot ? 'Yes' : 'No' },
    ],
    groups: [],
    actions: [readAction()],
    note: NOTE,
  }
}

function shelfEntry(world: World, item: StockItem): ConsoleEntry {
  return {
    id: item.id,
    title: item.id,
    subtitle: `${siteName(world, item.siteId)} · on the spare shelf`,
    facts: [
      { label: 'Asset tag', value: item.id },
      { label: 'Site', value: siteName(world, item.siteId) },
      { label: 'Kind', value: KIND_LABELS[item.kind] },
      { label: 'Model', value: item.model },
      { label: 'Days on the shelf', value: String(item.daysOnShelf) },
    ],
    groups: [{ label: 'Shelf note', items: [item.notes], empty: 'No note on this machine.' }],
    actions: [readAction()],
    note: NOTE,
  }
}

/** Machines in service by hostname, then shelf stock by tag. */
export function assetsConsoleEntries(world: World): ConsoleEntry[] {
  const devices = [...world.devices].sort((left, right) =>
    left.hostname.localeCompare(right.hostname),
  )
  const shelf = [...world.stock].sort((left, right) => left.id.localeCompare(right.id))

  return [...devices.map((device) => deviceEntry(world, device)), ...shelf.map((item) => shelfEntry(world, item))]
}
