import type { Printer } from '../../environment/types'
import type { BuildContext, ScenarioFamily } from '../types'
import { decision, effect, makeItem, makeRubric, note, ordered, ran } from '../rubric'

function defaultPrinter(context: BuildContext): Printer {
  const printer = context.world.printers.find(
    (candidate) => candidate.id === context.device.defaultPrinterId,
  )
  if (!printer) {
    throw new Error('Printer scenario requires a default printer on the device')
  }
  return printer
}

export const printerFamily: ScenarioFamily = {
  id: 'PRN-01',
  title: 'Printing and the spooler',
  category: 'printer',
  variants: [
    {
      id: 'spooler-stopped',
      label: 'Print spooler stopped',
      summary: 'The Print Spooler service is stopped, so every queue on the device fails.',
      difficulty: 1,
      severity: 'medium',
      subjects: ['{firstName} cannot print anything from {hostname}', 'Printing dead on {hostname} - {site}'],
      bodies: [
        'Nothing will print from {hostname}. The printer shows online and my colleague can print to the same one from her machine. I have already tried turning the printer off and on. I need the dispatch labels before the 2pm pickup.',
        'Every print job sits at zero percent and then disappears. It was fine yesterday. I am at {site} and this is blocking the delivery paperwork. Can you take a look?',
      ],
      symptoms: [
        'No document leaves any printer from this device',
        'The printer itself is online for other users',
        'Printing worked on this device yesterday',
      ],
      build(context) {
        context.device.spoolerStatus = 'stopped'
        return `spooler:${context.device.spoolerStatus}`
      },
      rubric(context) {
        const device = context.device
        return makeRubric('PRN-01', 'spooler-stopped', [
          makeItem({
            id: 'list-printers',
            label: 'Checked printer and spooler state',
            why: 'The device view separates a device-wide spooler fault from a single bad printer.',
            category: 'diagnosis',
            weight: 15,
            checks: [ran('get-printers')],
            hint: 'get-printers reports when the local spooler is stopped.',
          }),
          makeItem({
            id: 'inspect-queue',
            label: 'Tried to inspect the queue',
            why: 'A queue that cannot be read at all points at the spooler rather than a stuck document.',
            category: 'diagnosis',
            weight: 10,
            checks: [ran('get-printqueue')],
          }),
          makeItem({
            id: 'restart',
            label: 'Restarted the Print Spooler',
            why: 'The service has to be running before any queue can process.',
            category: 'resolution',
            weight: 35,
            critical: true,
            checks: [effect('spooler_restarted', device.hostname)],
          }),
          makeItem({
            id: 'verify-fix',
            label: 'Rechecked the queue after the restart',
            why: 'Confirm the service is accepting work instead of trusting the restart message.',
            category: 'diagnosis',
            weight: 15,
            checks: [ordered(effect('spooler_restarted', device.hostname), ran('get-printqueue'))],
          }),
          makeItem({
            id: 'note-troubleshooting',
            label: 'Documented the spooler state and restart',
            why: 'Repeated spooler failures are a pattern; the note is how that pattern becomes visible.',
            category: 'documentation',
            weight: 10,
            checks: [note('troubleshooting', 20)],
          }),
          makeItem({
            id: 'note-customer',
            label: 'Told the user to retry the print',
            why: 'The user has a deadline and needs to know the queue is usable again.',
            category: 'documentation',
            weight: 10,
            checks: [note('customer', 15)],
          }),
          makeItem({
            id: 'decision',
            label: 'Resolved the ticket',
            why: 'A stopped local service is a first-line fix.',
            category: 'resolution',
            weight: 5,
            critical: true,
            checks: [decision('resolved', ['resolved-remote'])],
          }),
        ])
      },
      reference() {
        return [
          { type: 'command', input: 'get-printers' },
          { type: 'command', input: 'get-printqueue' },
          { type: 'command', input: 'restart-spooler' },
          { type: 'command', input: 'get-printqueue' },
          {
            type: 'note',
            noteKind: 'troubleshooting',
            text: 'Print Spooler on the device was stopped, which blocked every queue. The printers themselves were online. Restarted the service and confirmed the queue for the default printer is readable.',
          },
          {
            type: 'note',
            noteKind: 'customer',
            text: 'Printing is restored on your laptop. Send the dispatch labels again and check they leave the queue.',
          },
        ]
      },
      expectedOutcome: 'resolved',
      expectedCodes: ['resolved-remote'],
    },
    {
      id: 'job-stuck-offline',
      label: 'Stuck job, printer offline',
      summary: 'A corrupt job wedged the queue and the printer dropped offline.',
      difficulty: 3,
      severity: 'high',
      subjects: ['Print queue stuck on {printerName}', '{firstName} print jobs will not clear'],
      bodies: [
        'My print jobs are stuck. The queue keeps saying “printing” for a document I already cancelled, and now the printer shows offline. Other people cannot print to it either, so this is not just me. We need the invoices out today.',
        'The printer has been offline since this morning. My jobs are piling up and one of them is holding the whole queue. I do not want to delete everyone’s work if there is a better way. Please advise.',
      ],
      symptoms: [
        'The printer reports offline while other printers work',
        'A cancelled document remains at the head of the queue',
        'Jobs from several users are blocked behind it',
      ],
      build(context) {
        const printer = defaultPrinter(context)
        printer.status = 'offline'
        printer.jobs = [
          {
            id: `job-${context.rng.int(2000, 8999)}`,
            document: 'invoice-batch-0917.pdf',
            owner: context.user.samAccountName,
            submittedAt: context.world.clock - 40 * 60 * 1000,
            status: 'error',
          },
          {
            id: `job-${context.rng.int(2000, 8999)}`,
            document: 'dispatch-labels.docx',
            owner: 'lnguyen',
            submittedAt: context.world.clock - 25 * 60 * 1000,
            status: 'queued',
          },
        ]
        return `printer:${printer.name}:offline`
      },
      rubric(context) {
        const printer = defaultPrinter(context)
        return makeRubric('PRN-01', 'job-stuck-offline', [
          makeItem({
            id: 'list-printers',
            label: 'Reviewed printer status',
            why: 'Seeing that other printers are online isolates this to one queue.',
            category: 'diagnosis',
            weight: 10,
            checks: [ran('get-printers')],
          }),
          makeItem({
            id: 'inspect-queue',
            label: 'Read the stuck queue',
            why: 'The failed document at the head is the evidence that this is a wedged job, not a dead printer.',
            category: 'diagnosis',
            weight: 15,
            checks: [ran('get-printqueue')],
          }),
          makeItem({
            id: 'clear-queue',
            label: `Cleared the queue for ${printer.name}`,
            why: 'The corrupt job has to be removed before the printer can return to service.',
            category: 'resolution',
            weight: 30,
            critical: true,
            checks: [effect('print_queue_cleared', printer.name)],
          }),
          makeItem({
            id: 'verify-fix',
            label: 'Confirmed the queue recovered',
            why: 'Rechecking proves the printer is back online and no jobs remain.',
            category: 'diagnosis',
            weight: 15,
            checks: [ordered(effect('print_queue_cleared', printer.name), ran('get-printqueue'))],
          }),
          makeItem({
            id: 'note-troubleshooting',
            label: 'Recorded the failed document and the other users affected',
            why: 'The note should explain why a shared queue was cleared, not just that it was.',
            category: 'documentation',
            weight: 10,
            checks: [note('troubleshooting', 25)],
          }),
          makeItem({
            id: 'note-customer',
            label: 'Explained the resend step',
            why: 'Clearing the queue deletes the user’s job, so they must know to resend it.',
            category: 'documentation',
            weight: 10,
            checks: [note('customer', 20)],
          }),
          makeItem({
            id: 'decision',
            label: 'Resolved the shared printer queue',
            why: 'A wedged queue on one shared printer is within Tier 1 scope once the evidence is clear.',
            category: 'resolution',
            weight: 10,
            critical: true,
            checks: [decision('resolved', ['resolved-remote', 'resolved-user-guidance'])],
          }),
        ])
      },
      reference(context) {
        const printer = defaultPrinter(context)
        return [
          { type: 'command', input: 'get-printers' },
          { type: 'command', input: `get-printqueue ${printer.name}` },
          { type: 'command', input: `clear-printqueue ${printer.name}` },
          { type: 'command', input: `get-printqueue ${printer.name}` },
          {
            type: 'note',
            noteKind: 'troubleshooting',
            text: `Queue for ${printer.name} was held at the head by a failed invoice job and the printer had dropped offline. Cleared the queue, which brought the printer back online; confirmed the queue is empty. Other users will need to resend.`,
          },
          {
            type: 'note',
            noteKind: 'customer',
            text: `I cleared the stuck job and ${printer.name} is online again. Please resend your invoice batch; the earlier copy was removed with the queue.`,
          },
        ]
      },
      expectedOutcome: 'resolved',
      expectedCodes: ['resolved-remote'],
    },
  ],
}
