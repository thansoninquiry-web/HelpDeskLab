import { MESSAGE_ARGUMENT, type ConsoleEntry } from './console'
import type { MailMessage, MailMessageState, World } from './types'

/**
 * Mail security: what the filter is holding, why, and what can be done with it.
 *
 * The verdict is shown because the filter already decided; the trace is shown so
 * a release or a block is a decision someone can defend afterwards.
 */

const STATE_LABELS: Record<MailMessageState, string> = {
  delivered: 'Delivered',
  quarantined: 'Held for review',
  blocked: 'Blocked',
  deferred: 'Deferred',
}

const STATE_ORDER: readonly MailMessageState[] = ['quarantined', 'blocked']

const NOTE =
  'Releasing delivers the message to its recipient; blocking a sender keeps future mail from it out of the tenant. Neither can recall mail that was already delivered.'

function stamp(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16).replace('T', ' ')
}

function heldEntry(world: World, message: MailMessage): ConsoleEntry {
  const alreadyBlocked = world.mail.blockedSenders.includes(message.from.toLowerCase())

  return {
    id: message.id,
    title: message.subject,
    subtitle: `${message.from} → ${message.to} · ${STATE_LABELS[message.state]}`,
    facts: [
      { label: 'Message', value: message.id },
      { label: 'From', value: message.from },
      { label: 'To', value: message.to },
      { label: 'Received', value: stamp(message.receivedAt) },
      { label: 'State', value: STATE_LABELS[message.state] },
      { label: 'Verdict', value: message.reason ?? 'No reason recorded.' },
      { label: 'Sender blocked', value: alreadyBlocked ? 'Yes' : 'No' },
    ],
    groups: [
      {
        label: 'Trace',
        items: message.events.map((event) => `${stamp(event.at)} · ${event.text}`),
        empty: 'No trace events were recorded for this message.',
      },
    ],
    actions: [
      {
        id: 'trace-message',
        label: 'Trace this message',
        detail: 'Log the transport path and the filter verdict in the ticket evidence.',
        command: (_target, args) => `trace-message ${args?.[0] ?? ''}`.trim(),
        args: [{ ...MESSAGE_ARGUMENT, choices: [message.id] }],
      },
      ...(message.state === 'quarantined'
        ? [
            {
              id: 'release',
              label: 'Release to the mailbox',
              detail: `Deliver ${message.id} to ${message.to}.`,
              command: (target: string) => `release-quarantine ${target}`,
            },
          ]
        : []),
      ...(alreadyBlocked
        ? []
        : [                {
                  id: 'block-sender',
                  label: 'Block the sender',
                  // The sender is on the record in front of the learner, so the
                  // action names it rather than asking them to retype it.
                  detail: `Stop future mail from ${message.from} at the tenant.`,
                  command: () => `block-sender ${message.from}`,
                },
          ]),
    ],
    note: NOTE,
  }
}

export function mailSecurityConsoleEntries(world: World): ConsoleEntry[] {
  const held = world.mail.messages
    .filter((message) => STATE_ORDER.includes(message.state))
    .sort(
      (left, right) =>
        STATE_ORDER.indexOf(left.state) - STATE_ORDER.indexOf(right.state) ||
        right.receivedAt - left.receivedAt,
    )

  return held.map((message) => heldEntry(world, message))
}
