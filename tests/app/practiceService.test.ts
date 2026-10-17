// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateTicket } from '../../src/domain/generator'
import type { GeneratedTicket } from '../../src/domain/generator'
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
  findActiveSessionId,
  loadDebrief,
  loadProgress,
  loadQueue,
  openSession,
  resolveAttempt,
  startAttempt,
  submitCommand,
  verifyCaller,
} from '../../src/app/practiceService'

function generatedFor(scenarioId: string, variantId: string): GeneratedTicket {
  for (let seed = 1; seed < 600; seed += 1) {
    const ticket = generateTicket(seed, { familyId: scenarioId })
    if (ticket.variantId === variantId) {
      return ticket
    }
  }
  throw new Error(`No seed produced ${scenarioId}/${variantId}`)
}

async function insertTicket(
  persistence: Persistence,
  generated: GeneratedTicket,
  id: string,
): Promise<void> {
  await persistence.tickets.create({
    id,
    scenarioId: generated.scenarioId,
    variantId: generated.variantId,
    difficulty: generated.difficulty,
    seed: generated.seed,
    signature: generated.signature,
    publicContent: JSON.parse(JSON.stringify(generated.public)),
    createdAt: Date.now(),
    status: 'available',
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

describe('practice service', () => {
  it('fills the queue with generated tickets that carry the required fields', async () => {
    const queue = await loadQueue()

    expect(queue).toHaveLength(5)
    for (const ticket of queue) {
      expect(ticket.subject.length).toBeGreaterThan(0)
      expect(ticket.requester.name.length).toBeGreaterThan(0)
      expect(['critical', 'high', 'medium', 'low']).toContain(ticket.severity)
      expect(ticket.status).toBe('available')
      expect(ticket.scenarioTitle.length).toBeGreaterThan(0)
    }
  })

  it('runs a full lockout attempt and persists the score and progress', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    const sam = generated.public.requester.samAccountName
    await insertTicket(persistence, generated, 'ticket-lockout')

    const workspace = await startAttempt('ticket-lockout')
    expect(workspace.ticket.id).toBe('ticket-lockout')
    expect(workspace.entries).toEqual([])

    await verifyCaller('employee-id')
    await submitCommand(`get-account ${sam}`)
    const afterUnlock = await submitCommand(`unlock-account ${sam}`)
    await submitCommand(`get-account ${sam}`)
    await addNote(
      'troubleshooting',
      'Directory showed the account locked. Verified the caller with their badge, unlocked it, and confirmed the status returned to active.',
    )
    await addNote(
      'customer',
      'Your account is unlocked. Sign in with your current password and contact us if it locks again today.',
    )

    expect(afterUnlock.entries.filter((entry) => entry.kind === 'command')).toHaveLength(2)
    expect(afterUnlock.hasVerifiedCaller).toBe(true)
    expect(afterUnlock.customerNotes).toHaveLength(0)

    const debrief = await resolveAttempt({
      code: 'resolved-remote',
      note: 'Resolved remotely after verifying the caller.',
    })

    expect(debrief.total).toBe(100)
    expect(debrief.passed).toBe(true)
    expect(debrief.band).toBe('strong')
    expect(debrief.reference.length).toBeGreaterThan(0)

    const storedScore = await persistence.scores.findBySession(workspace.sessionId)
    expect(storedScore?.total).toBe(100)
    expect(storedScore?.passed).toBe(true)

    const ticket = await persistence.tickets.findById('ticket-lockout')
    expect(ticket?.status).toBe('completed')

    const stats = await persistence.progress.get('PWD-01')
    expect(stats?.attempts).toBe(1)
    expect(stats?.passes).toBe(1)
    expect(stats?.bestScore).toBe(100)

    const reloaded = await loadDebrief(workspace.sessionId)
    expect(reloaded?.total).toBe(100)
    expect(reloaded?.decision.code).toBe('resolved-remote')
    expect(reloaded?.items.length).toBe(generated.rubric.items.length)

    const progress = await loadProgress()
    expect(progress.attempts).toBe(1)
    expect(progress.rows[0]?.scenarioTitle).toBe('Password and account access')
  })

  it('resumes an open session with its recorded action log', async () => {
    const generated = generatedFor('NET-01', 'bad-static-dns')
    await insertTicket(persistence, generated, 'ticket-network')

    const workspace = await startAttempt('ticket-network')
    await submitCommand('ipconfig /all')

    const activeId = await findActiveSessionId()
    expect(activeId).toBe(workspace.sessionId)

    const resumed = await openSession(workspace.sessionId)
    expect(resumed.ticket.id).toBe('ticket-network')
    expect(resumed.entries).toHaveLength(1)
    expect(resumed.entries[0]).toMatchObject({ kind: 'command', text: 'ipconfig /all' })
  })

  it('records a failed attempt with evidence of what was missed', async () => {
    const generated = generatedFor('PWD-01', 'account-lockout')
    await insertTicket(persistence, generated, 'ticket-fail')

    const workspace = await startAttempt('ticket-fail')
    const debrief = await resolveAttempt({ code: 'escalated-tier2', note: '' })

    expect(debrief.total).toBeLessThan(75)
    expect(debrief.passed).toBe(false)
    expect(debrief.criticalFailures.length).toBeGreaterThan(0)

    const storedScore = await persistence.scores.findBySession(workspace.sessionId)
    expect(storedScore?.passed).toBe(false)

    const stats = await persistence.progress.get('PWD-01')
    expect(stats?.attempts).toBe(1)
    expect(stats?.passes).toBe(0)
    expect(stats?.leitnerBox).toBe(1)
  })
})
