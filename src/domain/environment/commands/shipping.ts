import { errorLine, line, mutedLine, successLine } from '../output'
import type { Shipment, ShipmentState, World } from '../types'
import type { CommandContext, CommandDefinition, CommandOutcome } from './types'
import { failed, succeeded, usageFailure } from './types'

/**
 * The shipping desk. A shipment moves only when the carrier says it did:
 * preparing → in transit → delivered. A delayed collection is not delivered,
 * whatever the ticket would like, so it is rebooked and collected before it can
 * arrive. Every step is recorded on the shipment's own tracking event.
 */

const STATE_LABELS: Record<ShipmentState, string> = {
  preparing: 'Preparing',
  'in-transit': 'In transit',
  delayed: 'Delayed',
  delivered: 'Delivered',
}

/** Late movements first, then whatever still has to leave, then what is out. */
const STATE_ORDER: readonly ShipmentState[] = ['delayed', 'preparing', 'in-transit', 'delivered']

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_REBOOK_DAYS = 14

function formatDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

function formatStamp(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16).replace('T', ' ')
}

function siteName(world: World, siteId: string): string {
  return world.sites.find((site) => site.id === siteId)?.name ?? siteId
}

function findShipment(world: World, value: string): Shipment | undefined {
  const needle = value.trim().toLowerCase()
  return world.shipments.find((shipment) => shipment.id.toLowerCase() === needle)
}

function ordered(world: World): Shipment[] {
  return [...world.shipments].sort((left, right) => {
    const byState = STATE_ORDER.indexOf(left.state) - STATE_ORDER.indexOf(right.state)
    return byState !== 0 ? byState : left.dueOn - right.dueOn || left.id.localeCompare(right.id)
  })
}

function dueLine(shipment: Shipment, clock: number): string {
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

function route(shipment: Shipment, world: World): string {
  return `${siteName(world, shipment.fromSiteId)} → ${siteName(world, shipment.toSiteId)}`
}

function getShipments(context: CommandContext): CommandOutcome {
  if (context.args.length > 0) {
    return usageFailure('get-shipments')
  }

  const shipments = ordered(context.world)
  if (shipments.length === 0) {
    return succeeded([mutedLine('The shipping desk has nothing on its board.')])
  }

  const output: string[] = []
  output.push(`Shipments : ${shipments.length}`)
  for (const state of STATE_ORDER) {
    const count = shipments.filter((shipment) => shipment.state === state).length
    output.push(`${STATE_LABELS[state].padEnd(11)}: ${count}`)
  }
  output.push('')

  const lines = output.map((text) => line(text))
  for (const shipment of shipments) {
    lines.push(
      line(
        `${shipment.id} · ${shipment.direction === 'return' ? 'Return' : 'Outbound'} · ${STATE_LABELS[shipment.state]}`,
      ),
      line(`  Carrier  : ${shipment.carrier}`),
      line(`  Route    : ${route(shipment, context.world)}`),
      line(`  Asset    : ${shipment.assetTag ?? 'Not tagged'}`),
      line(`  Due      : ${dueLine(shipment, context.world.clock)}`),
      line(`  Last event: ${shipment.lastEvent}`),
    )
  }

  lines.push(
    mutedLine('A delay is not a delivery: rebook it with the carrier, then dispatch and deliver.'),
  )
  return succeeded(lines)
}

function getShipment(context: CommandContext): CommandOutcome {
  const target = context.args[0]
  if (!target || context.args.length > 1) {
    return usageFailure('get-shipment <reference>')
  }

  const shipment = findShipment(context.world, target)
  if (!shipment) {
    return failed([
      errorLine(`No shipment with the reference '${target}'.`),
      mutedLine(`References on the board: ${context.world.shipments.map((entry) => entry.id).join(', ')}`),
    ])
  }

  const shelf = shipment.assetTag
    ? context.world.stock.find((item) => item.id === shipment.assetTag)
    : undefined

  return succeeded([
    line(`Reference   : ${shipment.id}`),
    line(`Direction   : ${shipment.direction === 'return' ? 'Return' : 'Outbound'}`),
    line(`State       : ${STATE_LABELS[shipment.state]}`),
    line(`Carrier     : ${shipment.carrier}`),
    line(`From        : ${siteName(context.world, shipment.fromSiteId)}`),
    line(`To          : ${siteName(context.world, shipment.toSiteId)}`),
    line(`Asset tag   : ${shipment.assetTag ?? 'Not tagged — a consumable'}`),
    line(
      `Shelf state : ${
        shelf ? `${shelf.state} · ${shelf.notes}` : shipment.assetTag ? 'Not on a shelf' : 'No tag to look up'
      }`,
    ),
    line(`Contents    : ${shipment.contents}`),
    line(`Due         : ${dueLine(shipment, context.world.clock)}`),
    line(`Last event  : ${shipment.lastEvent}`),
  ])
}

function printShippingLabel(context: CommandContext): CommandOutcome {
  const target = context.args[0]
  if (!target || context.args.length > 1) {
    return usageFailure('print-shipping-label <reference>')
  }

  const shipment = findShipment(context.world, target)
  if (!shipment) {
    return failed([errorLine(`No shipment with the reference '${target}'.`)])
  }

  if (shipment.state === 'delivered') {
    return succeeded([
      mutedLine(`${shipment.id} is already delivered; there is nothing left to ship.`),
    ])
  }

  return succeeded([
    line('────────────────────────────────────────'),
    line(`  ${shipment.direction === 'return' ? 'RETURN' : 'OUTBOUND'}  ${shipment.id}`),
    line(`  Carrier : ${shipment.carrier}`),
    line(`  From    : ${siteName(context.world, shipment.fromSiteId)}`),
    line(`  To      : ${siteName(context.world, shipment.toSiteId)}`),
    line(`  Asset   : ${shipment.assetTag ?? 'No tag'}`),
    line(`  Contents: ${shipment.contents}`),
    line(`  Due     : ${formatDay(shipment.dueOn)}`),
    line('────────────────────────────────────────'),
    mutedLine('Printing a label moves nothing: dispatch it once the carrier collects.'),
  ])
}

function dispatchShipment(context: CommandContext): CommandOutcome {
  const target = context.args[0]
  if (!target || context.args.length > 1) {
    return usageFailure('dispatch-shipment <reference>')
  }

  const shipment = findShipment(context.world, target)
  if (!shipment) {
    return failed([errorLine(`No shipment with the reference '${target}'.`)])
  }

  if (shipment.state === 'delivered') {
    return succeeded([mutedLine(`${shipment.id} was delivered already; it cannot leave again.`)])
  }
  if (shipment.state === 'in-transit') {
    return succeeded([mutedLine(`${shipment.id} is already in transit with ${shipment.carrier}.`)])
  }
  if (shipment.state === 'delayed') {
    return failed([
      errorLine(`${shipment.id} is delayed: the collection never happened.`),
      mutedLine(`Rebook it first with rebook-shipment ${shipment.id} <days>.`),
    ])
  }

  shipment.state = 'in-transit'
  shipment.lastEvent = `Collected by ${shipment.carrier} at ${formatStamp(context.now)}.`

  return succeeded(
    [
      successLine(`Dispatched ${shipment.id} with ${shipment.carrier}.`),
      line(`Route      : ${route(shipment, context.world)}`),
      line(`Asset tag  : ${shipment.assetTag ?? 'Not tagged'}`),
      line(`Tracking   : ${shipment.lastEvent}`),
      mutedLine('The shipment is out of the building. Record the reference in the ticket.'),
    ],
    [
      {
        type: 'shipment_dispatched',
        target: shipment.id,
        details: { carrier: shipment.carrier, assetTag: shipment.assetTag ?? '' },
      },
    ],
  )
}

function deliverShipment(context: CommandContext): CommandOutcome {
  const target = context.args[0]
  if (!target || context.args.length > 1) {
    return usageFailure('deliver-shipment <reference>')
  }

  const shipment = findShipment(context.world, target)
  if (!shipment) {
    return failed([errorLine(`No shipment with the reference '${target}'.`)])
  }

  if (shipment.state === 'delivered') {
    return succeeded([mutedLine(`${shipment.id} is already recorded as delivered.`)])
  }
  if (shipment.state === 'preparing') {
    return failed([
      errorLine(`${shipment.id} has not been collected yet.`),
      mutedLine('Dispatch it once the carrier has it; delivery before collection is not a fact.'),
    ])
  }
  if (shipment.state === 'delayed') {
    return failed([
      errorLine(`${shipment.id} is delayed, so it never left. It cannot be delivered.`),
      mutedLine(`Rebook the collection first: rebook-shipment ${shipment.id} <days>.`),
    ])
  }

  shipment.state = 'delivered'
  shipment.lastEvent = `Delivered to ${siteName(context.world, shipment.toSiteId)} at ${formatStamp(context.now)}.`

  return succeeded(
    [
      successLine(`Recorded ${shipment.id} as delivered.`),
      line(`Delivered to : ${siteName(context.world, shipment.toSiteId)}`),
      line(`Tracking     : ${shipment.lastEvent}`),
      ...(shipment.direction === 'return'
        ? [mutedLine('A returned machine goes back to the shelf before it is issued again.')]
        : [mutedLine('Close the loop in the ticket: the reference, the site, and the time.')]),
    ],
    [
      {
        type: 'shipment_delivered',
        target: shipment.id,
        details: { toSite: shipment.toSiteId, assetTag: shipment.assetTag ?? '' },
      },
    ],
  )
}

function rebookShipment(context: CommandContext): CommandOutcome {
  const [target, daysArg] = context.args
  if (!target || !daysArg || context.args.length > 2) {
    return usageFailure('rebook-shipment <reference> <days>')
  }

  const shipment = findShipment(context.world, target)
  if (!shipment) {
    return failed([errorLine(`No shipment with the reference '${target}'.`)])
  }

  if (shipment.state !== 'delayed') {
    return failed([
      errorLine(`${shipment.id} is not delayed: it is ${STATE_LABELS[shipment.state].toLowerCase()}.`),
      mutedLine('Rebooking is for a collection that was missed.'),
    ])
  }

  if (!/^\d+$/.test(daysArg.trim())) {
    return failed([
      errorLine(`'${daysArg}' is not a number of days.`),
      mutedLine('Usage: rebook-shipment <reference> <days>'),
    ])
  }

  const days = Number(daysArg.trim())
  if (!Number.isInteger(days) || days < 1 || days > MAX_REBOOK_DAYS) {
    return failed([
      errorLine(`A collection is rebooked between 1 and ${MAX_REBOOK_DAYS} days out.`),
      mutedLine('Pick a date the carrier can actually collect on.'),
    ])
  }

  shipment.state = 'preparing'
  shipment.dueOn = context.now + days * DAY_MS
  shipment.lastEvent = `Rebooked with ${shipment.carrier} for ${formatDay(shipment.dueOn)}.`

  return succeeded(
    [
      successLine(`Rebooked ${shipment.id} with ${shipment.carrier}.`),
      line(`New due date : ${formatDay(shipment.dueOn)} (${days} day${days === 1 ? '' : 's'})`),
      line(`Tracking     : ${shipment.lastEvent}`),
      mutedLine('It is back in preparing until the carrier collects it.'),
    ],
    [
      {
        type: 'shipment_rebooked',
        target: shipment.id,
        details: { days },
      },
    ],
  )
}

export const shippingCommands: readonly CommandDefinition[] = [
  {
    name: 'get-shipments',
    aliases: [],
    group: 'shipping',
    access: 'read',
    usage: 'get-shipments',
    summary: 'Read the shipping board: late first, then what has to leave',
    run: getShipments,
  },
  {
    name: 'get-shipment',
    aliases: [],
    group: 'shipping',
    access: 'read',
    usage: 'get-shipment <reference>',
    summary: 'Read one shipment’s route, tracking state, and shelf record',
    run: getShipment,
  },
  {
    name: 'print-shipping-label',
    aliases: [],
    group: 'shipping',
    access: 'read',
    usage: 'print-shipping-label <reference>',
    summary: 'Print the outbound or return label for a shipment',
    run: printShippingLabel,
  },
  {
    name: 'dispatch-shipment',
    aliases: [],
    group: 'shipping',
    access: 'change',
    usage: 'dispatch-shipment <reference>',
    summary: 'Record a collected shipment as in transit',
    run: dispatchShipment,
  },
  {
    name: 'deliver-shipment',
    aliases: [],
    group: 'shipping',
    access: 'change',
    usage: 'deliver-shipment <reference>',
    summary: 'Record a shipment that reached the other site as delivered',
    run: deliverShipment,
  },
  {
    name: 'rebook-shipment',
    aliases: [],
    group: 'shipping',
    access: 'change',
    usage: 'rebook-shipment <reference> <days>',
    summary: 'Rebook a missed collection with the carrier, some days out',
    run: rebookShipment,
  },
]
