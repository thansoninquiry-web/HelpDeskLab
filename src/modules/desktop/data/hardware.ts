import { FIX_LABELS, isDestructiveFix, type DesktopCase, type FixId, type FixOption } from '../types'

/** One change the bench offers, with its label taken from the one table. */
function fix(id: FixId, detail: string): FixOption {
  return { id, label: FIX_LABELS[id], detail, risk: isDestructiveFix(id) }
}

/**
 * The hardware bench: ten machines that will not start, overheat, lose their
 * clock or lose a part.
 *
 * Each case names the reads that isolate it — the POST, the beep pattern, the
 * memory test, the SMART report — so the diagram and the console lead to the
 * same answer. Replacing a part that is not the fault is offered, because a real
 * bench offers it, and the scorer charges for it.
 */
export const HARDWARE_CASES: readonly DesktopCase[] = [
  {
    id: 'no-post-psu',
    title: 'The office PC is completely dead',
    difficulty: 1,
    category: 'hardware',
    platform: 'desktop',
    edition: 'Windows 11',
    symptom: 'Nothing happens when the power button is pressed — no fans, no lights.',
    report:
      '"I came in this morning and the machine under the desk is just dead. The socket is fine, my phone charger works in it."',
    subject: 'psu',
    fault: { kind: 'dead-psu' },
    evidence: [
      { check: 'post', on: 'os' },
      { check: 'psu', on: 'psu' },
    ],
    fixOptions: [
      fix('replace-psu', 'A dead supply cannot be repaired on the bench; swap it for a known-good unit of the same rating.'),
      fix('replace-motherboard', 'Only if the supply tests good and the board still gets no standby rail.'),
      fix('replace-cpu', 'A processor does not stop the fans from spinning.'),
      fix('replace-gpu', 'A graphics card cannot stop the machine from powering on.'),
    ],
    expectedFix: ['replace-psu'],
    hints: [
      'No fans and no lights is a power fault until something proves otherwise.',
      'Test the supply rails before condemning the board.',
      'A supply that reads 0 V on every rail is the fault, not the symptom.',
    ],
    explanation: [
      'A machine with no fans, no lights and no POST is not booting: it is not getting power. The supply is the first thing to prove, because everything else on the bench depends on it.',
      'Replacing the board first is the classic expensive guess. The rails either read correctly or they do not, and that reading is what separates a dead supply from a dead board.',
    ],
    backupRequired: false,
    verifyText: 'The machine powers on and reaches POST.',
    tools: ['post', 'test psu', 'help'],
  },
  {
    id: 'no-post-memory',
    title: 'Fans spin, no picture, and a beep pattern',
    difficulty: 2,
    category: 'hardware',
    platform: 'desktop',
    edition: 'Windows 11',
    symptom: 'The machine powers on, beeps once long and twice short, and never shows a picture.',
    report:
      '"It hums, then it beeps at me. Three beeps, I think. The screen stays black the whole time."',
    subject: 'ram-2',
    fault: { kind: 'unseated-ram', stick: 'ram-2' },
    evidence: [
      { check: 'post', on: 'os' },
      { check: 'beep', on: 'os' },
      { check: 'memtest', on: 'ram-2' },
    ],
    fixOptions: [
      fix('reseat-ram', 'Lift the module, clear the slot, and seat it until both clips click.'),
      fix('replace-ram', 'Only if reseating the module still leaves it undetected.'),
      fix('replace-motherboard', 'A beep pattern that names memory is not a board fault yet.'),
      fix('replace-gpu', 'The POST never reaches the graphics card.'),
    ],
    expectedFix: ['reseat-ram'],
    hints: [
      'One long and two short is the board telling you which subsystem failed POST.',
      'The report shows half the memory it should: one module is not being seen.',
      'Reseat before replacing — a module that is not fully home reads exactly like a dead one.',
    ],
    explanation: [
      'The beep pattern is the board naming the subsystem that failed POST. On this board, one long and two short is memory, and the hardware report confirms it: 8 GB seen of 16 GB installed.',
      'A module that is not fully seated reads as absent, so reseating costs nothing and fixes the common case. Replacing memory before reseating is paying for a part that was probably fine.',
    ],
    backupRequired: false,
    verifyText: 'Both modules are detected and POST completes.',
    tools: ['post', 'beep', 'memtest ram-2', 'help'],
  },
  {
    id: 'memory-bluescreens',
    title: 'Random blue screens on a machine that boots',
    difficulty: 2,
    category: 'hardware',
    platform: 'desktop',
    edition: 'Windows 10',
    symptom: 'Windows starts, then blue-screens at random through the day.',
    report:
      '"It runs fine for an hour and then just drops. It happened twice during a call. I have not lost any files."',
    subject: 'ram-1',
    fault: { kind: 'bad-ram', stick: 'ram-1' },
    evidence: [
      { check: 'memtest', on: 'ram-1' },
      { check: 'memtest', on: 'ram-2' },
      { check: 'eventlog', on: 'os' },
    ],
    fixOptions: [
      fix('replace-ram', 'Swap only the module the test fails, and test again afterwards.'),
      fix('reseat-ram', 'Worth trying first, but a module that fails a test is not just loose.'),
      fix('replace-motherboard', 'One failing module does not condemn the board.'),
      fix('replace-cpu', 'The memory controller is on the processor, but the test names the module.'),
    ],
    expectedFix: ['replace-ram'],
    hints: [
      'Blue screens with no pattern are a hardware suspect, and memory is the first test.',
      'Test the modules one at a time so the failing one is named.',
      'The other module passing is your control: it proves the slot and the board are fine.',
    ],
    explanation: [
      'A memory test that fails on one module and passes on the other isolates the fault to that module, not to the slot, the board or Windows.',
      'Testing both modules is what turns "the machine is unstable" into a part number. Replacing both, or the board, is a guess that costs more and teaches less.',
    ],
    backupRequired: false,
    verifyText: 'Both modules pass, and the machine boots with the full amount.',
    tools: ['memtest ram-1', 'memtest ram-2', 'eventvwr', 'help'],
  },
  {
    id: 'failing-drive',
    title: 'The laptop takes ten minutes to start',
    difficulty: 2,
    category: 'hardware',
    platform: 'laptop',
    edition: 'Windows 11',
    symptom: 'Boots slowly, freezes while opening files, and clicks from the drive bay.',
    report:
      '"It used to start in twenty seconds. Now I make a coffee. And there is a ticking noise when it is working."',
    subject: 'storage',
    fault: { kind: 'failing-disk' },
    evidence: [
      { check: 'smart', on: 'storage' },
      { check: 'post', on: 'os' },
      { check: 'eventlog', on: 'os' },
    ],
    fixOptions: [
      fix('replace-disk', 'Image or copy the data first, then fit a new drive and restore it.'),
      fix('replace-motherboard', 'The drive is reporting its own failure; the board is not in the path.'),
      fix('wipe-disk', 'Wiping a failing drive destroys the data and keeps the fault.'),
      fix('reinstall-windows', 'The hardware is failing, not the installation.'),
    ],
    expectedFix: ['replace-disk'],
    hints: [
      'A ticking drive with slow reads is a mechanical warning, not a Windows problem.',
      'Read SMART before you touch the filesystem: it is the drive reporting on itself.',
      'The backup comes before the replacement, not after it.',
    ],
    explanation: [
      'Slow reads, freezes and a click are the drive telling you it is on the way out. The SMART report confirms it, and Windows is only slow because every read is being retried.',
      'The fix is a new drive and the data restored onto it, which is why the checklist scores a backup before the change. Running chkdsk on a failing disk can finish it off, and reinstalling Windows fixes nothing.',
    ],
    backupRequired: true,
    verifyText: 'The drive reports healthy and the machine starts at normal speed.',
    tools: ['smart', 'chkdsk', 'eventvwr', 'help'],
  },
  {
    id: 'overheating-shutdown',
    title: 'The PC shuts down after twenty minutes',
    difficulty: 2,
    category: 'hardware',
    platform: 'desktop',
    edition: 'Windows 10',
    symptom: 'Fans run loud, the case is hot, and the machine powers off under load.',
    report:
      '"It is fine in the morning. By lunchtime the fan is roaring and it just cuts out. There is a lot of fluff in the front of it."',
    subject: 'cooler',
    fault: { kind: 'overheating' },
    evidence: [
      { check: 'temp', on: 'cooler' },
      { check: 'taskmgr', on: 'os' },
      { check: 'eventlog', on: 'os' },
    ],
    fixOptions: [
      fix('clean-cooler', 'Clear the dust from the heatsink and the intake, then check the fans spin freely.'),
      fix('replace-fan', 'Only if a fan still stalls after the dust is out.'),
      fix('replace-cpu', 'Heat is a cooling problem until the cooler is proven good.'),
      fix('replace-psu', 'A hot case causes shutdowns; a weak supply would drop under load, not after twenty minutes.'),
    ],
    expectedFix: ['clean-cooler'],
    hints: [
      'Shutdowns under load are a thermal signature: it works until it gets hot.',
      'Read the temperature under load, not at idle.',
      'The event log records a thermal shutdown, and the fix is airflow long before it is a part.',
    ],
    explanation: [
      'A machine that runs for twenty minutes and then shuts down is hitting its thermal limit. The temperature reading under load and the event log entry confirm it, and the dust in the intake explains it.',
      'Cleaning is the fix; replacing the cooler or the processor is the expensive way to learn that. A thermal shutdown protects the chip, so nothing is damaged yet — but every shutdown risks the work in progress.',
    ],
    backupRequired: false,
    verifyText: 'The temperature stays in range under load.',
    tools: ['temp', 'taskmgr', 'eventvwr', 'help'],
  },
  {
    id: 'cmos-clock-reset',
    title: 'The clock resets every morning',
    difficulty: 2,
    category: 'hardware',
    platform: 'desktop',
    edition: 'Windows 10',
    symptom: 'The date is years out, the machine asks for Setup at boot, and the time is wrong.',
    report:
      '"Every morning it tells me the date is 2011 and asks me to press F2. I set it, and the next day it has forgotten again."',
    subject: 'cmos',
    fault: { kind: 'cmos-battery' },
    evidence: [
      { check: 'cmos', on: 'cmos' },
      { check: 'post', on: 'os' },
      { check: 'eventlog', on: 'os' },
    ],
    fixOptions: [
      fix('replace-cmos', 'Fit a fresh CR2032 and set the clock once; the board keeps it from then on.'),
      fix('replace-motherboard', 'A flat coin cell is not a board fault.'),
      fix('replace-psu', 'The supply is fine: the machine starts every day, it just forgets.'),
      fix('reinstall-windows', 'Windows is not what forgets the date at power-on.'),
    ],
    expectedFix: ['replace-cmos'],
    hints: [
      'Settings that reset when the power is off point at what keeps them alive.',
      'The CMOS battery reading is the whole diagnosis.',
      'A clock that drifts while the machine runs is a different fault; this one forgets only when off.',
    ],
    explanation: [
      'The coin cell keeps the real-time clock and the firmware settings alive while the machine is unplugged. When it reads low, every cold start begins from a default date and a Setup prompt.',
      'Replacing the cell and setting the clock once is the whole fix. It also matters beyond the clock: certificate checks, file timestamps and domain sign-in all fail on a machine that thinks it is 2011.',
    ],
    backupRequired: false,
    verifyText: 'The clock keeps time across a power cycle.',
    tools: ['test cmos', 'post', 'eventvwr', 'help'],
  },
  {
    id: 'laptop-battery-dead',
    title: 'The laptop dies the moment it is unplugged',
    difficulty: 2,
    category: 'hardware',
    platform: 'laptop',
    edition: 'Windows 11',
    symptom: 'Runs on the charger, switches off instantly when the cable is pulled.',
    report:
      '"It is fine at my desk. The second I take it to a meeting it is dead. The battery symbol says it is full until I unplug it."',
    subject: 'battery',
    fault: { kind: 'dead-battery' },
    evidence: [
      { check: 'battery', on: 'battery' },
      { check: 'charger', on: 'charger' },
      { check: 'post', on: 'os' },
    ],
    fixOptions: [
      fix('replace-battery', 'Fit a new pack, then check the health report against the old one.'),
      fix('replace-charger', 'The machine charges, so the charger is doing its job.'),
      fix('replace-motherboard', 'A pack that reports 0 mWh is a pack, not a board.'),
    ],
    expectedFix: ['replace-battery'],
    hints: [
      'A machine that dies on unplug is running on the charger alone.',
      'The battery report gives design capacity against full-charge capacity.',
      'Test the charger too — proving it good is what makes the pack the fault.',
    ],
    explanation: [
      'The laptop is not "losing power"; it never had any stored. The battery report shows a pack at a fraction of its design capacity, and the charger test proves the supply is fine.',
      'Replacing the pack is the fix. The same report also warns of swelling, which is a safety issue rather than a convenience one — a swollen pack should come out of service, not be nursed along.',
    ],
    backupRequired: true,
    verifyText: 'The machine runs on the pack alone and reports healthy capacity.',
    tools: ['battery', 'charger', 'help'],
  },
  {
    id: 'charger-dead',
    title: 'The laptop will not charge at all',
    difficulty: 1,
    category: 'hardware',
    platform: 'laptop',
    edition: 'Windows 10',
    symptom: 'No charging light, battery draining even when plugged in.',
    report:
      '"It says plugged in, not charging. The light on the brick is out. I tried the socket and it is fine."',
    subject: 'charger',
    fault: { kind: 'dead-charger' },
    evidence: [
      { check: 'charger', on: 'charger' },
      { check: 'battery', on: 'battery' },
    ],
    fixOptions: [
      fix('replace-charger', 'Swap for a known-good charger of the same wattage and check the light.'),
      fix('replace-battery', 'The pack is holding charge; it is not being fed.'),
      fix('replace-motherboard', 'Test the charger before blaming the charging circuit.'),
    ],
    expectedFix: ['replace-charger'],
    hints: [
      'A dark brick and "plugged in, not charging" is the supply, not the pack.',
      'Measure the charger output, or substitute a known-good one.',
      'The battery report is the control: the pack itself is healthy.',
    ],
    explanation: [
      'The charger is not delivering power: the light is out and the machine is running on the pack until it is empty. Substituting a known-good charger or measuring its output isolates it in one step.',
      'Replacing the battery first is the common wrong turn — the pack is not the thing that stopped working. A charger of the wrong wattage will charge slowly or not at all, so match it.',
    ],
    backupRequired: false,
    verifyText: 'The machine charges from the new charger.',
    tools: ['charger', 'battery', 'help'],
  },
  {
    id: 'cracked-panel',
    title: 'The laptop screen cracked after a drop',
    difficulty: 1,
    category: 'hardware',
    platform: 'laptop',
    edition: 'Windows 11',
    symptom: 'A spider of cracks in the corner, with lines across the picture.',
    report:
      '"It slipped off the sofa. The picture still works in the middle but there is a crack and coloured lines down one side."',
    subject: 'screen',
    fault: { kind: 'cracked-screen' },
    evidence: [
      { check: 'display', on: 'screen' },
      { check: 'post', on: 'os' },
    ],
    fixOptions: [
      fix('replace-screen', 'Fit a replacement panel, and check the ribbon connector while the lid is open.'),
      fix('replace-gpu', 'The picture is being drawn; the panel it is drawn on is broken.'),
      fix('replace-motherboard', 'Damage in the lid does not reach the board.'),
      fix('reinstall-windows', 'Software cannot repair glass.'),
    ],
    expectedFix: ['replace-screen'],
    hints: [
      'Physical damage with a working picture is a panel, not a graphics fault.',
      'An external monitor proves the machine is drawing a picture correctly.',
      'Check the hinge and the ribbon while the lid is open — a drop that cracks glass can strain the cable too.',
    ],
    explanation: [
      'A cracked panel with a picture still visible in part of it is physical damage. Connecting an external display proves the graphics side is fine, which leaves the panel and its cable.',
      'The repair is a panel, and the checklist still matters: back up the machine before it goes on the bench, because a laptop that leaves the desk can come back without its data.',
    ],
    backupRequired: true,
    verifyText: 'The replacement panel shows a clean picture.',
    tools: ['test display', 'post', 'help'],
  },
  {
    id: 'keyboard-keys',
    title: 'Half the keyboard types nothing',
    difficulty: 1,
    category: 'hardware',
    platform: 'laptop',
    edition: 'Windows 10',
    symptom: 'A block of keys does not register; an external keyboard works fine.',
    report:
      '"The letters on the left are dead. I plugged in a USB keyboard and that works, so it is not me."',
    subject: 'keyboard',
    fault: { kind: 'keyboard-failure' },
    evidence: [
      { check: 'keyboard', on: 'keyboard' },
      { check: 'devicemgr', on: 'os' },
      { check: 'post', on: 'os' },
    ],
    fixOptions: [
      fix('replace-keyboard', 'Fit the keyboard assembly for this model; the ribbon is part of it.'),
      fix('install-driver', 'Device Manager shows the keyboard present and fine.'),
      fix('replace-motherboard', 'A block of dead keys is the membrane, not the board.'),
      fix('reinstall-windows', 'An external keyboard working rules out Windows.'),
    ],
    expectedFix: ['replace-keyboard'],
    hints: [
      'An external keyboard that works splits hardware from software.',
      'Device Manager reporting the keyboard healthy moves the fault to the keys themselves.',
      'A block of dead keys is a membrane or ribbon failure, not a driver.',
    ],
    explanation: [
      'The USB keyboard working is the control: Windows and the driver are fine. Device Manager agreeing leaves the built-in keyboard, and a contiguous block of dead keys is how a membrane fails.',
      'The assembly is replaced as one part, ribbon included. Reinstalling Windows or swapping the board would cost far more and leave the same dead keys.',
    ],
    backupRequired: true,
    verifyText: 'Every key registers on the built-in keyboard.',
    tools: ['test keyboard', 'devmgmt', 'help'],
  },
]
