import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { openPersistence, type Persistence } from '../../src/persistence/database'
import { MemorySnapshotStore } from '../../src/persistence/snapshotStore'

let cachedWasm: ArrayBuffer | null = null

/** Node reads the WASM file directly so no asset URL fetch is required. */
export function loadWasmBinary(): ArrayBuffer {
  if (!cachedWasm) {
    const path = fileURLToPath(new URL('../../node_modules/sql.js/dist/sql-wasm.wasm', import.meta.url))
    const file = readFileSync(path)
    const binary = new ArrayBuffer(file.byteLength)
    new Uint8Array(binary).set(file)
    cachedWasm = binary
  }
  return cachedWasm
}

export interface TestPersistence {
  persistence: Persistence
  snapshotStore: MemorySnapshotStore
}

export async function createTestPersistence(
  snapshotStore = new MemorySnapshotStore(),
): Promise<TestPersistence> {
  const persistence = await openPersistence({ snapshotStore, wasmBinary: loadWasmBinary() })
  return { persistence, snapshotStore }
}
