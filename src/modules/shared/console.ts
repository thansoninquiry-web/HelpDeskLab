/**
 * What a module console prints.
 *
 * The simulators each have a command line of their own — PowerShell for Intune,
 * the Azure CLI for its subscription — but they all print the same two things: a
 * line of output, and how to read it. Keeping that vocabulary here means a
 * module can build its output without importing the pane that draws it, and the
 * pane can draw any of them without knowing which module it belongs to.
 *
 * It lives beside the modules rather than in `src/domain` because the interface
 * is not allowed to import the domain directly: the pane that draws these lines
 * is a UI component, and a vocabulary it cannot reach would be a vocabulary
 * every caller had to redeclare.
 */

export type ConsoleTone = 'output' | 'muted' | 'error' | 'success'

export interface ConsoleLine {
  text: string
  tone?: ConsoleTone
}

export interface ConsoleResponse {
  lines: readonly ConsoleLine[]
  /** The command emptied the scrollback, the way `clear` does. */
  cleared?: boolean
}

/** A result: what the command found, in the console's own words. */
export function line(text: string): ConsoleLine {
  return { text }
}

/** The quiet text around a result: labels, hints, the shape of a command. */
export function muted(text: string): ConsoleLine {
  return { text, tone: 'muted' }
}

/** A refusal, or a command the shell does not have. Nothing was run. */
export function failure(text: string): ConsoleLine {
  return { text, tone: 'error' }
}

/** Something the console did do, and that changed state. */
export function applied(text: string): ConsoleLine {
  return { text, tone: 'success' }
}

/**
 * What a console prints after it asked for an action: the console's own sentence
 * about what happened, coloured by whether the console carried it out.
 */
export function outcomeLine(
  summary: string,
  status: 'applied' | 'refused' | 'failed',
): ConsoleLine {
  return status === 'applied' ? applied(summary) : failure(summary)
}

/** A blank line, for the gap between one record and the next. */
export function blank(): ConsoleLine {
  return muted('')
}

/**
 * Pads a value to a column width so a list lines up in a monospaced pane, and
 * truncates rather than letting a long name push every other column across.
 */
export function column(value: string, width: number): string {
  return value.length >= width ? value.slice(0, width - 1) + '…' : value.padEnd(width, ' ')
}

/**
 * How long ago something happened, in the shorthand a console uses. Passed the
 * clock rather than reading it, so a command's output is reproducible in a test.
 */
export function since(at: number | null, now: number): string {
  if (at === null) {
    return 'never'
  }

  const minutes = Math.round((now - at) / 60_000)
  if (minutes < 1) {
    return 'just now'
  }
  if (minutes < 60) {
    return `${minutes}m ago`
  }

  const hours = Math.round(minutes / 60)
  if (hours < 24) {
    return `${hours}h ago`
  }

  const days = Math.round(hours / 24)
  return `${days}d ago`
}
