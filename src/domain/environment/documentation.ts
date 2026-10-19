import type { ConsoleEntry } from './console'

/**
 * The runbook shelf: how a Tier 1 desk does the work, in our own words.
 *
 * Reference material, deliberately not a checklist of the open ticket. Nothing
 * here is evidence — the log records what was run — so a runbook names the real
 * commands and lets the learner decide which of them this fault needs.
 */

interface Runbook {
  id: string
  title: string
  subtitle: string
  appliesTo: string
  expects: string
  steps: string[]
  cautions: string[]
}

const RUNBOOKS: readonly Runbook[] = [
  {
    id: 'verify-the-caller',
    title: 'Verify a caller before anything changes',
    subtitle: 'Identity checks, and why they come first',
    appliesTo: 'Any request that changes an account, a mailbox, or access',
    expects: 'One live code, sent to a contact on the ticket and read back',
    steps: [
      'Open the ticket and note the person it names and the contact details on file.',
      'Send a verification code to the person themselves, not to whoever is asking.',
      'Ask them to read the code back, then enter the digits you were given.',
      'Only after the code checks out, continue with the work.',
    ],
    cautions: [
      'Never read a code out, accept a password, or take a colleague’s word for someone else.',
      'A manager can authorise a request; that is not the same as proving who is calling.',
    ],
  },
  {
    id: 'locked-or-expired-account',
    title: 'Get a locked or expired account working again',
    subtitle: 'Lockouts, expiries, and proving the fix',
    appliesTo: 'Sign-in and account-access tickets',
    expects: 'The account record before and after the change',
    steps: [
      'Read the account first: get-account <account> shows lockout and expiry state.',
      'Unlock it with unlock-account <account> if it is locked, or issue a temporary password with reset-password <account>.',
      'Read the account again and confirm the state changed.',
      'Tell the person what changed and what they have to do next.',
    ],
    cautions: [
      'Read before you write: resetting an account that is only locked hides the real cause.',
      'If the account should have been disabled, stop and escalate instead of re-enabling it.',
    ],
  },
  {
    id: 'name-resolution',
    title: 'Work a name-resolution failure',
    subtitle: 'When addresses work but names do not',
    appliesTo: 'Network tickets where nothing resolves',
    expects: 'The adapter configuration, then a lookup that succeeds',
    steps: [
      'Run ipconfig /all and read the address, gateway, and DNS servers.',
      'Test the name with nslookup <name>; a failure here points at the resolver.',
      'Compare the configured DNS servers with the ones the site scope publishes.',
      'Correct the servers with set-dns <ip>, then re-run the lookup.',
    ],
    cautions: [
      'A reachable gateway proves nothing about name resolution; test the lookup itself.',
      'Changing DNS on one machine does not fix a resolver that is down for a whole site.',
    ],
  },
  {
    id: 'address-from-dhcp',
    title: 'Get a machine back on the network',
    subtitle: 'Scope, stale leases, and renewing',
    appliesTo: 'Tickets where a machine has no usable address',
    expects: 'The scope read-out, the lease removed, and a renewed address',
    steps: [
      'Run ipconfig /all and note whether the machine is static or leasing.',
      'Read the site scope with get-dhcp-scope <site> and look for a stale lease on that address.',
      'Remove it with remove-dhcp-lease <site> <address> so the address can be handed out again.',
      'Renew on the machine with ipconfig /renew, then confirm the new address.',
    ],
    cautions: [
      'Never delete a lease that is still in use; check the state the scope reports.',
      'A scope with no free addresses needs an escalation, not a workaround.',
    ],
  },
  {
    id: 'stuck-print-queue',
    title: 'Clear a stuck print queue',
    subtitle: 'Jobs that will not move, and a spooler that is not running',
    appliesTo: 'Printing tickets',
    expects: 'The queue before and after, and a spooler that is running',
    steps: [
      'Run get-printers to see which printer is holding work and which one this machine defaults to.',
      'Inspect the queue with get-printqueue <printer> and read each job’s status.',
      'Restart the local service with restart-spooler when the spooler itself is stopped.',
      'Clear the stalled jobs with clear-printqueue <printer>, then print a test page.',
    ],
    cautions: [
      'Do not clear a queue on a printer that is merely offline; get it back online first.',
      'Tell the person which jobs were dropped so they can resend the ones they need.',
    ],
  },
  {
    id: 'm365-sign-in',
    title: 'Fix a Microsoft 365 sign-in',
    subtitle: 'Smart lockouts, MFA, and error codes',
    appliesTo: 'Sign-in tickets for the tenant',
    expects: 'The sign-in log before and after the change',
    steps: [
      'Run get-signin-log <account> and read the error code and the MFA method on file.',
      'Clear a smart lockout with unblock-signin <account> when the code names one.',
      'Reset a lost or replaced method with reset-mfa <account> and tell the person to re-register.',
      'Re-read the sign-in log to confirm the account is usable again.',
    ],
    cautions: [
      'Resetting MFA is a security change: verify the caller first, every time.',
      'A device-compliance block is not fixed by a password reset; escalate it.',
    ],
  },
  {
    id: 'share-access',
    title: 'Restore access to a file share',
    subtitle: 'Deny entries and group membership',
    appliesTo: 'Tickets where a share refuses a user',
    expects: 'Effective access before and after the change',
    steps: [
      'Check effective access with get-share-access <share> and read every grant, including denials.',
      'Compare the person’s groups with the ones the share expects.',
      'Restore membership with add-group-member <group> <account> when that is what is missing.',
      'Re-check access and confirm the person can open the folder.',
    ],
    cautions: [
      'An explicit Deny outranks every allow; removing the wrong grant opens more than it fixes.',
      'Group membership changes take a sign-out to reach a session; say so in the note.',
    ],
  },
  {
    id: 'close-the-ticket',
    title: 'Close a ticket another team can pick up',
    subtitle: 'Notes, closure codes, and handovers',
    appliesTo: 'Every ticket, whatever the outcome',
    expects: 'A troubleshooting note, a customer note, and a closure code',
    steps: [
      'Write the troubleshooting note while the evidence is on screen: what you saw, what you tried, what changed.',
      'Write a customer note in plain language: the outcome and the next step for them.',
      'Choose the closure code that matches what actually happened, including escalations and refusals.',
      'When you escalate, name the report, the evidence, and the next action in the handoff note.',
    ],
    cautions: [
      'Never close work you handed over without a note: the next team inherits the ticket, not your screen.',
      'A refusal is a decision, not a failure — record the reason and report it where the code says to.',
    ],
  },
]

const NOTE =
  'Reference material only. A runbook is not evidence, and it is not a list of steps for the open ticket: run the checks that this fault actually needs, and let the log show what you did.'

export function documentationConsoleEntries(): ConsoleEntry[] {
  return RUNBOOKS.map((runbook) => ({
    id: runbook.id,
    title: runbook.title,
    subtitle: runbook.subtitle,
    facts: [
      { label: 'Applies to', value: runbook.appliesTo },
      { label: 'Evidence it expects', value: runbook.expects },
    ],
    groups: [
      { label: 'Steps', items: [...runbook.steps], empty: 'No steps recorded.' },
      { label: 'Watch out for', items: [...runbook.cautions], empty: 'No cautions recorded.' },
    ],
    actions: [],
    note: NOTE,
  }))
}
