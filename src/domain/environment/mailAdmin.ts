import { MESSAGE_ARGUMENT, offeredValues, type ConsoleEntry } from './console'
import type { MailMessage, MailMessageState, World } from './types'

/**
 * The mail admin: every mailbox on the tenant, and the mail it handled.
 *
 * Quota, forwarding, and holds are inventory: they are read here. Whether a
 * message actually arrived is not — that is what a trace is for, and the trace
 * stays an audited command so the log shows the check was made.
 */

const STATE_LABELS: Record<MailMessageState, string> = {
  delivered: 'Delivered',
  quarantined: 'Held for review',
  blocked: 'Blocked',
  deferred: 'Deferred',
}

const NOTE =
  'Quota, forwarding, and holds are read here. Delivery state is not: trace a message to see what the transport actually did with it.'

const RECENT_LIMIT = 6

function stamp(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16).replace('T', ' ')
}

function recentMessages(world: World, address: string): MailMessage[] {
  return world.mail.messages
    .filter((message) => message.to.toLowerCase() === address.toLowerCase())
    .sort((left, right) => right.receivedAt - left.receivedAt)
    .slice(0, RECENT_LIMIT)
}

/**
 * The ids to offer for a trace: the mail this mailbox handled, in the order it
 * is listed above. A mailbox that has taken no mail offers nothing — the ids
 * belong to rows the learner can see, not to the rest of the tenant.
 */
function traceableIds(messages: readonly MailMessage[]): string[] {
  return offeredValues(messages.map((message) => message.id))
}

export function mailAdminConsoleEntries(world: World): ConsoleEntry[] {
  return world.users.flatMap((user) => {
    const mailbox = world.mail.mailboxes.find((candidate) => candidate.userId === user.id)
    if (!mailbox) {
      return []
    }

    const messages = recentMessages(world, user.email)
    const held = messages.filter((message) => message.state === 'quarantined').length

    return [
      {
        id: user.samAccountName,
        title: user.displayName,
        subtitle: `${user.email} · ${mailbox.quotaPercent}% of quota used`,
        facts: [
          { label: 'Account', value: user.samAccountName },
          { label: 'Address', value: user.email },
          { label: 'Department', value: user.department },
          { label: 'Quota used', value: `${mailbox.quotaPercent}%` },
          { label: 'Forwarding', value: mailbox.forwarding ?? 'None' },
          { label: 'On hold', value: mailbox.onHold ? 'Yes - do not empty this mailbox' : 'No' },
          { label: 'Held for review', value: String(held) },
        ],
        groups: [
          {
            label: `Recent messages (${messages.length})`,
            items: messages.map(
              (message) =>
                `${message.id} · ${message.subject} · ${STATE_LABELS[message.state]} · ${stamp(message.receivedAt)}`,
            ),
            empty: 'No message has reached this mailbox yet.',
          },
        ],
        actions: [
          {
            id: 'read-mailbox',
            label: 'Read the mailbox record',
            detail: 'Log the quota, forwarding address, and hold state in the ticket evidence.',
            command: (target: string) => `get-mailbox ${target}`,
          },
          {
            id: 'trace-message',
            label: 'Trace a message',
            detail: 'Read the path and the filter verdict for a message id listed above.',
            command: (_target, args) => `trace-message ${args?.[0] ?? ''}`.trim(),
            args: [{ ...MESSAGE_ARGUMENT, choices: traceableIds(messages) }],
          },
          ...(mailbox.forwarding
            ? [
                {
                  id: 'clear-forwarding',
                  label: 'Clear external forwarding',
                  detail: `Stop sending this mail on to ${mailbox.forwarding}.`,
                  command: (target: string) => `clear-forwarding ${target}`,
                },
              ]
            : []),
        ],
        note: NOTE,
      },
    ]
  })
}
