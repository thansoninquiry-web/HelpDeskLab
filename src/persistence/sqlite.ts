import initSqlJs, { type SqlValue } from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'

export type { SqlValue }

export type Row = Record<string, SqlValue>

export interface SqliteDriver {
  exec(sql: string, params?: SqlValue[]): Row[]
  /** Runs a single statement and returns the number of modified rows. */
  run(sql: string, params?: SqlValue[]): number
  transaction<T>(fn: () => T): T
  export(): Uint8Array
  close(): void
  getUserVersion(): number
  setUserVersion(version: number): void
}

export interface CreateDriverOptions {
  /** Used by tests so Node does not need to fetch the WASM asset by URL. */
  wasmBinary?: ArrayBuffer
}

type SqlJs = Awaited<ReturnType<typeof initSqlJs>>

let sqlJsPromise: Promise<SqlJs> | null = null

function loadSqlJs(wasmBinary?: ArrayBuffer): Promise<SqlJs> {
  if (!sqlJsPromise) {
    sqlJsPromise = initSqlJs(wasmBinary ? { wasmBinary } : { locateFile: () => wasmUrl })
  }
  return sqlJsPromise
}

function rowsFrom(result: { columns: string[]; values: SqlValue[][] }): Row[] {
  return result.values.map((values) => {
    const row: Row = {}
    result.columns.forEach((column, index) => {
      row[column] = values[index] ?? null
    })
    return row
  })
}

export async function createSqliteDriver(
  bytes?: Uint8Array,
  options: CreateDriverOptions = {},
): Promise<SqliteDriver> {
  const SQL = await loadSqlJs(options.wasmBinary)
  const database = bytes ? new SQL.Database(bytes) : new SQL.Database()
  database.run('PRAGMA foreign_keys = ON;')

  let closed = false

  const exec = (sql: string, params: SqlValue[] = []): Row[] => {
    const results = database.exec(sql, params)
    const first = results[0]
    return first ? rowsFrom(first) : []
  }

  const run = (sql: string, params: SqlValue[] = []): number => {
    database.run(sql, params)
    return database.getRowsModified()
  }

  const transaction = <T>(fn: () => T): T => {
    database.run('BEGIN IMMEDIATE;')
    let result: T
    try {
      result = fn()
    } catch (error) {
      try {
        database.run('ROLLBACK;')
      } catch {
        // The original error is the useful one; a failed rollback would be
        // reported by the next statement anyway.
      }
      throw error
    }
    database.run('COMMIT;')
    return result
  }

  return {
    exec,
    run,
    transaction,
    export: () => {
      if (closed) {
        throw new Error('Cannot export a closed SQLite database')
      }
      return database.export()
    },
    close: () => {
      if (!closed) {
        closed = true
        database.close()
      }
    },
    getUserVersion: () => {
      const value = exec('PRAGMA user_version;')[0]?.user_version
      return typeof value === 'number' ? value : 0
    },
    setUserVersion: (version: number) => {
      if (!Number.isInteger(version) || version < 0 || version > 1_000_000) {
        throw new RangeError(`Invalid schema version: ${version}`)
      }
      run(`PRAGMA user_version = ${version};`)
    },
  }
}

export const SQLITE_HEADER = 'SQLite format 3\u0000'
