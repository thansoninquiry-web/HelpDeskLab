import type { SchoolScenario } from '../types'
import { twoStep } from './dialog'

/**
 * The classroom calls: a projector, a panel, a lockout, a machine with a bad
 * image and a room with no sound. Each is a real lesson blocked, so the bell is
 * short and the caller is standing next to the fault.
 */
export const CLASSROOM_SCENARIOS: readonly SchoolScenario[] = [
  {
    id: 'projector-no-signal',
    title: 'The projector says “no signal”',
    area: 'classroom',
    difficulty: 1,
    symptom: 'Room 3’s projector will not pick up the teacher’s laptop, ten minutes before the lesson.',
    report:
      '“It was working at break. I have plugged the laptop in myself and wiggled the cable, but the screen still says no signal.”',
    subject: 'Room 3 · projector and teacher laptop',
    caller: { name: 'Elena Vargas', role: 'Year 3 teacher', language: 'es' },
    bell: { at: 60, label: 'Period 1 starts at 09:00' },
    window: 30,
    reads: [
      {
        id: 'hdmi-handshake',
        finding:
          'The lead is in the laptop but only half home, and it sits in the projector’s HDMI 2 socket while the projector is showing HDMI 1.',
        decisive: true,
      },
      {
        id: 'projector-status',
        finding:
          'HDMI 1: no signal. HDMI 2: no source detected. Lamp 214 h, filter clean, no fault logged.',
        decisive: true,
      },
      {
        id: 'room-schedule',
        finding: 'Year 3 has the room until 10:00; Year 4 arrives at 10:05.',
      },
    ],
    changes: ['reseat-hdmi', 'select-input', 'replace-hdmi', 'power-cycle-projector', 'replace-projector'],
    expected: ['reseat-hdmi', 'select-input'],
    dialog: twoStep(
      {
        prompt: '“¿Puede mirarlo ahora? La clase empieza en diez minutos.”',
        gloss: '“Can you look at it now? The class starts in ten minutes.”',
        best: '“Buenos días, señora Vargas. Voy a mirar el cable y la entrada del proyector ahora mismo.”',
        bestGloss:
          '“Good morning, Mrs Vargas. I’ll check the cable and the projector’s input right now.”',
        jargon: '“The HDCP handshake is probably failing on the sink.”',
        brusque: '“Have you tried plugging it in properly?”',
      },
      {
        prompt: '“¿Y si no funciona antes de que lleguen los niños?”',
        gloss: '“And if it doesn’t work before the children arrive?”',
        best: '“Si el cable no lo arregla, tengo un proyector de repuesto. Le aviso en cinco minutos.”',
        bestGloss:
          '“If the cable doesn’t fix it, I have a spare projector. I’ll tell you in five minutes.”',
        jargon: '“Then we will fail over to the secondary display path.”',
        brusque: '“It’ll be fine, don’t worry about it.”',
      },
    ),
    hints: [
      'The laptop sees no display at all. Start at the two ends of the lead, not at the projector’s menu.',
      'The lead is in HDMI 2 and the projector is on HDMI 1 — both facts are in the reads.',
      'Reseat the lead, then put the projector on the input the lead is actually in.',
    ],
    explanation: [
      '“No signal” is nearly always one of three things: the lead, the input, or the source. Read both ends before you touch the menu.',
      'Cleaning up the cable and then selecting the matching input is the whole fix. A new cable or a replacement projector is a guess until one of those two is proved wrong.',
    ],
    verifyText: 'The laptop is detected and the projector is showing the teacher’s desktop.',
  },
  {
    id: 'projector-lamp',
    title: 'The projector cuts out after ten minutes',
    area: 'classroom',
    difficulty: 2,
    symptom: 'Room 7’s projector runs for about ten minutes, then goes dark with a red lamp light.',
    report:
      '“It is fine for the register and then it just goes. The fan is very loud before it does it. I have been using the whiteboard instead.”',
    subject: 'Room 7 · ceiling projector',
    caller: { name: 'Aisha Bello', role: 'Science teacher', language: 'en' },
    bell: { at: 130, label: 'Period 3 starts at 10:10' },
    window: 40,
    reads: [
      {
        id: 'lamp-hours',
        finding:
          'Lamp 4,180 h of a 4,000 h rating. Filter 82% blocked. The projector logs “over temperature” eight minutes into each run.',
        decisive: true,
      },
      {
        id: 'projector-status',
        finding: 'Fan at 100%, intake 41 °C, exhaust 68 °C. Thermal shutdown armed.',
        decisive: true,
      },
      {
        id: 'room-schedule',
        finding: 'Room 7 is used every period until 15:20, with a practical in Period 5.',
      },
    ],
    changes: ['clean-filter', 'power-cycle-projector', 'replace-lamp', 'replace-projector'],
    expected: ['clean-filter'],
    dialog: twoStep(
      {
        prompt: '“Do you need to take it away? I have a practical this afternoon.”',
        best: '“I can clean the filter and test it with you now — the projector stays on the ceiling.”',
        jargon: '“The thermal envelope is degraded, so I’ll remediate the airflow path.”',
        brusque: '“Whoever installed it put it too close to the ceiling void.”',
      },
      {
        prompt: '“And if it still cuts out after that?”',
        best: '“Then I’ll book a lamp and a spare projector for Period 5, and tell you before lunch.”',
        jargon: '“Then we escalate to a hardware refresh of the optical block.”',
        brusque: '“Then you’ll have to use the whiteboard.”',
      },
    ),
    hints: [
      'The projector is not failing at power-on; it fails once it is hot. Read the temperature and the filter.',
      'The filter is 82% blocked and the lamp is past its rating. One of those is the shutdown, the other is maintenance.',
      'Clean the filter first: it is the over-temperature cause, and the lamp can be booked without stopping the lesson.',
    ],
    explanation: [
      'A projector that shuts down after a few minutes and runs its fan flat out is telling you it is hot. The filter is the cheapest and most common cause.',
      'The lamp being overdue is worth recording, but it is not what turns the projector off today. Fix the cause you can prove, and book the wear item separately.',
    ],
    verifyText: 'The filter is clear, the intake temperature is normal, and the projector runs past ten minutes.',
  },
  {
    id: 'teacher-locked-out',
    title: 'Locked out before the first bell',
    area: 'classroom',
    difficulty: 1,
    symptom: 'A Year 4 teacher cannot sign in; the screen says the account is locked.',
    report:
      '“I tried my password three times and now it says the account is locked. The children are in the corridor. I have my staff badge.”',
    subject: 'Room 9 · teacher account and laptop',
    caller: { name: 'Marisol Ortega', role: 'Year 4 teacher', language: 'es' },
    bell: { at: 45, label: 'Period 1 starts at 08:45' },
    window: 25,
    reads: [
      {
        id: 'account-status',
        finding:
          'Account locked after five failed attempts at 08:12. Password expired yesterday. Last successful sign-in was on the staff-room PC.',
        decisive: true,
      },
      {
        id: 'room-schedule',
        finding: 'Year 4 is registered in Room 9 from 08:45; the register is taken on the laptop.',
      },
      {
        id: 'login-timing',
        finding: 'The laptop reaches the sign-in screen in 22 seconds; nothing is wrong with the machine.',
      },
    ],
    changes: ['unlock-account', 'reset-password', 'share-admin-password', 'give-admin-rights'],
    expected: ['unlock-account', 'reset-password'],
    dialog: twoStep(
      {
        prompt: '“¿Me puede ayudar? Tengo el carné del colegio aquí.”',
        gloss: '“Can you help me? I have my school badge here.”',
        best: '“Buenos días. Veo el carné: es usted la señora Ortega, de 4.º. Voy a desbloquear la cuenta.”',
        bestGloss:
          '“Good morning. I can see the badge: you’re Mrs Ortega, Year 4. I’ll unlock the account.”',
        jargon: '“The directory has locked the principal after the bad-password threshold.”',
        brusque: '“You’ll have to wait for the password to reset itself.”',
      },
      {
        prompt: '“¿Y la contraseña? No quiero que me pase otra vez.”',
        gloss: '“And the password? I don’t want this to happen again.”',
        best: '“Le doy una contraseña temporal y la cambia al entrar. Elija una que recuerde y no la comparta.”',
        bestGloss:
          '“I’ll give you a temporary password and you change it at sign-in. Pick one you’ll remember and don’t share it.”',
        jargon: '“I’ll set a temporary credential with a forced rotation at next logon.”',
        brusque: '“Just don’t forget it this time.”',
      },
    ),
    walkUp: {
      id: 'pupil-chromebook',
      who: 'A Year 5 pupil, sent by her teacher',
      ask: '“My Chromebook won’t turn on and we have a test in ten minutes.”',
      options: [
        {
          id: 'help-now',
          label: 'Stop and look at the pupil’s Chromebook now',
          detail: 'The teacher waits, and the pupil is back in class quickly.',
          minutes: 15,
        },
        {
          id: 'hand-off',
          label: 'Give the pupil a charged spare and log the dead one for later',
          detail: 'Two minutes, the pupil is back in class, and the repair is on the list.',
          minutes: 2,
          best: true,
        },
        {
          id: 'decline',
          label: 'Tell the pupil to come back after break',
          detail: 'No time lost, but the test is missed.',
          minutes: 0,
        },
      ],
      note:
        'A walk-up during a lockout is a triage decision, not a second ticket. The spare gets the pupil to the test; the dead machine goes on the bench list, where it can be worked without holding up two people.',
    },
    hints: [
      'Someone is standing in front of you with a badge. That is the identity check; the read tells you what state the account is in.',
      'Locked is not the same as forgotten. The password also expired yesterday.',
      'Unlock it, then set a temporary password and require a change at sign-in. Never hand over an admin credential.',
    ],
    explanation: [
      'A lockout before the bell is a two-minute fix once the person is verified in front of you. The lock and the expired password are separate facts, so both have to be cleared.',
      'The request that must be refused is the shortcut: an administrator password or local admin rights would get the teacher in and leave the school less safe. Verify, unlock, reset, and move on.',
    ],
    verifyText: 'The teacher is signed in on her own account and has set a new password.',
  },
  {
    id: 'classroom-pc-image',
    title: 'One classroom PC has lost its software',
    area: 'classroom',
    difficulty: 2,
    symptom: 'A pupil PC in Room 12 boots to a blank desktop with none of the class software.',
    report:
      '“The other three are fine. This one came up like a new machine — no browser, no maths programme, nothing.”',
    subject: 'Room 12 · pupil PC 4',
    caller: { name: 'Daniel Whitfield', role: 'Year 6 teacher', language: 'en' },
    bell: { at: 330, label: 'Period 6 starts at 13:30' },
    window: 60,
    reads: [
      {
        id: 'image-report',
        finding:
          'Imaging agent applied image 24.09 three weeks ago and reported “verification failed — profile step skipped”. The machine has been running the fallback desktop since.',
        decisive: true,
      },
      {
        id: 'disk-health',
        finding: 'SMART: good. No reallocated sectors. The drive is not the reason the image failed.',
      },
      {
        id: 'device-manager',
        finding: 'No devices in error; the network adapter and display are both healthy.',
      },
    ],
    changes: ['reimage-machine', 'rebuild-profile', 'reinstall-driver', 'wipe-lab', 'order-new-lab'],
    expected: ['reimage-machine'],
    dialog: twoStep(
      {
        prompt: '“Can you just put the maths programme back on it? That’s all they need.”',
        best: '“I can reimage it from the school image, which puts every programme back and takes about twenty minutes.”',
        jargon: '“I’ll redeploy the baseline and re-run the task sequence.”',
        brusque: '“That’s not how these machines are built.”',
      },
      {
        prompt: '“Will it keep the work the pupil saved on it?”',
        best: '“Pupil work is saved to their own drive, not the machine. I’ll check that the folder is empty before I wipe it.”',
        jargon: '“The profile is non-persistent, so there’s no local data plane to preserve.”',
        brusque: '“It’s a shared machine, so no.”',
      },
    ),
    hints: [
      'The machine boots, so this is not hardware. Read the imaging report before you touch the drive.',
      'The image it applied failed its verification three weeks ago and has been on a fallback desktop since.',
      'Reimage it, and check for local pupil work first. Do not rebuild one profile when the whole image is missing.',
    ],
    explanation: [
      'A machine that boots to a bare desktop is usually running a fallback image: the deployment applied but a step failed. The report names the step.',
      'Reimaging is the fix that puts the machine back on the school’s standard build. Rebuilding a profile or reinstalling one driver fixes a symptom and leaves the machine inconsistent.',
    ],
    verifyText: 'The machine runs the current school image and every class application opens.',
  },
  {
    id: 'smartboard-driver',
    title: 'The interactive panel ignores touch',
    area: 'classroom',
    difficulty: 2,
    symptom: 'Room 12’s panel shows the desktop but does not respond to touch or the pen.',
    report:
      '“It worked before the update on Tuesday. The picture is fine — I just can’t touch anything.”',
    subject: 'Room 12 · interactive panel',
    caller: { name: 'Daniel Whitfield', role: 'Year 6 teacher', language: 'en' },
    bell: { at: 200, label: 'Period 4 starts at 11:20' },
    window: 45,
    reads: [
      {
        id: 'device-manager',
        finding:
          '“HID-compliant touch device” shows Code 10 (the device cannot start). The pen input device is missing entirely.',
        decisive: true,
      },
      {
        id: 'image-report',
        finding: 'The connected PC applied a display and input driver pack on Tuesday evening.',
        decisive: true,
      },
      {
        id: 'hdmi-handshake',
        finding: 'Video is present on HDMI 1 at 1080p; the cable is fine.',
      },
    ],
    changes: ['reinstall-driver', 'reimage-machine', 'give-admin-rights', 'replace-projector'],
    expected: ['reinstall-driver'],
    dialog: twoStep(
      {
        prompt: '“Can you roll the whole machine back? I don’t mind losing the update.”',
        best: '“I’ll reinstall just the touch driver first — it’s a five-minute job and keeps Tuesday’s other fixes.”',
        jargon: '“I’ll re-enumerate the HID stack and roll the PnP device.”',
        brusque: '“You’ll have to use the mouse.”',
      },
      {
        prompt: '“And if it does it again next update?”',
        best: '“I’ll pin the working driver on this room’s machine and tell you if a future update changes it.”',
        jargon: '“I’ll exclude the device class from the driver ring.”',
        brusque: '“Then we’ll deal with it then.”',
      },
    ),
    hints: [
      'The picture is fine, so the panel and the cable are working. The problem is the input device the PC sees.',
      'Device Manager has the touch device in Code 10, right after Tuesday’s driver pack.',
      'Reinstall that driver. Do not reimage a working machine for one device.',
    ],
    explanation: [
      'Touch is a separate device from video. When the picture works and the touch does not, read Device Manager before you suspect the panel.',
      'A Code 10 after a driver update is fixed by reinstalling the signed driver. Local admin for the teacher is not a fix, and a whole-machine reimage is a much bigger change than the fault needs.',
    ],
    verifyText: 'The panel reports touch and pen input, and the teacher can write on the board.',
  },
  {
    id: 'classroom-audio',
    title: 'No sound from the ceiling speakers',
    area: 'classroom',
    difficulty: 1,
    symptom: 'Room 7 plays video but nothing comes out of the ceiling speakers.',
    report:
      '“The video plays, the children can see it, but there is no sound at all. I have turned the volume up on the laptop.”',
    subject: 'Room 7 · ceiling speakers and teacher laptop',
    caller: { name: 'Aisha Bello', role: 'Science teacher', language: 'en' },
    bell: { at: 110, label: 'Period 2 starts at 09:50' },
    window: 30,
    reads: [
      {
        id: 'audio-devices',
        finding:
          'Default output is “Laptop speakers”, which are muted at 0%. The room amplifier is present on HDMI but muted at its own dial.',
        decisive: true,
      },
      {
        id: 'projector-status',
        finding: 'HDMI audio is embedded and the projector is passing it to the amplifier.',
      },
      {
        id: 'room-schedule',
        finding: 'Room 7 has back-to-back lessons until lunch; the next class arrives at 09:50.',
      },
    ],
    changes: ['set-default-audio', 'unmute-output', 'reinstall-driver', 'replace-projector'],
    expected: ['set-default-audio', 'unmute-output'],
    dialog: twoStep(
      {
        prompt: '“I have the volume all the way up already. Is the speaker broken?”',
        best: '“The laptop is still sending sound to its own speakers, and the room amplifier is muted. I’ll fix both.”',
        jargon: '“The default render endpoint is the local HDA sink, not the HDMI sink.”',
        brusque: '“The speakers are fine, it’s your laptop.”',
      },
      {
        prompt: '“Will it stay like this for the next class?”',
        best: '“Yes — the setting is saved for this room’s login. I’ll play a test sound before I go.”',
        jargon: '“The endpoint preference is persisted per device profile.”',
        brusque: '“It should do.”',
      },
    ),
    hints: [
      'The video reaches the projector, so the cable is fine. Read where the laptop is sending its sound.',
      'Default output is the laptop’s own speakers, muted, and the room amplifier is muted too.',
      'Set the room output as default, then unmute it, and play something to prove it.',
    ],
    explanation: [
      'Video over HDMI and audio over HDMI are separate paths as far as the laptop is concerned. A muted local output looks like a dead speaker.',
      'Both ends were muted: the laptop’s output and the room amplifier. Fixing only one leaves the room silent.',
    ],
    verifyText: 'The video’s sound comes out of the ceiling speakers at a normal level.',
  },
]
