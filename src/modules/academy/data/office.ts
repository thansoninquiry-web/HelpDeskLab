import type { SchoolScenario } from '../types'
import { twoStep } from './dialog'

/**
 * The front office and the staff room.
 *
 * These callers are not technical, the counter is public, and the work is often
 * about saying no safely: the filter, the payroll folder, and the parent at the
 * desk who is not the pupil.
 */
export const OFFICE_SCENARIOS: readonly SchoolScenario[] = [
  {
    id: 'office-printer-jam',
    title: 'The office printer is jammed before the registers',
    area: 'office',
    difficulty: 1,
    symptom: 'The front office multifunction stops with a jam warning and four jobs held.',
    report:
      '“It says there is a jam in tray two. I have opened the front and I cannot see any paper. The registers are due at 08:40.”',
    subject: 'Front office · multifunction printer',
    caller: { name: 'Carmen Ruiz', role: 'Office administrator', language: 'es' },
    bell: { at: 40, label: 'Registers are due at 08:40' },
    window: 20,
    reads: [
      {
        id: 'print-queue',
        finding:
          'Four jobs held: three registers and one purchase order. The printer reports “jam at fuser, tray 2”.',
        decisive: true,
      },
      {
        id: 'printer-config',
        finding: 'Tray 2 is set to A4, 80 gsm. The loaded stock is A4. The settings are correct.',
        decisive: true,
      },
      {
        id: 'room-schedule',
        finding: 'The office opens at 08:15 and the counter is staffed by one person until 09:00.',
      },
    ],
    changes: ['clear-jam', 'reload-paper', 'restart-spooler', 'test-print', 'replace-projector'],
    expected: ['clear-jam', 'test-print'],
    dialog: twoStep(
      {
        prompt: '“¿Puede venir ahora? La oficina abre en cinco minutos.”',
        gloss: '“Can you come now? The office opens in five minutes.”',
        best: '“Voy ahora mismo. ¿Puede no abrir la tapa del fusor? Está caliente.”',
        bestGloss:
          '“I’m coming now. Could you leave the fuser door closed? It gets hot.”',
        jargon: '“The fuser nip has a sheet wrapped around the roller.”',
        brusque: '“Don’t open it any further, you’ll make it worse.”',
      },
      {
        prompt: '“¿Y los registros? No puedo esperar mucho.”',
        gloss: '“And the registers? I can’t wait long.”',
        best: '“Si la impresora tarda, puedo imprimir los registros en la de la sala de profesores y traerlos.”',
        bestGloss:
          '“If the printer takes a while, I can print the registers on the staff-room printer and bring them over.”',
        jargon: '“We can redirect the queue to the secondary device.”',
        brusque: '“They’ll have to wait.”',
      },
    ),
    hints: [
      'The queue names the jam and the tray. Read it before you open anything.',
      'The jam is at the fuser, which is behind the rear door, not behind the front cover the caller opened.',
      'Clear the sheet in the direction of travel, close up, and print a test page. The settings do not need changing.',
    ],
    explanation: [
      'A jam message names a location. Opening the front cover when the sheet is at the fuser is how a small jam becomes a torn sheet and a service call.',
      'Clear it, then prove the printer with one page. Restarting the spooler or reloading an already-correct tray does not clear a fuser jam.',
    ],
    verifyText: 'The held jobs print and a test page comes out without a jam warning.',
  },
  {
    id: 'office-scan-to-email',
    title: 'Scan-to-email stopped working',
    area: 'office',
    difficulty: 2,
    symptom: 'Scans reach the printer’s outbox but never arrive by email.',
    report:
      '“It scans, it says sent, and nothing arrives. We are emailing photos of permission slips from a phone.”',
    subject: 'Front office · multifunction scan profile',
    caller: { name: 'Priya Raman', role: 'Front office administrator', language: 'en' },
    bell: { at: 240, label: 'The newsletter goes out at 12:00' },
    window: 40,
    reads: [
      {
        id: 'printer-config',
        finding:
          'Scan profile signs in as scan@larkspur.test. The account’s password expired nine days ago; the last successful SMTP sign-in is nine days ago.',
        decisive: true,
      },
      {
        id: 'print-queue',
        finding: 'Printing is working normally. The failure is only on the scan path.',
        decisive: true,
      },
      {
        id: 'account-status',
        finding: 'The scan account is not locked; only its password has expired.',
      },
    ],
    changes: ['fix-scan-settings', 'restart-spooler', 'clear-queue', 'disable-filter'],
    expected: ['fix-scan-settings'],
    dialog: twoStep(
      {
        prompt: '“Could we just use your email address for the scans instead?”',
        best: '“Better to keep the scan account and renew its password — then the scans stay in the office mailbox, not mine.”',
        jargon: '“I’ll rotate the service principal credential on the SMTP connector.”',
        brusque: '“No, that would be a mess.”',
      },
      {
        prompt: '“Will the ones we already sent arrive?”',
        best: '“No — they were rejected. I’ll re-scan the newsletter pages once the profile works.”',
        jargon: '“The queued messages are in a non-delivery state.”',
        brusque: '“They’re gone.”',
      },
    ),
    hints: [
      'The printer prints, so the network and the queue are fine. Read the scan profile’s own settings.',
      'The scan account’s password expired nine days ago, and the failures started then.',
      'Renew the scan account and update the profile, then send a test scan to the office mailbox.',
    ],
    explanation: [
      'Scan-to-email is a sign-in, not a print. When printing works and scanning does not, the service account behind the scan profile is the first thing to read.',
      'The fix is to renew the credential the profile uses, not to borrow a person’s mailbox. Restarting the spooler has nothing to do with the scan path.',
    ],
    verifyText: 'A scan from the office printer arrives in the office mailbox within a minute.',
  },
  {
    id: 'gradebook-blocked',
    title: 'The grade-book site is blocked',
    area: 'office',
    difficulty: 2,
    symptom: 'A teacher cannot open the grade-book site; the filter blocks it as uncategorised.',
    report:
      '“It worked last term. Now it says the site is blocked. I have reports due and the marks are in there.”',
    subject: 'Staff laptop · web filter',
    caller: { name: 'Marisol Ortega', role: 'Year 4 teacher', language: 'es' },
    bell: { at: 55, label: 'Period 1 starts at 08:55' },
    window: 25,
    reads: [
      {
        id: 'filter-log',
        finding:
          'grades.example.edu is filed as “Uncategorised” and blocked by the default rule. The block started when the filter list updated last night.',
        decisive: true,
      },
      {
        id: 'room-schedule',
        finding: 'Year 4 is in Room 9 from 08:55; reports are due at 16:00.',
      },
      {
        id: 'account-status',
        finding: 'The teacher’s account is fine; the block is not account-specific.',
      },
    ],
    changes: ['recategorise-site', 'disable-filter', 'pause-filter-for-testing', 'give-admin-rights'],
    expected: ['recategorise-site'],
    dialog: twoStep(
      {
        prompt: '“¿Puede quitar el bloqueo? Solo necesito esa página.”',
        gloss: '“Can you remove the block? I only need that page.”',
        best: '“Puedo pedir que la clasifiquen como sitio educativo. Mientras tanto, le doy una excepción solo para esa página.”',
        bestGloss:
          '“I can ask for it to be categorised as an education site. Meanwhile I’ll give you an exception for that one page only.”',
        jargon: '“I’ll raise a recategorisation against the vendor taxonomy.”',
        brusque: '“I can’t turn the filter off for you.”',
      },
      {
        prompt: '“¿Cuánto tarda? Tengo que entregar las notas hoy.”',
        gloss: '“How long does it take? I have to hand in the marks today.”',
        best: '“La excepción funciona en diez minutos; la clasificación puede tardar un día. Le aviso cuando esté.”',
        bestGloss:
          '“The exception works in ten minutes; the classification can take a day. I’ll tell you when it’s done.”',
        jargon: '“Vendor taxonomy updates are batched overnight.”',
        brusque: '“That’s not my problem.”',
      },
    ),
    walkUp: {
      id: 'video-request',
      who: 'Another teacher, at the office door',
      ask: '“While you’re in there, can you turn the filter off for my class? I want to show a YouTube clip.”',
      options: [
        {
          id: 'explain',
          label: 'Explain the exception process and log the request',
          detail: 'Two minutes; the clip is unblocked properly, for that class only.',
          minutes: 2,
          best: true,
        },
        {
          id: 'whole-school',
          label: 'Turn filtering off for the whole school for the afternoon',
          detail: 'Fast, and every pupil in the school loses the filter.',
          minutes: 5,
        },
        {
          id: 'ignore',
          label: 'Say you are busy and walk away',
          detail: 'No time lost; the request is lost too.',
          minutes: 0,
        },
      ],
      note:
        'A legitimate unblock request is still a request. Logging it and scoping the exception to the lesson keeps the filter doing its job; switching it off for the school is the shortcut that has to be refused.',
    },
    hints: [
      'The site is blocked by policy, not by a fault. Read the category and the rule that caught it.',
      'The filter list updated overnight and filed the grade book as uncategorised.',
      'Ask for a recategorisation, and give the teacher a scoped exception for today. Do not disable the filter.',
    ],
    explanation: [
      'The filter is doing what it was configured to do. The question is whether the category is right, and the log answers it.',
      'A scoped exception plus a recategorisation request solves today and tomorrow. Disabling the filter — for one user or the school — is the request the desk must refuse, however urgent the reports are.',
    ],
    verifyText: 'The grade-book site opens for the teacher and the filter still blocks what it should.',
  },
  {
    id: 'office-shared-drive',
    title: 'The shared drive has disappeared',
    area: 'office',
    difficulty: 2,
    symptom: 'The S: drive is missing after a reboot; the folder is still on the server.',
    report:
      '“Every morning this week S: is not there. I can get to it by typing the path, but the staff shortcuts are all broken.”',
    subject: 'Front office · PC 2',
    caller: { name: 'Priya Raman', role: 'Front office administrator', language: 'en' },
    bell: { at: 80, label: 'The office opens at 09:20' },
    window: 30,
    reads: [
      {
        id: 'drive-mapping',
        finding:
          'S: is not mapped. The logon script stopped at line 12 with “access denied” for the old server name; the server was renamed last week.',
        decisive: true,
      },
      {
        id: 'account-status',
        finding: 'The account is active and not locked; group membership for the staff share is present.',
      },
      {
        id: 'disk-health',
        finding: 'The machine’s drive is healthy and the profile loads normally.',
      },
    ],
    changes: ['remap-drive', 'reset-password', 'reimage-machine', 'set-static-ip'],
    expected: ['remap-drive'],
    dialog: twoStep(
      {
        prompt: '“Can you just put the shortcut back on my desktop?”',
        best: '“I’ll remap the drive properly so it comes back at every sign-in, then check the shortcut.”',
        jargon: '“I’ll update the UNC path in the logon script.”',
        brusque: '“A shortcut won’t survive a reboot.”',
      },
      {
        prompt: '“Will the other office PCs need this too?”',
        best: '“Yes — the script is shared, so I’ll fix it once and check all three machines before the office opens.”',
        jargon: '“The GPO preference will apply at next logon.”',
        brusque: '“Probably.”',
      },
    ),
    hints: [
      'The drive letter is gone but the folder is reachable by path, so the share is fine. Read the mapping.',
      'The logon script stops on the old server name — the server was renamed last week.',
      'Remap the drive and confirm it returns after a sign-out. A password reset would not bring a drive letter back.',
    ],
    explanation: [
      'A missing mapped drive with a working share is a mapping fault. The script read shows exactly where it stopped.',
      'Remapping fixes the machine and the next sign-in. A shortcut on the desktop hides the fault until the next reboot, and the other office PCs have the same script.',
    ],
    verifyText: 'S: returns at sign-in on the office PCs and opens the staff share.',
  },
  {
    id: 'admin-account-lockout',
    title: 'The bursar is locked out during payroll',
    area: 'office',
    difficulty: 2,
    symptom: 'The bursar cannot sign in; payroll closes at noon.',
    report:
      '“I changed my password on Friday and now it says locked. I am on the phone with payroll and I cannot get into the file.”',
    subject: 'Front office · bursar account',
    caller: { name: 'Priya Raman', role: 'Front office administrator', language: 'en' },
    bell: { at: 150, label: 'Payroll closes at 10:30' },
    window: 30,
    reads: [
      {
        id: 'account-status',
        finding:
          'Account locked after four failed attempts from the office PC and one from a phone. Password was changed on Friday and is valid. No sign of a second person using it.',
        decisive: true,
      },
      {
        id: 'room-schedule',
        finding: 'The bursar is in the front office until 11:00 and payroll closes at 10:30.',
      },
      {
        id: 'login-timing',
        finding: 'The office PC signs in normally in 18 seconds once the account is unlocked.',
      },
    ],
    changes: ['unlock-account', 'reset-password', 'share-admin-password', 'give-admin-rights'],
    expected: ['unlock-account'],
    dialog: twoStep(
      {
        prompt: '“Can you just tell me the admin password so I can unlock myself next time?”',
        best: '“I can’t share that, but I can unlock you now and show you the self-service reset page for next time.”',
        jargon: '“Shared credentials breach the access policy; I’ll clear the lock instead.”',
        brusque: '“Absolutely not.”',
      },
      {
        prompt: '“Why did it lock? Nobody else uses my account.”',
        best: '“There was one attempt from a phone as well as the office PC. If that was you, the old password is probably saved there.”',
        jargon: '“The lockout threshold was tripped by a stale cached credential.”',
        brusque: '“You must have typed it wrong.”',
      },
    ),
    hints: [
      'The password is valid; the account is locked. Those are different problems with different fixes.',
      'The read shows attempts from the office PC and a phone — a saved old password is the likely cause.',
      'Unlock it now, and point the bursar at self-service. Never share an administrator credential.',
    ],
    explanation: [
      'A lockout with a valid password needs an unlock, not a reset. Resetting a working password during payroll adds a change the bursar did not ask for and has to remember.',
      'The request for the admin password is the one to refuse: it would solve today and hand a payroll account’s neighbour the keys to the estate. Unlock, explain the phone, and move on.',
    ],
    verifyText: 'The bursar is signed in and the payroll file opens before the deadline.',
  },
]
