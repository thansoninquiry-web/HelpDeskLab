import { FIX_LABELS, isDestructiveFix, type DesktopCase, type FixId, type FixOption } from '../types'

function fix(id: FixId, detail: string): FixOption {
  return { id, label: FIX_LABELS[id], detail, risk: isDestructiveFix(id) }
}

/**
 * Application support: the four Office and printing cases a desk sees weekly,
 * and QuickBooks — a company file that will not open, multi-user mode, a lapsed
 * licence, and the backup that has to be restored.
 *
 * QuickBooks is in here because it is the application a small business actually
 * rings about, and its failures are not browser faults: the company file, the
 * hosting setup, the licence and the backup are four different records.
 */
export const APP_CASES: readonly DesktopCase[] = [
  {
    id: 'outlook-profile-corrupt',
    title: 'Outlook will not start',
    difficulty: 2,
    category: 'application',
    platform: 'desktop',
    edition: 'Windows 11',
    symptom: 'Outlook closes on launch; the profile cannot be opened.',
    report:
      '"Outlook flashes up and closes. My mail is on the server, I know that — I just need to get back into it before the 10 o’clock."',
    subject: 'outlook',
    fault: { kind: 'outlook-profile' },
    evidence: [
      { check: 'outlook-profiles', on: 'outlook' },
      { check: 'eventlog', on: 'os' },
      { check: 'sfc', on: 'os' },
    ],
    fixOptions: [
      fix('new-outlook-profile', 'Create a new mail profile in Mail (Microsoft Outlook), and set it as the default.'),
      fix('repair-office', 'Office is fine; the profile is what cannot be opened.'),
      fix('reinstall-windows', 'A mail profile is a per-user setting, not an operating system.'),
      fix('wipe-disk', 'There is nothing on the disk that this would recover.'),
    ],
    expectedFix: ['new-outlook-profile'],
    hints: [
      'Mail (Microsoft Outlook) in Control Panel shows the profiles and their data files.',
      'A profile that cannot be opened can be replaced without touching the mailbox on the server.',
      'Repair Office only after the new profile still fails — otherwise it is a long wait for the wrong fix.',
    ],
    explanation: [
      'Outlook’s profile points at its data files and the server settings; when the profile itself is damaged, Outlook cannot start at all. The Mail control panel shows the broken profile, and the event log names the failure.',
      'A new profile reconnects the same mailbox, with the mail that lives on the server intact. Repairing Office or reinstalling Windows is the expensive way to avoid a two-minute profile rebuild.',
    ],
    backupRequired: true,
    verifyText: 'Outlook starts with the new profile and the mailbox loads.',
    tools: ['outlook /profiles', 'eventvwr', 'sfc /scannow', 'help'],
  },
  {
    id: 'word-crashes',
    title: 'Word closes when a document opens',
    difficulty: 2,
    category: 'application',
    platform: 'desktop',
    edition: 'Windows 10',
    symptom: 'Word opens, then closes as soon as a particular document is loaded.',
    report:
      '"Every time I open the contract template, Word goes away. Other documents are fine. I have a deadline at four."',
    subject: 'word',
    fault: { kind: 'office-addin' },
    evidence: [
      { check: 'office-addins', on: 'word' },
      { check: 'eventlog', on: 'os' },
      { check: 'taskmgr', on: 'os' },
    ],
    fixOptions: [
      fix('disable-addin', 'Disable the add-in that loads with that document’s template, then reopen it.'),
      fix('repair-office', 'Try it if the add-in is not the cause; it costs a long repair.'),
      fix('reinstall-windows', 'One document and one add-in do not justify a rebuild.'),
      fix('disable-antivirus', 'The crash is in Word, and protection is not the suspect.'),
    ],
    expectedFix: ['disable-addin'],
    hints: [
      'It crashes on one document and not others: something that document loads is the suspect.',
      'The Office add-ins list shows what loads with the template, and when it was installed.',
      'Disable the add-in and reopen the document before you repair anything.',
    ],
    explanation: [
      'Word crashing on one document points at what that document loads — an add-in or template component — not at Word itself. The add-ins list names the one added recently, and the event log shows the faulting module.',
      'Disabling it is instant and reversible, and it proves the cause. Repairing Office first means a long wait and no evidence, and reinstalling Windows is out of proportion to one template.',
    ],
    backupRequired: true,
    verifyText: 'The document opens and Word stays open.',
    tools: ['word /addins', 'eventvwr', 'taskmgr', 'help'],
  },
  {
    id: 'printer-queue-stuck',
    title: 'The printer queue will not clear',
    difficulty: 1,
    category: 'application',
    platform: 'desktop',
    edition: 'Windows 10',
    symptom: 'A job sits at “Deleting” and every later job waits behind it.',
    report:
      '"I sent the same page four times. Now nothing prints and the queue says deleting. The printer itself is fine — it printed a test page."',
    subject: 'printer',
    fault: { kind: 'spooler-jam' },
    evidence: [
      { check: 'print-queue', on: 'printer' },
      { check: 'eventlog', on: 'os' },
    ],
    fixOptions: [
      fix('clear-print-queue', 'Stop the spooler, clear the stuck jobs from the queue, and start it again.'),
      fix('restart-spooler', 'Restarting alone can leave the same job on disk, ready to jam again.'),
      fix('install-shared-printer', 'The printer is installed and printing test pages.'),
      fix('repair-office', 'The job is in the spooler, not in the application that sent it.'),
    ],
    expectedFix: ['clear-print-queue', 'restart-spooler'],
    hints: [
      'A job stuck at “Deleting” is a spooler problem, not a printer problem.',
      'The test page printing proves the printer and its connection are fine.',
      'Clear the queue, then restart the service so it starts clean.',
    ],
    explanation: [
      'The printer is healthy — the test page proves it — and the job is stuck in the spooler on the PC. Every later job waits behind the one that will not delete.',
      'Clearing the queue and restarting the spooler is the fix; restarting without clearing can pick the same job back up. The event log shows the spooler error that stalled it, which is worth noting for the next person.',
    ],
    backupRequired: false,
    verifyText: 'The queue is empty and a new job prints.',
    tools: ['print queue', 'eventvwr', 'help'],
  },
  {
    id: 'shared-printer-install',
    title: 'Install the shared printer on a new laptop',
    difficulty: 1,
    category: 'application',
    platform: 'laptop',
    edition: 'Windows 11',
    symptom: 'The shared office printer is not installed on a replacement laptop.',
    report:
      '"I have the new laptop. The printer is the one in the corridor, on the file server. Can you set it up so I can print the payroll pack?"',
    subject: 'printer',
    fault: { kind: 'printer-not-installed' },
    evidence: [
      { check: 'print-drivers', on: 'printer' },
      { check: 'print-queue', on: 'printer' },
    ],
    fixOptions: [
      fix('install-shared-printer', 'Add the printer by its shared name and let Windows fetch the driver from the server.'),
      fix('restart-spooler', 'There is no queue to unstick: the printer is not installed yet.'),
      fix('clear-print-queue', 'Nothing is stuck; nothing has been sent.'),
      fix('replace-motherboard', 'The laptop is new and healthy.'),
    ],
    expectedFix: ['install-shared-printer'],
    hints: [
      'Check the driver and port list first: the printer is shared from the file server.',
      'Add it by its shared name rather than by IP, so the server keeps supplying the driver.',
      'Print a test page and confirm it comes out in the corridor, not just that the icon appeared.',
    ],
    explanation: [
      'This is a build task, not a repair: the printer is shared from the file server, and the new laptop has no connection to it. The driver and port list shows what is installed before you add anything.',
      'Adding it by its shared name lets the server hand over the right driver and keeps the queue in one place. Printing a test page is the verification — an icon is not a printed page.',
    ],
    backupRequired: false,
    verifyText: 'The shared printer is installed and prints a test page.',
    tools: ['print install', 'print queue', 'help'],
  },
  {
    id: 'qb-company-damaged',
    title: 'The QuickBooks company file will not open',
    difficulty: 3,
    category: 'quickbooks',
    platform: 'desktop',
    edition: 'Windows 11',
    symptom: 'QuickBooks reports the company file is damaged and closes.',
    report:
      '"It says the company file is damaged and to restore a backup. We invoice from it every day. The last backup is from last night."',
    subject: 'quickbooks',
    fault: { kind: 'qb-company-damaged' },
    evidence: [
      { check: 'qb-file', on: 'quickbooks' },
      { check: 'qb-backup', on: 'quickbooks' },
      { check: 'eventlog', on: 'os' },
    ],
    fixOptions: [
      fix('qb-rebuild', 'Run the rebuild tool on a copy of the company file, and check the log for what it recovered.'),
      fix('qb-restore-backup', 'Restore last night’s backup if the rebuild cannot recover the file.'),
      fix('qb-copy-local', 'Moving the file does not repair it, and it breaks the shared setup.'),
      fix('wipe-disk', 'The file is one file; wiping the disk loses the rest of the machine too.'),
    ],
    expectedFix: ['qb-rebuild'],
    hints: [
      'The company file log names which table failed, and the rebuild tool works on a copy.',
      'Check the backup list before you decide: a good backup is the fallback if the rebuild fails.',
      'Work on a copy, and do not move the file while the shared setup depends on its location.',
    ],
    explanation: [
      'QuickBooks has a rebuild utility for exactly this: it reads the damaged file, writes a clean one and logs what it could not carry over. The company file log names the damaged table, and the backup list tells you what the fallback is.',
      'Work on a copy so a failed rebuild does not destroy the only remaining data, and only fall back to the backup if the rebuild cannot recover. Moving the file locally would break the other users and repair nothing.',
    ],
    backupRequired: true,
    verifyText: 'The company file opens and the balances are intact.',
    tools: ['quickbooks /file', 'quickbooks /backup', 'eventvwr', 'help'],
  },
  {
    id: 'qb-multiuser',
    title: '“You cannot access the company file in multi-user mode”',
    difficulty: 3,
    category: 'quickbooks',
    platform: 'desktop',
    edition: 'Windows 11',
    symptom: 'The second user cannot open the company file; single-user works.',
    report:
      '"It works on the accounts PC. On mine it says the file is in use by someone else, or that multi-user mode is not set up. We both need it this afternoon."',
    subject: 'quickbooks',
    fault: { kind: 'qb-multiuser' },
    evidence: [
      { check: 'qb-multiuser', on: 'quickbooks' },
      { check: 'qb-file', on: 'quickbooks' },
      { check: 'eventlog', on: 'os' },
    ],
    fixOptions: [
      fix('qb-multiuser-fix', 'Run the QuickBooks Database Server Manager on the host and share the company folder correctly.'),
      fix('qb-rebuild', 'The file opens fine in single-user mode; it is not damaged.'),
      fix('qb-copy-local', 'A local copy makes the problem worse: two files, two sets of balances.'),
      fix('qb-activate', 'The licence is active and the first user is working.'),
    ],
    expectedFix: ['qb-multiuser-fix'],
    hints: [
      'Single-user working and multi-user not is a hosting and permissions problem, not a file problem.',
      'The multi-user setup report names the host, the shared folder and the ports it needs.',
      'Check the host’s firewall and the folder permissions before you touch the company file.',
    ],
    explanation: [
      'The company file is fine — it opens on the host. What is broken is the hosting: the Database Server Manager is not sharing the folder, or the firewall is blocking the port the second PC needs.',
      'Fixing the hosting setup keeps one file and one set of books. Copying the file locally would give two balances that nobody can reconcile, and rebuilding a healthy file fixes nothing.',
    ],
    backupRequired: true,
    verifyText: 'Both machines open the same company file in multi-user mode.',
    tools: ['quickbooks /multiuser', 'quickbooks /file', 'help'],
  },
  {
    id: 'qb-license',
    title: 'QuickBooks says the licence has expired',
    difficulty: 2,
    category: 'quickbooks',
    platform: 'desktop',
    edition: 'Windows 10',
    symptom: 'QuickBooks opens read-only and asks for activation.',
    report:
      '"It says my subscription has lapsed and I can only view. We renewed last month — the email is somewhere. I need to send invoices today."',
    subject: 'quickbooks',
    fault: { kind: 'qb-license' },
    evidence: [
      { check: 'qb-license', on: 'quickbooks' },
      { check: 'qb-file', on: 'quickbooks' },
    ],
    fixOptions: [
      fix('qb-activate', 'Sign in with the account that holds the subscription and re-activate the licence.'),
      fix('qb-rebuild', 'A licence prompt is not file damage.'),
      fix('qb-copy-local', 'The file is fine; the account is what needs to sign in.'),
      fix('reinstall-windows', 'Nothing on the operating system caused a subscription to lapse.'),
    ],
    expectedFix: ['qb-activate'],
    hints: [
      'Read the licence status first: it names the account and the expiry it is enforcing.',
      'The company file is fine — a lapsed licence opens read-only rather than damaging anything.',
      'Re-activate with the account that renewed, and confirm the expiry moves.',
    ],
    explanation: [
      'QuickBooks is enforcing a licence it believes has lapsed, so it opens the file read-only. The licence status names the account and the expiry date, which is the fact to check against the renewal.',
      'Signing in with the renewed account re-activates it. Rebuilding the file or moving it treats a licensing problem as a data problem, and neither touches the account.',
    ],
    backupRequired: true,
    verifyText: 'The licence reads active and QuickBooks opens for editing.',
    tools: ['quickbooks /license', 'quickbooks /file', 'help'],
  },
  {
    id: 'qb-restore',
    title: 'The company file is gone and the backup must go back',
    difficulty: 3,
    category: 'quickbooks',
    platform: 'desktop',
    edition: 'Windows 11',
    symptom: 'The company file is missing from its folder after a failed move.',
    report:
      '"I tried to move the company file to the new server and now it is not there. The backup drive is plugged in. Please tell me we have not lost the year."',
    subject: 'quickbooks',
    fault: { kind: 'qb-backup' },
    evidence: [
      { check: 'qb-backup', on: 'quickbooks' },
      { check: 'qb-file', on: 'quickbooks' },
      { check: 'eventlog', on: 'os' },
    ],
    fixOptions: [
      fix('qb-restore-backup', 'Restore the most recent verified backup into the shared folder, then check the balances.'),
      fix('qb-rebuild', 'There is no file to rebuild: it is not in the folder.'),
      fix('qb-copy-local', 'A local copy was what started this; it also hides the file from the other users.'),
      fix('wipe-disk', 'The backup drive is the thing that can save this.'),
    ],
    expectedFix: ['qb-restore-backup'],
    hints: [
      'List the backups and their timestamps before you restore anything.',
      'A restore replaces the missing file; it does not merge with it.',
      'Check the opening balances and the last invoice number after the restore, and tell the user what was lost.',
    ],
    explanation: [
      'The file is not in its folder, so there is nothing to repair. The backup list gives the newest verified copy, and restoring it puts the business back to the moment of that backup.',
      'A restore is a data-loss decision as much as a technical one: the entries made after the backup are gone, so the balances and the last invoice number have to be checked and the gap reported. That is what the follow-up step is for.',
    ],
    backupRequired: true,
    verifyText: 'The company file is back and opens with the restored balances.',
    tools: ['quickbooks /backup', 'quickbooks /file', 'help'],
  },
]
