import type { PolicyRuleId } from './policy'

/**
 * Every reason a command can refuse a learner's request, in one list.
 *
 * The simulator has two kinds of failure: the argument's own problem — a site
 * that does not exist, a tag that is not on a shelf — and a *decision*: a record
 * that was written down earlier and now stops what the desk is trying to do. The
 * first is answered where the argument is parsed and is not interesting to anyone
 * but the learner who typed it. The second is the shape the decision-binding audit
 * exists for: a refusal, a stopped spooler, a machine on hold, a session that is
 * not open. Each of those is listed here, so the question "what can a command
 * refuse, and which decision is it answering?" has one place to be read.
 *
 * This list is checked against the code, not merely written beside it: every
 * hand-written refusal in `commands/` has to match one of these messages, and
 * every entry has to be a row in
 * [the audit inventory](../../../docs/research/decision-binding-audit.md), or
 * the audit test fails. A new decision-shaped check therefore cannot appear
 * quietly in a command: it has to be named here and written down there.
 */

/** Which of the audit's three layers enforces the reason. */
export type RefusalLayer = 'world policy' | 'command-local' | 'attempt layer'

export interface RefusalReason {
  /** Stable id: the audit's inventory row and the tests name this, not the wording. */
  id: string
  /** The audit's inventory row this reason is written down in. */
  auditRow: number
  layer: RefusalLayer
  /**
   * What answers it: the rule in `policy.ts`, or the helper/handler that owns the
   * order a command-local rule has to answer in.
   */
  enforcedBy: string
  /**
   * A fragment of the message as the source writes it, used to match a hand-written
   * refusal back to the decision it is answering. One decision may have several
   * messages — the same rule says different things to a server and to a machine
   * nobody is signed in to — so this is a list of fragments, not a list of rules.
   */
  messages: readonly string[]
  /** The rule id of a world policy, when this reason is answered by `policy.ts`. */
  policyRule?: PolicyRuleId
  /** True for the reasons the audit lists as deliberately binding nothing. */
  bindsNothing?: boolean
}

/**
 * The reasons a command can refuse. A reason that reads a record and stops a
 * command belongs in layer 1 (`policy.ts`) unless the audit says why it cannot:
 * each entry names where it is answered and the row that says which layer it is.
 */
export const REFUSAL_REASONS: readonly RefusalReason[] = [
  {
    id: 'request-refused',
    auditRow: 1,
    layer: 'world policy',
    enforcedBy: 'policy.ts → refusedRequest, asked by the reducer',
    policyRule: 'request-refused',
    messages: ['will not run: this request was refused on this ticket.'],
  },
  {
    id: 'spooler-stopped',
    auditRow: 2,
    layer: 'world policy',
    enforcedBy: 'policy.ts → stoppedSpooler, asked by the reducer',
    policyRule: 'spooler-stopped',
    messages: ['is stopped, so no queue can be read or cleared.'],
  },
  {
    id: 'stock-not-available',
    auditRow: 3,
    layer: 'world policy',
    enforcedBy: 'policy.ts → stockPolicy, called by book-shelf-machine and start-deployment',
    policyRule: 'stock-not-available',
    messages: ['cannot be issued:', 'is held:', 'is waiting on parts:'],
  },
  {
    id: 'no-live-session',
    auditRow: 4,
    layer: 'world policy',
    enforcedBy: 'policy.ts → unopenedSession, asked by the reducer',
    policyRule: 'no-live-session',
    messages: ['No active remote session is open on'],
  },
  {
    id: 'remote-target-kind',
    auditRow: 16,
    layer: 'command-local',
    enforcedBy: 'commands/remote.ts → the target a desktop action resolves',
    messages: [
      'is a server; it is managed from the server room.',
      'is a server; it is restarted from the server room.',
      'is a server.',
      'You are already working at',
      'has no user assigned, so there is no session to open.',
      'A desktop session never opens to a server.',
      'Remote Desktop is for another machine',
      'A shelf machine is imaged and issued before anyone can sign in to it.',
      'A server restart is an outage decision',
    ],
  },
  {
    id: 'shipment-state',
    auditRow: 7,
    layer: 'command-local',
    enforcedBy: 'commands/shipping.ts → each transition reads the shipment first',
    messages: [
      'is delayed: the collection never happened.',
      'has not been collected yet.',
      'is delayed, so it never left.',
      'is not delayed: it is ',
      'Dispatch it once the carrier has it',
      'Rebooking is for a collection that was missed.',
      'A collection is rebooked between 1 and ',
    ],
  },
  {
    id: 'machine-on-a-truck',
    auditRow: 8,
    layer: 'command-local',
    enforcedBy: 'commands/shelf.ts → book-shelf-machine, after the stock read',
    messages: ['is booked out on '],
  },
  {
    id: 'requester-holds-a-machine',
    auditRow: 9,
    layer: 'command-local',
    enforcedBy: 'commands/shelf.ts → book-shelf-machine, after the shipment read',
    messages: ['already holds '],
  },
  {
    id: 'mail-not-in-quarantine',
    auditRow: 10,
    layer: 'command-local',
    enforcedBy: 'commands/mail.ts → release-quarantine',
    messages: ['not held in quarantine.'],
  },
  {
    id: 'account-administration-mandate',
    auditRow: 11,
    layer: 'command-local',
    enforcedBy: 'commands/workstation.ts → directoryMandateDenial',
    messages: ['require a directory administrator.'],
  },
  {
    id: 'account-disabled',
    auditRow: 17,
    layer: 'command-local',
    enforcedBy: 'commands/identity.ts and commands/m365.ts → the account they found',
    messages: [
      'is disabled. Unlocking will not help.',
      'is disabled. A password reset will not restore access.',
      'is disabled. Clearing MFA will not restore access.',
    ],
  },
  {
    id: 'link-or-adapter-state',
    auditRow: 18,
    layer: 'command-local',
    enforcedBy: 'commands/network.ts and commands/remote.ts → the adapter the command would use',
    messages: [
      'no adapter is in the state permissible for this operation.',
      'The network cable is unplugged or the adapter is disconnected.',
      'has a static address; it does not take a DHCP lease.',
      'has no link, so it cannot reach the DHCP server.',
      'Change the adapter to DHCP first',
      'Fix the adapter or the cable before renewing the lease.',
    ],
  },
  {
    id: 'dhcp-live-lease',
    auditRow: 19,
    layer: 'command-local',
    enforcedBy: 'commands/dhcp.ts → clear-dhcp-lease',
    messages: ['is an active lease for '],
  },
  {
    id: 'scope-exhausted',
    auditRow: 20,
    layer: 'command-local',
    enforcedBy: 'commands/network.ts → ipconfig /renew',
    messages: ['is exhausted.'],
  },
  {
    id: 'default-printer-missing',
    auditRow: 21,
    layer: 'command-local',
    enforcedBy: 'commands/printer.ts → the queue command with no printer named',
    messages: ['No default printer is configured for this device.'],
  },
]

/**
 * The inventory rows that name a decision whose enforcement is *not* a command
 * refusal, so it has no message and no entry above: the deliberate non-checks and
 * the attempt layer. They are listed so the audit's table and this module can be
 * compared row by row without either side having to guess.
 */
export const NON_REFUSAL_AUDIT_ROWS: readonly number[] = [5, 6, 12, 13, 14, 15]

/** The row of the audit inventory a reason is checked against. */
export function auditRowFor(id: string): number | null {
  return REFUSAL_REASONS.find((reason) => reason.id === id)?.auditRow ?? null
}
