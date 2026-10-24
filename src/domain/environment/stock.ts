import { ACCOUNT_ARGUMENT, ASSET_TAG_ARGUMENT, REASON_ARGUMENT, offeredValues } from './console'
import type { ConsoleAction, ConsoleEntry } from './console'
import type { Site, StockItem, StockState, World } from './types'

/**
 * The PC shelf: one bay per site, with the machines that are not in service.
 *
 * The bay is a projection plus the two decisions it supports: book a ready
 * machine to an account, or hold a machine so it cannot be issued. Both buttons
 * run the same audited commands as the terminal, so the movement is in the log.
 */

/**
 * What each shelf state is called, wherever a shelf state is shown or read.
 * The bay, the asset record and the policy that stops a machine leaving the
 * shelf all name the states from here, so a state cannot be described one way
 * on the console and another way in the refusal that quotes it.
 */
export const STOCK_STATE_LABELS: Record<StockState, string> = {
  ready: 'Ready to go out',
  'needs-image': 'Needs imaging',
  'awaiting-parts': 'Waiting on parts',
  quarantined: 'Held, do not issue',
}

export function stockStateLabel(state: StockState): string {
  return STOCK_STATE_LABELS[state]
}

/** The order a bay is worth reading in: what can leave first, held stock last. */
const STATE_ORDER: readonly StockState[] = ['ready', 'needs-image', 'awaiting-parts', 'quarantined']

const NOTE =
  'Only a machine in the ready state can be booked out. A held machine stays on the shelf until the fault is closed.'

function describe(item: StockItem): string {
  return `${item.id} · ${item.model} · ${item.daysOnShelf} day${item.daysOnShelf === 1 ? '' : 's'} on the shelf`
}

function actionsFor(items: readonly StockItem[]): ConsoleAction[] {
  if (items.length === 0) {
    return []
  }

  const tags = offeredValues(items.map((item) => item.id))

  return [
    {
      id: 'shelf-read',
      label: 'Read the bay',
      detail: 'Run the shelf read for this site, with every state and note.',
      command: (siteId) => `get-shelf ${siteId}`,
    },
    {
      id: 'shelf-book',
      label: 'Book a machine out',
      detail:
        'Issue a ready machine to the account the ticket names. A machine that is not ready is refused.',
      command: (_siteId, args) => `book-shelf-machine ${args?.[0] ?? ''} ${args?.[1] ?? ''}`,
      args: [{ ...ASSET_TAG_ARGUMENT, choices: tags }, ACCOUNT_ARGUMENT],
    },
    {
      id: 'shelf-hold',
      label: 'Hold a machine',
      detail:
        'Put a machine on hold for a fault, so no booking can issue it. The hold is cleared by the team that owns the fault.',
      command: (_siteId, args) => `hold-shelf-machine ${args?.[0] ?? ''} ${args?.[1] ?? ''}`,
      args: [{ ...ASSET_TAG_ARGUMENT, choices: tags }, REASON_ARGUMENT],
    },
  ]
}

function bayEntry(site: Site, items: readonly StockItem[]): ConsoleEntry {
  const counts = STATE_ORDER.map((state) => ({
    state,
    items: items.filter((item) => item.state === state),
  }))

  return {
    id: site.id,
    title: `${site.name} spare shelf`,
    subtitle:
      items.length === 0
        ? 'Nothing on the shelf'
        : `${items.length} machine${items.length === 1 ? '' : 's'} · ${counts[0]?.items.length ?? 0} ready to go out`,
    facts: [
      { label: 'Site', value: site.name },
      { label: 'Machines held', value: String(items.length) },
      ...counts.map((group) => ({
        label: stockStateLabel(group.state),
        value: String(group.items.length),
      })),
    ],
    groups: counts.map((group) => ({
      label: `${stockStateLabel(group.state)} (${group.items.length})`,
      items: group.items.map(describe),
      empty: 'Nothing in this state.',
    })),
    actions: actionsFor(items),
    note: NOTE,
  }
}

/** Sites in world order, so a shelf stays where its site is listed. */
export function pcShelfConsoleEntries(world: World): ConsoleEntry[] {
  return world.sites.map((site) =>
    bayEntry(
      site,
      world.stock
        .filter((item) => item.siteId === site.id)
        .sort((left, right) => right.daysOnShelf - left.daysOnShelf || left.id.localeCompare(right.id)),
    ),
  )
}
