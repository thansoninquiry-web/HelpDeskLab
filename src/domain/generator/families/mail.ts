import type { MailboxRecord } from '../../environment/types'
import type { BuildContext, ScenarioFamily } from '../types'
import {
  absent,
  decision,
  effect,
  makeItem,
  makeRubric,
  note,
  ordered,
  ran,
  verifyCaller,
} from '../rubric'

function mailboxFor(context: BuildContext): MailboxRecord {
  const mailbox = context.world.mail.mailboxes.find((entry) => entry.userId === context.user.id)
  if (!mailbox) {
    throw new Error('Mail scenario requires a mailbox for the requester')
  }
  return mailbox
}

/**
 * Mail Admin tickets are about the mailbox record: what is set on it, where its
 * mail is going, and what the tenant says happened to one message. The fixes are
 * first-line — an unwanted forward, or an explanation backed by a trace — so the
 * family never asks the desk to do something the console cannot do.
 */
export const mailFamily: ScenarioFamily = {
  id: 'MAIL-01',
  title: 'Mailboxes and delivery',
  category: 'mail',
  variants: [
    {
      id: 'forwarding-to-personal',
      label: 'Mail forwarded outside the organisation',
      summary: 'An external auto-forward copies every message to a personal address.',
      difficulty: 2,
      severity: 'high',
      subjects: [
        'Every email to {firstName} is being copied outside the company',
        'Personal forwarding left on {email}',
      ],
      bodies: [
        'I set up forwarding to my personal address before I went on leave and forgot to turn it off. Our policy says company mail must not leave the organisation, and my manager has asked me to get it removed today. The mailbox is {email} and I am at {site}. Can you take it off?',
        'Security has flagged that my mail is being copied to an outside address. I did set that up myself months ago so I could read messages at home, and I have not used it since. I need it gone, and I would rather not change anything else on the account. {displayName}, {department}.',
      ],
      symptoms: [
        'Every arriving message is also delivered to an address outside the organisation',
        'The mailbox record shows the forward, and the user confirms they set it',
        'The forwarding address is a personal one, not a company domain',
      ],
      build(context) {
        const mailbox = mailboxFor(context)
        const personal = `${context.user.samAccountName}.backup@example.net`
        mailbox.forwarding = personal
        return `forwarding:${context.user.samAccountName}:${personal}`
      },
      rubric(context) {
        const sam = context.user.samAccountName
        return makeRubric('MAIL-01', 'forwarding-to-personal', [
          makeItem({
            id: 'verify-caller',
            label: 'Verified the caller before changing the mailbox',
            why: 'A forwarding change decides where someone’s mail goes, so it is account-adjacent work.',
            category: 'safety',
            weight: 10,
            critical: true,
            checks: [ordered(verifyCaller(), effect('forwarding_cleared', sam))],
            hints: [
              'Changing where mail is delivered is account work, so prove who is asking first.',
              'Send a code to the number on the ticket and have the caller read it back before you clear anything.',
              'The read-back is the gate; clearing the forward before it is a scored safety miss.',
            ],
          }),
          makeItem({
            id: 'read-mailbox',
            label: 'Read the mailbox record',
            why: 'The record names the forwarding address, the quota, and any hold on the mailbox.',
            category: 'diagnosis',
            weight: 10,
            checks: [ran('get-mailbox', sam)],
            hints: [
              'get-mailbox <account> reads the mailbox record, including its forwarding line.',
              'Check the forwarding line and the hold line: a mailbox on hold must not be emptied.',
              'Expect a forwarding address at a personal domain and no hold on the mailbox.',
            ],
          }),
          makeItem({
            id: 'read-before-change',
            label: 'Read where the mail was going before removing it',
            why: 'Removing a forward without reading it leaves the handoff note unable to say what was stopped.',
            category: 'diagnosis',
            weight: 10,
            checks: [ordered(ran('get-mailbox', sam), effect('forwarding_cleared', sam))],
            hints: [
              'Read the record before you clear the forward, so the note can name the address that was receiving the mail.',
              'The order matters: an explained change is defensible, an unexplained one is not.',
              'The mailbox should show the personal address before the clearing command runs.',
            ],
          }),
          makeItem({
            id: 'clear-forwarding',
            label: 'Cleared the external forwarding',
            why: 'The forward is the fault; the mailbox itself is healthy.',
            category: 'resolution',
            weight: 25,
            critical: true,
            checks: [effect('forwarding_cleared', sam)],
            hints: [
              'clear-forwarding removes the auto-forward from the mailbox without touching the mail already delivered.',
              'Name the account, not the address: the command takes the account name from the ticket.',
              'After the command, the mailbox record should no longer show a forwarding address.',
            ],
          }),
          makeItem({
            id: 'verify-cleared',
            label: 'Re-read the mailbox to confirm the forward is gone',
            why: 'The success line confirms the command ran, not that the record changed.',
            category: 'diagnosis',
            weight: 10,
            checks: [ordered(effect('forwarding_cleared', sam), ran('get-mailbox', sam))],
            hints: [
              'Read the mailbox again after clearing the forward.',
              'The forwarding line should be back to None.',
              'If it still shows an address, the change did not take and the ticket is not finished.',
            ],
          }),
          makeItem({
            id: 'note-troubleshooting',
            label: 'Recorded the address the mail was going to',
            why: 'A forward that leaves the organisation is a security event; the note is what lets it be reviewed.',
            category: 'documentation',
            weight: 10,
            checks: [note('troubleshooting', 25)],
            hints: [
              'Name the external address and the account it was set on.',
              'Say that the user confirmed setting it, so the next reader does not start a compromise case from scratch.',
              'Example: “Personal forward to a personal domain on the account; user confirmed it; cleared and re-read the record.”',
            ],
          }),
          makeItem({
            id: 'note-customer',
            label: 'Told the user what stops now',
            why: 'The user needs to know future mail stays in the organisation and where the earlier copies went.',
            category: 'documentation',
            weight: 10,
            checks: [note('customer', 20)],
            hints: [
              'Tell the user the forward is off and future mail stays in their company mailbox.',
              'Be clear that copies already sent cannot be recalled.',
              'Ask them to check their personal inbox for anything sensitive and tell their manager.',
            ],
          }),
          makeItem({
            id: 'decision',
            label: 'Resolved the ticket',
            why: 'Removing an unwanted forward is a first-line mailbox change.',
            category: 'resolution',
            weight: 15,
            critical: true,
            checks: [decision('resolved', ['resolved-remote', 'resolved-user-guidance'])],
            hints: [
              'Removing a forward the user asked to remove is within the desk’s scope.',
              'Resolve it once the mailbox reads clean; no escalation is needed for the change itself.',
              'Pick “Resolved remotely”; the security review is a separate referral, not this ticket.',
            ],
          }),
        ])
      },
      reference(context) {
        const sam = context.user.samAccountName
        const mailbox = context.world.mail.mailboxes.find((entry) => entry.userId === context.user.id)
        return [
          { type: 'verify-caller' },
          { type: 'command', input: `get-mailbox ${sam}` },
          { type: 'command', input: `clear-forwarding ${sam}` },
          {
            type: 'command',
            input: `get-mailbox ${sam}`,
            label: 'Read the mailbox again to confirm the forward is gone',
          },
          {
            type: 'note',
            noteKind: 'troubleshooting',
            text: `Mailbox ${sam} had an external auto-forward to ${mailbox?.forwarding ?? 'a personal address'}. The user confirmed they set it themselves and does not use it. Verified the caller, cleared the forward, and re-read the record to confirm no forwarding remains.`,
          },
          {
            type: 'note',
            noteKind: 'customer',
            text: 'The forward to your personal address has been removed. New mail stays in your company mailbox from now on. Any copies already delivered to the personal inbox cannot be recalled, so please check it for company information and delete what you find there.',
          },
          {
            type: 'note',
            noteKind: 'resolution',
            text: 'Reported: mail to this mailbox was also copied to a personal address outside the organisation. Checked: the mailbox record showed the forward, and the user confirmed setting it. Next: forward cleared and the record re-read clean; no further action beyond the user checking the personal inbox.',
          },
        ]
      },
      expectedOutcome: 'resolved',
      expectedCodes: ['resolved-remote'],
    },
    {
      id: 'delivered-not-missing',
      label: 'Message already delivered',
      summary: 'The message the user says never arrived is in the mailbox; the trace shows it was delivered.',
      difficulty: 1,
      severity: 'low',
      subjects: ['Invoice email never arrived - {firstName}', '{firstName} is missing the freight invoice'],
      bodies: [
        'The freight invoice from our supplier never arrived. I have been waiting since yesterday and I need it to close the month. My mailbox is {email}. Nothing else is missing as far as I can tell.',
        'I was told the invoice was sent to me yesterday, but I cannot find it anywhere. My colleague got the same message, so perhaps it is my mailbox. Can you check what happened to it?',
      ],
      symptoms: [
        'One message is reported missing while other mail arrives normally',
        'The sender says the message was accepted for delivery',
        'The mailbox has room and no hold on it',
      ],
      build(context) {
        const mailbox = mailboxFor(context)
        mailbox.quotaPercent = 34
        mailbox.onHold = false

        const receivedAt = context.world.clock - 2 * 60 * 60 * 1000
        context.world.mail.messages.push({
          id: 'msg-3101',
          from: 'billing@northwind-freight.example',
          to: context.user.email,
          subject: 'Invoice 2291 for the September freight',
          receivedAt,
          state: 'delivered',
          reason: null,
          events: [
            { at: receivedAt, text: 'Accepted from the internet by MX01.' },
            { at: receivedAt + 9_000, text: 'Filtering passed: no rule matched.' },
            { at: receivedAt + 14_000, text: 'Delivered to the mailbox.' },
          ],
        })

        return `delivered:${context.user.samAccountName}:msg-3101`
      },
      rubric(context) {
        const sam = context.user.samAccountName
        return makeRubric('MAIL-01', 'delivered-not-missing', [
          makeItem({
            id: 'read-mailbox',
            label: 'Read the mailbox before assuming it is broken',
            why: 'Quota and holds are the two mailbox faults that would stop delivery; both are on this record.',
            category: 'diagnosis',
            weight: 10,
            checks: [ran('get-mailbox', sam)],
            hints: [
              'Read the mailbox record first: a full mailbox or a hold explains a whole class of missing mail.',
              'Check the quota and the hold line, and note how much mail is held for review.',
              'The record should show room in the mailbox and nothing on hold.',
            ],
          }),
          makeItem({
            id: 'trace-message',
            label: 'Traced the message through the transport',
            why: 'The trace is the only record of what happened to one message after it was accepted.',
            category: 'diagnosis',
            weight: 20,
            critical: true,
            checks: [ran('trace-message', 'msg-3101')],
            hints: [
              'trace-message <id> lists every step the transport recorded for that message.',
              'Look at the state and the last event, not just whether the sender says it was sent.',
              'Expect the trace to end with delivery to this mailbox.',
            ],
          }),
          makeItem({
            id: 'no-release',
            label: 'Did not release or drop anything',
            why: 'A message that was delivered is not in quarantine, and releasing the wrong one would change another mailbox.',
            category: 'safety',
            weight: 10,
            checks: [absent(effect('mail_released'))],
            hints: [
              'Nothing needs releasing: the message is not being held.',
              'Release only mail the filter is holding, and only after checking it is expected.',
              'Leave quarantine alone; a released message here would be a different message entirely.',
            ],
          }),
          makeItem({
            id: 'no-block',
            label: 'Did not block a sender the company needs',
            why: 'The supplier is a real trading partner; a block would stop every future invoice too.',
            category: 'safety',
            weight: 10,
            checks: [absent(effect('sender_blocked'))],
            hints: [
              'The sender is a supplier the company trades with, so a block would cost more than the missing message.',
              'Blocking is for unwanted mail, not for mail the desk cannot find.',
              'A block here would drop the supplier’s future invoices as well as this one.',
            ],
          }),
          makeItem({
            id: 'note-troubleshooting',
            label: 'Recorded what the trace showed',
            why: 'The next reader needs the message id and the delivery line, not a claim that the user was told to look again.',
            category: 'documentation',
            weight: 15,
            checks: [note('troubleshooting', 30)],
            hints: [
              'Record the message id, the sender, and the final state from the trace.',
              'Say that the mailbox had room and no hold, so those two causes are ruled out.',
              'Example: “msg-3101 from the supplier traced to delivered; mailbox has quota and no hold.”',
            ],
          }),
          makeItem({
            id: 'note-customer',
            label: 'Told the user where the message is',
            why: 'The user needs a next step they can take, not an argument about whether the message was sent.',
            category: 'documentation',
            weight: 20,
            checks: [note('customer', 30)],
            hints: [
              'Tell the user the message reached their mailbox and when.',
              'Send them to the inbox and the other mail app or device they read mail on.',
              'Ask them to search for the subject line and the supplier name before calling back.',
            ],
          }),
          makeItem({
            id: 'decision',
            label: 'Resolved with user guidance',
            why: 'There is no fault to fix; the deliverable is a clear, evidence-backed next step for the user.',
            category: 'resolution',
            weight: 15,
            critical: true,
            checks: [decision('resolved', ['resolved-user-guidance'])],
            hints: [
              'Nothing on the tenant is broken, so there is nothing to change.',
              'Resolve with user guidance rather than escalating a message that was delivered.',
              'Pick “Resolved with user guidance”; the evidence and the signpost are the close.',
            ],
          }),
        ])
      },
      reference(context) {
        const sam = context.user.samAccountName
        return [
          { type: 'command', input: `get-mailbox ${sam}` },
          { type: 'command', input: 'trace-message msg-3101' },
          {
            type: 'note',
            noteKind: 'troubleshooting',
            text: 'Mailbox has quota available and no hold. The trace for msg-3101 from billing@northwind-freight.example shows it was accepted, passed filtering, and was delivered to the mailbox two hours ago. No tenant fault is visible.',
          },
          {
            type: 'note',
            noteKind: 'customer',
            text: 'The invoice did reach your mailbox yesterday and nothing is blocking your mail. Search your inbox for “Invoice 2291” and check the other device or mail app you read mail on. If it still does not appear, reply and we will look again with the time you searched.',
          },
          {
            type: 'note',
            noteKind: 'resolution',
            text: 'Reported: the user could not find the supplier invoice. Checked: the mailbox had quota and no hold, and the trace showed msg-3101 delivered to the mailbox. Next: user will search the inbox and other mail clients; no tenant change was needed.',
          },
        ]
      },
      expectedOutcome: 'resolved',
      expectedCodes: ['resolved-user-guidance'],
    },
  ],
}
