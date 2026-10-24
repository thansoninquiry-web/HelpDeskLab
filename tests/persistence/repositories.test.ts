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

  it('keeps where the desk was inside a console and drops it when the ticket closes', async () => {
    const { persistence } = env
    await persistence.tickets.create(makeTicket())
    await persistence.sessions.create(makeSession())

    // A row written before the focus existed has none, which is the same as a
    // console that was never searched.
    expect((await persistence.sessions.findById('session-1'))?.consoleFocus).toBeNull()

    await persistence.sessions.saveConsoleFocus('session-1', {
      directory: { query: 'kira', selectedId: 'user:kira-khan' },
    })

    expect((await persistence.sessions.findById('session-1'))?.consoleFocus).toEqual({
      directory: { query: 'kira', selectedId: 'user:kira-khan' },
    })

    await persistence.sessions.finish('session-1', {
      endedAt: 1_760_000_400_000,
      resolution: 'restarted-spooler',
      outcome: 'resolved',
    })

    // A finished ticket has no console to reopen, so its focus goes with the layout.
    expect((await persistence.sessions.findById('session-1'))?.consoleFocus).toBeNull()
    await expect(
      persistence.sessions.saveConsoleFocus('session-1', {
        directory: { query: 'late', selectedId: null },
      }),
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

  it('stamps each step with the wall clock as well as the call clock', async () => {
    const { persistence } = env
    await persistence.tickets.create(makeTicket())
    await persistence.sessions.create(makeSession())

    const before = Date.now()
    const stored = await persistence.actions.append(makeAction())
    const after = Date.now()

    // The call clock is the simulated minute the step sits on; the wall clock is
    // when the row was written, which is what the caller's stall ladder reads.
    expect(stored.atMs).toBe(1_760_000_160_000)
    expect(stored.wallMs).not.toBeNull()
    expect(stored.wallMs ?? 0).toBeGreaterThanOrEqual(before)
    expect(stored.wallMs ?? 0).toBeLessThanOrEqual(after)

    const [reloaded] = await persistence.actions.listBySession('session-1')
    expect(reloaded?.wallMs).toBe(stored.wallMs)
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
    // The score names the attempt it belongs to, so a module can read anything
    // the attempt recorded — how the ticket arrived, not only its family.
    expect(history.map((entry) => entry.sessionId)).toEqual(['session-1', 'session-2'])
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

  it('reads every caller check by the method and the proof it produced', async () => {
    const { persistence } = env
    await persistence.tickets.create(makeTicket())
    await persistence.sessions.create(makeSession())
    await persistence.sessions.create(makeSession('ticket-1', { id: 'session-2' }))

    await persistence.actions.append(
      makeAction('session-1', {
        kind: 'verify-caller',
        input: { method: 'verification-code' },
        output: { verified: true, result: 'verified' },
      }),
    )
    // A callback a colleague answered: the check happened, and it proved
    // somebody else, which is the distinction the scorer draws.
    await persistence.actions.append(
      makeAction('session-2', {
        kind: 'verify-caller',
        input: { method: 'callback' },
        output: { verified: false, provesCaller: false, result: 'colleague-answered' },
      }),
    )
    // A check that names no method this build offers is not attributed.
    await persistence.actions.append(
      makeAction('session-2', {
        kind: 'verify-caller',
        input: { employeeId: 'E-8842' },
        output: { verified: true },
      }),
    )
    await persistence.actions.append(makeAction('session-1'))

    expect(await persistence.actions.listVerificationChecks()).toEqual([
      { sessionId: 'session-1', method: 'verification-code', proved: true },
      { sessionId: 'session-2', method: 'callback', proved: false },
    ])
  })

  it('reads the rung count each score charged, beside the logged hints', async () => {
    const { persistence } = env
    await persistence.tickets.create(makeTicket())
    await persistence.sessions.create(makeSession())
    await persistence.sessions.create(makeSession('ticket-1', { id: 'session-2' }))
    await persistence.sessions.create(makeSession('ticket-1', { id: 'session-3' }))
    await persistence.scores.save(
      makeScore('session-1', {
        computedAt: 10,
        rubric: { items: [{ id: 'unlock', label: 'Unlock the account' }], hintsUsed: 2 },
      }),
    )
    // A score written before hints were counted keeps no number at all.
    await persistence.scores.save(
      makeScore('session-2', {
        computedAt: 20,
        rubric: { items: [{ id: 'unlock', label: 'Unlock the account' }] },
      }),
    )
    await persistence.scores.save(
      makeScore('session-3', {
        computedAt: 30,
        rubric: { items: [{ id: 'unlock', label: 'Unlock the account' }], hintsUsed: 0 },
      }),
    )

    // Only the attempts that stored a count report one: absent is not zero, so
    // a legacy score cannot be read as "took no hints".
    expect(await persistence.scores.listScoredHintCounts()).toEqual([
      { sessionId: 'session-1', hintsUsed: 2 },
      { sessionId: 'session-3', hintsUsed: 0 },
    ])
  })

  it('keeps a hint repair beside the score, and clears it again', async () => {
    const { persistence } = env
    await persistence.tickets.create(makeTicket())
    await persistence.sessions.create(makeSession())
    await persistence.scores.save(makeScore('session-1', { rubric: { items: [], hintsUsed: 2 } }))

    const repair = {
      placed: 0,
      missing: 2,
      rungs: [
        { sequence: 1, cost: 5 },
        { sequence: 2, cost: 5 },
      ],
      cost: 10,
      charged: 10,
      policy: { perHint: 5, cap: 15, budget: 0 },
      repairedAt: 1_760_000_500_000,
      source: 'policy' as const,
    }

    // A score with no repair is the ordinary case, not an error.
    expect(await persistence.scores.findHintRepair('session-1')).toBeNull()

    await persistence.scores.saveHintRepair('session-1', repair)
    expect(await persistence.scores.findHintRepair('session-1')).toEqual(repair)
    // The evaluation it was made beside has not moved.
    expect((await persistence.scores.findBySession('session-1'))?.rubric).toEqual({
      items: [],
      hintsUsed: 2,
    })

    await persistence.scores.saveHintRepair('session-1', null)
    expect(await persistence.scores.findHintRepair('session-1')).toBeNull()
  })

  it('refuses a repair for an attempt that has no score', async () => {
    const { persistence } = env

    await expect(
      persistence.scores.saveHintRepair('session-missing', {
        placed: 0,
        missing: 1,
        rungs: [{ sequence: 1, cost: 5 }],
        cost: 5,
        charged: 5,
        policy: { perHint: 5, cap: 15, budget: 0 },
        repairedAt: 1,
        source: 'policy',
      }),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('reads a row it cannot parse as no repair rather than a broken one', async () => {
    const driver = await createSqliteDriver(undefined, { wasmBinary: loadWasmBinary() })
    runMigrations(driver)
    const scoped = new SqlitePersistence(driver, new MemorySnapshotStore(), loadWasmBinary())
    await scoped.tickets.create(makeTicket())
    await scoped.sessions.create(makeSession())
    await scoped.scores.save(makeScore())

    driver.run("UPDATE scores SET hint_repair_json = 'not json' WHERE session_id = 'session-1'")
    expect(await scoped.scores.findHintRepair('session-1')).toBeNull()

    // Well-formed JSON that is not a repair is no repair either.
    driver.run(
      'UPDATE scores SET hint_repair_json = ? WHERE session_id = \'session-1\'',
      [JSON.stringify({ missing: 2, rungs: [] })],
    )
    expect(await scoped.scores.findHintRepair('session-1')).toBeNull()

    await scoped.close()
  })

  it('reads the cuts a log still holds, with the step each started at', async () => {
    const { persistence } = env
    await persistence.tickets.create(makeTicket())
    await persistence.tickets.create(
      makeTicket({
        id: 'ticket-2',
        scenarioId: 'PWD-01',
        variantId: 'locked-out',
        seed: 43,
        signature: 'sig-0002',
      }),
    )
    await persistence.sessions.create(makeSession())
    await persistence.sessions.create(makeSession('ticket-2', { id: 'session-2' }))

    await persistence.actions.append(
      makeAction('session-1', {
        kind: 'rewind',
        atMs: 1_760_000_200_000,
        input: {
          dropped: 2,
          fromSeq: 4,
          removed: [
            {
              kind: 'command',
              atMs: 1_760_000_190_000,
              input: { command: 'unlock-account alice.cooper' },
              output: {},
            },
            { kind: 'note', atMs: 1_760_000_195_000, input: { noteKind: 'resolution' }, output: {} },
          ],
        },
      }),
    )
    // A marker written before the dropped steps were kept names a count and no
    // step, and one that kept only the steps still counts what it dropped.
    await persistence.actions.append(
      makeAction('session-2', {
        kind: 'rewind',
        atMs: 1_760_000_300_000,
        input: { dropped: 3, fromSeq: 2 },
      }),
    )
    await persistence.actions.append(
      makeAction('session-2', {
        kind: 'rewind',
        atMs: 1_760_000_400_000,
        input: { fromSeq: 6, removed: [{ kind: 'hint', input: { itemId: 'probe' }, output: {} }] },
      }),
    )
    // Not a cut: the same log holds commands, and they are not read as rewinds.
    await persistence.actions.append(makeAction('session-1'))

    expect(await persistence.actions.listRewinds()).toEqual([
      {
        sessionId: 'session-1',
        scenarioId: 'NET-01',
        atMs: 1_760_000_200_000,
        dropped: 2,
        boundary: { kind: 'command', command: 'unlock-account alice.cooper', noteKind: null },
      },
      {
        sessionId: 'session-2',
        scenarioId: 'PWD-01',
        atMs: 1_760_000_300_000,
        dropped: 3,
        boundary: null,
      },
      {
        sessionId: 'session-2',
        scenarioId: 'PWD-01',
        atMs: 1_760_000_400_000,
        dropped: 1,
        boundary: { kind: 'hint', command: null, noteKind: null },
      },
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
