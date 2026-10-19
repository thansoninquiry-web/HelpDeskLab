import type { ConsoleEntry } from './console'
import type { DeploymentState, DeploymentTask, StockItem, World } from './types'

/**
 * Computer Deployment: the imaging runs booked against the shelves, and the shelf
 * record behind each one.
 *
 * The queue is read-only in the sense that a sequence only starts when the desk
 * starts it — the action is what changes the machine, and it says so.
 */

const STATE_LABELS: Record<DeploymentState, string> = {
  queued: 'Queued',
  running: 'Running',
  complete: 'Complete',
  failed: 'Failed',
}

/** Waiting work is what the desk has to act on, so it is listed first. */
const STATE_ORDER: readonly DeploymentState[] = ['failed', 'queued', 'running', 'complete']

function stamp(ms: number | null): string {
  return ms === null ? 'Never' : new Date(ms).toISOString().slice(0, 16).replace('T', ' ')
}

function stockFor(world: World, task: DeploymentTask): StockItem | undefined {
  return world.stock.find((item) => item.id === task.assetTag)
}

function taskEntry(world: World, task: DeploymentTask): ConsoleEntry {
  const stock = stockFor(world, task)
  const canStart = task.state === 'queued' || task.state === 'failed'

  return {
    id: task.assetTag,
    title: `${task.assetTag} · ${STATE_LABELS[task.state]}`,
    subtitle: `${task.sequence} · ${task.step}`,
    facts: [
      { label: 'Asset tag', value: task.assetTag },
      { label: 'Sequence', value: task.sequence },
      { label: 'State', value: STATE_LABELS[task.state] },
      { label: 'Step', value: task.step },
      { label: 'Attempts', value: String(task.attempts) },
      { label: 'Last started', value: stamp(task.startedAt) },
      { label: 'Model', value: stock?.model ?? 'Unknown' },
      { label: 'Shelf state', value: stock?.state ?? 'Not on a shelf' },
      {
        label: 'Days on shelf',
        value: stock ? String(stock.daysOnShelf) : 'Not on a shelf',
      },
    ],
    groups: [
      {
        label: 'Shelf note',
        items: stock ? [stock.notes] : [],
        empty: 'No shelf note is recorded for this machine.',
      },
    ],
    actions: [
      {
        id: 'read-deployment',
        label: 'Read the deployment record',
        detail: 'Log the run and the shelf record in the ticket evidence.',
        command: (target) => `get-deployment ${target}`,
      },
      ...(canStart
        ? [
            {
              id: 'start',
              label: 'Run the sequence',
              detail: `Image ${task.assetTag} with ${task.sequence} and mark it ready to issue.`,
              command: (target: string) => `start-deployment ${target}`,
            },
          ]
        : []),
    ],
    note: canStart
      ? 'A finished sequence marks the machine ready on the shelf. It still has to be named and recorded in the ticket before it leaves.'
      : 'This sequence has nothing left to run. Re-read the shelf and the ticket before you issue the machine.',
  }
}

export function deploymentConsoleEntries(world: World): ConsoleEntry[] {
  return [...world.deploymentTasks]
    .sort((left, right) => {
      const byState = STATE_ORDER.indexOf(left.state) - STATE_ORDER.indexOf(right.state)
      return byState !== 0 ? byState : left.assetTag.localeCompare(right.assetTag)
    })
    .map((task) => taskEntry(world, task))
}
