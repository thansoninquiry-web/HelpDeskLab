import type { DeploymentTask, StockItem } from '../../environment/types'
import type { BuildContext, ScenarioFamily } from '../types'
import { absent, decision, effect, handoffNote, makeItem, makeRubric, note, ordered, ran } from '../rubric'

const FAILED_MACHINE = 'SHELF-DT-0302'
const HELD_MACHINE = 'SHELF-LT-0204'
/**
 * The variant whose run failed and can be finished. The curriculum pins it for
 * Computer Deployment's Practise entry point, because the held-machine variant
 * deliberately has no run to complete.
 */
export const FAILED_RUN_VARIANT = 'imaging-run-failed'
/**
 * The variant whose machine is held on the shelf. The curriculum reads it to
 * count a pass that respected the hold, so the id lives here rather than being
 * written out again there.
 */
export const HELD_SHELF_VARIANT = 'damage-hold-blocks-handover'

function shelfItem(context: BuildContext, id: string): StockItem {
  const item = context.world.stock.find((entry) => entry.id === id)
  if (!item) {
    throw new Error(`Deployment scenario requires shelf machine ${id}`)
  }
  return item
}

function taskFor(context: BuildContext, assetTag: string): DeploymentTask {
  const task = context.world.deploymentTasks.find((entry) => entry.assetTag === assetTag)
  if (!task) {
    throw new Error(`Deployment scenario requires a booked run for ${assetTag}`)
  }
  return task
}

/**
 * Computer Deployment tickets are about a machine on a shelf, not about the
 * caller's own device. The requester is the person waiting for it, and the
 * console is where the run and the shelf record are read. The two variants are
 * the two outcomes: a failed run the desk can finish, and a hold on the shelf
 * that the desk must not image over.
 */
export const deploymentFamily: ScenarioFamily = {
  id: 'DEP-01',
  title: 'Imaging and deployment',
  category: 'device',
  variants: [
    {
      id: FAILED_RUN_VARIANT,
      label: 'Imaging run failed on a handover machine',
      summary: 'The driver pack failed twice, so the booked desktop is still on the shelf.',
      difficulty: 2,
      severity: 'medium',
      subjects: [
        'Imaging failed for the handover desktop {assetTag}',
        '{assetTag} is still not ready for the new starter',
      ],
      bodies: [
        'The desktop we booked for a new starter never finished its imaging run. It is still sitting on the shelf and the new person starts on Monday. The run failed twice with a driver error. The asset tag is {assetTag}. Can you get it finished?',
        'Our replacement desktop has been on the shelf for weeks and the deployment tool says the last run failed. We cannot issue it until it has a name and is on the domain. The asset tag is {assetTag}; the new starter is waiting at {site}.',
      ],
      symptoms: [
        'The booked run reports a failed driver step and two attempts',
        'The machine is still in a needs-image state on the shelf',
        'Nothing has been issued to the new starter yet',
      ],
      build(context) {
        const stock = shelfItem(context, FAILED_MACHINE)
        const task = taskFor(context, FAILED_MACHINE)
        stock.siteId = context.site.id
        stock.state = 'needs-image'
        stock.notes = 'Wiped and held for a new starter; the last imaging run failed.'
        task.state = 'failed'
        task.step = 'Failed applying the driver pack: 0x80070005'
        task.attempts = 2
        task.startedAt = context.world.clock - 2 * 24 * 60 * 60 * 1000
        context.targetAssetTag = task.assetTag
        return `failed-run:${task.assetTag}:${task.attempts}`
      },
      rubric(context) {
        const task = taskFor(context, FAILED_MACHINE)
        const tag = task.assetTag
        return makeRubric('DEP-01', 'imaging-run-failed', [
          makeItem({
            id: 'read-run',
            label: 'Read the failed run and the shelf record',
            why: 'The failure step, the attempt count, and the shelf state are one record, and they decide whether a rerun is safe.',
            category: 'diagnosis',
            weight: 15,
            checks: [ran('get-deployment', tag)],
            hints: [
              'get-deployment <assetTag> reads the run and the shelf record together.',
              'Look at the failed step and the shelf state before deciding to run it again.',
              'Expect a failed driver step, two attempts, and a machine that is still needs-image.',
            ],
          }),
          makeItem({
            id: 'read-before-run',
            label: 'Read the failure before rerunning the sequence',
            why: 'A rerun without reading repeats the same failure or hides a hold that should stop it.',
            category: 'diagnosis',
            weight: 10,
            checks: [ordered(ran('get-deployment', tag), effect('deployment_completed', tag))],
            hints: [
              'Read the run before you start it again.',
              'The failure step tells you whether a rerun is the fix or a waste of another slot.',
              'The ticket log should show the read before the completed run.',
            ],
          }),
          makeItem({
            id: 'rerun',
            label: 'Ran the sequence to completion',
            why: 'The machine cannot be issued until its sequence finishes and the shelf turns ready.',
            category: 'resolution',
            weight: 30,
            critical: true,
            checks: [effect('deployment_completed', tag)],
            hints: [
              'start-deployment runs the sequence for one asset tag.',
              'Use the tag from the ticket, not a machine that already finished.',
              'A completed run marks the machine ready on the shelf.',
            ],
          }),
          makeItem({
            id: 'verify-fix',
            label: 'Re-read the run and the shelf state',
            why: 'The completed line is the proof the machine can be issued, not just that the button was pressed.',
            category: 'diagnosis',
            weight: 15,
            checks: [ordered(effect('deployment_completed', tag), ran('get-deployment', tag))],
            hints: [
              'Read the run again after the sequence finishes.',
              'The state should be complete and the shelf should read ready.',
              'If the shelf still shows needs-image, the machine is not ready to issue.',
            ],
          }),
          makeItem({
            id: 'note-troubleshooting',
            label: 'Recorded the failure and the new run',
            why: 'The next person needs the failure step and the attempt that cleared it, not just a ready shelf.',
            category: 'documentation',
            weight: 10,
            checks: [note('troubleshooting', 30)],
            hints: [
              'Name the asset tag, the failed step, and the attempt count.',
              'Say which sequence was run and that it finished.',
              'Example: “Tag failed twice on the driver pack; reran the laptop sequence and it finished ready.”',
            ],
          }),
          makeItem({
            id: 'note-customer',
            label: 'Told the requester the machine is ready',
            why: 'The new starter is waiting on this machine, and the desk is the only one who knows it can be issued.',
            category: 'documentation',
            weight: 10,
            checks: [note('customer', 25)],
            hints: [
              'Tell the requester the imaging finished and the machine is on the shelf ready.',
              'Name the asset tag so the handover picks the right machine.',
              'Say the machine can be issued now.',
            ],
          }),
          makeItem({
            id: 'decision',
            label: 'Resolved the ticket',
            why: 'Rerunning a failed imaging sequence is a first-line deployment task.',
            category: 'resolution',
            weight: 10,
            critical: true,
            checks: [decision('resolved', ['resolved-remote'])],
            hints: [
              'The run finished and the shelf is ready, so the desk can close it.',
              'Resolve remotely; no escalation is needed for a rerun.',
              'Pick “Resolved remotely”; the machine still has to be handed to the user.',
            ],
          }),
        ])
      },
      reference(context) {
        const tag = taskFor(context, FAILED_MACHINE).assetTag
        return [
          { type: 'command', input: `get-deployment ${tag}` },
          { type: 'command', input: `start-deployment ${tag}` },
          {
            type: 'command',
            input: `get-deployment ${tag}`,
            label: 'Read the run again to confirm the shelf is ready',
          },
          {
            type: 'note',
            noteKind: 'troubleshooting',
            text: `Run for ${tag} had failed twice while applying the driver pack, and the machine was still needs-image on the shelf. Read the failure and the shelf record, reran the W11-23H2-Desktop sequence, and re-read the record, which now shows complete and ready to issue.`,
          },
          {
            type: 'note',
            noteKind: 'customer',
            text: `${tag} has finished imaging and is ready on the shelf. It can be issued to the new starter now; the machine has its name and is joined to the domain.`,
          },
          {
            type: 'note',
            noteKind: 'resolution',
            text: `Reported: the handover desktop never finished imaging and the new starter is waiting. Checked: ${tag} showed a failed driver step after two attempts and a needs-image shelf state. Next: sequence rerun to completion, record re-read as ready, and the machine can be issued.`,
          },
        ]
      },
      expectedOutcome: 'resolved',
      expectedCodes: ['resolved-remote'],
    },
    {
      id: HELD_SHELF_VARIANT,
      label: 'Shelf hold blocks the handover',
      summary: 'The machine booked for a handover is quarantined for damage, so imaging it will not make it issuable.',
      difficulty: 3,
      severity: 'high',
      subjects: [
        'The handover laptop {assetTag} is held on the shelf',
        '{assetTag} cannot be imaged - damage hold',
      ],
      bodies: [
        'The laptop we booked for a handover has been on the shelf for weeks. It still has not been imaged and now I am told it cannot go out at all. The asset tag is {assetTag}. The new person starts next week and I need to know what happens next.',
        'I picked a machine from the shelf for a new starter, but the shelf note says it is held for damage. The deployment tool still has a run booked against it. I do not want to force anything - what should we do so the new person is not left waiting?',
      ],
      symptoms: [
        'The shelf record holds the machine for damage',
        'A deployment run is still booked against the held machine',
        'The machine has been on the shelf far longer than the others',
      ],
      build(context) {
        const stock = shelfItem(context, HELD_MACHINE)
        stock.siteId = context.site.id
        stock.state = 'quarantined'
        stock.notes = 'Cracked lid. Held until the damage case is closed.'
        stock.daysOnShelf = 41

        let task = context.world.deploymentTasks.find((entry) => entry.assetTag === HELD_MACHINE)
        if (!task) {
          task = {
            assetTag: HELD_MACHINE,
            sequence: 'W11-23H2-Laptop',
            state: 'queued',
            step: 'Waiting on the damage case before imaging',
            attempts: 0,
            startedAt: null,
          }
          context.world.deploymentTasks.push(task)
        } else {
          task.state = 'queued'
          task.step = 'Waiting on the damage case before imaging'
          task.attempts = 0
          task.startedAt = null
        }

        context.targetAssetTag = task.assetTag
        return `held-shelf:${task.assetTag}:${stock.state}`
      },
      rubric(context) {
        const tag = taskFor(context, HELD_MACHINE).assetTag
        return makeRubric('DEP-01', 'damage-hold-blocks-handover', [
          makeItem({
            id: 'read-run',
            label: 'Read the run and the shelf hold',
            why: 'The hold is on the shelf record, and the imaging tool will refuse because of it.',
            category: 'diagnosis',
            weight: 15,
            checks: [ran('get-deployment', tag)],
            hints: [
              'get-deployment <assetTag> shows the shelf state and the shelf note beside the run.',
              'A quarantined shelf state means the machine cannot be issued, whatever the run says.',
              'Expect the shelf note to describe the damage and the hold.',
            ],
          }),
          makeItem({
            id: 'no-image',
            label: 'Did not image a machine that is held',
            why: 'Imaging does not close a damage case, and a run would make a held machine look ready.',
            category: 'safety',
            weight: 20,
            critical: true,
            checks: [absent(effect('deployment_started', tag))],
            hints: [
              'Imaging a held machine does not clear the damage case.',
              'A completed run would mark the shelf ready while the hold is still open.',
              'Read the hold and escalate it; do not force the sequence.',
            ],
          }),
          makeItem({
            id: 'handoff',
            label: 'Handed the damage case on with the evidence',
            why: 'Field Services owns the repair and the release of the shelf hold; the desk cannot close it.',
            category: 'documentation',
            weight: 25,
            critical: true,
            checks: [handoffNote()],
            hints: [
              'The handoff note is the close: what was reported, what the record showed, and what Field Services should do.',
              'Name the asset tag, the damage hold, and the fact that the run was not forced.',
              'A handoff without the shelf evidence comes straight back.',
            ],
          }),
          makeItem({
            id: 'note-customer',
            label: 'Told the requester what happens next',
            why: 'The new starter needs a machine; the requester needs to know the hold is with Field Services, not lost.',
            category: 'documentation',
            weight: 10,
            checks: [note('customer', 30)],
            hints: [
              'Tell the requester the machine is held for damage and cannot be issued yet.',
              'Say the case is with Field Services and that a different shelf machine may be needed.',
              'Give them a next step rather than leaving the handover open.',
            ],
          }),
          makeItem({
            id: 'decision',
            label: 'Escalated to Field Services',
            why: 'The damage case and the shelf release belong to Field Services, not to the service desk.',
            category: 'resolution',
            weight: 30,
            critical: true,
            checks: [decision('escalated', ['escalated-field-services'])],
            hints: [
              'A damage hold is not a desk fix.',
              'Escalate to Field Services with the shelf record attached.',
              'Pick “Escalated to Field Services”; the hold has to be closed before the machine can be issued.',
            ],
          }),
        ])
      },
      reference(context) {
        const tag = taskFor(context, HELD_MACHINE).assetTag
        return [
          { type: 'command', input: `get-deployment ${tag}` },
          {
            type: 'command',
            input: `start-deployment ${tag}`,
            label: 'Confirm the imaging tool refuses the held machine',
          },
          {
            type: 'note',
            noteKind: 'troubleshooting',
            text: `Run for ${tag} is queued, but the shelf record holds the machine as quarantined for a cracked lid, with the damage case still open. The imaging attempt was refused rather than forced; the machine has been on the shelf for weeks.`,
          },
          {
            type: 'note',
            noteKind: 'customer',
            text: `The machine booked for your new starter, ${tag}, is held for damage and cannot be issued until the case is closed. We have sent it to Field Services with the shelf record. A different machine from the shelf may be needed for the start date; we will confirm once the hold is answered.`,
          },
          {
            type: 'note',
            noteKind: 'resolution',
            text: `Reported: the handover laptop could not be imaged and the new starter is waiting. Checked: ${tag} is quarantined on the shelf for a cracked lid, and the imaging attempt is refused while the case is open. Next: Field Services should close the damage case and release the hold, or supply a replacement shelf machine for the start date.`,
          },
        ]
      },
      expectedOutcome: 'escalated',
      expectedCodes: ['escalated-field-services'],
    },
  ],
}
