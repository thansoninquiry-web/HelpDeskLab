import type { SettingsRepository } from '../../domain/ports'
import type { JsonValue } from '../../domain/shared/json'
import type { RepositoryContext } from './context'
import { parseJsonValue } from './mappers'
import { assertNonEmpty } from './validation'

export class SqliteSettingsRepository implements SettingsRepository {
  private readonly context: RepositoryContext

  constructor(context: RepositoryContext) {
    this.context = context
  }

  async get(key: string): Promise<JsonValue | null> {
    assertNonEmpty(key, 'settings.key')
    return this.context.read((db) => {
      const row = db.exec('SELECT value FROM settings WHERE key = ?', [key])[0]
      return row ? parseJsonValue(row.value ?? null, `settings.${key}`) : null
    })
  }

  async set(key: string, value: JsonValue): Promise<void> {
    assertNonEmpty(key, 'settings.key')
    await this.context.write((db) => {
      db.run(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        [key, JSON.stringify(value)],
      )
    })
  }

  list(): Promise<Array<{ key: string; value: JsonValue }>> {
    return this.context.read((db) =>
      db.exec('SELECT key, value FROM settings ORDER BY key ASC').map((row) => {
        const key = String(row.key)
        return { key, value: parseJsonValue(row.value ?? null, `settings.${key}`) }
      }),
    )
  }
}
