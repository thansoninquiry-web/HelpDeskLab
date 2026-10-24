// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { COMMANDS } from '../../src/domain/environment/commands'
import {
  CONSOLE_IDS,
  consoleEntries,
  findConsoleActionForCommand,
  type ConsoleActionMatch,
} from '../../src/domain/environment/consoles'
import type { ConsoleAction } from '../../src/domain/environment/console'
import { createLarkspurWorld } from '../../src/domain/environment/fixtures'
import { parseCommandLine } from '../../src/domain/environment/parser'
import { applyCommand } from '../../src/domain/environment/reducer'
import type { World } from '../../src/domain/environment/types'
import { SCENARIO_FAMILIES, generateTicket, type GeneratedTicket } from '../../src/domain/generator'
import type { ReferenceStep } from '../../src/domain/generator/types'
import { openPersistence, type Persistence } from '../../src/persistence/database'
import { MemorySnapshotStore } from '../../src/persistence/snapshotStore'
import { loadWasmBinary } from '../helpers/sqlite'

const holder = vi.hoisted(() => ({ current: null as Persistence | null }))

vi.mock('../../src/app/persistenceService', () => ({
  getLocalDatabase: async () => {
    if (!holder.current) {
      throw new Error('Test database is not ready')
    }
    return holder.current
  },
}))

import {
  addNote,
  askCaller,
  denyCaller,
  getWorkspace,
  placeCallback,
  resolveAttempt,
  runConsoleAction,
  sendVerificationCode,
  startAttempt,
  verifyCallerWithCode,
  type DebriefView,
  type DenialReason,
} from '../../src/app/practiceService'

/**
 * Parity between the tools and the terminal.
 *
 * Every scenario's reference path is the answer the product wants a learner to
 * reach. This suite replays each one using nothing but console actions, so a
 * family that can only be answered by typing into the terminal fails here. It is
 * the guard on the console work: adding a command that is scored but has no
 * button is what breaks it. The same guard follows the rest of the registry too:
 * every command either has a console button, or is named in `TERMINAL_ONLY` with
 * the reason it never will, so being terminal-only is a decision rather than an
 * omission.
 */

const CASES = referenceCases()

interface ReferenceCase {
  key: string
  generated: GeneratedTicket
}

/**
 * One generated ticket per family variant, keyed the way the suite reports it.
 * Families filter their own variants, so this is the only scan that is certain
 * to reach every one of them.
 */
function referenceCases(): ReferenceCase[] {
  const cases: ReferenceCase[] = []
  for (const family of SCENARIO_FAMILIES) {
    for (const variant of family.variants) {
      const generated = generateVariant(family.id, variant.id)
      if (!generated) {
        throw new Error(`No seed produced ${family.id}/${variant.id}`)
      }
      cases.push({ key: `${family.id}/${variant.id}`, generated })
    }
  }
  return cases
}

function generateVariant(familyId: string, variantId: string): GeneratedTicket | null {
  for (let seed = 1; seed < 600; seed += 1) {
    const ticket = generateTicket(seed, { familyId })
    if (ticket.variantId === variantId) {
      return ticket
    }
  }
  return null
}

/** The gate the interface offers: one live code, read back by the caller. */
async function verifyCallerByCode(): Promise<void> {
  const view = await getWorkspace()
  const sent = await sendVerificationCode(view.verification.callerId)
  await verifyCallerWithCode(sent.verification.active?.readBack ?? '')
}

/**
 * The other panel control: ring the caller back on a line that reaches them.
 * The contact is chosen the way a learner would choose it, from the lines on
 * file, rather than from anything the test knows about the variant.
 */
async function ringBack(): Promise<void> {
  const view = await getWorkspace()
  const contact = view.verification.recipients.find(
    (recipient) =>
      recipient.role === 'caller' &&
      recipient.reachable &&
      recipient.methods.includes('callback'),
  )
  if (!contact) {
    throw new Error('The ticket offers no line to ring the caller back on.')
  }
  await placeCallback(contact.id)
}

/**
 * A refusal is scored for being recorded, not for the reason attached to it, so
 * the reason only has to match the outcome the reference expects.
 */
const DENIAL_REASONS_BY_CODE: Record<string, DenialReason> = {
  'denied-social-engineering': 'third-party-request',
}

function denialReasonFor(generated: GeneratedTicket): DenialReason {
  const code = generated.expectedCodes[0] ?? ''
  return DENIAL_REASONS_BY_CODE[code] ?? 'unverified-identity'
}

function resolutionNote(generated: GeneratedTicket): string {
  const step = generated.reference.find(
    (candidate): candidate is Extract<ReferenceStep, { type: 'note' }> =>
      candidate.type === 'note' && candidate.noteKind === 'resolution',
  )
  return step?.text ?? ''
}

/**
 * The console action that runs this command, or a failure naming the family.
 *
 * The lookup runs against the world as the replay has reached it, not the world
 * the ticket started in: a console grows actions as the work progresses, and the
 * button that cleans a machine is only on the desktop once its session is open.
 */
function consoleActionFor(key: string, world: World, input: string): ConsoleActionMatch {
  const match = findConsoleActionForCommand(world, input)
  if (!match) {
    throw new Error(`${key} expects \`${input}\`, which no console action runs.`)
  }
  return match
}

const CASES_BY_KEY = new Map(CASES.map((entry) => [entry.key, entry]))

/**
 * Runs the reference path through console actions and the panel controls, with
 * nothing typed into the terminal, and scores the result.
 */
async function replayReference(key: string): Promise<DebriefView> {
  const entry = CASES_BY_KEY.get(key)
  if (!entry) {
    throw new Error(`No generated ticket for ${key}`)
  }
  const { generated } = entry
  // The attempt and this clone see the same commands in the same order, so the
  // clone is what the next action is looked up against.
  let liveWorld = structuredClone(generated.world)

  for (const step of generated.reference) {
    if (step.type === 'command') {
      const match = consoleActionFor(key, liveWorld, step.input)
      const view = await runConsoleAction(match.consoleId, match.entryId, match.actionId, match.args)
      const last = view.entries.at(-1)
      // The action has to produce that exact command, attributed to its console.
      // Whether it succeeds is the command's business: a reference step is often
      // the failure that proves the fault, like a queue read with the spooler down.
      expect(last).toMatchObject({ kind: 'command', text: step.input, source: match.consoleId })
      liveWorld = applyCommand(liveWorld, step.input).world
      continue
    }

    if (step.type === 'verify-caller') {
      if (step.method === 'callback') {
        await ringBack()
      } else {
        await verifyCallerByCode()
      }
      continue
    }

    if (step.type === 'deny-caller') {
      // The reference names the reason the ticket needs; only a path written
      // before reasons existed falls back to the close code's own default.
      await denyCaller(step.reason ?? denialReasonFor(generated))
      continue
    }

    if (step.type === 'ask-user') {
      await askCaller(step.intent)
      continue
    }

    if (step.noteKind !== 'resolution') {
      await addNote(step.noteKind, step.text)
    }
  }

  return resolveAttempt({
    code: generated.expectedCodes[0] ?? 'resolved-remote',
    note: resolutionNote(generated),
  })
}

let persistence: Persistence

beforeEach(async () => {
  persistence = await openPersistence({
    snapshotStore: new MemorySnapshotStore(),
    wasmBinary: loadWasmBinary(),
  })
  holder.current = persistence
})

describe('console parity', () => {
  it('covers every variant the generator offers', () => {
    const expected = SCENARIO_FAMILIES.flatMap((family) =>
      family.variants.map((variant) => `${family.id}/${variant.id}`),
    )
    expect(CASES.map((entry) => entry.key)).toEqual(expected)
  })

  it('keeps each console-backed family on the console it was written for', () => {
    const expected: Record<string, string> = {
      'MAIL-01': 'mail-admin',
      'MAILSEC-01': 'mail-security',
      'RDP-01': 'remote-desktop',
      'DEP-01': 'computer-deployment',
    }
    const misses: string[] = []

    for (const { key, generated } of CASES) {
      const consoleId = expected[generated.scenarioId]
      if (!consoleId) {
        continue
      }
      let liveWorld = structuredClone(generated.world)
      let used = false
      for (const step of generated.reference) {
        if (step.type !== 'command') {
          continue
        }
        if (findConsoleActionForCommand(liveWorld, step.input)?.consoleId === consoleId) {
          used = true
        }
        liveWorld = applyCommand(liveWorld, step.input).world
      }
      if (!used) {
        misses.push(`${key} never uses ${consoleId}`)
      }
    }

    expect(misses).toEqual([])
  })

  it('offers every reference command as a console action', () => {
    const missing: string[] = []

    for (const { key, generated } of CASES) {
      let liveWorld = structuredClone(generated.world)
      for (const step of generated.reference) {
        if (step.type !== 'command') {
          continue
        }
        if (!findConsoleActionForCommand(liveWorld, step.input)) {
          missing.push(`${key}: ${step.input}`)
        }
        liveWorld = applyCommand(liveWorld, step.input).world
      }
    }

    expect(missing).toEqual([])
  })

  for (const { key, generated } of CASES) {
    it(`scores ${key} full marks without the terminal`, async () => {
      await persistence.tickets.create({
        id: `ticket-${key}`,
        scenarioId: generated.scenarioId,
        variantId: generated.variantId,
        difficulty: generated.difficulty,
        seed: generated.seed,
        signature: generated.signature,
        publicContent: JSON.parse(JSON.stringify(generated.public)),
        createdAt: Date.now(),
        status: 'available',
      })

      await startAttempt(`ticket-${key}`)
      const debrief = await replayReference(key)

      // The whole point: not one scored command came from the terminal.
      expect(debrief.trail.filter((entry) => entry.source === 'terminal')).toEqual([])
      expect(debrief.trail.length).toBeGreaterThan(0)
      expect(debrief.total).toBe(100)
      expect(debrief.passed).toBe(true)
    })
  }
})

/**
 * The commands no console button runs, and why that is right for each one.
 *
 * The parity replay only covers the commands a reference path uses. This list
 * closes the rest of the registry: a command is reachable from a console
 * somewhere, or it is written here with the reason it never will be. Being
 * terminal-only is then a decision on the record instead of an omission, and a
 * command added tomorrow without a button fails the suite until somebody either
 * writes the button or writes the reason. This list may shrink; it must not grow
 * quietly.
 */
const TERMINAL_ONLY: Readonly<Record<string, string>> = {
  // About the session or the machine itself, not a record a console lists.
  help: 'how the reference is asked for, not work on a machine',
  hostname: 'names the machine the desk is sitting at',
  whoami: 'names the signed-in account, not a directory record',
  ver: 'the Windows build string, for when a learner is checking the shell',
  echo: 'prints what it is given; it exists to test the parser',
  dir: 'browses the local filesystem, which no console projects',
  type: 'reads a file the learner already found',
  tree: 'draws a directory tree; a console lists records, not folders',
  // Diagnostics whose answer is printed rather than acted on.
  systeminfo: 'summarises the machine consoles already read field by field',
  tasklist: 'lists processes; no console row acts on one',
  netstat: 'lists connections; a console has nothing to run against it',
  tracert: 'traces a route; ping and nslookup are the reachability buttons',
  net: 'one verb for accounts, time and sessions, so no single record action fits',
  // The console already lists what the command would print.
  'get-quarantine': 'Mail Security lists the held mail as its records',
  'get-messages': 'Mail Admin lists a mailbox’s mail as the record’s group',
  'get-sessions': 'Remote Desktop lists the sessions on the machines it shows',
  'get-deployment-queue': 'Computer Deployment lists the queue as its records',
  'get-shipments': 'Ship Manager lists the shipments as its records',
  // Changes no console offers a button for.
  'remove-share-deny': 'the shares console has no deny editor yet',
  'set-default-printer': 'only the remote desktop can change a machine’s default printer',
}

/** The command name behind an action, whatever value its inputs would carry. */
function actionCommandName(action: ConsoleAction, entryId: string): string | null {
  const args = action.args?.map((argument) => argument.choices?.[0] ?? 'x') ?? []
  const parsed = parseCommandLine(action.command(entryId, args))
  return parsed.ok ? parsed.command.name : null
}

/**
 * Every command a console button would run, over every world this suite builds:
 * the fixture, each variant's own world, and each step along its reference path —
 * a console grows actions as the work goes on, so the later worlds matter.
 */
function commandsBehindButtons(): Set<string> {
  const found = new Set<string>()
  const scan = (world: World) => {
    for (const consoleId of CONSOLE_IDS) {
      for (const entry of consoleEntries(world, consoleId)) {
        for (const action of entry.actions) {
          const name = actionCommandName(action, entry.id)
          if (name) {
            found.add(name)
          }
        }
      }
    }
  }

  scan(createLarkspurWorld())
  for (const { generated } of CASES) {
    let liveWorld = structuredClone(generated.world)
    scan(liveWorld)
    for (const step of generated.reference) {
      if (step.type !== 'command') {
        continue
      }
      liveWorld = applyCommand(liveWorld, step.input).world
      scan(liveWorld)
    }
  }
  return found
}

describe('terminal-only commands', () => {
  const reachable = commandsBehindButtons()
  const registry = new Set(COMMANDS.map((command) => command.name))

  it('gives every registry command a console button or a stated reason', () => {
    const uncovered = [...registry].filter(
      (name) => !reachable.has(name) && !(name in TERMINAL_ONLY),
    )

    expect(
      uncovered,
      'A command with no console button. Give it an action, or add it to TERMINAL_ONLY with the reason it cannot have one.',
    ).toEqual([])
  })

  it('takes a command off the terminal-only list once a button runs it', () => {
    const stale = Object.keys(TERMINAL_ONLY).filter((name) => reachable.has(name))

    expect(
      stale,
      'These commands now have a console button, so they are no longer terminal-only: remove them from TERMINAL_ONLY.',
    ).toEqual([])
  })

  it('keeps the terminal-only list to real commands, each with a reason', () => {
    const unknown = Object.keys(TERMINAL_ONLY).filter((name) => !registry.has(name))
    const unexplained = Object.entries(TERMINAL_ONLY)
      .filter(([, reason]) => reason.trim().length < 12)
      .map(([name]) => name)

    // A renamed or retired command leaves an entry behind; a terse one tells
    // whoever finds it nothing.
    expect(unknown).toEqual([])
    expect(unexplained).toEqual([])
  })
})
