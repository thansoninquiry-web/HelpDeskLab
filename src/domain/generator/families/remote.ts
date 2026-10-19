import type { Device } from '../../environment/types'
import type { BuildContext, ScenarioFamily } from '../types'
import { decision, effect, makeItem, makeRubric, note, ordered, ran } from '../rubric'

/**
 * The machine the caller has been handed: the site's other user machine. The
 * desk works from the one the caller is on, which is why the handover unit is
 * the second machine rather than the ticket's own device.
 *
 * Chosen from the site and the kind rather than from the random stream, so the
 * build, the reference path and the rubric all name the same machine.
 */
function handoverMachine(context: BuildContext): Device {
  const target = context.world.devices.find(
    (device) =>
      device.siteId === context.site.id &&
      device.id !== context.device.id &&
      device.kind !== 'server',
  )
  if (!target) {
    throw new Error('Remote desktop scenario requires a second machine at the site')
  }
  return target
}

/**
 * The machine becomes the caller's second machine, with no live support session
 * so the desk has to open one. Its previous holder is returned for the variants
 * that need to leave that person’s session in place.
 */
function prepareHandover(context: BuildContext): { target: Device; previousHolder: string | null } {
  const target = handoverMachine(context)
  const previousHolder = target.loggedInUserId
  target.assignedUserId = context.user.id
  context.world.remoteSessions = context.world.remoteSessions.filter(
    (session) => session.machineId !== target.id,
  )
  context.targetHostname = target.hostname
  return { target, previousHolder }
}

export const remoteDesktopFamily: ScenarioFamily = {
  id: 'RDP-01',
  title: 'Remote desktop support',
  category: 'device',
  variants: [
    {
      id: 'handover-disk-updates',
      label: 'Handover machine out of space and updates',
      summary: 'The second machine has almost no free disk and weeks of updates that never installed.',
      difficulty: 2,
      severity: 'medium',
      subjects: [
        '{targetHostname} is full before I can use it',
        'Handover laptop {targetHostname} will not update',
      ],
      bodies: [
        'I have been given a second laptop for the depot work and it is unusable. It says the disk is almost full and Windows Update has not installed anything for weeks. My own machine {hostname} is fine - it is the handover one, {targetHostname}, that needs sorting. I am at {site}.',
        'The laptop I was handed for the warehouse rota starts up, then complains about storage and asks to install updates that never get anywhere. I do not want to lose any of the work files on it. The machine is {targetHostname} and I am at {site}.',
      ],
      symptoms: [
        'The handover machine reports almost no free disk space',
        'Updates have not installed for weeks and are still waiting',
        'The caller’s own machine is working normally',
      ],
      build(context) {
        const { target } = prepareHandover(context)
        target.loggedInUserId = context.user.id
        target.diskFreePercent = 6
        target.lastUpdateDays = 47
        target.pendingReboot = false
        return `handover-cleanup:${target.id}:${target.diskFreePercent}:${target.lastUpdateDays}`
      },
      rubric(context) {
        // Pure read: the rubric must not re-run the handover mutation.
        const host = handoverMachine(context).hostname
        return makeRubric('RDP-01', 'handover-disk-updates', [
          makeItem({
            id: 'read-machine',
            label: 'Read the machine before changing it',
            why: 'Disk free, update age, and the signed-in user all come from the machine itself.',
            category: 'diagnosis',
            weight: 10,
            checks: [ran('get-remote-machine', host)],
            hints: [
              'get-remote-machine <hostname> reads the state without opening a session.',
              'Check disk free and the update age together: both are on the same record.',
              'Expect a single-digit disk percentage and updates more than a month old.',
            ],
          }),
          makeItem({
            id: 'connect',
            label: 'Opened a support session to the machine',
            why: 'The desktop work only runs against a machine the desk is connected to.',
            category: 'safety',
            weight: 5,
            checks: [ran('connect-remote', host)],
            hints: [
              'connect-remote opens the session the desktop actions need.',
              'The machine is not the one the console is running on, so the session is the way in.',
              'Connect first, then use the desktop actions against the same hostname.',
            ],
          }),
          makeItem({
            id: 'free-space',
            label: 'Freed space on the machine',
            why: 'Updates need room to install, and the user cannot work on a full disk.',
            category: 'resolution',
            weight: 20,
            critical: true,
            checks: [effect('disk_cleaned', host)],
            hints: [
              'remote-cleanup clears temporary files without touching the user’s documents.',
              'Do the clean-up before the updates, which need the room.',
              'After it runs, the disk free line should be higher than it was.',
            ],
          }),
          makeItem({
            id: 'install-updates',
            label: 'Installed the missing updates',
            why: 'The machine is weeks behind and will keep asking until the updates are installed.',
            category: 'resolution',
            weight: 20,
            critical: true,
            checks: [effect('updates_installed', host)],
            hints: [
              'remote-check-updates installs what the machine is missing.',
              'It reports a restart as pending rather than finishing the job itself.',
              'Expect an installed count and a pending restart after it runs.',
            ],
          }),
          makeItem({
            id: 'restart',
            label: 'Restarted the machine to finish the updates',
            why: 'A pending restart leaves the updates half-applied and the machine still asking.',
            category: 'resolution',
            weight: 10,
            checks: [effect('machine_rebooted', host)],
            hints: [
              'reboot-remote clears a pending restart on a user machine.',
              'Restart only after the updates are installed, so they finish applying.',
              'Ask the user to sign in again after the restart before you close.',
            ],
          }),
          makeItem({
            id: 'verify-fix',
            label: 'Re-read the machine after the restart',
            why: 'The success lines confirm commands ran; the record proves the machine is actually clean.',
            category: 'diagnosis',
            weight: 10,
            checks: [ordered(effect('machine_rebooted', host), ran('get-remote-machine', host))],
            hints: [
              'Read the machine again after the restart.',
              'The pending restart line should be clear and the updates line should read as current.',
              'If the restart is still pending, the machine will ask the user again on the next sign-in.',
            ],
          }),
          makeItem({
            id: 'end-session',
            label: 'Closed the support session',
            why: 'A session left open stays recorded against the machine and the ticket.',
            category: 'safety',
            weight: 5,
            checks: [effect('remote_ended', host)],
            hints: [
              'end-remote-session closes the session on the machine.',
              'Close it after the work, once the verification read is done.',
              'The session should read as disconnected when the ticket closes.',
            ],
          }),
          makeItem({
            id: 'note-troubleshooting',
            label: 'Recorded the state and what was changed',
            why: 'The machine is going to the user, so the handoff needs to say what was done and what was cleared.',
            category: 'documentation',
            weight: 10,
            checks: [note('troubleshooting', 30)],
            hints: [
              'Name the machine, the disk percentage before the clean-up, and the update state.',
              'Say that temporary files were cleared and the user’s documents were not touched.',
              'Note that the machine restarted and the session was closed.',
            ],
          }),
          makeItem({
            id: 'note-customer',
            label: 'Told the user the machine is ready',
            why: 'The user is waiting to start work on this machine and needs the sign-in step.',
            category: 'documentation',
            weight: 5,
            checks: [note('customer', 25)],
            hints: [
              'Tell the user the clean-up and updates are finished.',
              'Ask them to sign in again now that the restart is done.',
              'Say the documents on the machine were left alone.',
            ],
          }),
          makeItem({
            id: 'decision',
            label: 'Resolved the ticket',
            why: 'Cleaning space and finishing updates on a handover machine is first-line work.',
            category: 'resolution',
            weight: 5,
            critical: true,
            checks: [decision('resolved', ['resolved-remote'])],
            hints: [
              'Everything needed was done through the session, so the desk can close it.',
              'Resolve remotely; no escalation is needed for disk space and updates.',
              'Pick “Resolved remotely”; the machine is clean and up to date.',
            ],
          }),
        ])
      },
      reference(context) {
        const host = handoverMachine(context).hostname
        return [
          { type: 'command', input: `get-remote-machine ${host}` },
          { type: 'command', input: `connect-remote ${host}` },
          { type: 'command', input: `remote-cleanup ${host}` },
          { type: 'command', input: `remote-check-updates ${host}` },
          { type: 'command', input: `reboot-remote ${host}` },
          {
            type: 'command',
            input: `get-remote-machine ${host}`,
            label: `Read ${host} again now the restart is done`,
          },
          { type: 'command', input: `end-remote-session ${host}` },
          {
            type: 'note',
            noteKind: 'troubleshooting',
            text: `Handover machine ${host} had 6% disk free and updates 47 days old. Cleared temporary files, which lifted the free space without touching the user’s documents, installed the missing updates, restarted to finish them, re-read the record, and closed the session.`,
          },
          {
            type: 'note',
            noteKind: 'customer',
            text: `Your handover machine ${host} has been cleaned up and updated, and the restart is done. Sign in again now. None of the documents on the machine were touched, so your work files are where you left them.`,
          },
          {
            type: 'note',
            noteKind: 'resolution',
            text: `Reported: the second machine was unusable because of storage warnings and updates that never installed. Checked: ${host} showed 6% free and updates 47 days old. Next: temporary files cleared, updates installed, machine restarted and re-read clean; session closed and the user asked to sign in again.`,
          },
        ]
      },
      expectedOutcome: 'resolved',
      expectedCodes: ['resolved-remote'],
    },
    {
      id: 'handover-previous-user',
      label: 'Previous user still signed in',
      summary: 'The handover machine still holds the previous holder’s session, so the new holder cannot get in.',
      difficulty: 2,
      severity: 'medium',
      subjects: [
        '{targetHostname} still opens on the last user’s account',
        'Handover machine will not let me sign in - {firstName}',
      ],
      bodies: [
        'The laptop I have been handed still opens on the person who had it before me. It asks for their password and I cannot get to my own desktop. My own machine {hostname} is fine; the handover one is {targetHostname}, at {site}. Please do not wipe it, there are handover notes on it I need.',
        'I collected the second laptop this morning and it is still signed in as the previous user. I can see their desktop but not mine. The machine is {targetHostname} and I am at {site}. There are files on there I need to keep.',
      ],
      symptoms: [
        'The machine shows another user’s session rather than the new holder’s',
        'The new holder cannot reach their own desktop on the machine',
        'The machine itself is otherwise healthy',
      ],
      build(context) {
        const { target, previousHolder } = prepareHandover(context)
        target.loggedInUserId = previousHolder
        target.diskFreePercent = 41
        target.lastUpdateDays = 6
        target.pendingReboot = false
        return `handover-signed-in:${target.id}:${previousHolder ?? 'nobody'}`
      },
      rubric(context) {
        // Pure read: the rubric must not re-run the handover mutation.
        const host = handoverMachine(context).hostname
        return makeRubric('RDP-01', 'handover-previous-user', [
          makeItem({
            id: 'read-machine',
            label: 'Read who is signed in',
            why: 'The machine record separates the holder from the signed-in session, and that is the whole fault.',
            category: 'diagnosis',
            weight: 10,
            checks: [ran('get-remote-machine', host)],
            hints: [
              'get-remote-machine names the holder and the signed-in user separately.',
              'Expect the holder to be the caller and the signed-in user to be someone else.',
              'Check that the disk and update lines are healthy, so the signed-in user is the only fault.',
            ],
          }),
          makeItem({
            id: 'connect',
            label: 'Opened a support session to the machine',
            why: 'Signing the other user out is a desktop action and needs a session on the machine.',
            category: 'safety',
            weight: 5,
            checks: [ran('connect-remote', host)],
            hints: [
              'connect-remote opens the session the desktop actions need.',
              'Connect to the handover machine, not to the machine the console runs on.',
              'The session is recorded against the attempt, so the note can cite it.',
            ],
          }),
          makeItem({
            id: 'sign-out',
            label: 'Signed the previous user out',
            why: 'The old session is what blocks the new holder’s desktop; ending it is the fix.',
            category: 'resolution',
            weight: 25,
            critical: true,
            checks: [effect('user_signed_out', host)],
            hints: [
              'remote-sign-out ends the interactive Windows session without closing your support session.',
              'Sign out the previous user, not the new holder.',
              'After it runs, the machine should show nobody signed in until the holder signs in.',
            ],
          }),
          makeItem({
            id: 'verify-fix',
            label: 'Re-read the machine after signing them out',
            why: 'The record is the proof the old session ended and the machine is ready for its holder.',
            category: 'diagnosis',
            weight: 10,
            checks: [ordered(effect('user_signed_out', host), ran('get-remote-machine', host))],
            hints: [
              'Read the machine again after the sign-out.',
              'The signed-in line should read Nobody, with the caller still shown as holder.',
              'If the old user is still signed in, the sign-out did not take.',
            ],
          }),
          makeItem({
            id: 'end-session',
            label: 'Closed the support session',
            why: 'The desk’s own session should be closed once the machine is ready for its holder.',
            category: 'safety',
            weight: 5,
            checks: [effect('remote_ended', host)],
            hints: [
              'end-remote-session closes the session on the machine.',
              'Close it after the verification read.',
              'The machine should be left with no support session open.',
            ],
          }),
          makeItem({
            id: 'note-troubleshooting',
            label: 'Recorded the old session and that data was kept',
            why: 'The user asked for the files to be kept, so the note has to say that nothing was wiped.',
            category: 'documentation',
            weight: 10,
            checks: [note('troubleshooting', 30)],
            hints: [
              'Name the machine and the previous session that was ended.',
              'Say that the disk and the user’s files were not touched, only the interactive session.',
              'Mention that the machine was re-read and the support session closed.',
            ],
          }),
          makeItem({
            id: 'note-customer',
            label: 'Told the user they can sign in now',
            why: 'The user is standing at the machine waiting for their own desktop.',
            category: 'documentation',
            weight: 15,
            checks: [note('customer', 25)],
            hints: [
              'Tell the user the old session is closed and the machine is ready for them.',
              'Ask them to sign in with their own account now.',
              'Reassure them that their files and the handover notes were left in place.',
            ],
          }),
          makeItem({
            id: 'decision',
            label: 'Resolved the ticket',
            why: 'Signing out a previous holder is a first-line handover task once the machine is read.',
            category: 'resolution',
            weight: 20,
            critical: true,
            checks: [decision('resolved', ['resolved-remote'])],
            hints: [
              'The machine is ready for its holder, so there is nothing left to escalate.',
              'Resolve remotely after the sign-out and the verification read.',
              'Pick “Resolved remotely”; the new holder still has to sign in themselves.',
            ],
          }),
        ])
      },
      reference(context) {
        const host = handoverMachine(context).hostname
        return [
          { type: 'command', input: `get-remote-machine ${host}` },
          { type: 'command', input: `connect-remote ${host}` },
          { type: 'command', input: `remote-sign-out ${host}` },
          {
            type: 'command',
            input: `get-remote-machine ${host}`,
            label: `Read ${host} again to confirm nobody is signed in`,
          },
          { type: 'command', input: `end-remote-session ${host}` },
          {
            type: 'note',
            noteKind: 'troubleshooting',
            text: `Handover machine ${host} still held the previous holder’s interactive session. The record showed the caller as holder but the old user as signed in; disk and updates were healthy. Opened a session, signed the previous user out, re-read the record to confirm nobody was signed in, and closed the support session without touching any files.`,
          },
          {
            type: 'note',
            noteKind: 'customer',
            text: `The previous user has been signed out of ${host} and the machine is ready for you. Sign in with your own account now. Your documents and the handover notes were left on the machine.`,
          },
          {
            type: 'note',
            noteKind: 'resolution',
            text: `Reported: the handover machine opened on the previous user and the caller could not reach their own desktop. Checked: ${host} showed the caller as holder with the old user signed in, and healthy disk and update state. Next: old session ended, record re-read with nobody signed in, support session closed, files untouched.`,
          },
        ]
      },
      expectedOutcome: 'resolved',
      expectedCodes: ['resolved-remote'],
    },
  ],
}
