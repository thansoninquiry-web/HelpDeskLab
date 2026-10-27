import type { SchoolScenario } from '../types'
import { twoStep } from './dialog'

/**
 * The computer lab: one image, 28 machines, two printers and a testing day.
 *
 * Lab faults are never quite one machine. The reads are there to show the
 * difference between a machine that failed and a rollout that failed.
 */
export const LAB_SCENARIOS: readonly SchoolScenario[] = [
  {
    id: 'lab-image-corrupt',
    title: 'The lab image failed across the room',
    area: 'lab',
    difficulty: 3,
    symptom: 'Half of Lab A boots to a broken desktop after last night’s image rollout.',
    report:
      '“I came in at seven and nineteen of them are like this. The other nine are fine. We have an exam at ten.”',
    subject: 'Lab A · 28 machines',
    caller: { name: 'Priya Raman', role: 'Front office administrator', language: 'en' },
    bell: { at: 120, label: 'The Year 6 exam starts at 10:00' },
    window: 50,
    reads: [
      {
        id: 'lab-console',
        finding:
          'Image 24.10 was pushed to all 28 machines at 19:05. 19 failed verification at the profile step. The rollout is marked complete, so it will not retry.',
        decisive: true,
      },
      {
        id: 'image-report',
        finding:
          'On a failed machine: image 24.10 applied, profile step skipped, machine running the fallback desktop.',
        decisive: true,
      },
      {
        id: 'disk-health',
        finding: 'All four machines sampled report healthy drives. This is not a hardware pattern.',
      },
    ],
    changes: ['rollback-image', 'reimage-machine', 'wipe-lab', 'order-new-lab'],
    expected: ['rollback-image', 'reimage-machine'],
    dialog: twoStep(
      {
        prompt: '“Can we just cancel the exam? Or put them all on the old image?”',
        best: '“I can roll the lab back to the last image that passed, then reimage the machines that still fail. That gets you the room.”',
        jargon: '“I’ll revert the deployment ring and re-run the failed task sequences.”',
        brusque: '“You should have told me before the rollout.”',
      },
      {
        prompt: '“How long will that take? The exam is at ten.”',
        best: '“The rollback takes about twenty minutes and I’ll start with the front row. I’ll tell you by 09:40 whether we need Lab B.”',
        jargon: '“Rollback is sequential per chassis; expect a full window.”',
        brusque: '“As long as it takes.”',
      },
    ),
    walkUp: {
      id: 'exam-move',
      who: 'The deputy head, in the doorway',
      ask: '“Do we need to move the exam to Lab B? I have to tell the invigilator now.”',
      options: [
        {
          id: 'rush',
          label: 'Keep the exam in Lab A and rush the reimage',
          detail: 'No move, but the room may not be ready and the rollback gets skipped.',
          minutes: 15,
        },
        {
          id: 'lab-b',
          label: 'Move the exam to Lab B and finish the lab properly',
          detail: 'Five minutes to move, the exam runs, and Lab A is fixed without a shortcut.',
          minutes: 5,
          best: true,
        },
        {
          id: 'decline',
          label: 'Tell the deputy head it is not your decision',
          detail: 'No time lost, but nobody moves the exam and the room is still broken at ten.',
          minutes: 0,
        },
      ],
      note:
        'The exam is the school’s problem to place; the lab is yours to fix. Handing the room decision back with a working alternative — Lab B — protects both, and rushing a rollout is how a second room ends up broken.',
    },
    hints: [
      'Nine machines are fine. That is not a machine fault, it is a rollout fault. Read the lab console.',
      'Image 24.10 failed its profile step on nineteen machines and the rollout will not retry itself.',
      'Roll the lab back to the last good image, then reimage the machines that still fail. Do not wipe the room.',
    ],
    explanation: [
      'When the same image fails on most of a room, the image is the fault, not the hardware. The rollout log tells you which step failed and whether it will retry.',
      'A rollback restores the room to a known-good state quickly; reimaging the stragglers finishes the job. Wiping every machine destroys the nine that were working and takes the room away for longer.',
    ],
    verifyText: 'Every machine in Lab A boots the last verified image and the exam group can sign in.',
  },
  {
    id: 'lab-login-slow',
    title: 'Logins take six minutes in the lab',
    area: 'lab',
    difficulty: 2,
    symptom: 'A whole lab class waits six minutes each to reach the desktop.',
    report:
      '“By the time the last one is in, the lesson is half gone. It started after the profile change last week.”',
    subject: 'Lab A · pupil accounts',
    caller: { name: 'Daniel Whitfield', role: 'Year 6 teacher', language: 'en' },
    bell: { at: 90, label: 'Period 2 starts at 09:30' },
    window: 30,
    reads: [
      {
        id: 'login-timing',
        finding:
          'Six minutes forty from password to desktop. Most of it is “Waiting for the profile service”, then a 1.8 GB profile copy from the server.',
        decisive: true,
      },
      {
        id: 'disk-health',
        finding: 'Drive healthy, 42% free. The machine is not struggling for space or failing.',
      },
      {
        id: 'image-report',
        finding: 'All machines run the current image and verified. The image is not the fault.',
      },
    ],
    changes: ['rebuild-profile', 'reimage-machine', 'reinstall-driver', 'wipe-lab'],
    expected: ['rebuild-profile'],
    dialog: twoStep(
      {
        prompt: '“Can you make the profiles smaller? The children only need the browser.”',
        best: '“I’ll rebuild the profile so it stops carrying the old copy, then test a login before the next class.”',
        jargon: '“I’ll clear the cached roaming hive and re-provision the profile container.”',
        brusque: '“They shouldn’t be saving things to the desktop.”',
      },
      {
        prompt: '“Will they lose their work?”',
        best: '“Their documents live on the shared drive, not the profile. I’ll check the folder before I rebuild it.”',
        jargon: '“The VHD is non-authoritative; redirected folders are untouched.”',
        brusque: '“Probably not.”',
      },
    ),
    hints: [
      'Every machine is slow, and every machine passed its image check. Time one login and see what it waits on.',
      'The wait is the profile service copying a 1.8 GB profile, not the disk or the image.',
      'Rebuild the profile, after checking that nothing of the pupil’s is only on the machine.',
    ],
    explanation: [
      'Slow logins across a room are a profile or a server problem, not a machine problem. The timing read tells you which stage is slow, which is the whole diagnosis.',
      'Rebuilding the profile clears the oversized copy. Reimaging a room of healthy machines is a much larger change that does not address the profile at all.',
    ],
    verifyText: 'A pupil login reaches the desktop in under a minute on the lab machines.',
  },
  {
    id: 'lab-printing',
    title: 'The lab prints to the office printer',
    area: 'lab',
    difficulty: 1,
    symptom: 'Lab A jobs come out in the front office, two floors away.',
    report:
      '“The children print their certificates and they appear on our counter. We have had three parents collect the wrong thing.”',
    subject: 'Lab A · printer defaults',
    caller: { name: 'Priya Raman', role: 'Front office administrator', language: 'en' },
    bell: { at: 180, label: 'The certificates are needed at 11:00' },
    window: 40,
    reads: [
      {
        id: 'print-queue',
        finding:
          '26 jobs are queued to OFFICE-MFP from lab machines. The lab printer LAB-A-P1 is online with an empty queue.',
        decisive: true,
      },
      {
        id: 'printer-config',
        finding:
          'The lab machines’ default printer is OFFICE-MFP. The lab printer is installed but not default.',
        decisive: true,
      },
      {
        id: 'room-schedule',
        finding: 'Lab A is booked all morning; the certificates are for the 11:00 assembly.',
      },
    ],
    changes: ['set-default-printer', 'clear-queue', 'test-print', 'restart-spooler'],
    expected: ['set-default-printer', 'clear-queue', 'test-print'],
    dialog: twoStep(
      {
        prompt: '“Can you just cancel everything on our printer? It’s blocking our own work.”',
        best: '“I’ll clear the lab jobs from your queue and point the lab at its own printer, then print one page to prove it.”',
        jargon: '“I’ll purge the spooler on the MFP and re-target the default queue.”',
        brusque: '“The children shouldn’t be printing that much.”',
      },
      {
        prompt: '“Will it happen again tomorrow?”',
        best: '“The default is set per machine and saved, so no. I’ll check one machine in the morning.”',
        jargon: '“The change is applied at the machine policy level.”',
        brusque: '“Hopefully not.”',
      },
    ),
    hints: [
      'The lab printer is online, so this is not a broken printer. Read where the jobs are going.',
      'Every lab machine’s default is the office multifunction, and the office queue is full of lab jobs.',
      'Change the default, clear the office queue, and print a test page from the lab.',
    ],
    explanation: [
      'Printing in the wrong place is a default-printer fault. The queue read shows both ends: too many jobs on the office printer, none on the lab printer.',
      'Clearing the queue without changing the default just refills it. Changing the default without clearing the queue leaves the office blocked.',
    ],
    verifyText: 'A job sent from a lab machine comes out of LAB-A-P1 and the office queue is empty.',
  },
  {
    id: 'testing-day-wifi',
    title: 'Wi-Fi collapses on testing day',
    area: 'lab',
    difficulty: 3,
    symptom: 'Every laptop in Lab A drops its connection as soon as the online test starts.',
    report:
      '“It is fine for a normal lesson. Today, with all 28 on the test, they keep dropping. The test timer does not stop.”',
    subject: 'Lab A · wireless and the laptop cart',
    caller: { name: 'Priya Raman', role: 'Front office administrator', language: 'en' },
    bell: { at: 75, label: 'The test window opens at 09:15' },
    window: 40,
    reads: [
      {
        id: 'wifi-clients',
        finding:
          '94 clients on AP-LAB-1, 61 of them on 2.4 GHz. Airtime utilisation 96%. The 5 GHz radio is disabled.',
        decisive: true,
      },
      {
        id: 'rssi-survey',
        finding: '−41 dBm at the front desk, −58 dBm mid-room, −69 dBm at the back wall.',
        decisive: true,
      },
      {
        id: 'switch-port',
        finding: 'The lab’s 28 wired ports are up and idle; the machines are all on Wi-Fi.',
      },
    ],
    changes: ['enable-5ghz', 'add-lab-ap', 'reboot-ap', 'pause-filter-for-testing'],
    expected: ['enable-5ghz', 'add-lab-ap'],
    dialog: twoStep(
      {
        prompt: '“Can you turn the filter off? Maybe that’s what’s slowing it.”',
        best: '“The filter isn’t the bottleneck — the radio is. I’ll turn on 5 GHz and put a second access point in the lab.”',
        jargon: '“Airtime contention is the constraint; the filtering path is not in the data plane.”',
        brusque: '“The filter has nothing to do with it.”',
      },
      {
        prompt: '“The test starts in fifteen minutes. Will it hold?”',
        best: '“I’ll bring the cart onto the wired ports for the test and leave the Wi-Fi for the room’s own devices.”',
        jargon: '“I’ll fail the cohort over to the wired distribution.”',
        brusque: '“It’ll be better than it was.”',
      },
    ),
    hints: [
      'This is a capacity fault, not a coverage fault: it works until everyone is on. Read the client list.',
      'Ninety-four clients on one access point, most on 2.4 GHz, with the 5 GHz radio switched off.',
      'Turn on 5 GHz and add a second access point. Pausing the filter changes nothing about airtime.',
    ],
    explanation: [
      'Wi-Fi fails under load in a way that looks like a coverage problem. The client list and the airtime figure tell you it is contention on one radio.',
      'The fix is more capacity: the second radio and a second access point. Disabling the web filter is the request to refuse — it would weaken the school and would not add a single MHz of airtime.',
    ],
    verifyText: 'The test cohort stays connected with airtime below 70% for the whole window.',
  },
  {
    id: 'lab-pc-no-network',
    title: 'One lab PC has no network',
    area: 'lab',
    difficulty: 1,
    symptom: 'Machine 14 in Lab A shows a red cross on the network icon.',
    report:
      '“It was working before lunch. The other 27 are fine. The cable is plugged in at the back — I checked.”',
    subject: 'Lab A · machine 14',
    caller: { name: 'Daniel Whitfield', role: 'Year 6 teacher', language: 'en' },
    bell: { at: 360, label: 'Period 7 starts at 14:00' },
    window: 45,
    reads: [
      {
        id: 'switch-port',
        finding: 'Gi1/0/14 is administratively down. It was disabled at 12:41, during the cabling work.',
        decisive: true,
      },
      {
        id: 'image-report',
        finding: 'Machine 14 runs the current image and verified this morning. No change since.',
      },
      {
        id: 'device-manager',
        finding: 'The network adapter is present and reporting no fault; Windows says the cable is unplugged.',
      },
    ],
    changes: ['enable-switch-port', 'replace-hdmi', 'set-static-ip', 'reimage-machine'],
    expected: ['enable-switch-port'],
    dialog: twoStep(
      {
        prompt: '“Should I move the child to another machine?”',
        best: '“If it’s quick, yes — I’ll bring the port back up and come and check the machine in a few minutes.”',
        jargon: '“The port is in an admin-down state; I’ll clear it.”',
        brusque: '“The port’s off. I’ll deal with it.”',
      },
      {
        prompt: '“How did it get switched off?”',
        best: '“The cabling work this afternoon disabled it. I’ll check the other ports that were touched as well.”',
        jargon: '“A configuration change during the patching window.”',
        brusque: '“Someone must have done it.”',
      },
    ),
    hints: [
      'The cable is in and the adapter is healthy. The next thing upstream is the switch port.',
      'Port Gi1/0/14 is administratively down, disabled during the cabling work at 12:41.',
      'Bring the port back up. Nothing on the machine needs changing.',
    ],
    explanation: [
      '“Cable unplugged” on a machine with a cable in it means the link is down somewhere upstream. Read the switch port before you touch the PC.',
      'The port was disabled during cabling. Re-enabling it is the whole fix; a static address or a reimage would paper over a port that is simply off.',
    ],
    verifyText: 'Machine 14 has a link, picks up its address, and reaches the file server.',
  },
]
