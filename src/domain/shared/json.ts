/** Values that can cross the SQLite boundary as JSON text. */
export type JsonPrimitive = string | number | boolean | null

export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject

export interface JsonObject {
  [key: string]: JsonValue
}

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
