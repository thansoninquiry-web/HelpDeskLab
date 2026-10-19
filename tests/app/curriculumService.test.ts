// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

import { loadCurriculum, type CurriculumView } from '../../src/app/curriculumService'
import {
  addNote,
  startAttempt,
  submitCommand,
  submitDesktopTerminalCommand,
} from '../../src/app/practiceService'
import { generateTicket, publicTicketJson } from '../../src/domain/generator'
import type { Score } from '../../src/domain/scoring/types'
import type { JsonObject } from '../../src/domain/shared/json'
import type { SessionAction } from '../../src/domain/tickets/types'
import { makeJobTarget, makeScore, makeSession, makeTicket } from '../helpers/factories'

function moduleByNumber(view: CurriculumView, number: number) {
  const found = view.modules.find((module) => module.number === number)
  if (!found) {
    throw new Error(`No module numbered ${number}`)
  }
  return found
}

const PERFECT = {
  diagnosis: { earned: 10, possible: 10 },
  documentation: { earned: 10, possible: 10 },
  resolution: { earned: 10, possible: 10 },
  safety: { earned: 10, possible: 10 },
}

function score(sessionId: string, overrides: Partial<Score> = {}): Score {
  return makeScore(sessionId, {
    total: 92,
    passed: true,
    band: 'strong',
    rubric: { xp: 60, categoryScores: PERFECT },
    ...overrides,
  })
}

let persistence: Persistence

beforeEach(async () => {
  holder.current = await openPersistence({
    snapshotStore: new MemorySnapshotStore(),
    wasmBinary: loadWasmBinary(),
  })
  persistence = holder.current
})

describe('loadCurriculum', () => {
  it('opens with every module untouched', async () => {
    const view = await loadCurriculum()

    expect(view.modules).toHaveLength(16)
    expect(view.modules.map((module) => module.number)).toEqual(
      Array.from({ length: 16 }, (_, index) => index + 1),
    )
    expect(view.playable).toBe(15)
    expect(view.total).toBe(47)
    expect(view.met).toBe(0)
    expect(view.percent).toBe(0)
    expect(view.complete).toBe(0)
    expect(view.next?.title).toBe('Your First Shift')
    expect(view.modules.every((module) => !module.complete)).toBe(true)
  })

  it('derives progress from attempts, notes, calls and listings', async () => {
    await persistence.tickets.create(makeTicket({ id: 'ticket-1', scenarioId: 'PWD-01' }))
    await persistence.tickets.create(makeTicket({ id: 'ticket-2', scenarioId: 'NET-01' }))
    await persistence.tickets.create(makeTicket({ id: 'ticket-3', scenarioId: 'FS-01' }))

    await persistence.sessions.create(
      makeSession('ticket-1', {
        id: 'session-1',
        endedAt: 1_760_000_500_000,
        resolution: 'resolved',
        outcome: 'resolved',
      }),
    )
    await persistence.sessions.create(
      makeSession('ticket-2', {
        id: 'session-2',
        endedAt: 1_760_000_600_000,
        resolution: 'escalated-tier2',
        outcome: 'abandoned',
      }),
    )

    await persistence.scores.save(score('session-1'))
    await persistence.scores.save(
      score('session-2', {
        total: 55,
        passed: false,
        band: 'fail',
        rubric: {
          xp: 20,
          categoryScores: { ...PERFECT, safety: { earned: 5, possible: 10 } },
        },
        computedAt: 1_760_000_600_000,
      }),
    )

    const steps: Array<{ kind: SessionAction['kind']; input: JsonObject; output: JsonObject }> = [
      { kind: 'verify-caller', input: { method: 'verification-code' }, output: { verified: true } },
      { kind: 'command', input: { command: 'get-account dwhitfield' }, output: {} },
      { kind: 'ask-user', input: { intent: 'scope' }, output: {} },
      {
        kind: 'note',
        input: { noteKind: 'troubleshooting', text: 'Account was locked out after three bad passwords.' },
        output: { saved: true },
      },
      {
        kind: 'note',
        input: { noteKind: 'customer', text: 'Unlocked your account; sign in again and tell us if it repeats.' },
        output: { saved: true },
      },
    ]

    for (const [index, step] of steps.entries()) {
      await persistence.actions.append({
        sessionId: 'session-1',
        atMs: 1_760_000_100_000 + index,
        kind: step.kind,
        input: step.input,
        output: step.output,
      })
    }

    await persistence.actions.append({
      sessionId: 'session-2',
      atMs: 1_760_000_200_000,
      kind: 'command',
      input: { command: 'ipconfig /all' },
      output: {},
    })
    await persistence.actions.append({
      sessionId: 'session-2',
      atMs: 1_760_000_210_000,
      kind: 'deny-caller',
      input: { reason: 'third-party-request' },
      output: { denied: true },
    })

    await persistence.targets.create(
      makeJobTarget({
        rawDescription:
          'Tier 1 analyst: troubleshoot DNS and DHCP, reset passwords in Active Directory, and document every ticket.',
      }),
    )

    const view = await loadCurriculum()
    const byNumber = new Map(view.modules.map((module) => [module.number, module]))

    expect(view.playable).toBe(15)
    expect(view.total).toBe(47)
    // Modules 1, 6, 7 and 16 close: the listing asks for passwords, and PWD-01 passed.
    expect(view.complete).toBe(4)
    expect(view.met).toBe(15)
    expect(view.percent).toBe(31)
    expect(view.next?.number).toBe(2)

    expect(byNumber.get(1)?.complete).toBe(true)
    expect(byNumber.get(2)?.met).toBe(1)
    expect(byNumber.get(3)?.met).toBe(0)
    expect(byNumber.get(4)?.met).toBe(0)
    expect(byNumber.get(6)?.complete).toBe(true)
    expect(byNumber.get(7)?.complete).toBe(true)
    // Nothing in this history opened, read, or wrote up a remote session.
    expect(byNumber.get(8)?.met).toBe(0)
    expect(byNumber.get(8)?.nextRequirement?.label).toBe(
      'Open a support session to a user’s machine',
    )
    expect(byNumber.get(9)?.met).toBe(2)
    expect(byNumber.get(16)?.complete).toBe(true)

    // XP is credited to every module whose scope covers the family it came from.
    expect(byNumber.get(7)?.xp).toBe(60)
    expect(byNumber.get(9)?.xp).toBe(20)
    expect(byNumber.get(1)?.xp).toBe(80)

    // The next unmet requirement is the one the row advertises.
    expect(byNumber.get(2)?.nextRequirement?.label).toBe('Close three tickets')
    expect(byNumber.get(2)?.nextRequirement?.progressLabel).toBe('1 / 3')
  })

  it('counts a Remote Desktop session as evidence for module 8', async () => {
    const generated = generateTicket(7, { familyId: 'PWD-01' })
    await persistence.tickets.create(
      makeTicket({
        id: 'ticket-remote',
        scenarioId: generated.scenarioId,
        variantId: generated.variantId,
        seed: generated.seed,
        signature: generated.signature,
        publicContent: publicTicketJson(generated.public),
      }),
    )
    await startAttempt('ticket-remote')

    expect(moduleByNumber(await loadCurriculum(), 8).met).toBe(0)

    // A machine that is not the ticket's host and has nobody else's session on
    // it: the connect has to do real work to count.
    const rented = generated.world.remoteSessions.find((session) => session.state === 'active')
    const remote = generated.world.devices.find(
      (device) =>
        device.kind !== 'server' &&
        device.id !== generated.world.currentDeviceId &&
        device.id !== rented?.machineId &&
        (device.assignedUserId ?? device.loggedInUserId) !== null,
    )
    expect(remote).toBeDefined()

    const connected = await submitCommand(`connect-remote ${remote?.hostname ?? ''}`)
    expect(connected.entries.at(-1)).toMatchObject({ ok: true })

    // Read the machine, change it, then write the change into the ticket.
    await submitDesktopTerminalCommand('ipconfig /all')
    await submitDesktopTerminalCommand('ipconfig /flushdns')
    await addNote(
      'troubleshooting',
      'Flushed the resolver cache on the user\u2019s own machine.',
    )

    const module = moduleByNumber(await loadCurriculum(), 8)
    expect(module.status).toBe('playable')
    expect(module.requirements.map((entry) => entry.current)).toEqual([1, 1, 1])
    expect(module.complete).toBe(true)
  })

  it('counts the shelf reads and the finished run as evidence for modules 12 and 13', async () => {
    const generated = generateTicket(11, {
      familyId: 'DEP-01',
      variantId: 'imaging-run-failed',
    })
    await persistence.tickets.create(
      makeTicket({
        id: 'ticket-deployment',
        scenarioId: generated.scenarioId,
        variantId: generated.variantId,
        seed: generated.seed,
        signature: generated.signature,
        publicContent: publicTicketJson(generated.public),
      }),
    )
    await startAttempt('ticket-deployment')

    const task = generated.world.deploymentTasks.find((entry) => entry.state === 'failed')
    expect(task).toBeDefined()

    await submitCommand('get-deployment-queue')
    await submitCommand(`get-deployment ${task?.assetTag ?? ''}`)
    await submitCommand(`start-deployment ${task?.assetTag ?? ''}`)

    const view = await loadCurriculum()
    // The queue and the record are read; no hold pass and no closed attempt yet.
    expect(moduleByNumber(view, 12).requirements.map((entry) => entry.current)).toEqual([1, 1, 0])
    expect(moduleByNumber(view, 13).requirements.map((entry) => entry.current)).toEqual([1, 1, 0])
    expect(moduleByNumber(view, 13).nextRequirement?.measure).toBe('deploymentPasses')
  })

  it('keeps planned modules empty and marked', async () => {
    const view = await loadCurriculum()
    const planned = view.modules.filter((module) => module.status === 'planned')

    expect(planned).toHaveLength(1)
    for (const module of planned) {
      expect(module.requirements).toEqual([])
      expect(module.total).toBe(0)
      expect(module.note).toMatch(/not in this build/i)
      expect(module.nextRequirement).toBeNull()
    }
  })
})
