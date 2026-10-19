import { errorLine, line, mutedLine, successLine } from '../output'
import type { DirectoryUser, MailMessage, MailboxRecord } from '../types'
import type { CommandContext, CommandDefinition, CommandOutcome } from './types'
import { failed, succeeded, usageFailure } from './types'

const ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function stamp(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16).replace('T', ' ')
}

function findUser(context: CommandContext, value: string): DirectoryUser | undefined {
  const needle = value.trim().toLowerCase()
  return context.world.users.find(
    (user) =>
      user.samAccountName.toLowerCase() === needle ||
      user.email.toLowerCase() === needle ||
      user.displayName.toLowerCase() === needle,
  )
}

function mailboxFor(context: CommandContext, user: DirectoryUser): MailboxRecord | undefined {
  return context.world.mail.mailboxes.find((mailbox) => mailbox.userId === user.id)
}

function findMessage(context: CommandContext, value: string): MailMessage | undefined {
  const needle = value.trim().toLowerCase()
  return context.world.mail.messages.find((message) => message.id.toLowerCase() === needle)
}

function missingUser(value: string): CommandOutcome {
  return failed([
    errorLine(`The user '${value}' could not be found in the directory.`),
    mutedLine('Use the account name from the ticket details.'),
  ])
}

function missingMessage(value: string): CommandOutcome {
  return failed([
    errorLine(`No message '${value}' is recorded in the tenant.`),
    mutedLine('Run get-quarantine or open Mail Admin to read the message ids the filter kept.'),
  ])
}

function getMailbox(context: CommandContext): CommandOutcome {
  const target = context.args[0]
  if (!target || context.args.length > 1) {
    return usageFailure('get-mailbox <samAccountName>')
  }

  const user = findUser(context, target)
  if (!user) {
    return missingUser(target)
  }

  const mailbox = mailboxFor(context, user)
  if (!mailbox) {
    return failed([errorLine(`No mailbox exists for ${user.samAccountName}.`)])
  }

  const held = context.world.mail.messages.filter(
    (message) => message.to.toLowerCase() === user.email.toLowerCase() && message.state === 'quarantined',
  )

  return succeeded([
    line(`Mailbox         : ${user.email}`),
    line(`Tenant          : ${context.world.mail.domain}`),
    line(`Quota used      : ${mailbox.quotaPercent}%`),
    line(`Forwarding      : ${mailbox.forwarding ?? 'None'}`),
    line(`On hold         : ${mailbox.onHold ? 'True - do not empty this mailbox' : 'False'}`),
    line(`Held for review : ${held.length}`),
  ])
}

function traceMessage(context: CommandContext): CommandOutcome {
  const target = context.args[0]
  if (!target || context.args.length > 1) {
    return usageFailure('trace-message <messageId>')
  }

  const message = findMessage(context, target)
  if (!message) {
    return missingMessage(target)
  }

  const output = [
    line(`Message         : ${message.id}`),
    line(`From            : ${message.from}`),
    line(`To              : ${message.to}`),
    line(`Subject         : ${message.subject}`),
    line(`Received        : ${stamp(message.receivedAt)}`),
    line(`State           : ${message.state}`),
    line(`Filter verdict  : ${message.reason ?? 'None - no rule matched.'}`),
    line(),
    line('Trace'),
    ...message.events.map((event) => line(`  ${stamp(event.at)}  ${event.text}`)),
  ]

  return succeeded(output)
}

function getQuarantine(context: CommandContext): CommandOutcome {
  if (context.args.length > 0) {
    return usageFailure('get-quarantine')
  }

  const held = context.world.mail.messages.filter((message) => message.state === 'quarantined')
  if (held.length === 0) {
    return succeeded([mutedLine('Nothing is held in quarantine.')])
  }

  return succeeded([
    line(`Held for review : ${held.length}`),
    line(),
    ...held.flatMap((message) => [
      line(`${message.id}  ${message.subject}`),
      line(`  From    : ${message.from}`),
      line(`  To      : ${message.to}`),
      line(`  Held at : ${stamp(message.receivedAt)}`),
      line(`  Verdict : ${message.reason ?? 'No reason recorded.'}`),
    ]),
    mutedLine('Release a message only when the sender is expected and the content is safe.'),
  ])
}

function releaseQuarantine(context: CommandContext): CommandOutcome {
  const target = context.args[0]
  if (!target || context.args.length > 1) {
    return usageFailure('release-quarantine <messageId>')
  }

  const message = findMessage(context, target)
  if (!message) {
    return missingMessage(target)
  }
  if (message.state !== 'quarantined') {
    return failed([
      errorLine(`Message ${message.id} is '${message.state}', not held in quarantine.`),
      mutedLine('Only a message the filter is holding can be released.'),
    ])
  }

  message.state = 'delivered'
  message.events.push({
    at: context.now,
    text: `Released from quarantine by ${context.user?.samAccountName ?? 'the desk'}.`,
  })

  return succeeded(
    [
      successLine(`Released ${message.id} to ${message.to}.`),
      line(`Subject         : ${message.subject}`),
      line(`Verdict         : ${message.reason ?? 'None recorded.'}`),
      mutedLine('Tell the recipient the message was held, and why. Do not warn them off it if it was released.'),
    ],
    [{ type: 'mail_released', target: message.id, details: { from: message.from, to: message.to } }],
  )
}

function blockSender(context: CommandContext): CommandOutcome {
  const target = context.args[0]
  if (!target || context.args.length > 1) {
    return usageFailure('block-sender <address>')
  }
  const address = target.trim().toLowerCase()
  if (!ADDRESS.test(address)) {
    return failed([
      errorLine(`'${target}' is not an email address.`),
      mutedLine('Usage: block-sender <address>'),
    ])
  }

  if (context.world.mail.blockedSenders.includes(address)) {
    return succeeded([mutedLine(`${address} is already on the tenant block list.`)])
  }

  context.world.mail.blockedSenders.push(address)
  const held = context.world.mail.messages.filter(
    (message) => message.from.toLowerCase() === address && message.state === 'quarantined',
  )
  for (const message of held) {
    message.state = 'blocked'
    message.reason = 'Sender address is on the tenant block list'
    message.events.push({ at: context.now, text: 'Held messages from this sender were dropped.' })
  }

  return succeeded(
    [
      successLine(`Blocked ${address} at the tenant.`),
      line(`Held messages now dropped : ${held.length}`),
      mutedLine('A block stops new mail; it does not recall anything already delivered.'),
    ],
    [{ type: 'sender_blocked', target: address }],
  )
}

function clearForwarding(context: CommandContext): CommandOutcome {
  const target = context.args[0]
  if (!target || context.args.length > 1) {
    return usageFailure('clear-forwarding <samAccountName>')
  }

  const user = findUser(context, target)
  if (!user) {
    return missingUser(target)
  }

  const mailbox = mailboxFor(context, user)
  if (!mailbox) {
    return failed([errorLine(`No mailbox exists for ${user.samAccountName}.`)])
  }
  if (!mailbox.forwarding) {
    return succeeded([mutedLine(`No forwarding is set on ${user.samAccountName}.`)])
  }

  const previous = mailbox.forwarding
  mailbox.forwarding = null

  return succeeded(
    [
      successLine(`Cleared the forwarding on '${user.samAccountName}'.`),
      line(`Was sending to  : ${previous}`),
      mutedLine('Forwarding to an external address leaves the organisation; confirm the user set it before removing it.'),
    ],
    [{ type: 'forwarding_cleared', target: user.samAccountName, details: { previous } }],
  )
}

export const mailCommands: readonly CommandDefinition[] = [
  {
    name: 'get-mailbox',
    aliases: [],
    group: 'mail',
    access: 'read',
    usage: 'get-mailbox <samAccountName>',
    summary: 'Show a mailbox: quota, forwarding, holds, and mail held for review',
    run: getMailbox,
  },
  {
    name: 'trace-message',
    aliases: [],
    group: 'mail',
    access: 'read',
    usage: 'trace-message <messageId>',
    summary: 'Trace one message through the transport, with each event',
    run: traceMessage,
  },
  {
    name: 'get-quarantine',
    aliases: [],
    group: 'mail',
    access: 'read',
    usage: 'get-quarantine',
    summary: 'List the mail the filter is holding for review',
    run: getQuarantine,
  },
  {
    name: 'release-quarantine',
    aliases: [],
    group: 'mail',
    access: 'change',
    usage: 'release-quarantine <messageId>',
    summary: 'Release a held message to its recipient',
    run: releaseQuarantine,
  },
  {
    name: 'block-sender',
    aliases: [],
    group: 'mail',
    access: 'change',
    usage: 'block-sender <address>',
    summary: 'Block a sender at the tenant and drop the mail it has held',
    run: blockSender,
  },
  {
    name: 'clear-forwarding',
    aliases: [],
    group: 'mail',
    access: 'change',
    usage: 'clear-forwarding <samAccountName>',
    summary: 'Remove an external auto-forward from a mailbox',
    run: clearForwarding,
  },
]
