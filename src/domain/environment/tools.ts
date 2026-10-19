import type { ConsoleId } from './console'

/**
 * The tool shelf the course is organised around, grouped the way the work is.
 *
 * Every tool here opens a console; the catalog is the only place the interface
 * learns which tools exist, so a new console appears on the shelf by being
 * added here rather than by editing the picker.
 */

export type ToolGroupId = 'infrastructure' | 'email' | 'knowledge' | 'management' | 'service-desk'

export interface ToolGroup {
  id: ToolGroupId
  label: string
}

export const TOOL_GROUPS: readonly ToolGroup[] = [
  { id: 'infrastructure', label: 'Infrastructure' },
  { id: 'email', label: 'Email' },
  { id: 'knowledge', label: 'Knowledge' },
  { id: 'management', label: 'Management' },
  { id: 'service-desk', label: 'Service desk' },
]

/** A tool id is a console id: every tool on the shelf opens one. */
export type ToolId = ConsoleId

export interface ToolListing {
  id: ToolId
  label: string
  group: ToolGroupId
  /** One line describing what the tool is for. */
  detail: string
}

function tool(id: ConsoleId, label: string, group: ToolGroupId, detail: string): ToolListing {
  return { id, label, group, detail }
}

/** In the order the picker lists them. */
export const TOOL_CATALOG: readonly ToolListing[] = [
  tool('directory', 'Directory', 'infrastructure', 'Accounts, groups, and the machines people use.'),
  tool('server-room', 'Server Room', 'infrastructure', 'Sites, servers, and the path traffic takes.'),
  tool(
    'remote-desktop',
    'Remote Desktop',
    'infrastructure',
    'Sessions on a user’s machine, and its state read from here.',
  ),
  tool(
    'computer-deployment',
    'Computer Deployment',
    'infrastructure',
    'Imaging runs against the machines on the shelves.',
  ),
  tool('pc-shelf', 'PC Shelf', 'infrastructure', 'What is on each site’s spare shelf, and its state.'),
  tool('mail-admin', 'Mail Admin', 'email', 'Mailboxes, quotas, forwarding, and a message trace.'),
  tool(
    'mail-security',
    'Mail Security',
    'email',
    'Held mail, the filter’s verdict, and sender blocks.',
  ),
  tool(
    'documentation',
    'Documentation',
    'knowledge',
    'The desk’s runbooks: how this work is done, in our own words.',
  ),
  tool('assets', 'Asset Management', 'management', 'Every machine, who holds it, and the state the fleet reports.'),
  tool('ship-manager', 'Ship Manager', 'management', 'Equipment going out, coming back, and running late.'),
  tool('printers', 'Printers', 'service-desk', 'Published printers, their queues, and the spooler.'),
  tool('shares', 'File shares', 'service-desk', 'Share paths, their servers, and effective access.'),
]

export function toolListing(id: ConsoleId): ToolListing | null {
  return TOOL_CATALOG.find((entry) => entry.id === id) ?? null
}

/** Grouped for the picker, skipping any group the catalog leaves empty. */
export function toolsByGroup(): Array<{ group: ToolGroup; tools: ToolListing[] }> {
  return TOOL_GROUPS.map((group) => ({
    group,
    tools: TOOL_CATALOG.filter((entry) => entry.group === group.id),
  })).filter((entry) => entry.tools.length > 0)
}
