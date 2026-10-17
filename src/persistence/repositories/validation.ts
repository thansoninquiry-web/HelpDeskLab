import { ConflictError } from '../errors'

export const MAX_LIST_LIMIT = 500

export function assertLimit(limit: number, max = MAX_LIST_LIMIT): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > max) {
    throw new RangeError(`limit must be an integer between 1 and ${max}`)
  }
}

export function assertNonEmpty(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new RangeError(`${field} must not be empty`)
  }
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && error.message.includes('UNIQUE constraint failed')
}

export function rethrowUniqueViolation(error: unknown, message: string): never {
  if (isUniqueViolation(error)) {
    throw new ConflictError(message, { cause: error })
  }
  throw error
}
