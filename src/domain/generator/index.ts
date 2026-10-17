import { BASE_CLOCK, createLarkspurWorld } from '../environment/fixtures'
import type { Device, Printer, Site, World } from '../environment/types'
import type { JsonObject } from '../shared/json'
import { hashSeed, createRng } from '../shared/rng'
import type { Rng } from '../shared/rng'
import { identityFamily } from './families/identity'
import { networkFamily } from './families/network'
import { printerFamily } from './families/printer'
import type {
  BuildContext,
  GeneratedTicket,
  GenerateTicketOptions,
  PublicTicket,
  ScenarioFamily,
  ScenarioVariant,
} from './types'

export * from './types'
export { CLOSURE_CODES, PASS_THRESHOLD, STRONG_THRESHOLD, closureCodesFor } from './rubric'
export type { ClosureCode } from './rubric'

export const SCENARIO_FAMILIES: readonly ScenarioFamily[] = [
  identityFamily,
  networkFamily,
  printerFamily,
]

export function findFamily(familyId: string): ScenarioFamily | undefined {
  return SCENARIO_FAMILIES.find((family) => family.id === familyId)
}

export function listVariants(familyId: string): readonly ScenarioVariant[] {
  return findFamily(familyId)?.variants ?? []
}

interface Candidate {
  user: BuildContext['user']
  device: Device
  site: Site
}

function candidatesFor(family: ScenarioFamily, world: World): Candidate[] {
  const candidates: Candidate[] = []

  for (const user of world.users) {
    const device = world.devices.find(
      (candidate) => candidate.assignedUserId === user.id && candidate.kind !== 'server',
    )
    const site = device ? world.sites.find((candidate) => candidate.id === device.siteId) : undefined
    if (!device || !site) {
      continue
    }
    if (family.category === 'printer') {
      const hasPrinter = world.printers.some((printer) => printer.siteId === site.id)
      if (!hasPrinter) {
        continue
      }
    }
    candidates.push({ user, device, site })
  }

  return candidates
}

function ensureDefaultPrinter(world: World, device: Device): Printer | undefined {
  const current = world.printers.find((printer) => printer.id === device.defaultPrinterId)
  if (current) {
    return current
  }
  const sitePrinter = world.printers.find((printer) => printer.siteId === device.siteId)
  if (sitePrinter) {
    device.defaultPrinterId = sitePrinter.id
  }
  return sitePrinter
}

function render(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match)
}

function slotValues(
  context: BuildContext,
  printer: Printer | undefined,
): Record<string, string> {
  const [firstName, ...rest] = context.user.displayName.split(' ')
  return {
    firstName: firstName ?? context.user.displayName,
    lastName: rest.join(' '),
    displayName: context.user.displayName,
    hostname: context.device.hostname,
    site: context.site.name,
    department: context.user.department,
    managerName: context.user.managerName,
    email: context.user.email,
    printerName: printer?.name ?? 'the shared printer',
    os: context.device.os,
    domain: context.domain,
  }
}

function buildTicket(seed: number, options: GenerateTicketOptions): GeneratedTicket {
  const rng: Rng = createRng(seed)
  const clock = options.clock ?? BASE_CLOCK + rng.int(0, 6 * 60) * 60_000

  const picked = rng.pick(SCENARIO_FAMILIES)
  const family = options.familyId ? findFamily(options.familyId) : undefined
  if (options.familyId && !family) {
    throw new Error(`Unknown scenario family: ${options.familyId}`)
  }
  const resolvedFamily = family ?? picked
  const variant = rng.pick(resolvedFamily.variants)

  const world = createLarkspurWorld(clock)
  const candidates = candidatesFor(resolvedFamily, world)
  if (candidates.length === 0) {
    throw new Error(`No eligible device for scenario family ${resolvedFamily.id}`)
  }
  const candidate = rng.pick(candidates)

  world.currentDeviceId = candidate.device.id
  candidate.device.loggedInUserId = candidate.user.id
  const printer = ensureDefaultPrinter(world, candidate.device)

  const context: BuildContext = {
    rng,
    world,
    user: candidate.user,
    device: candidate.device,
    site: candidate.site,
    domain: world.domain,
  }

  const faultDetail = variant.build(context)
  const slots = slotValues(context, printer)

  const signature = hashSeed(
    JSON.stringify({
      scenario: resolvedFamily.id,
      variant: variant.id,
      user: candidate.user.samAccountName,
      hostname: candidate.device.hostname,
      fault: faultDetail,
      dns: candidate.device.dnsServers,
      address: candidate.device.ipAddress,
      spooler: candidate.device.spoolerStatus,
      clock,
    }),
  ).toString(16)

  const publicTicket: PublicTicket = {
    subject: render(rng.pick(variant.subjects), slots),
    body: render(rng.pick(variant.bodies), slots),
    scenarioTitle: resolvedFamily.title,
    variantLabel: variant.label,
    category: resolvedFamily.category,
    severity: variant.severity,
    requester: {
      name: candidate.user.displayName,
      samAccountName: candidate.user.samAccountName,
      employeeId: candidate.user.employeeId,
      department: candidate.user.department,
      email: candidate.user.email,
      siteName: candidate.site.name,
    },
    device: {
      hostname: candidate.device.hostname,
      kind: candidate.device.kind,
      os: candidate.device.os,
      siteName: candidate.site.name,
    },
    reportedSymptoms: [...variant.symptoms],
    createdAt: clock,
  }

  world.fault = {
    code: `${resolvedFamily.id}/${variant.id}`,
    details: { scenario: resolvedFamily.id, variant: variant.id, signature },
  }

  return {
    scenarioId: resolvedFamily.id,
    variantId: variant.id,
    variantLabel: variant.label,
    difficulty: variant.difficulty,
    severity: variant.severity,
    seed,
    signature,
    public: publicTicket,
    world,
    rubric: variant.rubric(context),
    reference: variant.reference(context),
    expectedOutcome: variant.expectedOutcome,
    expectedCodes: [...variant.expectedCodes],
  }
}

const SIGNATURE_RETRIES = 12
const SEED_STEP = 7919

/**
 * Generates a deterministic ticket for a seed. Passing the same seed and family
 * reproduces the same world, which is how "try this ticket again" works.
 */
export function generateTicket(
  seed: number,
  options: GenerateTicketOptions = {},
): GeneratedTicket {
  const avoid = new Set(options.avoidSignatures ?? [])

  for (let attempt = 0; attempt < SIGNATURE_RETRIES; attempt += 1) {
    const ticket = buildTicket(seed + attempt * SEED_STEP, options)
    if (!avoid.has(ticket.signature)) {
      return ticket
    }
  }

  throw new Error('Could not generate a ticket with a fresh signature')
}

export function publicTicketJson(ticket: PublicTicket): JsonObject {
  return JSON.parse(JSON.stringify(ticket)) as JsonObject
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2_147_483_647)
}
