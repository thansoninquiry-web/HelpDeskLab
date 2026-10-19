/**
 * The shape every tool console produces.
 *
 * A console is a *projection plus an action list*: read-only inventory facts, and
 * buttons that run the same simulated commands the terminal runs. Nothing here
 * carries live state — lease status, link state, account state, and scope options
 * are deliberately absent, because those are the evidence a learner has to
 * collect with an audited command.
 *
 * Because every tool produces this one shape, a single pane renders all of them;
 * adding a tool means writing a projection, not another copy of the UI.
 */

import { isIPv4 } from './network'

export type ConsoleId =
  | 'directory'
  | 'server-room'
  | 'remote-desktop'
  | 'computer-deployment'
  | 'printers'
  | 'shares'
  | 'documentation'
  | 'mail-admin'
  | 'mail-security'
  | 'assets'
  | 'pc-shelf'
  | 'ship-manager'

/**
 * A value the learner types before the action can run, e.g. the lease to clear.
 * The console never guesses it from hidden state: the command's own output is
 * where an address or an account name comes from.
 */
export interface ConsoleActionArgument {
  id: string
  label: string
  placeholder: string
  /** What a usable value looks like, in the learner's words. */
  hint: string
  /** Checked before the command runs, in the service and in the interface. */
  validate: (value: string) => boolean
  /**
   * Values this action could plausibly take, offered as chips so the learner can
   * pick one instead of recalling it. A value is only ever offered once the
   * attempt already has it: either the console shows it (a mailbox's message
   * ids, the printers a site published) or the learner's own log has named it
   * (the addresses a scope check reported). Nothing here is revealed for free,
   * so the set is the learner's real choices rather than a shortcut past the
   * check that names them.
   *
   * Two more rules keep it honest. Nothing here is the answer key: an address is
   * offered as a value, not as "the stale one", and the evidence that says which
   * value is right is still only in the command's output. And no chip is ever
   * selected for the learner — the box starts empty and the run button stays
   * closed until a value is actually chosen.
   */
  choices?: readonly string[]
}

/**
 * One command the attempt has already run, reduced to the lines it printed. A
 * projection may read this to offer values the learner has collected — never
 * values the checks exist to reveal.
 */
export interface ConsoleEvidenceCommand {
  command: string
  lines: readonly { text: string }[]
}

/** What the attempt has already collected, oldest first. */
export type ConsoleEvidence = readonly ConsoleEvidenceCommand[]

/**
 * A short, stable list of values to offer for one argument: deduplicated, in the
 * order they were read, and capped so the row stays readable however large the
 * inventory behind it grows.
 */
export function offeredValues(values: readonly string[], limit = 8): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))].slice(
    0,
    limit,
  )
}

/** One word, because the commands take the account as a single argument. */
export const ACCOUNT_ARGUMENT: ConsoleActionArgument = {
  id: 'account',
  label: 'Account',
  placeholder: 'account-name',
  hint: 'the account to act on, as one word — the directory and the ticket name them',
  validate: (value) => /^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/.test(value.trim()),
}

export const GROUP_ARGUMENT: ConsoleActionArgument = {
  id: 'group',
  label: 'Access group',
  placeholder: 'group-name',
  hint: 'the access group the check names, as a single word',
  validate: (value) => /^[A-Za-z][A-Za-z0-9._-]{1,63}$/.test(value.trim()),
}

export const MESSAGE_ARGUMENT: ConsoleActionArgument = {
  id: 'message',
  label: 'Message ID',
  placeholder: 'msg-1001',
  hint: 'the trace id listed against the mailbox or in Mail Security',
  validate: (value) => /^[A-Za-z0-9][A-Za-z0-9-]{2,31}$/.test(value.trim()),
}

export const HOSTNAME_ARGUMENT: ConsoleActionArgument = {
  id: 'hostname',
  label: 'Machine',
  placeholder: 'LT-4472',
  hint: 'the hostname from the machine list, as it is written there',
  validate: (value) => /^[A-Za-z0-9][A-Za-z0-9-]{1,31}$/.test(value.trim()),
}

export const ASSET_TAG_ARGUMENT: ConsoleActionArgument = {
  id: 'assetTag',
  label: 'Asset tag',
  placeholder: 'SHELF-DT-0102',
  hint: 'the tag of a machine on a shelf, exactly as the register lists it',
  validate: (value) => /^[A-Za-z0-9][A-Za-z0-9-]{2,31}$/.test(value.trim()),
}

export const REASON_ARGUMENT: ConsoleActionArgument = {
  id: 'reason',
  label: 'Reason',
  placeholder: 'damage',
  hint: 'one word for why the machine is held, such as damage or parts',
  validate: (value) => /^[A-Za-z0-9][A-Za-z0-9-]{2,23}$/.test(value.trim()),
}

export const DAYS_ARGUMENT: ConsoleActionArgument = {
  id: 'days',
  label: 'Days out',
  placeholder: '2',
  hint: 'how many days until the carrier collects, 1 to 14',
  validate: (value) => /^\d{1,2}$/.test(value.trim()) && Number(value.trim()) >= 1 && Number(value.trim()) <= 14,
}

export const ADDRESS_ARGUMENT: ConsoleActionArgument = {
  id: 'address',
  label: 'Address',
  placeholder: '192.0.2.10',
  hint: 'an address the scope is holding, exactly as the scope check listed it',
  validate: (value) => isIPv4(value.trim()),
}

export interface ConsoleAction {
  id: string
  label: string
  /** What the action does, in the learner's words. */
  detail: string
  /**
   * The simulated command this action runs, exactly as if it were typed. `args`
   * holds the values the learner supplied, in the order they are declared.
   */
  command: (targetId: string, args?: readonly string[]) => string
  /** Inputs the action cannot run without; a console action always runs one command. */
  args?: readonly ConsoleActionArgument[]
}

export interface ConsoleFact {
  label: string
  value: string
}

export interface ConsoleGroup {
  label: string
  items: string[]
  /** Shown instead of the list when the group is empty. */
  empty: string
}

export interface ConsoleEntry {
  id: string
  title: string
  subtitle: string
  facts: ConsoleFact[]
  groups: ConsoleGroup[]
  actions: readonly ConsoleAction[]
  /** A caveat shown under the entry, e.g. which state it will not reveal. */
  note?: string
  /**
   * Filter ids this record matches, read from the live world by the projection.
   * They narrow the list without being printed: the record still leaves its
   * state to be collected with an audited command.
   */
  filterIds?: readonly string[]
  /**
   * What the desk has already done with this record, newest first: commands it
   * ran and tickets it closed that named it. Only consoles with a past to show
   * supply this, and it is read from the closed sessions rather than the world.
   */
  history?: readonly ConsoleHistoryItem[]
}

/** One past step in a record's desk history. */
export interface ConsoleHistoryItem {
  kind: 'command' | 'ticket'
  atMs: number
  /** The command line, or the subject of the ticket that was closed. */
  text: string
  /** The ticket the step belonged to. */
  ticket: string
  /** For a closed ticket only: how the attempt ended. */
  outcome?: 'resolved' | 'abandoned'
}

/** A way to narrow a console's records by a fact the projection computes. */
export interface ConsoleFilter {
  id: string
  label: string
}

/** How a console that is a picker names its list and the button on each row. */
export interface ConsolePicker {
  /** The heading the list sits under. */
  title: string
  /** One line saying what the list is for. */
  subtitle: string
  /**
   * The buttons a row may offer, in order — the first one this record actually
   * has is the one shown. A record with none of them is a plain row.
   */
  rowActions: readonly { id: string; label: string }[]
  /**
   * The glyph a row leads with. Only the machine glyph exists, because only the
   * machine console is a picker; a second picker would add its own here.
   */
  rowIcon?: 'machine'
}

export interface ConsoleDefinition {
  id: ConsoleId
  /** Tab label. */
  label: string
  /** Singular noun for the records listed, used for counts. */
  entryNoun: string
  searchLabel: string
  searchPlaceholder: string
  listLabel: string
  emptyMessage: string
  selectHint: string
  /**
   * True when these records can be browsed as tiles as well as rows: the same
   * records, the same selection, read all at once instead of a column at a
   * time. Only consoles whose records are short enough to read as a tile say so
   * — a directory account, not a runbook.
   */
  showsGrid?: boolean
  /**
   * Turns the console into a picker: a centred heading over one search and a
   * full-width list, and each row carrying the action that opens the record.
   * The row button runs the same audited command as the record's own button, so
   * reaching a machine this way is still an action in the log rather than a
   * shortcut past one.
   */
  picker?: ConsolePicker
  /**
   * Which facts a tile prints, in the order it prints them. Every label here
   * has to exist on every record of that console: a tile with a missing line is
   * a blank square rather than a smaller record, which is why a test holds the
   * declared labels to the projection.
   */
  tileFacts?: readonly string[]
  /**
   * True when each record is a machine and its actions act on that machine, so
   * a command run from a record is logged with the record's hostname. Remote
   * Desktop is the only console like this: its rows are machines, while a
   * directory row is an account and a server-room row may be a site.
   */
  machineScoped?: boolean
  /** Filters the console offers; a record matches when its `filterIds` names one. */
  filters?: readonly ConsoleFilter[]
  /** The label on the filter control, in the learner's words. */
  filterLabel?: string
}

export const CONSOLE_DEFINITIONS: Record<ConsoleId, ConsoleDefinition> = {
  directory: {
    id: 'directory',
    label: 'Directory',
    entryNoun: 'account',
    searchLabel: 'Search the directory',
    searchPlaceholder: 'Search by name, account, department, or device',
    listLabel: 'Directory accounts',
    emptyMessage:
      'The directory is empty. This should not happen in a generated world — report it rather than working around it.',
    selectHint:
      'Choose an account to see its record and the actions the desk can take. Nothing is changed until you run an action.',
    // A hundred accounts are easier to scan as tiles than as one column, and
    // where someone sits and what their employee id is are what the scan is for.
    showsGrid: true,
    tileFacts: ['Employee ID', 'Site'],
    // The listing does not print each account's state, but the live world can
    // narrow it: finding the locked accounts is a browse, proving it is a command.
    filters: [
      { id: 'locked', label: 'Locked' },
      { id: 'password-expired', label: 'Password expired' },
      { id: 'disabled', label: 'Disabled' },
    ],
    filterLabel: 'Filter by account state',
  },
  'remote-desktop': {
    id: 'remote-desktop',
    label: 'Remote Desktop',
    entryNoun: 'machine',
    searchLabel: 'Search the machines',
    searchPlaceholder: 'Search by hostname, holder, site, or model',
    listLabel: 'Machines the desk can reach',
    emptyMessage:
      'No machine is listed. This should not happen in a generated world — report it rather than working around it.',
    selectHint:
      'Choose a machine to read its state from here, then open or end the session on it. Nothing changes until you run an action.',
    machineScoped: true,
    picker: {
      title: 'Remote Desktop',
      subtitle: 'Select a computer to connect',
      rowActions: [
        { id: 'connect', label: 'Connect' },
        { id: 'end-session', label: 'End session' },
      ],
      rowIcon: 'machine',
    },
  },
  'computer-deployment': {
    id: 'computer-deployment',
    label: 'Computer Deployment',
    entryNoun: 'deployment',
    searchLabel: 'Search the deployment queue',
    searchPlaceholder: 'Search by asset tag, sequence, state, or step',
    listLabel: 'Booked deployments',
    emptyMessage: 'No deployment is booked against any machine on the shelves.',
    selectHint:
      'Choose a deployment to read the sequence and the shelf record behind it, then run it. Nothing changes until you run an action.',
  },
  'server-room': {
    id: 'server-room',
    label: 'Server room',
    entryNoun: 'record',
    searchLabel: 'Search the server room',
    searchPlaceholder: 'Search by site, server, subnet, gateway, or MAC address',
    listLabel: 'Sites, servers, and this machine',
    emptyMessage:
      'No infrastructure is listed. This should not happen in a generated world — report it rather than working around it.',
    selectHint:
      'Choose a site, a server, or this machine to see its inventory and the checks you can run. Nothing is changed until you run an action.',
  },
  printers: {
    id: 'printers',
    label: 'Printers',
    entryNoun: 'record',
    searchLabel: 'Search the printers',
    searchPlaceholder: 'Search by printer, site, model, or share',
    listLabel: 'Printers and this machine',
    emptyMessage:
      'No printer is inventoried. This should not happen in a generated world — report it rather than working around it.',
    selectHint:
      'Choose a printer, or this machine, to see the queues it holds and what you can do about them. Nothing is changed until you run an action.',
  },
  shares: {
    id: 'shares',
    label: 'File shares',
    entryNoun: 'share',
    searchLabel: 'Search the shares',
    searchPlaceholder: 'Search by share, path, or server',
    listLabel: 'File shares',
    emptyMessage:
      'No share is inventoried. This should not happen in a generated world — report it rather than working around it.',
    selectHint:
      'Choose a share to see where it lives and what you can check about it. Nothing is changed until you run an action.',
  },
  documentation: {
    id: 'documentation',
    label: 'Documentation',
    entryNoun: 'runbook',
    searchLabel: 'Search the runbooks',
    searchPlaceholder: 'Search by symptom, tool, or command',
    listLabel: 'Runbooks',
    emptyMessage: 'No runbook is loaded. This should not happen in a shipped build.',
    selectHint:
      'Choose a runbook to read how the desk does this work. It is reference material: the log is what counts as evidence.',
  },
  'mail-admin': {
    id: 'mail-admin',
    label: 'Mail Admin',
    entryNoun: 'mailbox',
    searchLabel: 'Search the mailboxes',
    searchPlaceholder: 'Search by name, account, address, or department',
    listLabel: 'Mailboxes',
    emptyMessage:
      'No mailbox is listed. This should not happen in a generated world — report it rather than working around it.',
    selectHint:
      'Choose a mailbox to read its quota, forwarding, and the messages the tenant handled. Nothing changes until you run an action.',
  },
  'mail-security': {
    id: 'mail-security',
    label: 'Mail Security',
    entryNoun: 'message',
    searchLabel: 'Search the held mail',
    searchPlaceholder: 'Search by subject, sender, recipient, or verdict',
    listLabel: 'Held and blocked messages',
    emptyMessage: 'Nothing is held or blocked in the tenant.',
    selectHint:
      'Choose a message to read the filter’s verdict and trace it, then release it or block the sender. Nothing changes until you run an action.',
  },
  assets: {
    id: 'assets',
    label: 'Asset Management',
    entryNoun: 'record',
    searchLabel: 'Search the asset register',
    searchPlaceholder: 'Search by tag, holder, site, model, or operating system',
    listLabel: 'Machines and shelf stock',
    emptyMessage:
      'Nothing is registered. This should not happen in a generated world — report it rather than working around it.',
    selectHint:
      'Choose a machine to see who holds it, then read the record to put the lookup in the ticket log.',
  },
  'pc-shelf': {
    id: 'pc-shelf',
    label: 'PC Shelf',
    entryNoun: 'bay',
    searchLabel: 'Search the shelves',
    searchPlaceholder: 'Search by site, tag, model, or state',
    listLabel: 'Spare shelves by site',
    emptyMessage:
      'No shelf is inventoried. This should not happen in a generated world — report it rather than working around it.',
    selectHint:
      'Choose a site to count what is on its shelf, then book a ready machine out or hold one that must not be issued.',
  },
  'ship-manager': {
    id: 'ship-manager',
    label: 'Ship Manager',
    entryNoun: 'shipment',
    searchLabel: 'Search the shipping desk',
    searchPlaceholder: 'Search by reference, carrier, site, tag, or state',
    listLabel: 'Shipments',
    emptyMessage: 'Nothing is moving between sites in this world.',
    selectHint:
      'Choose a shipment to see where it is, then print its label, dispatch it, deliver it, or rebook a missed collection.',
  },
}

/** Everything a learner could type into the search box, as one lowercased string. */
export function searchTextFor(entry: ConsoleEntry): string {
  return [
    entry.title,
    entry.subtitle,
    ...entry.facts.flatMap((fact) => [fact.label, fact.value]),
    ...entry.groups.flatMap((group) => group.items),
  ]
    .join(' ')
    .toLowerCase()
}

/**
 * Narrows records to the ones a declared filter matches. A projection computes
 * each record's `filterIds` from the live world, so the list follows an unlock,
 * a disablement, or a password change without a second listing to keep in step.
 */
export function filterConsoleEntries(
  entries: readonly ConsoleEntry[],
  filterId: string | null,
): ConsoleEntry[] {
  if (!filterId) {
    return [...entries]
  }
  return entries.filter((entry) => entry.filterIds?.includes(filterId))
}

/**
 * Case-insensitive search across the fields a learner would actually type: the
 * entry's own name, its site, its facts, and the devices or items it lists.
 */
export function searchConsoleEntries(
  entries: readonly ConsoleEntry[],
  query: string,
): ConsoleEntry[] {
  const needle = query.trim().toLowerCase()
  if (needle.length === 0) {
    return [...entries]
  }
  return entries.filter((entry) => searchTextFor(entry).includes(needle))
}
