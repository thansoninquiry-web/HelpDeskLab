import { describe, expect, it } from 'vitest'
import { COMMANDS } from '../../../src/domain/environment/commands'
import { applyCommand } from '../../../src/domain/environment/reducer'
import { focusedRemoteSession } from '../../../src/domain/environment/remoteDesktop'
import { foldWorld, worldsMatch, type ReplayStep } from '../../../src/domain/environment/replay'
import type { World } from '../../../src/domain/environment/types'
import {
  emptyVerificationState,
  issueVerificationCode,
  nextVerificationCode,
  verificationRecipients,
} from '../../../src/domain/environment/verification'
import { SCENARIO_FAMILIES, generateTicket } from '../../../src/domain/generator'
import { createRng, hashSeed, type Rng } from '../../../src/domain/shared/rng'

/**
 * The replay guarantee, as a property: whatever a learner types, the log they
 * leave behind folds back to the world in hand, a cut at any step lands on the
 * world they stood in at that step, and re-running the dropped steps gets them
 * back to where they were. A rewind is built on all three, so any divergence —
 * a command that changes something the fold does not reproduce, a step taken on
 * a machine the fold cannot work out, a code drawn from the wrong counter —
 * would let an un-run step leave a change behind.
 *
 * The sequences are random but seeded, so a failure names the family, the seed
 * and the step it broke at. The command lines come from the registry's own
 * `usage` strings with their arguments drawn from the generated world, so a
 * command added later is exercised by these tests without anyone remembering to
 * add it here — and the coverage assertions at the end fail if the corpus ever
 * thins out to the point where a clean pass means nothing.
 */

/** Seeds each family is walked with. Named so a failure is reproducible. */
const DIRECTED_SEED = 3
const SEEDS = [DIRECTED_SEED, 11, 29]

/** Steps in one sequence, before the cuts are taken. */
const LENGTH = 8

/** What the desk did, in the order the log would hold it. */
type Plan =
  | {
      kind: 'command'
      line: string
      desktop: boolean
      /**
       * A log written before commands carried a machine tag. The fold has to work
       * the desktop out from the session in view instead, so both shapes are run.
       */
      untagged?: boolean
    }
  | { kind: 'note' }
  | { kind: 'hint' }
  | { kind: 'ask' }
  | { kind: 'verify' }
  | { kind: 'code-sent' }
  | { kind: 'deny-caller' }

/* ------------------------------------------------------------- the corpus */

/**
 * The values a command line can be given, by the placeholder its usage names.
 * Every list is drawn from the world the sequence runs against, so the arguments
 * are ones the simulation recognises rather than strings that always miss.
 */
function placeholders(world: World, rng: Rng): Record<string, () => string> {
  const hosts = world.devices.map((device) => device.hostname)
  const accounts = world.users.map((user) => user.samAccountName)
  const sites = [...world.sites.map((site) => site.id), ...world.sites.map((site) => site.name)]
  const tags = [
    ...world.stock.map((item) => item.id),
    ...world.deploymentTasks.map((task) => task.assetTag),
    ...world.shipments.map((shipment) => shipment.assetTag).filter((tag): tag is string => tag !== null),
  ]
  const addresses = [
    ...world.printers.map((printer) => printer.ipAddress),
    ...world.network.dnsRecords.map((record) => record.address),
    ...world.dhcpScopes.flatMap((scope) => scope.leases.map((lease) => lease.address)),
    ...world.mail.messages.map((message) => message.from),
  ]
  const dnsNames = world.network.dnsRecords.map((record) => record.name)

  const pick = (items: readonly string[], fallback: string) => () =>
    items.length > 0 ? rng.pick(items) : fallback

  return {
    hostname: pick(hosts, 'nowhere'),
    host: pick([...hosts, ...addresses], 'nowhere'),
    name: pick([...hosts, ...dnsNames], 'nowhere'),
    samAccountName: pick(accounts, 'nobody'),
    sam: pick(accounts, 'nobody'),
    site: pick(sites, 'nowhere'),
    assetTag: pick(tags, 'SHELF-DT-0000'),
    reference: pick(world.shipments.map((shipment) => shipment.id), 'SHIP-0000'),
    address: pick(addresses, '10.0.0.1'),
    messageId: pick(world.mail.messages.map((message) => message.id), 'MSG-0000'),
    printerName: pick(world.printers.map((printer) => printer.name), 'PRN-0000'),
    share: pick(world.shares.map((share) => share.name), 'data'),
    group: pick(world.groups.map((group) => group.name), 'staff'),
    command: pick(COMMANDS.map((command) => command.name), 'help'),
    reason: () => rng.pick(['damage', 'parts', 'quarantine']),
    days: () => String(rng.int(1, 5)),
    port: () => rng.pick(['443', '3389']),
    primary: pick(world.network.publicNameServers, '1.1.1.1'),
    secondary: pick(world.network.publicNameServers, '1.1.1.1'),
    'dns-server': pick(world.network.publicNameServers, '1.1.1.1'),
    file: () => rng.pick(['hosts', 'C:\\Windows\\System32\\drivers\\etc\\hosts']),
    text: () => rng.pick(['hello', 'the link is down']),
  }
}

/** Splits a usage string on spaces, keeping `[…]` and `<…>` together. */
function tokensOf(usage: string): string[] {
  const tokens: string[] = []
  let current = ''
  let depth = 0
  for (const character of usage) {
    if (character === '[' || character === '<') depth += 1
    if (character === ']' || character === '>') depth -= 1
    if (character === ' ' && depth === 0) {
      if (current.length > 0) tokens.push(current)
      current = ''
      continue
    }
    current += character
  }
  if (current.length > 0) tokens.push(current)
  return tokens
}

/** The value for one `<placeholder>`, falling back to its first word. */
function valueFor(
  key: string,
  values: Record<string, () => string>,
  generic: () => string,
): string {
  const exact = values[key]
  if (exact) {
    return exact()
  }
  const firstWord = key.split(/\s+/)[0] ?? ''
  const byWord = values[firstWord]
  if (byWord) {
    return byWord()
  }
  return generic()
}


/**
 * One token of a usage, as the words to type in its place. Null drops an
 * optional group, which is how `ipconfig` is sometimes run bare and sometimes
 * with a switch.
 */
function expand(
  token: string,
  values: Record<string, () => string>,
  rng: Rng,
  generic: () => string,
): string[] | null {
  if (token.startsWith('[') && token.endsWith(']')) {
    if (!rng.bool(0.65)) {
      return null
    }
    const inner = token.slice(1, -1).trim()
    // `[command]`, `[dns-server]`, `[secondary]` name a value, not a switch.
    if (!inner.includes('|') && !inner.includes(' ') && values[inner]) {
      return [values[inner]()]
    }
    const branch = rng.pick(inner.split('|').map((part) => part.trim()).filter((part) => part.length > 0))
    return tokensOf(branch).flatMap((part) => expand(part, values, rng, generic) ?? [])
  }

  const placeholder = /^<(.+)>$/.exec(token)
  if (placeholder) {
    return [valueFor(placeholder[1] ?? '', values, generic)]
  }
  return [token]
}

/** Every command line the registry can be given, arguments drawn from the world. */
function corpus(world: World, rng: Rng): string[] {
  const values = placeholders(world, rng)
  const generic = () => valueFor('host', values, () => 'nowhere')
  const lines: string[] = []

  for (const definition of COMMANDS) {
    const words = tokensOf(definition.usage).slice(1)
    const filled = words.flatMap((word) => expand(word, values, rng, generic) ?? [])
    lines.push([definition.name, ...filled].join(' ').trim())
  }

  return lines
}

/* ------------------------------------------------------- the live attempt */

/**
 * A random attempt: mostly commands, with the panel work a real log holds
 * between them, so the fold is asked about the recording-only steps and the
 * refusal that gates the account commands as well as the commands themselves.
 */
function planFor(world: World, rng: Rng, length: number): Plan[] {
  const lines = corpus(world, rng)
  const plans: Plan[] = []

  for (let index = 0; index < length; index += 1) {
    const roll = rng.next()
    if (roll < 0.7) {
      plans.push({ kind: 'command', line: rng.pick(lines), desktop: false })
    } else if (roll < 0.78) {
      // The desktop terminal, which runs on the machine the session is open on.
      plans.push({ kind: 'command', line: rng.pick(lines), desktop: true, untagged: rng.bool(0.5) })
    } else if (roll < 0.84) {
      plans.push({ kind: 'note' })
    } else if (roll < 0.89) {
      plans.push({ kind: 'hint' })
    } else if (roll < 0.93) {
      plans.push({ kind: 'ask' })
    } else if (roll < 0.97) {
      plans.push({ kind: 'verify' })
    } else if (roll < 0.985) {
      plans.push({ kind: 'code-sent' })
    } else {
      plans.push({ kind: 'deny-caller' })
    }
  }

  return plans
}

interface LiveRun {
  world: World
  steps: ReplayStep[]
  /** The world after each step, so a cut can be compared with where it landed. */
  history: World[]
  ok: number
  ran: Set<string>
}

/**
 * The live path, mirroring what the app records for each kind of step: a command
 * is filed under the machine it acted on, a code is drawn from the attempt's
 * seed, and the panel steps are logged with the words the panels log them with.
 */
function runLive(initial: World, plans: readonly Plan[], codeSeed: string): LiveRun {
  let world = structuredClone(initial)
  const steps: ReplayStep[] = []
  const history: World[] = [structuredClone(world)]
  const ran = new Set<string>()
  let ok = 0

  for (const plan of plans) {
    switch (plan.kind) {
      case 'command': {
        const session = focusedRemoteSession(world)
        const onDesktop = plan.desktop && session !== null
        const deviceId = onDesktop && session ? session.machineId : world.currentDeviceId
        const source = onDesktop ? 'remote-desktop-terminal' : 'terminal'
        const machine = world.devices.find((device) => device.id === deviceId)?.hostname ?? null
        const result = applyCommand(world, plan.line, { deviceId })

        world = result.world
        if (result.ok) {
          ok += 1
        }
        ran.add(plan.line.split(/\s+/)[0] ?? plan.line)
        const named = machine !== null && plan.untagged !== true
        steps.push({
          kind: 'command',
          atMs: world.clock,
          input: named ? { command: plan.line, source, machine } : { command: plan.line, source },
          output: { ok: result.ok },
        })
        break
      }
      case 'note':
        steps.push({
          kind: 'note',
          atMs: world.clock,
          input: { noteKind: 'troubleshooting', text: 'Checked the link light.', source: 'troubleshooting-notes' },
          output: { saved: true },
        })
        break
      case 'hint':
        steps.push({
          kind: 'hint',
          atMs: world.clock,
          input: { itemId: 'probe', hintIndex: 0, hint: 'read the status', source: 'hints' },
          output: { revealed: true },
        })
        break
      case 'ask':
        steps.push({ kind: 'ask-user', atMs: world.clock, input: { intent: 'when-start' }, output: { answer: 'Today.' } })
        break
      case 'verify':
        steps.push({
          kind: 'verify-caller',
          atMs: world.clock,
          input: { method: 'verification-code', source: 'verify-caller' },
          output: { verified: true },
        })
        break
      case 'code-sent': {
        const recipient = verificationRecipients({
          name: initial.users[0]?.displayName ?? 'The caller',
          employeeId: initial.users[0]?.employeeId ?? '0',
          managerName: null,
          mobileInService: true,
        })[0]
        if (!recipient) {
          break
        }
        const state = world.verification ?? emptyVerificationState()
        world = {
          ...world,
          verification: issueVerificationCode(state, {
            code: nextVerificationCode(codeSeed, state.issued),
            recipient,
            now: world.clock,
          }),
        }
        steps.push({
          kind: 'code-sent',
          atMs: world.clock,
          input: {
            method: 'verification-code',
            source: 'verify-caller',
            recipientId: recipient.id,
            recipientName: recipient.name,
            destination: recipient.destination,
          },
          output: { sent: true },
        })
        break
      }
      case 'deny-caller': {
        const refusal = {
          reason: 'third-party-request',
          label: 'Asked for someone else’s account',
          atMs: world.clock,
        }
        world = { ...world, refusal }
        steps.push({
          kind: 'deny-caller',
          atMs: world.clock,
          input: { reason: refusal.reason, label: refusal.label, source: 'verify-caller' },
          output: { denied: true },
        })
        break
      }
    }

    history.push(structuredClone(world))
  }

  return { world, steps, history, ok, ran }
}

/** The first places two worlds differ, so a failure can be read at a glance. */
function differences(left: unknown, right: unknown, path = ''): string[] {
  if (worldsMatch(left, right)) {
    return []
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      return [`${path}.length ${left.length} → ${right.length}`]
    }
    return left.flatMap((value, index) => differences(value, right[index], `${path}[${index}]`)).slice(0, 6)
  }
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)])
    return [...keys]
      .flatMap((key) =>
        differences(
          (left as Record<string, unknown>)[key],
          (right as Record<string, unknown>)[key],
          path ? `${path}.${key}` : key,
        ),
      )
      .slice(0, 6)
  }
  return [`${path}: ${JSON.stringify(left)} → ${JSON.stringify(right)}`]
}

/* ------------------------------------------------------- the controls */

/**
 * The property has to be able to fail. Each of these is a fault a rewind would
 * otherwise paper over, handed to the same fold the property uses: a step the
 * log lost, a command filed under a machine it did not run on, and a code drawn
 * from a counter the attempt never used.
 */
describe('the fold is not trusted for free', () => {
  const control = () => generateTicket(5, { familyId: 'PWD-01' })

  it('sees a log that lost a step', () => {
    const generated = control()
    const plans: Plan[] = [
      { kind: 'command', line: 'ipconfig /renew', desktop: false },
      { kind: 'command', line: 'hostname', desktop: false },
    ]
    const live = runLive(generated.world, plans, 'control')

    expect(worldsMatch(foldWorld(generated.world, live.steps, { codeSeed: 'control' }), live.world)).toBe(
      true,
    )
    expect(
      worldsMatch(foldWorld(generated.world, live.steps.slice(0, 1), { codeSeed: 'control' }), live.world),
    ).toBe(false)
  })

  it('runs a terminal step on the machine the step names, and notices when it cannot', () => {
    const generated = control()
    const other = generated.world.devices.find(
      (device) => device.id !== generated.world.currentDeviceId && device.kind !== 'server',
    )
    if (!other) {
      throw new Error('The fixture world has no second machine')
    }

    // The learner really changed the DNS servers on `other`, so the world in
    // hand has a change on that machine and nowhere else.
    const live = applyCommand(generated.world, 'set-dns 8.8.8.8', { deviceId: other.id }).world
    const step = (machine: string): ReplayStep => ({
      kind: 'command',
      atMs: live.clock,
      input: { command: 'set-dns 8.8.8.8', source: 'terminal', machine },
      output: {},
    })

    // The tag is load-bearing: the machine the step names is the machine the
    // fold runs it on.
    expect(worldsMatch(foldWorld(generated.world, [step(other.hostname)], { codeSeed: 'control' }), live)).toBe(
      true,
    )

    // A tag the world does not know — a stale or hand-edited log — leaves the
    // fold with nowhere to run it, and it falls back to the ticket's machine.
    expect(worldsMatch(foldWorld(generated.world, [step('LT-9999')], { codeSeed: 'control' }), live)).toBe(false)
  })

  it('sees a code drawn from a counter the attempt never used', () => {
    const generated = control()
    const live = runLive(generated.world, [{ kind: 'code-sent' }], 'control')
    const folded = foldWorld(generated.world, live.steps, { codeSeed: 'not-the-attempt-seed' })

    expect(live.world.verification?.active?.code).toBeDefined()
    expect(worldsMatch(folded, live.world)).toBe(false)
  })
})

/**
 * A sequence built to hold the interactions a rewind is most likely to get
 * wrong, whatever the seed: a second code send retiring the first, a refusal
 * with an account command behind it, and a desktop command on a machine that is
 * not the ticket's. Random sampling reaches these only when it happens to chain
 * them, which is why they are asked for by name as well.
 */
function directedPlans(world: World): {
  plans: Plan[]
  account: string
  desktopMachineId: string | null
} {
  const account =
    world.users.find((user) => user.status === 'locked')?.samAccountName ??
    world.users[0]?.samAccountName ??
    'nobody'
  const desktop = world.devices.find(
    (device) =>
      device.id !== world.currentDeviceId &&
      device.kind !== 'server' &&
      (device.assignedUserId ?? device.loggedInUserId) !== null,
  )

  const plans: Plan[] = [{ kind: 'code-sent' }, { kind: 'note' }]
  if (desktop) {
    plans.push(
      { kind: 'command', line: `connect-remote ${desktop.hostname}`, desktop: false },
      // A step from a log written before commands carried a machine tag, and a
      // change rather than a read, so the fold has to work the desktop out from
      // the session in view and get a change onto that machine.
      { kind: 'command', line: 'set-dns 1.1.1.1', desktop: true, untagged: true },
    )
  }
  plans.push(
    { kind: 'command', line: `get-account ${account}`, desktop: false },
    { kind: 'deny-caller' },
    { kind: 'command', line: `unlock-account ${account}`, desktop: false },
    { kind: 'code-sent' },
  )
  if (desktop) {
    plans.push({ kind: 'command', line: 'set-dns 8.8.8.8', desktop: true })
  }

  return { plans, account, desktopMachineId: desktop?.id ?? null }
}

/** A directory account's status, for comparing a world against the world it came from. */
function accountStatus(world: World, samAccountName: string): string | null {
  return world.users.find((user) => user.samAccountName === samAccountName)?.status ?? null
}

/**
 * Everything the guarantee says, for one sequence: the fold of the log is the
 * world the attempt reached, a cut at any step lands on the world the learner
 * stood in at that step, running the dropped steps again gets back to the end,
 * and the world handed in is never touched.
 */
function assertGuarantee(where: string, initial: World, plans: readonly Plan[], codeSeed: string): LiveRun {
  const live = runLive(initial, plans, codeSeed)

  expect(
    differences(foldWorld(initial, live.steps, { codeSeed }), live.world),
    `${where}: folding the log`,
  ).toEqual([])

  for (let cut = 0; cut <= live.steps.length; cut += 1) {
    const prefix = foldWorld(initial, live.steps.slice(0, cut), { codeSeed })
    expect(differences(prefix, live.history[cut]), `${where}: rewinding to step ${cut}`).toEqual([])
    expect(
      differences(foldWorld(prefix, live.steps.slice(cut), { codeSeed }), live.world),
      `${where}: re-running the steps the cut at ${cut} dropped`,
    ).toEqual([])
  }

  expect(differences(initial, foldWorld(initial, [], { codeSeed })), `${where}: folding an empty log`).toEqual(
    [],
  )
  expect(
    differences(
      foldWorld(initial, live.steps, { codeSeed }),
      foldWorld(structuredClone(initial), live.steps, { codeSeed }),
    ),
    `${where}: folding twice`,
  ).toEqual([])

  return live
}

/** What the whole file managed to exercise, asserted at the end. */
const coverage = {
  commands: new Set<string>(),
  ok: 0,
  sequences: 0,
  moved: 0,
  states: 0,
}

describe('a random attempt folds back to the world it built', () => {
  for (const family of SCENARIO_FAMILIES) {
    it(`holds for ${family.id}`, () => {
      for (const seed of SEEDS) {
        const generated = generateTicket(seed, { familyId: family.id })
        const rng = createRng(hashSeed(`replay-property:${family.id}:${seed}`))
        const plans = planFor(generated.world, rng, LENGTH)
        const codeSeed = `${family.id}:${seed}`
        const where = `${family.id} seed ${seed}`
        const live = assertGuarantee(where, generated.world, plans, codeSeed)

        coverage.sequences += 1
        coverage.ok += live.ok
        for (const name of live.ran) {
          coverage.commands.add(name)
        }
        if (!worldsMatch(live.world, generated.world)) {
          coverage.moved += 1
        }
        coverage.states += live.world.verification?.issued ?? 0
      }
    })

    it(`holds across the interactions a rewind is most likely to get wrong for ${family.id}`, () => {
      const generated = generateTicket(DIRECTED_SEED, { familyId: family.id })
      const { plans, account, desktopMachineId } = directedPlans(generated.world)
      const live = assertGuarantee(
        `${family.id} directed`,
        generated.world,
        plans,
        `${family.id}:directed`,
      )

      // Two codes went out: the counter advanced, and the first was retired.
      expect(live.world.verification?.issued).toBe(2)
      expect(live.world.verification?.active?.code).toBeDefined()
      expect(live.world.verification?.active?.code).not.toBe(live.world.verification?.retired[0])

      // The refusal is world state, and the account command behind it did not run.
      expect(live.world.refusal?.reason).toBe('third-party-request')
      expect(accountStatus(live.world, account)).toBe(accountStatus(generated.world, account))

      if (desktopMachineId !== null) {
        // The desktop command landed on the machine the session was open on, and
        // the ticket's own machine was left alone.
        expect(
          live.world.devices.find((device) => device.id === desktopMachineId)?.dnsServers,
        ).toEqual(['8.8.8.8'])
        expect(
          live.world.devices.find((device) => device.id === generated.world.currentDeviceId)?.dnsServers,
        ).toEqual(
          generated.world.devices.find((device) => device.id === generated.world.currentDeviceId)
            ?.dnsServers,
        )
        expect(
          live.world.remoteSessions.some(
            (session) => session.machineId === desktopMachineId && session.state === 'active',
          ),
        ).toBe(true)
      }
    })
  }

  it('exercises the registry, not a handful of commands', () => {
    // A corpus that stopped producing real lines would make the property above
    // pass while proving nothing. These floors sit below what the run reaches
    // today — 64 commands, 141 of them successful, every sequence moving the
    // world and six codes issued — by enough that a different machine or a new
    // command does not tip them, and above enough that a thinned corpus fails.
    expect(coverage.sequences).toBe(SCENARIO_FAMILIES.length * SEEDS.length)
    expect(coverage.commands.size).toBeGreaterThanOrEqual(50)
    expect(coverage.ok).toBeGreaterThanOrEqual(110)
    expect(coverage.moved).toBeGreaterThanOrEqual(25)
    // The seeded code path is reached, so the counter is part of the property.
    expect(coverage.states).toBeGreaterThanOrEqual(5)
  })
})
