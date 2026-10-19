import type { CommandSource, StepSource } from '../../app/practiceService'

/**
 * One label set for every surface that shows where a step came from — a command
 * typed in a terminal, pressed in a console, or a hint, note or identity check
 * taken in a panel — so the workspace log and the debrief cannot drift apart.
 */
export const SOURCE_LABELS: Record<StepSource, string> = {
  terminal: 'Terminal',
  'remote-desktop-terminal': 'Desktop terminal',
  directory: 'Directory',
  'server-room': 'Server room',
  'remote-desktop': 'Remote desktop',
  'computer-deployment': 'Computer deployment',
  printers: 'Printers',
  shares: 'File shares',
  documentation: 'Documentation',
  'mail-admin': 'Mail admin',
  'mail-security': 'Mail security',
  assets: 'Asset Management',
  'pc-shelf': 'PC Shelf',
  'ship-manager': 'Ship Manager',
  hints: 'Hints',
  'troubleshooting-notes': 'Troubleshooting notes',
  'customer-notes': 'Customer notes',
  'handoff-note': 'Handoff note',
  'verify-caller': 'Verify the caller',
}

/** Every source, in a stable order, for surfaces that list them all. */
export const STEP_SOURCES = Object.keys(SOURCE_LABELS) as StepSource[]

/**
 * Where one command ran, as a phrase: the surface that took it, and the machine
 * whose shell ran it when the log recorded one. The side terminal is where a
 * desk types by default, so its surface name is left out — the pane and its
 * hostname already say as much — while a command from a Remote Desktop session
 * names both the surface and the machine it reached.
 *
 * Null when there is nothing worth adding: a side-terminal command from a log
 * that predates machines.
 */
export function commandOriginLabel(source: CommandSource, machine: string | null): string | null {
  if (source === 'terminal') {
    return machine ? `on ${machine}` : null
  }
  const surface = SOURCE_LABELS[source]
  return machine ? `via ${surface} on ${machine}` : `via ${surface}`
}
