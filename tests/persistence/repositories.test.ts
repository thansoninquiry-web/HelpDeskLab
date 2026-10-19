// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SqlitePersistence } from '../../src/persistence/database'
import {
  ConflictError,
  DataCorruptionError,
  ImportError,
  NotFoundError,
  SchemaVersionError,
} from '../../src/persistence/errors'
import { runMigrations } from '../../src/persistence/migrations'
import { SCHEMA_VERSION } from '../../src/persistence/schema'
import { createSqliteDriver } from '../../src/persistence/sqlite'
import { MemorySnapshotStore } from '../../src/persistence/snapshotStore'
import { makeAction, makeScore, makeSession, makeStats, makeTicket } from '../helpers/factories'
import { createTestPersistence, loadWasmBinary, type TestPersistence } from '../helpers/sqlite'

describe('repositories', () => {
  let env: TestPersistence

  beforeEach(async () => {
    env = await createTestPersistence()
  })

  afterEach(async () => {
    await env.persistence.close()
  })

  it('round-trips tickets and rejects unknown updates', async () => {
    const { persistence } = env
    const ticket = makeTicket()
    await persistence.tickets.create(ticket)
    await persistence.tickets.create(makeTicket({ id: 'ticket-2', seed: 43, signature: 'sig-0002' }))

    expect(await persistence.tickets.findById('ticket-1')).toEqual(ticket)
    expect(await persistence.tickets.listRecent(1)).toHaveLength(1)
    expect((await persistence.tickets.listRecent(10)).map((row) => row.id)).toEqual([
      'ticket-2',
      'ticket-1',
    ])

    await persistence.tickets.updateStatus('ticket-1', 'in_progress')
    expect((await persistence.tickets.findById('ticket-1'))?.status).toBe('in_progress')

    await expect(persistence.tickets.updateStatus('missing', 'completed')).rejects.toBeInstanceOf(
      NotFoundError,
    )
    await expect(persistence.tickets.listRecent(0)).rejects.toBeInstanceOf(RangeError)
  })

  it('binds parameters instead of interpolating ids', async () => {
    await env.persistence.tickets.create(makeTicket())
    expect(await env.persistence.tickets.findById("' OR '1'='1")).toBeNull()
  })

  it('round-trips sessions and enforces a single finish', async () => {
    const { persistence } = env
    await persistence.tickets.create(makeTicket())
    await persistence.sessions.create(makeSession())

    const loaded = await persistence.sessions.findById('session-1')
    expect(loaded?.world).toEqual({ clock: 1_760_000_100_000, currentDeviceId: 'lt-4471' })
    expect((await persistence.sessions.findActive())?.id).toBe('session-1')
    expect(await persistence.sessions.listByTicket('ticket-1')).toHaveLength(1)

    await persistence.sessions.saveWorld('session-1', { clock: 1_760_000_160_000 })
    await persistence.sessions.finish('session-1', {
      endedAt: 1_760_000_400_000,
      resolution: 'restarted-spooler',
      outcome: 'resolved',
    })

    expect(await persistence.sessions.findActive()).toBeNull()
    expect((await persistence.sessions.findById('session-1'))?.outcome).toBe('resolved')

    await expect(
      persistence.sessions.saveWorld('session-1', { clock: 1 }),
    ).rejects.toBeInstanceOf(NotFoundError)
    await expect(
      persistence.sessions.finish('session-1', {
        endedAt: 1,
        resolution: 'again',
        outcome: 'abandoned',
      }),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('keeps a close draft on the session and drops it when the ticket closes', async () => {
    const { persistence } = env
    await persistence.tickets.create(makeTicket())
    await persistence.sessions.create(makeSession())

    await persistence.sessions.saveClosureDraft('session-1', {
      code: 'escalated-tier2',
      note: 'Repeat lockout: the identity team needs the report.',
    })

    const loaded = await persistence.sessions.findById('session-1')
    expect(loaded?.closureDraft).toEqual({
      code: 'escalated-tier2',
      note: 'Repeat lockout: the identity team needs the report.',
    })

    await persistence.sessions.finish('session-1', {
      endedAt: 1_760_000_400_000,
      resolution: 'escalated-tier2',
      outcome: 'resolved',
    })

    expect((await persistence.sessions.findById('session-1'))?.closureDraft).toBeNull()
    await expect(
      persistence.sessions.saveClosureDraft('session-1', { code: null, note: 'too late' }),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('remembers which attempts were sat as exams', async () => {
    const { persistence } = env
    await persistence.tickets.create(makeTicket())
    await persistence.tickets.create(makeTicket({ id: 'ticket-2' }))
    await persistence.sessions.create(makeSession('ticket-1', { examMode: true }))
    await persistence.sessions.create(makeSession('ticket-2', { id: 'session-2' }))

    expect((await persistence.sessions.findById('session-1'))?.examMode).toBe(true)
    // A practice attempt — and a row written before the mode existed — reads false.
    expect((await persistence.sessions.findById('session-2'))?.examMode).toBe(false)
    // Both rows start at the same moment, so the newer id comes first.
    expect((await persistence.sessions.listRecent(10)).map((row) => row.examMode)).toEqual([
      false,
      true,
    ])
  })

  it('appends actions with contiguous sequence numbers', async () => {
    const { persistence } = env
    await persistence.tickets.create(makeTicket())
    await persistence.sessions.create(makeSession())

    const first = await persistence.actions.append(makeAction())
    const second = await persistence.actions.append(
      makeAction('session-1', { kind: 'verify-caller', input: { employeeId: 'E-8842' } }),
    )

    expect([first.seq, second.seq]).toEqual([1, 2])
    expect(second.id).toBeGreaterThan(first.id)

    const actions = await persistence.actions.listBySession('session-1')
    expect(actions).toHaveLength(2)
    expect(actions[1]?.input).toEqual({ employeeId: 'E-8842' })

    await expect(persistence.actions.append(makeAction('missing'))).rejects.toBeInstanceOf(
      NotFoundError,
    )
  })

  it('stores one immutable score per session', async () => {
    const { persistence } = env
    await persistence.tickets.create(makeTicket())
    await persistence.sessions.create(makeSession())
    await persistence.scores.save(makeScore())

    expect(await persistence.scores.findBySession('session-1')).toEqual(makeScore())
    expect(await persistence.scores.listRecent(5)).toHaveLength(1)

    await expect(persistence.scores.save(makeScore('session-1', { total: 99 }))).rejects.toBeInstanceOf(
      ConflictError,
    )
  })

  it('lists score history joined to its scenario and category breakdown', async () => {
    const { persistence } = env
    const categoryScores = {
      diagnosis: { earned: 4, possible: 10 },
      documentation: { earned: 6, possible: 20 },
      resolution: { earned: 20, possible: 30 },
      safety: { earned: 5, possible: 5 },
    }

    await persistence.tickets.create(makeTicket())
    await persistence.tickets.create(
      makeTicket({ id: 'ticket-2', scenarioId: 'M365-01', variantId: 'smart-lockout', seed: 43, signature: 'sig-0002' }),
    )
    await persistence.sessions.create(makeSession())
    await persistence.sessions.create(makeSession('ticket-2', { id: 'session-2' }))
    await persistence.scores.save(
      makeScore('session-1', {
        total: 62,
        passed: false,
        band: 'fail',
        computedAt: 10,
        rubric: { items: [], categoryScores },
      }),
    )
    await persistence.scores.save(
      makeScore('session-2', { total: 91, band: 'strong', computedAt: 20 }),
    )

    const history = await persistence.scores.listHistory()

    expect(history.map((entry) => [entry.scenarioId, entry.variantId, entry.total])).toEqual([
      ['NET-01', 'bad-static-dns', 62],
      ['M365-01', 'smart-lockout', 91],
    ])
    expect(history[0]?.categoryScores?.documentation).toEqual({ earned: 6, possible: 20 })
    // Scores written before categories were stored simply report null.
    expect(history[1]?.categoryScores).toBeNull()
  })

  it('reads the rubric steps and hints a habit summary is built from', async () => {
    const { persistence } = env
    await persistence.tickets.create(makeTicket())
    await persistence.sessions.create(makeSession())
    await persistence.sessions.create(makeSession('ticket-1', { id: 'session-2' }))
    await persistence.scores.save(
      makeScore('session-1', {
        computedAt: 10,
        rubric: {
          items: [
            { id: 'verify-caller', label: 'Verify the caller', category: 'safety' },
            // A step without a label cannot be named, so it is left out rather
            // than guessed at.
            { id: 'unlock' },
          ],
        },
      }),
    )
    await persistence.scores.save(
      makeScore('session-2', {
        computedAt: 20,
        rubric: { items: [{ id: 'unlock', label: 'Unlock the account' }] },
      }),
    )

    await persistence.actions.append(
      makeAction('session-1', {
        kind: 'hint',
        input: { itemId: 'verify-caller', hintIndex: 1 },
      }),
    )
    await persistence.actions.append(
      makeAction('session-1', { kind: 'hint', input: { itemId: 'unlock' } }),
    )
    await persistence.actions.append(makeAction('session-1'))
    // A hint row that names no step is not attributed to a rubric step.
    await persistence.actions.append(
      makeAction('session-2', { kind: 'hint', input: { text: 'no step here' } }),
    )

    expect(await persistence.scores.listScoredSteps()).toEqual([
      { sessionId: 'session-1', itemId: 'verify-caller', label: 'Verify the caller' },
      { sessionId: 'session-2', itemId: 'unlock', label: 'Unlock the account' },
    ])
    expect(await persistence.actions.listHints()).toEqual([
      { sessionId: 'session-1', itemId: 'verify-caller', hintIndex: 1 },
      { sessionId: 'session-1', itemId: 'unlock', hintIndex: 0 },
    ])
  })

  it('upserts scenario progress and settings values', async () => {
    const { persistence } = env

    await persistence.progress.upsert(makeStats())
    await persistence.progress.upsert(makeStats('NET-01', { attempts: 3, leitnerBox: 3 }))
    await persistence.progress.upsert(makeStats('PWD-01'))

    expect((await persistence.progress.get('NET-01'))?.attempts).toBe(3)
    expect((await persistence.progress.list()).map((row) => row.scenarioId)).toEqual([
      'NET-01',
      'PWD-01',
    ])

    await persistence.settings.set('theme', 'dark')
    await persistence.settings.set('onboarding', { seen: true, step: 2 })
    await persistence.settings.set('theme', 'light')

    expect(await persistence.settings.get('theme')).toBe('light')
    expect(await persistence.settings.get('missing')).toBeNull()
    expect(await persistence.settings.list()).toHaveLength(2)
  })

  it('keeps data across a close and reopen', async () => {
    const snapshotStore = new MemorySnapshotStore()
    const first = await createTestPersistence(snapshotStore)
    await first.persistence.tickets.create(makeTicket())
    await first.persistence.close()

    const second = await createTestPersistence(snapshotStore)
    expect((await second.persistence.tickets.findById('ticket-1'))?.id).toBe('ticket-1')
    expect(second.persistence.schemaVersion()).toBe(SCHEMA_VERSION)
    await second.persistence.close()
  })

  it('exports, imports, and keeps a pre-import backup', async () => {
    const { persistence, snapshotStore } = env
    await persistence.tickets.create(makeTicket())
    const exported = await persistence.exportDatabase()

    await persistence.tickets.create(makeTicket({ id: 'ticket-2', signature: 'sig-0002' }))
    expect(await persistence.tickets.listRecent(10)).toHaveLength(2)

    await persistence.importDatabase(exported)

    expect((await persistence.tickets.listRecent(10)).map((row) => row.id)).toEqual(['ticket-1'])
    expect(await snapshotStore.loadBackup()).not.toBeNull()
    expect(await persistence.tickets.findById('ticket-2')).toBeNull()
  })

  it('rejects invalid imports and leaves the current database untouched', async () => {
    const { persistence } = env
    await persistence.tickets.create(makeTicket())

    await expect(persistence.importDatabase(new Uint8Array())).rejects.toBeInstanceOf(ImportError)
    await expect(persistence.importDatabase(new Uint8Array([1, 2, 3, 4]))).rejects.toBeInstanceOf(
      ImportError,
    )

    const newer = await createSqliteDriver(undefined, { wasmBinary: loadWasmBinary() })
    runMigrations(newer)
    newer.setUserVersion(SCHEMA_VERSION + 1)
    const newerBytes = newer.export()
    newer.close()

    await expect(persistence.importDatabase(newerBytes)).rejects.toBeInstanceOf(SchemaVersionError)
    expect(await persistence.tickets.findById('ticket-1')).not.toBeNull()
  })

  it('resets to an empty current-schema database', async () => {
    const { persistence, snapshotStore } = env
    await persistence.tickets.create(makeTicket())
    await persistence.settings.set('theme', 'dark')

    await persistence.resetDatabase()

    expect(await persistence.tickets.listRecent(10)).toEqual([])
    expect(await persistence.settings.list()).toEqual([])
    expect(persistence.schemaVersion()).toBe(SCHEMA_VERSION)
    // A reset keeps a recoverable copy of the previous database.
    expect(await snapshotStore.loadBackup()).not.toBeNull()
  })

  it('surfaces corrupted JSON instead of returning a broken row', async () => {
    const db = await createSqliteDriver(undefined, { wasmBinary: loadWasmBinary() })
    runMigrations(db)
    db.run(
      `INSERT INTO tickets (id, scenario_id, variant_id, difficulty, seed, signature, public_json, created_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['corrupt', 'NET-01', 'variant', 1, 7, 'sig', 'not-json', 1, 'available'],
    )
    const persistence = new SqlitePersistence(db, new MemorySnapshotStore(), loadWasmBinary())

    await expect(persistence.tickets.findById('corrupt')).rejects.toBeInstanceOf(DataCorruptionError)

    await persistence.close()
  })
})
