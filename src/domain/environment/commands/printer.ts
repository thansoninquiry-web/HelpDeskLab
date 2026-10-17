import { errorLine, line, mutedLine, successLine } from '../output'
import type { Printer } from '../types'
import type { CommandContext, CommandDefinition, CommandOutcome } from './types'
import { failed, succeeded, usageFailure } from './types'

function findPrinter(context: CommandContext, reference: string): Printer | undefined {
  const needle = reference.toLowerCase()
  return context.world.printers.find(
    (printer) =>
      printer.name.toLowerCase() === needle ||
      printer.id.toLowerCase() === needle ||
      printer.shareName.toLowerCase() === needle,
  )
}

function resolvePrinter(
  context: CommandContext,
  reference: string | undefined,
): { ok: true; printer: Printer } | { ok: false; outcome: CommandOutcome } {
  if (reference) {
    const printer = findPrinter(context, reference)
    if (!printer) {
      return {
        ok: false,
        outcome: failed([errorLine(`Printer '${reference}' was not found on this site.`)]),
      }
    }
    return { ok: true, printer }
  }

  const defaultId = context.device.defaultPrinterId
  const printer = defaultId
    ? context.world.printers.find((candidate) => candidate.id === defaultId)
    : undefined

  if (!printer) {
    return {
      ok: false,
      outcome: failed([
        errorLine('No default printer is configured for this device.'),
        mutedLine('Provide a printer name, for example: get-printqueue PRN-FIN-01'),
      ]),
    }
  }
  return { ok: true, printer }
}

function getPrinters(context: CommandContext): CommandOutcome {
  if (context.args.length > 0) {
    return usageFailure('get-printers')
  }

  const output = [line('Name             Status    Model')]
  for (const printer of context.world.printers) {
    const isDefault = printer.id === context.device.defaultPrinterId ? ' (default)' : ''
    output.push(
      line(
        `${printer.name.padEnd(16)} ${printer.status.padEnd(9)} ${printer.model}${isDefault}`,
      ),
    )
  }
  if (context.device.spoolerStatus === 'stopped') {
    output.push(
      line(),
      errorLine('The Print Spooler service on this device is stopped. Queues cannot be processed.'),
    )
  }

  return succeeded(output)
}

function getPrintQueue(context: CommandContext): CommandOutcome {
  if (context.device.spoolerStatus === 'stopped') {
    return failed([
      errorLine('The Print Spooler service is not running on this device.'),
      mutedLine('Start the service before inspecting queues: restart-spooler'),
    ])
  }

  const resolved = resolvePrinter(context, context.args[0])
  if (!resolved.ok) {
    return resolved.outcome
  }

  const { printer } = resolved
  const output = [
    line(`Queue for ${printer.name} (${printer.status})`),
    line(),
  ]

  if (printer.jobs.length === 0) {
    output.push(line('There are no documents waiting in the queue.'))
  } else {
    for (const job of printer.jobs) {
      output.push(
        line(
          `${job.id}  ${job.status.padEnd(9)} ${job.owner.padEnd(12)} ${job.document}`,
        ),
      )
    }
  }

  if (printer.status === 'offline') {
    output.push(
      line(),
      errorLine('The printer reports offline; queued jobs cannot leave the spooler.'),
    )
  } else if (printer.status === 'paused') {
    output.push(line(), errorLine('The printer is paused.'))
  }

  return succeeded(output)
}

function restartSpooler(context: CommandContext): CommandOutcome {
  if (context.args.length > 0) {
    return usageFailure('restart-spooler')
  }

  if (context.device.spoolerStatus === 'running') {
    return succeeded([mutedLine('The Print Spooler service is already running.')])
  }

  context.device.spoolerStatus = 'running'

  return succeeded(
    [
      successLine('Print Spooler service restarted.'),
      mutedLine('Recheck the queue before telling the user the printer is fixed.'),
    ],
    [{ type: 'spooler_restarted', target: context.device.hostname }],
  )
}

function clearPrintQueue(context: CommandContext): CommandOutcome {
  const resolved = resolvePrinter(context, context.args[0])
  if (!resolved.ok) {
    return resolved.outcome
  }

  const { printer } = resolved
  const clearedJobs = printer.jobs.length
  if (clearedJobs === 0 && printer.status === 'online') {
    return succeeded([mutedLine(`The queue for ${printer.name} is already empty.`)])
  }

  printer.jobs = []
  const broughtOnline = printer.status === 'offline'
  if (broughtOnline) {
    printer.status = 'online'
  }

  const details: Record<string, string | number | boolean> = {
    printer: printer.name,
    clearedJobs,
    broughtOnline,
  }

  return succeeded(
    [
      successLine(`Cleared ${clearedJobs} job(s) from ${printer.name}.`),
      ...(broughtOnline
        ? [line(`${printer.name} returned to an online state.`)]
        : []),
      mutedLine('Confirm the queue is empty before closing the ticket.'),
    ],
    [{ type: 'print_queue_cleared', target: printer.name, details }],
  )
}

function setDefaultPrinter(context: CommandContext): CommandOutcome {
  const reference = context.args[0]
  if (!reference || context.args.length > 1) {
    return usageFailure('set-default-printer <printerName>')
  }

  const printer = findPrinter(context, reference)
  if (!printer) {
    return failed([errorLine(`Printer '${reference}' was not found on this site.`)])
  }

  if (context.device.defaultPrinterId === printer.id) {
    return succeeded([mutedLine(`${printer.name} is already the default printer.`)])
  }

  context.device.defaultPrinterId = printer.id

  return succeeded(
    [successLine(`Default printer set to ${printer.name}.`)],
    [{ type: 'default_printer_changed', target: printer.name }],
  )
}

export const printerCommands: readonly CommandDefinition[] = [
  {
    name: 'get-printers',
    aliases: ['get-printer'],
    group: 'printer',
    usage: 'get-printers',
    summary: 'List printers, their status, and this device default',
    run: getPrinters,
  },
  {
    name: 'get-printqueue',
    aliases: ['get-print-queue'],
    group: 'printer',
    usage: 'get-printqueue [printerName]',
    summary: 'Show the documents waiting in a printer queue',
    run: getPrintQueue,
  },
  {
    name: 'restart-spooler',
    aliases: ['restart-printspooler'],
    group: 'printer',
    usage: 'restart-spooler',
    summary: 'Restart the Print Spooler service on this device',
    run: restartSpooler,
  },
  {
    name: 'clear-printqueue',
    aliases: ['clear-print-queue'],
    group: 'printer',
    usage: 'clear-printqueue [printerName]',
    summary: 'Delete stalled jobs and return an offline printer to service',
    run: clearPrintQueue,
  },
  {
    name: 'set-default-printer',
    aliases: ['set-printer'],
    group: 'printer',
    usage: 'set-default-printer <printerName>',
    summary: 'Change the default printer for this device',
    run: setDefaultPrinter,
  },
]
