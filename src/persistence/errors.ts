export class PersistenceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'PersistenceError'
  }
}

export class SchemaVersionError extends PersistenceError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'SchemaVersionError'
  }
}

export class SchemaValidationError extends PersistenceError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'SchemaValidationError'
  }
}

export class DataCorruptionError extends PersistenceError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'DataCorruptionError'
  }
}

export class NotFoundError extends PersistenceError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'NotFoundError'
  }
}

export class ConflictError extends PersistenceError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ConflictError'
  }
}

export class ImportError extends PersistenceError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ImportError'
  }
}
