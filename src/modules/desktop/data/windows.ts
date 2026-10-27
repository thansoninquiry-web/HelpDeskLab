import { FIX_LABELS, isDestructiveFix, type DesktopCase, type FixId, type FixOption } from '../types'

function fix(id: FixId, detail: string): FixOption {
  return { id, label: FIX_LABELS[id], detail, risk: isDestructiveFix(id) }
}

/**
 * Windows faults: four on supported Windows 10 and 11, three in Legacy mode.
 *
 * The legacy three are not nostalgia — they are the cases where the machine is
 * still doing useful work on an operating system nobody supports any more, and
 * the decision is as much "this should not be on the network" as "install the
 * driver". The tools are the same ones: Device Manager, Event Viewer, System
 * Configuration, System Restore.
 */
export const WINDOWS_CASES: readonly DesktopCase[] = [
  {
    id: 'win10-profile-service',
    title: '“User Profile Service failed the sign-in”',
    difficulty: 2,
    category: 'windows',
    platform: 'desktop',
    edition: 'Windows 10',
    symptom: 'A user cannot sign in; Windows loads a temporary profile instead.',
    report:
      '"It says my profile cannot be loaded and gives me a blank desktop. My files are gone. It started after it restarted for updates."',
    subject: 'os',
    fault: { kind: 'profile-service' },
    evidence: [
      { check: 'eventlog', on: 'os' },
      { check: 'safemode', on: 'os' },
      { check: 'sfc', on: 'os' },
    ],
    fixOptions: [
      fix('boot-safe-mode', 'Load the built-in administrator profile so the broken one is not in use while you work.'),
      fix('create-profile', 'Make a new profile and copy the user’s documents across from the old folder.'),
      fix('run-sfc', 'Repair the system files the profile service depends on.'),
      fix('reinstall-windows', 'A profile is not the installation; this destroys every user’s data.'),
      fix('wipe-disk', 'Nothing about a broken profile calls for this.'),
    ],
    expectedFix: ['boot-safe-mode', 'create-profile', 'run-sfc'],
    hints: [
      'The error names the profile service, and Event Viewer names the profile that failed to load.',
      'A temporary profile is Windows protecting itself: the old one is still on disk, under C:\\Users.',
      'Copy the data from the old profile before you delete anything — and run sfc afterwards to repair what caused it.',
    ],
    explanation: [
      'Windows loaded a temporary profile because the real one could not be read: the event log names the profile and the failure, and Safe Mode is how you get in without it being locked.',
      'The repair is a fresh profile plus the user’s data copied from the old folder, with sfc repairing the system files behind it. Reinstalling Windows throws away every profile to fix one.',
    ],
    backupRequired: true,
    verifyText: 'The user signs in to a working profile with their data.',
    tools: ['eventvwr', 'safe mode', 'sfc /scannow', 'help'],
  },
  {
    id: 'win10-driver-regression',
    title: 'The second monitor stopped after an update',
    difficulty: 2,
    category: 'windows',
    platform: 'desktop',
    edition: 'Windows 10',
    symptom: 'One display works, the second is not detected, and the screen flickers.',
    report:
      '"It was fine on Friday. On Monday only one screen works and the other one flickers. Windows did an update over the weekend."',
    subject: 'os',
    fault: { kind: 'driver-regression' },
    evidence: [
      { check: 'devicemgr', on: 'os' },
      { check: 'restore', on: 'os' },
      { check: 'eventlog', on: 'os' },
    ],
    fixOptions: [
      fix('rollback-driver', 'Use the driver’s Previous Version button, which restores the package the update replaced.'),
      fix('system-restore', 'A restore point works, but it takes the rest of the update with it.'),
      fix('install-driver', 'The device is present with a driver that starts — the wrong one, not a missing one.'),
      fix('replace-gpu', 'The card worked on Friday and the update is the only change.'),
    ],
    expectedFix: ['rollback-driver'],
    hints: [
      'Device Manager will show the display adapter with a warning, not as an unknown device.',
      'The driver’s own Previous Version button is the smallest change that undoes the update.',
      'Check the restore points as a fallback, and note what else they would roll back.',
    ],
    explanation: [
      'The only change between working and not working was the update, and Device Manager shows the display adapter with a warning: the new driver is installed and failing, not missing.',
      'Rolling the driver back is the narrow fix. A full System Restore also works but undoes everything else in that window, which is why it is the fallback rather than the first move.',
    ],
    backupRequired: false,
    verifyText: 'Both displays are detected and the picture is stable.',
    tools: ['devmgmt', 'system restore', 'eventvwr', 'help'],
  },
  {
    id: 'win11-slow-boot',
    title: 'Four minutes from power button to desktop',
    difficulty: 2,
    category: 'windows',
    platform: 'desktop',
    edition: 'Windows 11',
    symptom: 'Boots to a usable desktop in over four minutes; the disk is idle most of that time.',
    report:
      '"It is not broken, it is just slow. I press the button, go and get a coffee, and it is still on the spinning dots when I come back."',
    subject: 'os',
    fault: { kind: 'startup-load' },
    evidence: [
      { check: 'taskmgr', on: 'os' },
      { check: 'msconfig', on: 'os' },
      { check: 'eventlog', on: 'os' },
    ],
    fixOptions: [
      fix('disable-startup', 'Turn off the third-party startup entries, keeping the security and driver helpers.'),
      fix('replace-disk', 'SMART is clean and the disk is idle, so it is not waiting on storage.'),
      fix('reinstall-windows', 'Nothing here needs a rebuild; the startup list is the cause.'),
      fix('disable-antivirus', 'Turning off protection to make a machine faster is not a fix.'),
    ],
    expectedFix: ['disable-startup'],
    hints: [
      'A boot that waits is often a boot waiting for something that starts with Windows.',
      'Task Manager’s Startup tab ranks the impact of each entry.',
      'System Configuration shows the same entries and the services beside them; disable the third-party ones, not the security ones.',
    ],
    explanation: [
      'The machine is not doing work during those four minutes; it is waiting. Task Manager’s Startup tab names the entries with high impact, and the event log shows the desktop being held back by them.',
      'Disabling the third-party startup entries fixes it without touching the disk, Windows or the antivirus — and the antivirus entry is exactly the one that should stay on.',
    ],
    backupRequired: false,
    verifyText: 'The machine reaches a usable desktop in under a minute.',
    tools: ['taskmgr', 'msconfig', 'eventvwr', 'help'],
  },
  {
    id: 'win11-disk-missing',
    title: 'The new SSD does not appear in File Explorer',
    difficulty: 3,
    category: 'windows',
    platform: 'desktop',
    edition: 'Windows 11',
    symptom: 'A second disk is fitted and detected by the firmware, but has no drive letter.',
    report:
      '"I put the new drive in myself. The BIOS sees it, Windows does not. It is not in This PC at all."',
    subject: 'os',
    fault: { kind: 'disk-uninitialised' },
    evidence: [
      { check: 'diskmgmt', on: 'os' },
      { check: 'eventlog', on: 'os' },
      { check: 'post', on: 'os' },
    ],
    fixOptions: [
      fix('initialize-disk', 'Initialise the disk as GPT, which writes the partition table it is missing.'),
      fix('assign-drive-letter', 'Give the new volume a letter so File Explorer can show it.'),
      fix('wipe-disk', 'There is nothing on it to wipe — it has no partition table at all.'),
      fix('replace-disk', 'The firmware and Disk Management both see the disk; it is not dead.'),
    ],
    expectedFix: ['initialize-disk', 'assign-drive-letter'],
    hints: [
      'Disk Management shows the disk as unallocated or "not initialised" — that is the whole fault.',
      'A disk with no partition table has no volumes, so there is nothing to give a letter to yet.',
      'Initialise, create the volume, then assign the letter; a new disk is empty, so nothing is lost.',
    ],
    explanation: [
      'The drive is healthy and visible to the firmware; it simply has no partition table, so Windows has no volume to mount. Disk Management shows it as uninitialised, which is the diagnosis.',
      'Initialising as GPT and assigning a letter is the fix. This is also the one case where the backup step is about what is *not* on the disk: initialising the wrong disk erases it, so the checklist still applies.',
    ],
    backupRequired: true,
    verifyText: 'The new disk has a letter and appears in File Explorer.',
    tools: ['diskmgmt', 'eventvwr', 'help'],
  },
  {
    id: 'legacy-usb-driver',
    title: 'USB ports dead after a Windows 7 reinstall',
    difficulty: 2,
    category: 'legacy',
    platform: 'desktop',
    edition: 'Windows 7',
    symptom: 'No USB device works; Device Manager lists unknown devices with yellow marks.',
    report:
      '"We rebuilt the old machine for the stock room and now nothing on USB works. The mouse is dead, so I am using the keyboard on PS/2."',
    subject: 'os',
    fault: { kind: 'missing-driver' },
    evidence: [
      { check: 'devicemgr', on: 'os' },
      { check: 'eventlog', on: 'os' },
      { check: 'winver', on: 'os' },
    ],
    fixOptions: [
      fix('install-driver', 'Install the chipset and USB drivers for this model from the vendor’s support page.'),
      fix('rollback-driver', 'There is no previous driver to roll back to after a clean install.'),
      fix('reinstall-windows', 'The installation is fine; the drivers are missing.'),
      fix('replace-motherboard', 'Unknown devices are a driver gap, not a dead board.'),
    ],
    expectedFix: ['install-driver'],
    hints: [
      'Unknown devices in Device Manager after a reinstall mean Windows has no driver for them.',
      'Windows 7 does not carry the USB 3 driver for this chipset, so it must come from the vendor.',
      'Check the Windows version too: the machine is on an unsupported OS, which is its own finding.',
    ],
    explanation: [
      'A clean install of Windows 7 has no driver for this machine’s USB 3 controller, so every port that depends on it is an unknown device. Device Manager names them, and the vendor’s chipset package supplies them.',
      'Rolling back needs a previous driver that does not exist, and a reinstall installs the same gap. The unsupported OS is a separate finding worth raising: the machine works, but it should not be on the network long-term.',
    ],
    backupRequired: false,
    verifyText: 'The USB controller has a driver and the ports work.',
    tools: ['devmgmt', 'winver', 'eventvwr', 'help'],
  },
  {
    id: 'legacy-compat',
    title: 'The XP-era payroll program will not start',
    difficulty: 2,
    category: 'legacy',
    platform: 'desktop',
    edition: 'Windows 7',
    symptom: 'The program starts and closes immediately; Event Viewer logs an application error.',
    report:
      '"It has run on this machine for years. Now it opens for a second and disappears. Nothing changed except Windows updates."',
    subject: 'os',
    fault: { kind: 'compat-refusal' },
    evidence: [
      { check: 'eventlog', on: 'os' },
      { check: 'compat', on: 'os' },
      { check: 'taskmgr', on: 'os' },
    ],
    fixOptions: [
      fix('compatibility-mode', 'Set the program to run in Windows XP compatibility mode, for this user.'),
      fix('install-driver', 'The crash is in the application, not a device.'),
      fix('upgrade-windows', 'A newer Windows will not make an XP-era program happier.'),
      fix('reinstall-windows', 'The operating system is working; the program is refusing it.'),
    ],
    expectedFix: ['compatibility-mode'],
    hints: [
      'The application error names the program, and the compatibility tab is where old programs are made to behave.',
      'Compatibility mode can be set per program and per user; check which user is affected.',
      'The vendor may have a supported build — that is a follow-up, not a bench fix.',
    ],
    explanation: [
      'The program was written for Windows XP and is checking the version it is running on. The application error and the compatibility settings tab together explain the instant exit.',
      'Running it in XP compatibility mode is the smallest change that keeps the business working. The real follow-up is a supported version, which is why the checklist asks for one.',
    ],
    backupRequired: true,
    verifyText: 'The payroll program opens and stays open.',
    tools: ['eventvwr', 'taskmgr', 'help'],
  },
  {
    id: 'legacy-eol',
    title: 'A Windows 7 machine with no updates and a browser that refuses',
    difficulty: 3,
    category: 'legacy',
    platform: 'desktop',
    edition: 'Windows 7',
    symptom: 'Updates have been off for years, the browser will not load the finance portal.',
    report:
      '"The finance portal says my browser is out of date and will not let me in. Windows Update has been off since it kept breaking things."',
    subject: 'os',
    fault: { kind: 'unsupported-os' },
    evidence: [
      { check: 'winver', on: 'os' },
      { check: 'eventlog', on: 'os' },
      { check: 'restore', on: 'os' },
    ],
    fixOptions: [
      fix('upgrade-windows', 'Move the machine to a supported Windows, with the vendor’s compatibility check first.'),
      fix('enable-updates', 'Turn updates back on as part of the move, not instead of it.'),
      fix('disable-updates', 'Updates were switched off years ago and that is how the machine got here.'),
      fix('reinstall-windows', 'A reinstall of the same unsupported version changes nothing.'),
    ],
    expectedFix: ['upgrade-windows', 'enable-updates'],
    hints: [
      'The browser refusing is a symptom of the version, not a browser fault.',
      'Windows 7 has been out of support since January 2020: no security updates at all.',
      'Check what the machine is used for and what the finance portal requires before you plan the move.',
    ],
    explanation: [
      'The portal requires a current browser, and no current browser runs on Windows 7 — the version is the fault, not the browser. Windows 7 has had no security updates since January 2020, so the machine is also an unpatched risk on the network.',
      'The fix is a supported Windows with updates on. Reinstalling the same version, or turning updates off again, is what created the situation; the migration deserves a plan and a backup, not an afternoon.',
    ],
    backupRequired: true,
    verifyText: 'The machine runs a supported Windows with updates on, and the portal loads.',
    tools: ['winver', 'eventvwr', 'system restore', 'help'],
  },
]
