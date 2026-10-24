import type { PressureLine } from '../../environment/pressure'
import type { Printer } from '../../environment/types'
import type { Rubric } from '../../scoring/types'
import type { BuildContext, ReferenceStep, ScenarioFamily } from '../types'
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

/**
 * The spooler fault two variants share: the plain report and the angry caller.
 * The evidence and the fix do not change with the caller's temper, so the rubric
 * is written once and stamped with the variant it scores.
 */
function spoolerRubric(context: BuildContext, variantId: string): Rubric {
  const device = context.device
  return makeRubric('PRN-01', variantId, [
    makeItem({
      id: 'list-printers',
      label: 'Checked printer and spooler state',
      why: 'The device view separates a device-wide spooler fault from a single bad printer.',
      category: 'diagnosis',
      weight: 15,
      checks: [ran('get-printers')],
      hints: ['get-printers reports when the local spooler is stopped.', 'A stopped spooler affects every printer at once, which matches “nothing will print”.', 'Expect “Spooler: stopped” while the printer entries themselves show online.'],
    }),
    makeItem({
      id: 'inspect-queue',
      label: 'Tried to inspect the queue',
      why: 'A queue that cannot be read at all points at the spooler rather than a stuck document.',
      category: 'diagnosis',
      weight: 10,
      checks: [ran('get-printqueue')],
      hints: ['Try reading the queue; a queue that will not load points at the service.', 'If the queue is unreadable, the fault is the spooler rather than a stuck document.', 'Run get-printqueue; an unreadable queue with a stopped spooler confirms the service is the fault.'],
    }),
    makeItem({
      id: 'restart',
      label: 'Restarted the Print Spooler',
      why: 'The service has to be running before any queue can process.',
      category: 'resolution',
      weight: 35,
      critical: true,
      checks: [effect('spooler_restarted', device.hostname)],
      hints: ['Start the Print Spooler service before touching any queue.', 'restart-spooler restarts the local service; queues can process only after that.', 'Run restart-spooler; the success line only confirms the command, not the fix.'],
    }),
    makeItem({
      id: 'verify-fix',
      label: 'Rechecked the queue after the restart',
      why: 'Confirm the service is accepting work instead of trusting the restart message.',
      category: 'diagnosis',
      weight: 15,
      checks: [ordered(effect('spooler_restarted', device.hostname), ran('get-printqueue'))],
      hints: ['Reopen the queue after the restart.', 'A readable queue means the service is accepting work again.', 'The post-restart get-printqueue must return a readable queue.'],
    }),
    makeItem({
      id: 'note-troubleshooting',
      label: 'Documented the spooler state and restart',
      why: 'Repeated spooler failures are a pattern; the note is how that pattern becomes visible.',
      category: 'documentation',
      weight: 10,
      checks: [note('troubleshooting', 20)],
      hints: ['Record the service state and the restart.', 'Mention that the printers themselves were online, so the note shows the right scope.', 'Example: “Print Spooler stopped; printers online; restarted and confirmed the queue is readable.”'],
    }),
    makeItem({
      id: 'note-customer',
      label: 'Told the user to retry the print',
      why: 'The user has a deadline and needs to know the queue is usable again.',
      category: 'documentation',
      weight: 10,
      checks: [note('customer', 15)],
      hints: ['Tell the user the queue is usable again.', 'Ask them to resend the labels and confirm they leave the queue.', 'Ask them to resend the dispatch labels now and check they leave the queue.'],
    }),
    makeItem({
      id: 'decision',
      label: 'Resolved the ticket',
      why: 'A stopped local service is a first-line fix.',
      category: 'resolution',
      weight: 5,
      critical: true,
      checks: [decision('resolved', ['resolved-remote'])],
      hints: ['A stopped local service is a first-line fix.', 'Resolve remotely; no escalation is needed.', 'Resolve remotely; a local service restart is never an escalation.'],
    }),
  ])
}

/** The plain spooler path, reused by the angry caller: same fault, same fix. */
function spoolerReference(): ReferenceStep[] {
  return [
    { type: 'command', input: 'get-printers' },
    { type: 'command', input: 'get-printqueue' },
    { type: 'command', input: 'restart-spooler' },
    {
      type: 'command',
      input: 'get-printqueue',
      label: 'Check the queue again with the spooler running',
    },
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
}

/**
 * The angry caller presses on the same fault. The lines use the shared trigger
 * rule: a stall earns the first, restarting the service without reading the
 * queue earns the second, and carrying on after either warning climbs the
 * ladder. Getting the fix right is still what ends the call, so the script has
 * no line for running the restart itself.
 */
const ANGRY_CALLER_PRESSURE: readonly PressureLine[] = [
  {
    id: 'angry-blind-restart',
    trigger: { kind: 'acted-first', effect: 'spooler_restarted', beforeCommand: 'get-printqueue' },
    message:
      'You restarted the whole service without even opening the queue? So you still have no idea what was wrong. Brilliant.',
  },
  {
    // The desk opened the printer's console: the caller can hear that the queue
    // is on screen, and wants it fixed rather than studied.
    id: 'angry-printer-read',
    trigger: { kind: 'read', consoleId: 'printers' },
    message:
      'That is the one — the queue has not moved since nine. Do not just look at it, get the run out.',
  },
  {
    // The correct path is four steps, so the clock only starts on a desk that has
    // already spent more than that without getting anywhere.
    id: 'angry-stalled',
    trigger: { kind: 'stalled', afterSteps: 5, afterMinutes: 2 },
    message:
      'Twenty minutes on hold and I am still answering questions? The delivery van leaves at two — get it printing.',
  },
  {
    id: 'angry-ignored-warning',
    trigger: { kind: 'stalled', afterSteps: 7, afterMinutes: 4 },
    onceSaid: ['angry-stalled', 'angry-blind-restart'],
    message:
      'I have told you twice now: the run is late. Stop poking at it and fix the printer.',
  },
  {
    id: 'angry-escalates',
    trigger: { kind: 'stalled', afterSteps: 9, afterMinutes: 7 },
    onceSaid: ['angry-ignored-warning'],
    message:
      'Right. I am calling my manager and putting this in writing. The whole delivery run is your problem now.',
  },
]

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
        return spoolerRubric(context, 'spooler-stopped')
      },
      reference() {
        return spoolerReference()
      },
      expectedOutcome: 'resolved',
      expectedCodes: ['resolved-remote'],
    },
    {
      id: 'angry-caller',
      label: 'Angry caller, printer down',
      summary:
        'The Print Spooler is stopped and the caller has already been kept waiting, so every answer is met with more pressure.',
      difficulty: 2,
      severity: 'high',
      subjects: ['This printer is useless - {firstName} at {site}', 'Printing down and a delivery waiting - {hostname}'],
      bodies: [
        'This printer has been dead all morning and I have a delivery run sitting on my desk. I have already called once. Do not tell me to turn it off and on again — just get it printing before the van leaves. {displayName}, {department}.',
        'Second call about this. Nothing prints from {hostname}, my labels are late, and my manager is asking why. Every job disappears at zero percent. I am not sitting through a checklist — sort the queue out.',
      ],
      symptoms: [
        'No document leaves any printer from this device',
        'The printer is online for other users',
        'The caller has already called once and is pressing for the fix',
        'A delivery run is waiting on the print',
      ],
      build(context) {
        context.device.spoolerStatus = 'stopped'
        return `spooler:${context.device.spoolerStatus}`
      },
      rubric(context) {
        return spoolerRubric(context, 'angry-caller')
      },
      reference() {
        return spoolerReference()
      },
      pressure: ANGRY_CALLER_PRESSURE,
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
            hints: ['get-printers shows which printers are online, which separates a dead device from a wedged queue.', 'If other printers are online, the fault is this queue rather than the network or the spooler.', 'Expect the shared printer offline while other printers report online.'],
            why: 'Seeing that other printers are online isolates this to one queue.',
            category: 'diagnosis',
            weight: 10,
            checks: [ran('get-printers')],
          }),
          makeItem({
            id: 'inspect-queue',
            label: 'Read the stuck queue',
            hints: ['get-printqueue lists the job at the head; a failed document holding the queue is the signature here.', 'The failed job at the head explains why everything behind it is stuck.', 'The queue should show a failed invoice job at the head, with a queued job behind it.'],
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
            hints: ['clear-printqueue removes the wedged job and brings the printer back online.', 'Clearing deletes the queued jobs, including other users’ work, so say so in the notes.', 'Run clear-printqueue <printer>; it removes the wedged job and brings the printer back online.'],
          }),
          makeItem({
            id: 'verify-fix',
            label: 'Confirmed the queue recovered',
            hints: ['Read the queue again after clearing it: it should be empty and the printer back online.', 'An empty queue and an online printer are the two things to see.', 'The follow-up get-printqueue <printer> should be empty with the printer online.'],
            why: 'Rechecking proves the printer is back online and no jobs remain.',
            category: 'diagnosis',
            weight: 15,
            checks: [ordered(effect('print_queue_cleared', printer.name), ran('get-printqueue'))],
          }),
          makeItem({
            id: 'note-troubleshooting',
            label: 'Recorded the failed document and the other users affected',
            hints: ['Name the document that blocked the queue and note that other users lost jobs when you cleared it.', 'Name the failed document and note that other users lost jobs when the queue was cleared.', 'Example: “invoice-batch-0917.pdf wedged the queue; cleared it; other users must resend.”'],
            why: 'The note should explain why a shared queue was cleared, not just that it was.',
            category: 'documentation',
            weight: 10,
            checks: [note('troubleshooting', 25)],
          }),
          makeItem({
            id: 'note-customer',
            label: 'Explained the resend step',
            hints: ['Clearing the queue deletes the user’s job, so say plainly that it has to be resent.', 'Tell them the earlier copy is gone and the document has to be sent again.', 'Say the earlier copy was deleted with the queue and has to be sent again.'],
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
            hints: ['A wedged queue on one shared printer is in Tier 1 scope.', 'Resolve it once the evidence is clear; no escalation is needed.', 'Pick “Resolved remotely” or “with user guidance”; the queue is back in service.'],
          }),
        ])
      },
      reference(context) {
        const printer = defaultPrinter(context)
        return [
          { type: 'command', input: 'get-printers' },
          { type: 'command', input: `get-printqueue ${printer.name}` },
          { type: 'command', input: `clear-printqueue ${printer.name}` },
          {
            type: 'command',
            input: `get-printqueue ${printer.name}`,
            label: 'Check the queue again once the stuck jobs are cleared',
          },
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
