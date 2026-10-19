import { DAYS_ARGUMENT } from './console'
import type { ConsoleAction, ConsoleEntry } from './console'
import type { Shipment, ShipmentDirection, ShipmentState, SiteId, World } from './types'

/**
 * The shipping desk: what is going out, what is coming back, and what is late.
 *
 * The board is a projection plus the movements it supports: print the label,
 * dispatch a collected shipment, deliver one that arrived, or rebook a missed
 * collection. Each button runs the same audited command as the terminal.
 */

const STATE_LABELS: Record<ShipmentState, string> = {
  preparing: 'Preparing',
  'in-transit': 'In transit',
  delayed: 'Delayed',
  delivered: 'Delivered',
}

/** What to look at first: late movements, then anything still to leave. */
const STATE_ORDER: readonly ShipmentState[] = ['delayed', 'preparing', 'in-transit', 'delivered']

const DIRECTION_LABELS: Record<ShipmentDirection, string> = {
  outbound: 'Going out',
  return: 'Coming back',
}

const NOTE =
  'A delay is not a delivery. Rebook a missed collection, dispatch it once the carrier has it, and record delivery only when it reaches the other site.'

const DAY_MS = 24 * 60 * 60 * 1000

/** A date without a locale, so the console reads the same everywhere. */
function formatDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** How the due date reads against the simulated clock it was read at. */
function dueLabel(shipment: Shipment, clock: number): string {
  const days = Math.round((shipment.dueOn - clock) / DAY_MS)
  if (days === 0) {
    return `${formatDay(shipment.dueOn)} · due today`
  }
  if (days > 0) {
    return `${formatDay(shipment.dueOn)} · due in ${days} day${days === 1 ? '' : 's'}`
  }
  const late = Math.abs(days)
  return `${formatDay(shipment.dueOn)} · ${late} day${late === 1 ? '' : 's'} overdue`
}

function siteName(world: World, siteId: SiteId): string {
  return world.sites.find((site) => site.id === siteId)?.name ?? siteId
}

function actionsFor(shipment: Shipment): ConsoleAction[] {
  const actions: ConsoleAction[] = [
    {
      id: 'shipment-read',
      label: 'Read the shipment',
      detail: 'Open this movement’s route, carrier, and latest tracking event.',
      command: (reference) => `get-shipment ${reference}`,
    },
  ]

  if (shipment.state === 'delivered') {
    return actions
  }

  actions.push({
    id: 'shipment-label',
    label: 'Print label',
    detail: 'Print the outbound or return label. Printing moves nothing on its own.',
    command: (reference) => `print-shipping-label ${reference}`,
  })

  if (shipment.state === 'preparing') {
    actions.push({
      id: 'shipment-dispatch',
      label: 'Dispatch',
      detail: 'Record the handover to the carrier once it has collected the shipment.',
      command: (reference) => `dispatch-shipment ${reference}`,
    })
  }

  if (shipment.state !== 'preparing') {
    actions.push({
      id: 'shipment-deliver',
      label: 'Mark delivered',
      detail: 'Close the movement at the receiving site. A delayed shipment never left.',
      command: (reference) => `deliver-shipment ${reference}`,
    })
  }

  if (shipment.state === 'delayed') {
    actions.push({
      id: 'shipment-rebook',
      label: 'Rebook collection',
      detail: 'Put a missed collection back into preparing with a new due date.',
      command: (reference, args) => `rebook-shipment ${reference} ${args?.[0] ?? ''}`,
      args: [DAYS_ARGUMENT],
    })
  }

  return actions
}

function shipmentEntry(world: World, shipment: Shipment): ConsoleEntry {
  return {
    id: shipment.id,
    title: `${shipment.id} · ${DIRECTION_LABELS[shipment.direction]}`,
    subtitle: `${siteName(world, shipment.fromSiteId)} → ${siteName(world, shipment.toSiteId)} · ${STATE_LABELS[shipment.state]}`,
    facts: [
      { label: 'Reference', value: shipment.id },
      { label: 'Direction', value: DIRECTION_LABELS[shipment.direction] },
      { label: 'Carrier', value: shipment.carrier },
      { label: 'State', value: STATE_LABELS[shipment.state] },
      { label: 'From', value: siteName(world, shipment.fromSiteId) },
      { label: 'To', value: siteName(world, shipment.toSiteId) },
      { label: 'Asset tag', value: shipment.assetTag ?? 'Consumable, not tagged' },
      { label: 'Due', value: dueLabel(shipment, world.clock) },
    ],
    groups: [{ label: 'Latest tracking event', items: [shipment.lastEvent], empty: 'No event recorded.' }],
    actions: actionsFor(shipment),
    note: NOTE,
  }
}

/** Late movements first, then whatever still has to leave, oldest due date first. */
export function shipManagerConsoleEntries(world: World): ConsoleEntry[] {
  const ordered = [...world.shipments].sort((left, right) => {
    const byState = STATE_ORDER.indexOf(left.state) - STATE_ORDER.indexOf(right.state)
    return byState !== 0 ? byState : left.dueOn - right.dueOn || left.id.localeCompare(right.id)
  })

  return ordered.map((shipment) => shipmentEntry(world, shipment))
}
