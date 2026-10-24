// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { MemorySnapshotStore } from '../../src/persistence/snapshotStore'
import { openPersistence, type Persistence } from '../../src/persistence/database'
import { loadWasmBinary } from '../helpers/sqlite'

/**
 * A backup is a file, not a JSON blob: Settings exports the SQLite database and
 * imports it back. The prices live in one settings row keyed by family id, so
 * this proves the row that arrives in a fresh install is the row that left — for
 * a family this build prices, and for a family it has never heard of.
 */
const holder = vi.hoisted(() => ({ current: null as Persistence | null }))

vi.mock('../../src/app/persistenceService', () => ({
  getLocalDatabase: async () => {
    if (!holder.current) {
      throw new Error('Test database is not ready')
    }
    return holder.current
  },
}))

import { exportBackupFile, importBackupBytes } from '../../src/app/maintenanceService'
import {
  defaultHintPolicy,
  loadHintTargets,
  resolveHintPolicy,
  resolveHintPricing,
  saveFamilyHintPolicy,
  saveHintPolicy,
} from '../../src/app/settingsService'
import type { HintPolicy } from '../../src/domain/scoring/policy'

/** A family id no build in this repository knows, as a later release's file would carry. */
const UNKNOWN_FAMILY = 'E2E-99'

const DEFAULT_PRICE: HintPolicy = { perHint: 4, cap: 12, budget: 6 }
const KNOWN_PRICE: HintPolicy = { perHint: 9, cap: 27, budget: 10 }
const UNKNOWN_PRICE: HintPolicy = { perHint: 7, cap: 21, budget: 8 }
const OTHER_PRICE: HintPolicy = { perHint: 6, cap: 18, budget: 4 }

const SQLITE_HEADER = 'SQLite format 3'

let directory: string

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'helpdesklab-hints-'))
})

afterAll(async () => {
  await rm(directory, { recursive: true, force: true })
  holder.current = null
})

async function openFresh(): Promise<Persistence> {
  const persistence = await openPersistence({
    snapshotStore: new MemorySnapshotStore(),
    wasmBinary: loadWasmBinary(),
  })
  holder.current = persistence
  return persistence
}

/** The families in the stored settings row, read without going through the normalizer. */
async function storedFamilies(persistence: Persistence): Promise<Record<string, HintPolicy>> {
  const stored = await persistence.settings.get('hintPolicies')
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
    return {}
  }
  const families = (stored as { families?: unknown }).families
  if (typeof families !== 'object' || families === null || Array.isArray(families)) {
    return {}
  }
  return families as Record<string, HintPolicy>
}

describe('per-family hint prices in a backup file', () => {
  it('reaches a fresh database through a real .sqlite file, unknown family included', async () => {
    // --- The install that set the prices.
    const priced = await openFresh()
    await saveHintPolicy(DEFAULT_PRICE)
    await saveFamilyHintPolicy('NET-01', KNOWN_PRICE)

    // The row a later build would have written: its id is not in this build's
    // catalog, and `saveFamilyHintPolicy` deliberately refuses such an id. A
    // file from that build holds it all the same, so that is what is exported.
    const before = await storedFamilies(priced)
    expect(before['NET-01']).toEqual(KNOWN_PRICE)
    await priced.settings.set('hintPolicies', {
      default: { ...DEFAULT_PRICE },
      families: { ...before, [UNKNOWN_FAMILY]: { ...UNKNOWN_PRICE } },
    })

    // The Settings button: one SQLite file, saved under its dated name.
    const file = await exportBackupFile()
    const path = join(directory, file.filename)
    await writeFile(path, file.bytes)
    await priced.close()

    // The artifact is a database file, not a document with a .sqlite name, and
    // the prices are physically in it rather than re-derived on the way back.
    expect(file.filename).toMatch(/^helpdesklab-.+\.sqlite$/)
    const bytes = new Uint8Array(await readFile(path))
    expect(bytes.byteLength).toBeGreaterThan(0)
    expect(new TextDecoder().decode(bytes.subarray(0, SQLITE_HEADER.length))).toBe(SQLITE_HEADER)
    const contents = new TextDecoder().decode(bytes)
    expect(contents).toContain(UNKNOWN_FAMILY)
    expect(contents).toContain('"perHint":7')

    // --- A fresh install, restored from that file.
    const fresh = await openFresh()
    // Before the import it has no prices at all and every family plays at the default.
    expect(await storedFamilies(fresh)).toEqual({})
    expect(await resolveHintPolicy('NET-01')).toEqual(defaultHintPolicy())

    // The Settings import control, over the bytes of the file on disk.
    await importBackupBytes(bytes)

    // The known family plays at its own price, and the unknown one is still a
    // price of its own rather than silently becoming the default.
    expect(await resolveHintPolicy('NET-01')).toEqual(KNOWN_PRICE)
    expect(await resolveHintPolicy(UNKNOWN_FAMILY)).toEqual(UNKNOWN_PRICE)
    expect(await resolveHintPolicy('PWD-01')).toEqual(DEFAULT_PRICE)

    const pricing = await resolveHintPricing(UNKNOWN_FAMILY, false)
    expect(pricing.source).toBe('family')
    expect(pricing.familyId).toBe(UNKNOWN_FAMILY)
    expect(pricing.defaultPolicy).toEqual(DEFAULT_PRICE)

    // The Settings list shows this build's families and no phantom row.
    const targets = await loadHintTargets()
    expect(targets.find((target) => target.id === 'NET-01')).toEqual({
      id: 'NET-01',
      policy: KNOWN_PRICE,
      own: true,
    })
    expect(targets.find((target) => target.id === UNKNOWN_FAMILY)).toBeUndefined()

    // Editing another price rewrites the whole catalogue from a read of it. The
    // unknown family has to come back out of that write, or one visit to Settings
    // would quietly drop a price this build cannot show.
    await saveFamilyHintPolicy('PWD-01', OTHER_PRICE)
    expect(await resolveHintPolicy(UNKNOWN_FAMILY)).toEqual(UNKNOWN_PRICE)
    expect(await storedFamilies(fresh)).toEqual({
      'NET-01': KNOWN_PRICE,
      'PWD-01': OTHER_PRICE,
      [UNKNOWN_FAMILY]: UNKNOWN_PRICE,
    })

    // And a second export carries the same file forward instead of losing it.
    const again = await exportBackupFile()
    await fresh.close()

    const reimported = await openFresh()
    await importBackupBytes(again.bytes)
    expect(await resolveHintPolicy(UNKNOWN_FAMILY)).toEqual(UNKNOWN_PRICE)
    expect(await resolveHintPolicy('NET-01')).toEqual(KNOWN_PRICE)
    expect(await resolveHintPolicy('PWD-01')).toEqual(OTHER_PRICE)
    await reimported.close()
  })
})
