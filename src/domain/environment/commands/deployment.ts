import { errorLine, line, mutedLine, successLine } from '../output'
import type { DeploymentState, DeploymentTask, OutputLine, StockItem } from '../types'
import type { CommandContext, CommandDefinition, CommandOutcome } from './types'
import { failed, succeeded, usageFailure } from './types'

const STATE_LABELS: Record<DeploymentState, string> = {
  queued: 'Queued',
  running: 'Running',
  complete: 'Complete',
  failed: 'Failed',
}

function findTask(context: CommandContext, value: string): DeploymentTask | undefined {
  const needle = value.trim().toLowerCase()
  return context.world.deploymentTasks.find((task) => task.assetTag.toLowerCase() === needle)
}

function stockFor(context: CommandContext, task: DeploymentTask): StockItem | undefined {
  return context.world.stock.find((item) => item.id === task.assetTag)
}

function describe(context: CommandContext, task: DeploymentTask): OutputLine[] {
  const stock = stockFor(context, task)
  const started =
    task.startedAt === null
      ? 'Never'
      : new Date(task.startedAt).toISOString().slice(0, 16).replace('T', ' ')
  return [
    line(`Asset tag       : ${task.assetTag}`),
    line(`Sequence        : ${task.sequence}`),
    line(`State           : ${STATE_LABELS[task.state]}`),
    line(`Step            : ${task.step}`),
    line(`Attempts        : ${task.attempts}`),
    line(`Last started    : ${started}`),
    line(`Shelf state     : ${stock ? stock.state : 'Not on a shelf'}`),
    line(`Shelf note      : ${stock?.notes ?? 'No shelf note is recorded'}`),
    line(`Model           : ${stock?.model ?? 'Unknown'}`),
  ]
}

function getQueue(context: CommandContext): CommandOutcome {
  if (context.args.length > 0) {
    return usageFailure('get-deployment-queue')
  }

  const tasks = context.world.deploymentTasks
  if (tasks.length === 0) {
    return succeeded([mutedLine('No deployment is booked for any machine.')])
  }

  const unsettled = tasks.filter((task) => task.state !== 'complete')

  return succeeded([
    line(`Booked : ${tasks.length}   Waiting or failed : ${unsettled.length}`),
    line(),
    ...tasks.flatMap((task) => [
      line(`${task.assetTag} · ${STATE_LABELS[task.state]}`),
      line(`  Sequence : ${task.sequence}`),
      line(`  Step     : ${task.step}`),
      line(`  Attempts : ${task.attempts}`),
    ]),
    mutedLine('A machine is only ready to issue once its sequence has finished and the shelf says ready.'),
  ])
}

function getDeployment(context: CommandContext): CommandOutcome {
  const target = context.args[0]
  if (!target || context.args.length > 1) {
    return usageFailure('get-deployment <assetTag>')
  }

  const task = findTask(context, target)
  if (!task) {
    return failed([
      errorLine(`No deployment is booked for '${target}'.`),
      mutedLine('Run get-deployment-queue to read the tags that have a sequence against them.'),
    ])
  }

  return succeeded(describe(context, task))
}

function startDeployment(context: CommandContext): CommandOutcome {
  const target = context.args[0]
  if (!target || context.args.length > 1) {
    return usageFailure('start-deployment <assetTag>')
  }

  const task = findTask(context, target)
  if (!task) {
    return failed([
      errorLine(`No deployment is booked for '${target}'.`),
      mutedLine('A machine has to be on a shelf with a sequence before it can be imaged.'),
    ])
  }
  if (task.state === 'complete') {
    return succeeded([mutedLine(`${task.assetTag} has already finished its sequence.`)])
  }
  if (task.state === 'running') {
    return succeeded([mutedLine(`${task.assetTag} is already imaging.`)])
  }

  const stock = stockFor(context, task)
  if (!stock) {
    return failed([errorLine(`${task.assetTag} is not on any shelf.`)])
  }
  if (stock.state === 'quarantined') {
    return failed([
      errorLine(`${task.assetTag} is held: ${stock.notes}`),
      mutedLine('Imaging will not clear a damage case. Resolve the hold first.'),
    ])
  }
  if (stock.state === 'awaiting-parts') {
    return failed([
      errorLine(`${task.assetTag} is waiting on parts: ${stock.notes}`),
      mutedLine('Do not image a machine that cannot be issued yet.'),
    ])
  }

  const previousAttempts = task.attempts
  task.state = 'complete'
  task.step = 'Finished: imaged, named, and joined to the domain'
  task.attempts = previousAttempts + 1
  task.startedAt = context.now
  stock.state = 'ready'
  stock.notes = `Imaged with ${task.sequence} on ${new Date(context.now).toISOString().slice(0, 10)}.`

  return succeeded(
    [
      successLine(`Started and finished the ${task.sequence} sequence on ${task.assetTag}.`),
      line(`Attempt         : ${task.attempts}`),
      line(`Shelf state     : ready - the machine can be issued`),
      mutedLine('Record the new name and the sequence in the ticket note before it leaves the shelf.'),
    ],
    [
      {
        type: 'deployment_started',
        target: task.assetTag,
        details: { sequence: task.sequence, attempt: task.attempts },
      },
      {
        type: 'deployment_completed',
        target: task.assetTag,
        details: { sequence: task.sequence },
      },
    ],
  )
}

export const deploymentCommands: readonly CommandDefinition[] = [
  {
    name: 'get-deployment-queue',
    aliases: [],
    group: 'deployment',
    access: 'read',
    usage: 'get-deployment-queue',
    summary: 'List the imaging runs booked against the shelves',
    run: getQueue,
  },
  {
    name: 'get-deployment',
    aliases: [],
    group: 'deployment',
    access: 'read',
    usage: 'get-deployment <assetTag>',
    summary: 'Read one machine’s deployment state and shelf record',
    run: getDeployment,
  },
  {
    name: 'start-deployment',
    aliases: [],
    group: 'deployment',
    access: 'change',
    usage: 'start-deployment <assetTag>',
    summary: 'Run the imaging sequence for a shelf machine and mark it ready',
    run: startDeployment,
  },
]
