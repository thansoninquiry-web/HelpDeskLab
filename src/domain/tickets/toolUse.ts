import type { JsonObject } from '../shared/json'
import type { ActionKind } from './types'

/**
 * How the attempt used the tools, read from its own log.
 *
 * The log holds three things worth saying about tool use that no score does: a
 * console going to the front (`console-read` with no record named), a record
 * being read in it (`console-read` naming one), and a command it ran (a
 * `command` whose `source` is a console id rather than a shell). Reading them in
 * order answers what the debrief's trail cannot — *this* is where the desk went,
 * *this* is what it kept coming back to — and nothing here is stored: a rewind,
 * a reopen or a log written before this reading existed all produce it the same
 * way.
 */

/** The part of a logged action this reading needs. */
export interface ToolUseLogStep {
  kind: ActionKind
  input: JsonObject
  output: JsonObject
}

export interface ConsoleVisit {
  consoleId: string
  /**
   * Times the console was put in front. Opening a console that is already open
   * brings it forward without a row, so this counts the moves, not the tabs.
   */
  opens: number
  /** Records read from it, apart from opening it. */
  reads: number
  /** Commands it ran. An action pressed in the console is a command too. */
  commands: number
}

export interface ToolUseReport {
  /** Consoles in the order they were first put in front or first used. */
  order: string[]
  /** One row per console, in that same order. */
  consoles: ConsoleVisit[]
  /**
   * The console that ran the most commands, or null when none ran one. Ties go
   * to the console the desk reached first, so the reading favours what it did
   * sooner over what it did more of later.
   */
  busiest: string | null
  /** Consoles that were opened but never ran a command: looked at, then left. */
  idle: string[]
  /** Moves from one console to another, in the order the log recorded them. */
  switches: number
  /** Times a console was put in front after the first: going back to it. */
  revisits: number
  /** Commands typed in a shell rather than pressed in a console. */
  shellCommands: number
}

/** The two surfaces that are a command line rather than a console. */
const SHELL_SOURCES = new Set(['terminal', 'remote-desktop-terminal'])

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * What the log says about the tools the attempt used. A console is in `order`
 * from its first open or its first command, whichever came first, so an attempt
 * that ran an action without opening the console still appears.
 */
export function toolUseReport(steps: readonly ToolUseLogStep[]): ToolUseReport {
  const visits = new Map<string, ConsoleVisit>()
  const order: string[] = []
  let shellCommands = 0
  let switches = 0
  let front: string | null = null

  const visit = (consoleId: string): ConsoleVisit => {
    const existing = visits.get(consoleId)
    if (existing) {
      return existing
    }
    const created: ConsoleVisit = { consoleId, opens: 0, reads: 0, commands: 0 }
    visits.set(consoleId, created)
    order.push(consoleId)
    return created
  }

  for (const step of steps) {
    if (step.kind === 'console-read') {
      const consoleId = text(step.input.consoleId)
      if (!consoleId) {
        continue
      }
      const entry = visit(consoleId)
      // Naming a record is a read; leaving it unnamed is the console going to
      // the front, which is the only row that says where the desk moved to.
      if (text(step.input.entryId)) {
        entry.reads += 1
        continue
      }
      entry.opens += 1
      if (front !== null && front !== consoleId) {
        switches += 1
      }
      front = consoleId
      continue
    }

    if (step.kind !== 'command') {
      continue
    }
    const source = text(step.input.source)
    if (!source) {
      continue
    }
    if (SHELL_SOURCES.has(source)) {
      shellCommands += 1
      continue
    }
    visit(source).commands += 1
  }

  const consoles = order.map((consoleId) => visits.get(consoleId) as ConsoleVisit)

  let busiest: string | null = null
  let mostCommands = 0
  for (const visit of consoles) {
    if (visit.commands > mostCommands) {
      mostCommands = visit.commands
      busiest = visit.consoleId
    }
  }

  return {
    order,
    consoles,
    busiest,
    idle: consoles.filter((visit) => visit.commands === 0).map((visit) => visit.consoleId),
    switches,
    revisits: consoles.reduce((total, visit) => total + Math.max(visit.opens - 1, 0), 0),
    shellCommands,
  }
}
