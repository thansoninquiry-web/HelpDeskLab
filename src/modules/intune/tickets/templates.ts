import { requiredAppsFor } from '../logic/compliance'
import type { DeviceAction, IntuneDevice, IntuneState } from '../types'

/**
 * The eight tickets this module can hand out.
 *
 * Each one names the device it is about, the actions the reference answer takes,
 * and a check that reads the estate afterwards. The check is the definition of
 * "done": a learner who reaches the same end state another way still closes the
 * ticket, which is the point of verifying state rather than keystrokes.
 */
export interface IntuneTicketTemplate {
  id: string
  title: string
  difficulty: 1 | 2 | 3
  category: 'compliance' | 'apps' | 'lifecycle' | 'ownership'
  /** The seeded device the request is about. */
  deviceId: string
  subject: string
  body: string
  /** The reference path, in order. */
  expectedActions: readonly DeviceAction[]
  /** What has to be true afterwards. */
  verify(device: IntuneDevice, state: IntuneState): boolean
  /** One line naming the end state, shown wherever the ticket is summarised. */
  resolution: string
  /** Why the path is the right one, in the debrief's own words. */
  explanation: string
  hints: readonly string[]
}

function appStatus(device: IntuneDevice, appId: string): string {
  return device.apps.find((entry) => entry.appId === appId)?.status ?? 'not-installed'
}

export const INTUNE_TICKET_TEMPLATES: readonly IntuneTicketTemplate[] = [
  {
    id: 'tpl-bitlocker-off',
    title: 'Laptop reported as non-compliant',
    difficulty: 1,
    category: 'compliance',
    deviceId: 'dev-lt-2207',
    subject: 'LT-2207 is showing as non-compliant in the portal',
    body:
      'I opened the company portal this morning and my laptop is flagged red. I have not changed anything on it. The message says something about disk encryption. I am working from the office today so the machine is on and connected.',
    expectedActions: ['sync'],
    verify: (device) => device.compliance === 'compliant',
    resolution: 'The device passes both rules in the Windows baseline.',
    explanation:
      'The only failing rule was BitLocker, which the policy can switch on for a managed device. A sync both applies the setting and makes the service re-evaluate, so the verdict changes on the same check-in. Nothing has to be escalated, and nothing is lost by trying the sync first.',
    hints: [
      'Open the device and read the compliance reasons before doing anything.',
      'Ask which rule failed. BitLocker is a setting the policy applies; the OS version is not.',
      'Send a sync. The check-in applies the policy and re-evaluates in one step.',
    ],
  },
  {
    id: 'tpl-app-install-failed',
    title: 'Company Portal will not install',
    difficulty: 2,
    category: 'apps',
    deviceId: 'dev-lt-2402',
    subject: 'The portal app keeps failing to install on LT-2402',
    body:
      'Every time I open the software centre it says the install failed and to contact IT. I have tried closing it twice. My colleague on the same build got it first time. I need it to get to the shared drive.',
    expectedActions: ['restart', 'sync'],
    verify: (device) => appStatus(device, 'app-portal') === 'installed',
    resolution: 'Northgate Portal shows as installed on LT-2402.',
    explanation:
      'The install had failed and was not being retried; the device keeps that verdict until something pushes it back into the queue. A restart re-queues failed installs, and a sync collects the queue, which is why the pair works where a second sync on its own would not.',
    hints: [
      'Look at the app list on the device, not just the device status.',
      'A failed install is not waiting to be retried; something has to requeue it.',
      'Restart first so the install is queued again, then sync to collect it.',
    ],
  },
  {
    id: 'tpl-lost-phone-wipe',
    title: 'Lost phone needs a remote wipe',
    difficulty: 1,
    category: 'lifecycle',
    deviceId: 'dev-iph-3390',
    subject: 'I have lost my phone - please wipe it',
    body:
      'I left my phone in a taxi last night. It has my mail on it and the passcode is a four digit one my daughter knows. I have a new handset on the way. Please make sure the old one cannot be used.',
    expectedActions: ['wipe'],
    verify: (device) => device.lifecycle === 'wiped',
    resolution: 'The phone has been reset and has left the service.',
    explanation:
      'A lost device holding company mail is wiped, not retired: retiring removes company data from a device the owner still has, which is useless when the owner does not have it. The seed makes the phone reachable, so the wipe command can be delivered.',
    hints: [
      'This is a lost device, not a leaver.',
      'Retiring only removes work data from a device its owner is still using.',
      'Wipe the device, and say in the note that the handset was reported lost.',
    ],
  },
  {
    id: 'tpl-stale-device',
    title: 'Laptop has not checked in for over a month',
    difficulty: 2,
    category: 'lifecycle',
    deviceId: 'dev-ws-1120',
    subject: 'WS-1120 has not checked in',
    body:
      'The compliance report lists WS-1120 as not reporting for over six weeks. The user says she has been using it every day in the office. We need it back in reporting before the audit on Friday.',
    expectedActions: ['sync', 'retire'],
    verify: (device) => device.lifecycle === 'retired',
    resolution: 'The stale record has been retired, releasing the licence and the policy target.',
    explanation:
      'A device silent for more than a fortnight cannot be commanded, so a sync fails and is worth trying once to show it. What is broken is the record, not the laptop in the user hands: retiring it clears the stale enrolment so it can be re-enrolled cleanly, which is the only step that resolves the audit line.',
    hints: [
      'Try the sync, but read the result before assuming it worked.',
      'A device that has not reported cannot be commanded at all.',
      'Retire the stale record so the machine can be enrolled again.',
    ],
  },
  {
    id: 'tpl-new-hire-apps',
    title: 'New starter needs the standard apps',
    difficulty: 2,
    category: 'apps',
    deviceId: 'dev-iph-3366',
    subject: 'New starter phone has nothing on it',
    body:
      'June starts on Monday and her phone came back from the reseller with nothing installed. She needs the portal and the usual suite before she can take calls. Can you push them out?',
    expectedActions: ['assign-apps', 'sync'],
    verify: (device, state) => {
      const required = requiredAppsFor(device, state.apps)
      return (
        required.length > 0 &&
        required.every((app) => appStatus(device, app.id) === 'installed')
      )
    },
    resolution: 'Every app required for the phone is installed.',
    explanation:
      'Assigning puts the apps in the queue and a sync collects them; neither step alone leaves the phone usable. The list is not the four apps in the catalogue but the ones the device group requires, which is why reading the group first is the difference between a complete handover and a missing VPN client.',
    hints: [
      'The phone is enrolled and healthy, so nothing is wrong with it.',
      'Assignments come from the group, not from picking apps by hand.',
      'Assign the required set, then sync so the phone collects it.',
    ],
  },
  {
    id: 'tpl-leaver-retire',
    title: 'Leaver still has a managed phone',
    difficulty: 1,
    category: 'lifecycle',
    deviceId: 'dev-and-4455',
    subject: 'Lena left on Friday - her phone is still enrolled',
    body:
      'Lena Duarte finished on Friday and her account is already disabled, but her phone is still listed as managed and still has the portal on it. HR want it off the estate this week.',
    expectedActions: ['retire'],
    verify: (device) => device.lifecycle === 'retired',
    resolution: 'The phone is retired and its assignments are gone.',
    explanation:
      'A leaver device is retired: it takes the company data and assignments off a device the person keeps, and it is reversible if they come back. Wiping destroys their personal data and is reserved for loss or compromise.',
    hints: [
      'The account is already disabled; the device is the loose end.',
      'The phone is not lost, so the owner still has it.',
      'Retire the device so company data and assignments leave it.',
    ],
  },
  {
    id: 'tpl-policy-not-evaluated',
    title: 'Device stuck on "not evaluated"',
    difficulty: 1,
    category: 'compliance',
    deviceId: 'dev-ws-1264',
    subject: 'WS-1264 has been "not evaluated" all week',
    body:
      'Our compliance dashboard has one machine stuck on not evaluated since the policy was edited last week. It is checking in, it is on, and two of its apps are still pending. Nobody has touched it since the policy change.',
    expectedActions: ['sync'],
    verify: (device) => device.compliance !== 'not-evaluated',
    resolution: 'The device has a current verdict again.',
    explanation:
      'The device had checked in, but the service had not re-judged it since the policy changed, so the console was showing a verdict it no longer stood behind. A sync forces the evaluation; the pending installs collect on the same check-in, which is why the app count drops too.',
    hints: [
      'Read the reason text: this is not a device that has gone quiet.',
      'The device reports in; the verdict is what is out of date.',
      'Send a sync and confirm the verdict changes rather than staying not evaluated.',
    ],
  },
  {
    id: 'tpl-wrong-owner',
    title: 'Laptop is assigned to the wrong person',
    difficulty: 2,
    category: 'ownership',
    deviceId: 'dev-ws-1301',
    subject: 'WS-1301 is on Bram account, but it is Kai laptop',
    body:
      'Kai has been using WS-1301 since he joined and it is registered to Bram, who left the field team last month. Kai cannot get his own app assignments and Bram keeps getting Kai device alerts. Please put it right.',
    expectedActions: ['reassign-user'],
    verify: (device) => device.ownerUserId === 'usr-kai',
    resolution: 'Kai Brenner is the primary user of WS-1301.',
    explanation:
      'The hardware is fine; the record is wrong. Changing the primary user fixes the alerts and the ownership trail without touching the device, and it is the only action here that leaves a clean audit line. Retiring or wiping would destroy a working machine to solve a bookkeeping error.',
    hints: [
      'Check who the console says the primary user is.',
      'The device works; only the ownership is wrong.',
      'Set Kai as the primary user. Nothing needs to happen on the hardware.',
    ],
  },
]
