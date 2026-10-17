// @vitest-environment node
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { IndexedDbSnapshotStore } from '../../src/persistence/snapshotStore'

const databaseNames: string[] = []

function makeStore(): IndexedDbSnapshotStore {
  const databaseName = `helpdesklab-test-${Math.random().toString(36).slice(2)}`
  databaseNames.push(databaseName)
  return new IndexedDbSnapshotStore({ databaseName })
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
  })
}

afterEach(async () => {
  await Promise.all(databaseNames.splice(0).map(deleteDatabase))
})

describe('IndexedDbSnapshotStore', () => {
  it('round-trips live and backup snapshots', async () => {
    const store = makeStore()
    const live = new Uint8Array([1, 2, 3])
    const backup = new Uint8Array([9, 8])

    expect(await store.load()).toBeNull()
    await store.save(live)
    await store.saveBackup(backup)

    expect(Array.from((await store.load()) ?? [])).toEqual([1, 2, 3])
    expect(Array.from((await store.loadBackup()) ?? [])).toEqual([9, 8])
  })

  it('copies bytes so later mutations do not change stored data', async () => {
    const store = makeStore()
    const bytes = new Uint8Array([5, 5, 5])
    await store.save(bytes)
    bytes[0] = 0

    expect((await store.load())?.[0]).toBe(5)
  })

  it('shares snapshots between instances of the same database', async () => {
    const store = makeStore()
    await store.save(new Uint8Array([7]))

    const reopened = new IndexedDbSnapshotStore({ databaseName: store.databaseName })
    expect(Array.from((await reopened.load()) ?? [])).toEqual([7])
  })

  it('clears the live snapshot but keeps the backup', async () => {
    const store = makeStore()
    await store.save(new Uint8Array([1]))
    await store.saveBackup(new Uint8Array([2]))

    await store.clear()

    expect(await store.load()).toBeNull()
    expect(Array.from((await store.loadBackup()) ?? [])).toEqual([2])
  })
})
