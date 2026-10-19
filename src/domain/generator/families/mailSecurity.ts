import type { MailMessage } from '../../environment/types'
import type { BuildContext, ScenarioFamily } from '../types'
import { absent, decision, effect, makeItem, makeRubric, note, ordered, ran } from '../rubric'

function holdMessage(
  context: BuildContext,
  message: Pick<MailMessage, 'id' | 'from' | 'subject' | 'reason'>,
): MailMessage {
  const receivedAt = context.world.clock - 90 * 60 * 1000
  const held: MailMessage = {
    ...message,
    to: context.user.email,
    receivedAt,
    state: 'quarantined',
    events: [
      { at: receivedAt, text: 'Accepted from the internet by MX01.' },
      { at: receivedAt + 6_000, text: message.reason ?? 'The filter held the message.' },
    ],
  }
  context.world.mail.messages.push(held)
  return held
}

/**
 * Mail Security tickets are decisions, not just reads: the filter has already
 * judged the message, and the desk decides whether to release it, block the
 * sender, or leave both alone. The two variants are the two directions of that
 * judgement, so a learner who learns "release the held mail" or "block the
 * sender" as a reflex fails one of them.
 */
export const mailSecurityFamily: ScenarioFamily = {
  id: 'MAILSEC-01',
  title: 'Mail security and quarantine',
  category: 'mail',
  variants: [
    {
      id: 'phishing-release-request',
      label: 'Release request for a phishing hold',
      summary: 'A payment message held as a finance impersonation is being pushed for release.',
      difficulty: 3,
      severity: 'high',
      subjects: [
        'Please release the payment email that was held - {displayName}',
        'Held invoice email is stopping a supplier payment',
      ],
      bodies: [
        'An email about our September payment has been held for review and I need it today to pay the invoice. It looks like it came from our payment provider’s accounts team. Can you release it to me? I am {displayName} in {department} at {site}.',
        'The finance team says a payment confirmation is sitting in quarantine and the supplier is chasing. I have not seen the message itself. Please release it so we can process the payment before the cut-off.',
      ],
      symptoms: [
        'The message is held by the anti-phishing policy',
        'The display name matches a finance team, but the sending domain does not',
        'The request is for a fast release, with the payment deadline as the reason',
      ],
      build(context) {
        const held = holdMessage(context, {
          id: 'msg-4001',
          from: 'accounts@larkspur-payment-support.example',
          subject: 'Action required: confirm your payment details',
          reason: 'Phishing: display name impersonating the finance team',
        })
        return `phishing-hold:${held.id}:${held.from}`
      },
      rubric(context) {
        const message = context.world.mail.messages.find((entry) => entry.id === 'msg-4001')
        const from = message?.from ?? 'accounts@larkspur-payment-support.example'
        return makeRubric('MAILSEC-01', 'phishing-release-request', [
          makeItem({
            id: 'trace-message',
            label: 'Read the filter’s verdict and the trace',
            why: 'The hold reason is the evidence: a finance display name over a domain that is not the company’s.',
            category: 'diagnosis',
            weight: 15,
            critical: true,
            checks: [ran('trace-message', 'msg-4001')],
            hints: [
              'Open the held message and read the verdict the filter recorded.',
              'Compare the display name with the sending domain; an impersonation is exactly that mismatch.',
              'trace-message msg-4001 should show a finance display name and a domain that is not the payment provider’s.',
            ],
          }),
          makeItem({
            id: 'no-release',
            label: 'Did not release the message',
            why: 'Releasing delivers a phishing attempt to the mailbox it was aimed at.',
            category: 'safety',
            weight: 20,
            critical: true,
            checks: [absent(effect('mail_released'))],
            hints: [
              'A verified impersonation is not released, however urgent the payment sounds.',
              'Releasing delivers it straight to the mailbox the attacker chose.',
              'Leave the message held; the request is the attack, not the work.',
            ],
          }),
          makeItem({
            id: 'block-sender',
            label: 'Blocked the sender at the tenant',
            why: 'A block stops the next message from the same address before it reaches anyone.',
            category: 'resolution',
            weight: 25,
            critical: true,
            checks: [effect('sender_blocked', from)],
            hints: [
              'Block the sending address, not the display name.',
              'block-sender takes the address exactly as the trace prints it.',
              'After the block, the held message should show as blocked rather than waiting for review.',
            ],
          }),
          makeItem({
            id: 'block-before-release',
            label: 'Blocked before anything could be delivered',
            why: 'The order proves the message was never handed over while the block was being arranged.',
            category: 'safety',
            weight: 10,
            checks: [ordered(ran('trace-message', 'msg-4001'), effect('sender_blocked', from))],
            hints: [
              'Read the verdict before you act on the message.',
              'The block follows the trace; acting first is guessing at what the message is.',
              'The trace should come before the block in the ticket log.',
            ],
          }),
          makeItem({
            id: 'note-troubleshooting',
            label: 'Recorded why it was a phish',
            why: 'A block without the verdict is a block the next reviewer has to justify again.',
            category: 'documentation',
            weight: 10,
            checks: [note('troubleshooting', 30)],
            hints: [
              'Name the message id, the sending address, and the impersonation the filter found.',
              'Say that the requested release was refused.',
              'Example: “msg-4001 impersonated finance from an outside domain; not released; sender blocked.”',
            ],
          }),
          makeItem({
            id: 'note-customer',
            label: 'Told the user the payment request is not genuine',
            why: 'The user is about to pay an invoice; they need to know the message was an attempt, not a delay.',
            category: 'documentation',
            weight: 10,
            checks: [note('customer', 30)],
            hints: [
              'Say plainly that the message was not sent by the payment provider.',
              'Tell them not to act on its payment details and to check the invoice through the supplier’s known contact route.',
              'Mention that the sender is blocked, so a repeat should not arrive.',
            ],
          }),
          makeItem({
            id: 'decision',
            label: 'Resolved the ticket',
            why: 'Refusing the release and blocking the sender is the complete first-line response.',
            category: 'resolution',
            weight: 10,
            critical: true,
            checks: [decision('resolved', ['resolved-remote'])],
            hints: [
              'The decision is the close here: refuse the release, block, and record it.',
              'Resolve remotely once the sender is blocked.',
              'Pick “Resolved remotely”; the user still has their own payment to verify separately.',
            ],
          }),
        ])
      },
      reference(context) {
        const message = context.world.mail.messages.find((entry) => entry.id === 'msg-4001')
        const from = message?.from ?? 'accounts@larkspur-payment-support.example'
        return [
          { type: 'command', input: 'trace-message msg-4001' },
          { type: 'command', input: `block-sender ${from}` },
          {
            type: 'command',
            input: 'trace-message msg-4001',
            label: 'Read the trace again to confirm the message is blocked',
          },
          {
            type: 'note',
            noteKind: 'troubleshooting',
            text: `Held message msg-4001 claimed to be from the payment provider’s accounts team but came from ${from}, an outside domain. The filter verdict was a display-name impersonation of finance. The release request was refused and the sender was blocked at the tenant; the message now reads as blocked.`,
          },
          {
            type: 'note',
            noteKind: 'customer',
            text: 'That email was not sent by our payment provider. It was an impersonation attempt and has not been released to your mailbox. Do not use the payment details in it. Please verify the invoice through the supplier’s usual contact details, and tell us if anything similar arrives.',
          },
          {
            type: 'note',
            noteKind: 'resolution',
            text: 'Reported: a payment confirmation held in quarantine needed releasing before a deadline. Checked: the trace showed a finance display name over an outside domain, matching the impersonation verdict. Next: no release; sender blocked; the user will verify the invoice through the supplier’s known contact.',
          },
        ]
      },
      expectedOutcome: 'resolved',
      expectedCodes: ['resolved-remote'],
    },
    {
      id: 'supplier-note-held',
      label: 'Carrier’s delivery note held as an attachment',
      summary: 'A real carrier’s delivery note is held by an attachment-type rule; the shipment needs it.',
      difficulty: 2,
      severity: 'medium',
      subjects: [
        'Delivery note from Ridgeway Couriers is held - {firstName}',
        'Held attachment is holding up shipment LSP-8842',
      ],
      bodies: [
        'Our carrier sent the delivery note for a shipment that is already on its way, and it has been held for review. The depot needs that note to book the return. The message is from invoices@ridgeway-couriers.example and I cannot see it. Can you check and let it through if it is genuine?',
        'A delivery note from our freight carrier never reached me. I have used this carrier for years and the shipment is due tomorrow. {displayName} here at {site}; please release it if it is really from them.',
      ],
      symptoms: [
        'The message is held by an attachment-type rule, not by a phishing verdict',
        'The sender is a carrier the company already ships with',
        'The shipment it refers to is due and waiting on the paperwork',
      ],
      build(context) {
        const held = holdMessage(context, {
          id: 'msg-4101',
          from: 'invoices@ridgeway-couriers.example',
          subject: 'Delivery note for LSP-8842',
          reason: 'Attachment type blocked by policy: .htm',
        })
        return `supplier-hold:${held.id}:${held.from}`
      },
      rubric() {
        return makeRubric('MAILSEC-01', 'supplier-note-held', [
          makeItem({
            id: 'trace-message',
            label: 'Checked the verdict and the sender',
            why: 'An attachment rule is a policy block, not a judgement about the sender; the trace says which one held it.',
            category: 'diagnosis',
            weight: 15,
            critical: true,
            checks: [ran('trace-message', 'msg-4101')],
            hints: [
              'Read the hold reason before deciding: an attachment rule and a phishing verdict are different things.',
              'Check the sending domain against the carrier the ticket names.',
              'The trace should show a blocked .htm attachment from the carrier’s own domain.',
            ],
          }),
          makeItem({
            id: 'release',
            label: 'Released the message to the mailbox',
            why: 'The carrier’s note is expected mail; the attachment rule is what stopped it.',
            category: 'resolution',
            weight: 25,
            critical: true,
            checks: [effect('mail_released', 'msg-4101')],
            hints: [
              'release-quarantine delivers the held message to its recipient.',
              'Release the one message the trace names, not the whole hold.',
              'After the release, the message should read as delivered with the release recorded in its trace.',
            ],
          }),
          makeItem({
            id: 'no-block',
            label: 'Did not block the carrier',
            why: 'A block would drop every future delivery note from a supplier the company depends on.',
            category: 'safety',
            weight: 20,
            critical: true,
            checks: [absent(effect('sender_blocked'))],
            hints: [
              'The sender is a working supplier; a block would stop all of its future mail.',
              'Blocking is for unwanted senders, not for a policy that held a legitimate attachment.',
              'Leave the sender alone; the attachment rule is the thing that needs the message released, not the sender removed.',
            ],
          }),
          makeItem({
            id: 'verify-release',
            label: 'Re-read the trace after the release',
            why: 'The release line and the delivered state are the proof the note reached the mailbox.',
            category: 'diagnosis',
            weight: 10,
            checks: [ordered(effect('mail_released', 'msg-4101'), ran('trace-message', 'msg-4101'))],
            hints: [
              'Trace the message again after releasing it.',
              'The state should be delivered and the trace should show who released it.',
              'If the message still reads as held, the release did not take.',
            ],
          }),
          makeItem({
            id: 'note-troubleshooting',
            label: 'Recorded the rule that held it',
            why: 'The next held note from this carrier will be easier to clear if the note names the rule.',
            category: 'documentation',
            weight: 10,
            checks: [note('troubleshooting', 30)],
            hints: [
              'Name the message, the carrier, and the attachment rule that held it.',
              'Say why releasing it was safe: an expected supplier and a shipment the company is tracking.',
              'Example: “msg-4101 held by the .htm attachment rule; carrier domain matches LSP-8842; released.”',
            ],
          }),
          makeItem({
            id: 'note-customer',
            label: 'Told the user the note is on its way',
            why: 'The depot is holding a shipment on this paperwork and needs to know it is delivered.',
            category: 'documentation',
            weight: 10,
            checks: [note('customer', 30)],
            hints: [
              'Tell the user the note has been released to their mailbox.',
              'Ask them to confirm the shipment reference now that the message is delivered.',
              'Mention that future notes from the same carrier may be held by the same rule.',
            ],
          }),
          makeItem({
            id: 'decision',
            label: 'Resolved the ticket',
            why: 'Releasing expected mail the filter held is a first-line decision with the evidence on the record.',
            category: 'resolution',
            weight: 10,
            critical: true,
            checks: [decision('resolved', ['resolved-remote'])],
            hints: [
              'The evidence supports a release, so the desk can close it.',
              'Resolve remotely; no escalation is needed for an attachment rule holding expected mail.',
              'Pick “Resolved remotely”; the message is delivered and the trace shows it.',
            ],
          }),
        ])
      },
      reference() {
        return [
          { type: 'command', input: 'trace-message msg-4101' },
          { type: 'command', input: 'release-quarantine msg-4101' },
          {
            type: 'command',
            input: 'trace-message msg-4101',
            label: 'Read the trace again to confirm the note was delivered',
          },
          {
            type: 'note',
            noteKind: 'troubleshooting',
            text: 'msg-4101 from invoices@ridgeway-couriers.example was held by the .htm attachment rule, not by a phishing verdict. The carrier is the one named on shipment LSP-8842, so the note was expected. Released it to the mailbox and re-read the trace, which now shows it as delivered.',
          },
          {
            type: 'note',
            noteKind: 'customer',
            text: 'The delivery note from Ridgeway Couriers has been released to your mailbox and should be there now. Please check the shipment reference and book the return as planned. Future notes from this carrier may be held by the same attachment rule, so tell us if another one does not arrive.',
          },
          {
            type: 'note',
            noteKind: 'resolution',
            text: 'Reported: a carrier’s delivery note had not arrived and the depot was waiting on it. Checked: the trace showed the .htm attachment rule held it, and the sender matches the carrier on LSP-8842. Next: message released and re-traced as delivered; no sender block; the depot will book the return.',
          },
        ]
      },
      expectedOutcome: 'resolved',
      expectedCodes: ['resolved-remote'],
    },
  ],
}
