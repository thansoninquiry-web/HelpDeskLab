import { describe, expect, it } from 'vitest'
import { toolUseReport, type ToolUseLogStep } from '../../../src/domain/tickets/toolUse'

/** A console coming to the front. */
function opened(consoleId: string): ToolUseLogStep {
  return { kind: 'console-read', input: { consoleId }, output: { read: true } }
}

/** A record read inside whichever console was in front. */
function readRecord(consoleId: string, entryId: string): ToolUseLogStep {
  return { kind: 'console-read', input: { consoleId, entryId }, output: { read: true } }
}

/** A command, filed under the surface that ran it. */
function command(source: string): ToolUseLogStep {
  return { kind: 'command', input: { command: 'read-it', source }, output: { ok: true } }
}

describe('tool use reading', () => {
  it('names the consoles in the order they were first opened', () => {
    const report = toolUseReport([
      opened('directory'),
      readRecord('directory', 'lt-4471'),
      opened('printers'),
      command('printers'),
      opened('server-room'),
    ])

    expect(report.order).toEqual(['directory', 'printers', 'server-room'])
    expect(report.consoles.map((visit) => visit.consoleId)).toEqual(report.order)
  })

  it('counts opens, reads and commands per console, apart from the shell', () => {
    const report = toolUseReport([
      opened('directory'),
      readRecord('directory', 'lt-4471'),
      readRecord('directory', 'lt-8812'),
      command('directory'),
      command('terminal'),
      command('remote-desktop-terminal'),
    ])

    expect(report.consoles).toEqual([
      { consoleId: 'directory', opens: 1, reads: 2, commands: 1 },
    ])
    // The two shells are work, but no console owns them.
    expect(report.shellCommands).toBe(2)
  })

  it('counts only a change of console as a move, and the returns as revisits', () => {
    const report = toolUseReport([
      opened('directory'),
      opened('directory'),
      opened('printers'),
      opened('directory'),
      opened('server-room'),
    ])

    // Directory twice in a row is the same console brought forward again.
    expect(report.switches).toBe(3)
    expect(report.revisits).toBe(2)
  })

  it('marks a console that was opened and never run, and finds the one that carried the work', () => {
    const report = toolUseReport([
      opened('documentation'),
      opened('printers'),
      command('printers'),
      command('printers'),
      opened('shares'),
      readRecord('shares', 'finance'),
    ])

    expect(report.busiest).toBe('printers')
    expect(report.idle).toEqual(['documentation', 'shares'])
  })

  it('lists a console known only by the command it ran, which is where the desk was', () => {
    // A log written before opens were recorded: no open row, but the action says
    // which console ran it, so the console is part of the attempt's history.
    const report = toolUseReport([command('mail-admin'), command('terminal')])

    expect(report.order).toEqual(['mail-admin'])
    expect(report.consoles).toEqual([{ consoleId: 'mail-admin', opens: 0, reads: 0, commands: 1 }])
    expect(report.switches).toBe(0)
  })

  it('breaks a tie for the busiest console towards the one reached first', () => {
    const report = toolUseReport([
      opened('directory'),
      opened('printers'),
      command('directory'),
      command('printers'),
    ])

    expect(report.busiest).toBe('directory')
  })

  it('reads an attempt that never touched the tools as empty, not as one console', () => {
    const report = toolUseReport([command('terminal'), { kind: 'hint', input: {}, output: {} }])

    expect(report.order).toEqual([])
    expect(report.busiest).toBeNull()
    expect(report.idle).toEqual([])
    expect(report.shellCommands).toBe(1)
  })
})
