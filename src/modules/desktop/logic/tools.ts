import {
  applied,
  blank,
  column,
  failure,
  line,
  muted,
  type ConsoleLine,
  type ConsoleResponse,
} from '../../shared/console'
import type { BenchEstate, CheckId, PartId } from '../types'
import { partById } from '../data/parts'

/**
 * The bench's tools.
 *
 * Each command reads the simulated machine and, when it is a real read, names
 * the check it recorded: the same check the case's evidence asks for. A tool
 * that changes nothing cannot change the score except by being a read, which is
 * exactly how the diagnosis is earned.
 */

export interface ToolOutcome extends ConsoleResponse {
  /** The check this read records, if it was a read. */
  check?: CheckId
  /** The part, OS or app the read was pointed at. */
  on?: string
}

interface RunContext {
  estate: BenchEstate
  subject: string
}

function partName(id: string): string {
  return partById(id)?.name ?? id
}

function postLines(estate: BenchEstate): ConsoleLine[] {
  if (estate.post.state === 'dead') {
    return [
      failure('No activity: fans stopped, no lights, no display output.'),
      muted('The machine is not reaching POST at all.'),
    ]
  }
  if (estate.post.state === 'beep') {
    return [
      line(`POST stops at the memory check. Beep pattern: ${estate.post.beeps ?? 'unknown'}.`),
      muted(`${estate.post.ramDetectedGb} GB of ${estate.post.ramExpectedGb} GB detected.`),
    ]
  }
  return [
    applied('POST completed.'),
    line(`Memory detected: ${estate.post.ramDetectedGb} GB of ${estate.post.ramExpectedGb} GB.`),
    line(`Display adapter initialised. Boot device found: ${estate.disk.detected ? 'yes' : 'no'}.`),
  ]
}

function memoryLines(estate: BenchEstate, stick: PartId): ConsoleLine[] {
  if (stick !== 'ram-1' && stick !== 'ram-2') {
    return [failure('Memory tests address ram-1 or ram-2.')]
  }
  const failing = estate.post.failing === stick
  const detected = estate.post.ramDetectedGb === estate.post.ramExpectedGb || stick === 'ram-1'
  if (failing) {
    return [
      failure(`${partName(stick)}: FAIL — errors at 0x00000000_1A44C120 and 0x00000000_7F02B880.`),
      muted('Run the test on the other module as a control before replacing anything.'),
    ]
  }
  if (!detected) {
    return [failure(`${partName(stick)}: not present in the slot.`)]
  }
  return [
    applied(`${partName(stick)}: PASS — 8 GB, 0 errors in one full pass.`),
    muted('A module that passes is not the fault, whatever the symptom looks like.'),
  ]
}

function tempLines(estate: BenchEstate): ConsoleLine[] {
  const verdict =
    estate.tempC >= 90 ? 'critical' : estate.tempC >= 80 ? 'high' : estate.tempC >= 70 ? 'warm' : 'normal'
  return [
    line(`CPU package: ${estate.tempC} °C (${verdict})`),
    line(`Case intake: ${Math.max(21, estate.tempC - 18)} °C · fan 2: ${estate.tempC > 80 ? '2,480 rpm' : '980 rpm'}`),
    ...(estate.tempC >= 90
      ? [failure('The processor is throttling, and the firmware has logged thermal shutdowns.')]
      : []),
  ]
}

function batteryLines(estate: BenchEstate): ConsoleLine[] {
  const battery = estate.battery
  return [
    line(`Design capacity: 52,000 mWh`),
    line(`Full charge capacity: ${battery.health.includes('0 Wh') ? '0' : '49,100'} mWh`),
    line(`Current charge: ${battery.chargePct}% · ${battery.charging ? 'charging' : 'not charging'}`),
    line(`Health: ${battery.health}`),
    ...(battery.chargePct === 0
      ? [failure('The pack reports no usable capacity. The machine cannot run on it.')]
      : []),
  ]
}

function chargerLines(estate: BenchEstate): ConsoleLine[] {
  if (estate.charger === 'dead') {
    return [
      failure('Charger output: 0.0 V — no output at the barrel connector.'),
      muted('The lamp on the brick is out. Try a known-good charger of the same wattage.'),
    ]
  }
  return [applied('Charger output: 19.5 V, 3.34 A (65 W). The brick is delivering power.')]
}

function smartLines(estate: BenchEstate): ConsoleLine[] {
  return [
    ...estate.disk.smart.split('\n').map((text) => line(text)),
    estate.disk.health === 'failing'
      ? failure('The drive is reporting its own failure. Copy the data off it before anything else.')
      : applied('The drive reports healthy.'),
  ]
}

function diskMgmtLines(estate: BenchEstate): ConsoleLine[] {
  const rows = estate.disks.map(
    (disk) =>
      `${column(disk.name, 8)}${column(String(disk.sizeGb) + ' GB', 10)}${column(disk.fs ?? '—', 7)}${column(
        disk.status,
        54,
      )}${disk.freeGb === null ? '—' : `${disk.freeGb} GB free`}`,
  )
  return [
    muted('Volume ###  Size      File system  Status                                                Free'),
    ...rows.map((row) => line(row)),
    ...(estate.disk.initialised
      ? []
      : [
          failure(
            `Disk 1 is present and unallocated: no partition table. Right-click to initialise it.`,
          ),
        ]),
    ...(estate.disk.initialised && estate.disk.letter === null
      ? [muted('The new volume has no drive letter yet, so File Explorer cannot show it.')]
      : []),
  ]
}

function eventLines(estate: BenchEstate): ConsoleLine[] {
  return estate.events.map(
    (event) =>
      line(
        `${event.level === 'error' ? 'Error  ' : event.level === 'warning' ? 'Warning' : 'Info   '}  ${event.source}  ${event.id}  ${event.message}`,
      ),
  )
}

function deviceLines(estate: BenchEstate): ConsoleLine[] {
  return estate.devices.map((device) =>
    line(
      `${column(device.name, 26)}${column(device.status, 9)}${device.detail}`,
    ),
  )
}

function startupLines(estate: BenchEstate): ConsoleLine[] {
  return [
    line(`Boot time: ${estate.windows.bootSeconds} seconds`),
    muted('Startup  Name                              Impact    State'),
    ...estate.startup.map((row) =>
      line(`${column(row.name, 34)}${column(row.impact, 10)}${row.enabled ? 'enabled' : 'disabled'}`),
    ),
  ]
}

function sfcLines(estate: BenchEstate): ConsoleLine[] {
  const broken = estate.windows.signIn === 'fails'
  return [
    muted('Beginning verification phase of system scan.'),
    line('Verification 100% complete.'),
    broken
      ? failure('Windows Resource Protection found corrupt files and successfully repaired them.')
      : applied('Windows Resource Protection did not find any integrity violations.'),
    ...(broken ? [muted('A repair is not a new profile: the broken profile still fails to load.')] : []),
  ]
}

function chkdskLines(estate: BenchEstate): ConsoleLine[] {
  if (estate.disk.health === 'failing') {
    return [
      line('Stage 1: examining basic file system structure …'),
      failure('The disk has bad sectors that could not be repaired.'),
      muted('A repair pass cannot fix a drive that fails its own SMART report.'),
    ]
  }
  return [
    line('Stage 1: examining basic file system structure …'),
    applied('Windows has scanned the file system and found no problems.'),
  ]
}

function restoreLines(estate: BenchEstate): ConsoleLine[] {
  return [
    muted('Restore points available:'),
    ...estate.restorePoints.map((point) => line(`· ${point}`)),
    muted('A restore rolls back everything in the window, not only the driver.'),
  ]
}

function winverLines(estate: BenchEstate): ConsoleLine[] {
  return [
    line(`${estate.windows.edition} · ${estate.windows.build}`),
    line(`Support: ${estate.windows.supported ? 'in support' : 'out of support — no security updates'}`),
    line(`Activation: ${estate.windows.activation} · Updates: ${estate.windows.updates}`),
    line(`Signed in: ${estate.windows.signIn === 'ok' ? 'yes' : 'no — temporary profile'}`),
  ]
}

function outlookLines(estate: BenchEstate): ConsoleLine[] {
  return [
    muted('Mail (Microsoft Outlook) · Profiles'),
    line(`Outlook — ${estate.outlook.profile === 'corrupt' ? 'cannot be opened (0x8004010F)' : 'loaded'}`),
    line('Data file: C:\\Users\\dana\\AppData\\Local\\Microsoft\\Outlook\\dana@ashfield.ost'),
    ...(estate.outlook.profile === 'corrupt'
      ? [failure('The profile is damaged. The mailbox on the server is unaffected.')]
      : []),
  ]
}

function officeLines(estate: BenchEstate): ConsoleLine[] {
  return [
    muted('Add-ins loaded with Word:'),
    line(`${column('Smart Connect', 30)}${estate.office.addin ? 'enabled (installed today)' : 'disabled'}`),
    line(`${column('Spelling & Grammar', 30)}enabled`),
    ...(estate.office.addin
      ? [failure('An add-in that loads with the crashing document is the first suspect.')]
      : [applied('No third-party add-in is loading.')]),
  ]
}

function printerLines(estate: BenchEstate): ConsoleLine[] {
  return [
    line(`Printer: Office Corridor (shared from \\\\FS01)`),
    line(`Installed: ${estate.printer.installed ? 'yes' : 'no'} · Status: ${estate.printer.status}`),
    line(`Jobs in queue: ${estate.printer.queue}`),
    ...(estate.printer.queue > 0
      ? [failure('A job is stuck. The printer itself will still print a test page.')]
      : []),
  ]
}

function driverLines(estate: BenchEstate): ConsoleLine[] {
  return [
    muted('Ports and drivers on this PC:'),
    line(`${column('Office Corridor', 28)}${column('HP Universal', 24)}${estate.printer.installed ? 'installed' : 'not installed'}`),
    line(`${column('Microsoft Print to PDF', 28)}${column('Microsoft', 24)}installed`),
    ...(estate.printer.installed ? [] : [muted('Add the printer by its shared name so the server supplies the driver.')]),
  ]
}

function quickBooksFileLines(estate: BenchEstate): ConsoleLine[] {
  const state = estate.quickbooks.companyFile
  return [
    muted('QBWin.log · company file'),
    line(`Company: Ashfield Trading Ltd · file: \\\\FS01\\Books\\Ashfield.qbw`),
    line(`Integrity: ${state === 'ok' ? 'passed' : 'failed (error 6144, damaged table)'}`),
    state === 'ok'
      ? applied('The company file opens.')
      : failure('The company file is damaged or missing. Work on a copy, and check the backups.'),
  ]
}

function quickBooksMultiUserLines(estate: BenchEstate): ConsoleLine[] {
  const broken = estate.quickbooks.multiUser === 'error'
  return [
    muted('QuickBooks Database Server Manager · host FS01'),
    line(`Shared folder: \\\\FS01\\Books · port 8019`),
    line(`Hosting: ${broken ? 'not sharing the folder' : 'sharing'}`),
    line(`Firewall: ${broken ? 'blocking 8019/tcp' : '8019/tcp allowed'}`),
    broken
      ? failure('The second PC cannot reach the host. The company file itself is fine.')
      : applied('Both machines can open the file in multi-user mode.'),
  ]
}

function quickBooksLicenseLines(estate: BenchEstate): ConsoleLine[] {
  const expired = estate.quickbooks.license === 'expired'
  return [
    muted('QuickBooks · licence status'),
    line(`Account: accounts@ashfield-trading.example`),
    line(`Status: ${expired ? 'expired (read-only mode)' : 'active'}`),
    expired
      ? failure('QuickBooks is enforcing an expiry. Sign in with the renewed account.')
      : applied('The licence is active for this company file.'),
  ]
}

function quickBooksBackupLines(estate: BenchEstate): ConsoleLine[] {
  return [
    muted('Backups found on the backup drive:'),
    line('· Ashfield_2026-10-25_2200.qbb — verified, 41.2 MB'),
    line('· Ashfield_2026-10-18_2200.qbb — verified, 39.8 MB'),
    estate.quickbooks.backup === 'restored'
      ? applied('A backup has been restored into the shared folder.')
      : muted('Restoring replaces the missing file; anything entered after the backup is lost.'),
  ]
}

/** The aliases a learner is likely to type, mapped to the part they mean. */
const PART_ALIASES: Record<string, PartId> = {
  psu: 'psu',
  power: 'psu',
  cpu: 'cpu',
  processor: 'cpu',
  motherboard: 'motherboard',
  board: 'motherboard',
  ram: 'ram-1',
  'ram-1': 'ram-1',
  'ram-2': 'ram-2',
  memory: 'ram-1',
  gpu: 'gpu',
  graphics: 'gpu',
  cooler: 'cooler',
  fan: 'cooler',
  cmos: 'cmos',
  battery: 'battery',
  charger: 'charger',
  screen: 'screen',
  panel: 'screen',
  keyboard: 'keyboard',
}

function partTest(estate: BenchEstate, part: PartId): ToolOutcome {
  const entry = partById(part)
  if (!entry) {
    return { lines: [failure(`There is no part called ${part} on this machine.`)] }
  }
  const header = [muted(`${entry.name} · ${entry.role}`)]
  switch (entry.test) {
    case 'psu':
      return {
        lines: [
          ...header,
          ...(estate.post.state === 'dead'
            ? [
                line('12 V rail: 0.00 V · 5 V rail: 0.00 V · 3.3 V rail: 0.00 V'),
                failure('No rails at all. The supply is not starting.'),
              ]
            : [applied('12 V: 12.04 V · 5 V: 5.02 V · 3.3 V: 3.31 V — within tolerance.')]),
        ],
        check: 'psu',
        on: part,
      }
    case 'memtest':
      return { lines: [...header, ...memoryLines(estate, part)], check: 'memtest', on: part }
    case 'smart':
      return { lines: [...header, ...smartLines(estate)], check: 'smart', on: part }
    case 'temp':
      return { lines: [...header, ...tempLines(estate)], check: 'temp', on: part }
    case 'cmos':
      return {
        lines: [
          ...header,
          line(`CMOS battery: ${estate.cmos === 'ok' ? '3.08 V' : '2.41 V — below the 2.6 V threshold'}`),
          ...(estate.cmos === 'ok'
            ? [applied('The cell is holding the clock and the firmware settings.')]
            : [failure('The cell is flat: every cold start begins from a default date.')]),
        ],
        check: 'cmos',
        on: part,
      }
    case 'battery':
      return { lines: [...header, ...batteryLines(estate)], check: 'battery', on: part }
    case 'charger':
      return { lines: [...header, ...chargerLines(estate)], check: 'charger', on: part }
    case 'display':
      return {
        lines: [
          ...header,
          ...(estate.screen === 'cracked'
            ? [
                line('Panel: cracked in the top-right corner, with vertical lines.'),
                failure('Physical damage to the panel; the picture behind it is being drawn correctly.'),
              ]
            : [
                line(`External display: ${estate.devices.find((device) => device.name === 'Display adapter')?.status === 'ok' ? 'stable picture' : 'flicker and one display missing'}`),
                estate.devices.find((device) => device.name === 'Display adapter')?.status === 'ok'
                  ? applied('Panel and cable test clean.')
                  : muted('The panel is fine; the adapter driving it is not.'),
              ]),
        ],
        check: 'display',
        on: part,
      }
    case 'keyboard':
      return {
        lines: [
          ...header,
          ...(estate.keyboard === 'ok'
            ? [applied('All keys report, including the function row.')]
            : [failure('Keys E, D, C and X do not report. An external keyboard works.')]),
        ],
        check: 'keyboard',
        on: part,
      }
    case 'post':
      return { lines: [...header, ...postLines(estate)], check: 'post', on: part }
    default:
      return { lines: [...header, muted('No test is defined for this part.')] }
  }
}

const HELP = [
  'post                     power-on self test and beep pattern',
  'test <part>              test a part: psu, ram-1, ram-2, storage, cooler, cmos, ...',
  'memtest [ram-1|ram-2]    memory test on one module',
  'smart | temp | battery | charger | display | keyboard',
  'taskmgr | devmgmt.msc | eventvwr | diskmgmt.msc | msconfig',
  'safe mode                Safe Mode options',
  'sfc /scannow             repair system files',
  'chkdsk                   check the disk',
  'system restore           list restore points',
  'winver                   Windows version and support status',
  'outlook /profiles        Outlook profiles',
  'word /addins             Office add-ins',
  'print queue | print install',
  'quickbooks /file | /multiuser | /license | /backup',
  'compat                   program compatibility settings',
  'clear                    clear the console',
]

export function runTool(context: RunContext, input: string): ToolOutcome {
  const estate = context.estate
  const command = input.trim()
  const lower = command.toLowerCase()
  const words = lower.split(/\s+/)

  if (lower.length === 0) {
    return { lines: [] }
  }
  if (lower === 'clear' || lower === 'cls') {
    return { lines: [], cleared: true }
  }
  if (lower === 'help' || lower === '?') {
    return { lines: [muted('Simulated bench tools. Nothing here changes the machine.'), ...HELP.map(line)] }
  }

  if (lower === 'post' || lower === 'test post') {
    return { lines: postLines(estate), check: 'post', on: 'os' }
  }
  if (lower === 'beep' || lower === 'beep codes') {
    if (estate.post.state !== 'beep') {
      return {
        lines: [muted('The POST did not beep. Check the pattern again while the machine starts.')],
        check: 'beep',
        on: 'os',
      }
    }
    return {
      lines: [
        line(`Pattern: ${estate.post.beeps ?? 'unknown'}`),
        muted('One long, two short — memory. Check the modules are seated before replacing any.'),
      ],
      check: 'beep',
      on: 'os',
    }
  }

  if (words[0] === 'test') {
    const target = words.slice(1).join(' ')
    if (target.length === 0) {
      return { lines: [failure('Which part? Try `test psu` or `test ram-2`.')] }
    }
    const part = PART_ALIASES[target]
    if (!part) {
      return { lines: [failure(`There is no part called ${target} on this machine.`)] }
    }
    return partTest(estate, part)
  }

  if (lower.startsWith('memtest')) {
    const target = words[1] ?? 'ram-1'
    const part = PART_ALIASES[target] ?? 'ram-1'
    return partTest(estate, part)
  }
  if (lower === 'smart') {
    return partTest(estate, 'storage')
  }
  if (lower === 'temp' || lower === 'temps') {
    return partTest(estate, 'cooler')
  }
  if (lower === 'battery' || lower === 'powercfg /batteryreport') {
    return partTest(estate, 'battery')
  }
  if (lower === 'charger') {
    return partTest(estate, 'charger')
  }
  if (lower === 'display' || lower === 'test screen') {
    return partTest(estate, 'screen')
  }
  if (lower === 'keyboard') {
    return partTest(estate, 'keyboard')
  }

  if (lower === 'taskmgr' || lower === 'task manager') {
    return {
      lines: [
        muted('Processes  ·  Performance  ·  Startup'),
        line(`${column('VendorUpdater.exe', 26)}${column('12.4% CPU', 14)}2,140 MB · high startup impact`),
        line(`${column('OUTLOOK.EXE', 26)}${column('1.2% CPU', 14)}420 MB`),
        line(`${column('explorer.exe', 26)}${column('0.4% CPU', 14)}180 MB`),
        ...(estate.windows.bootSeconds > 60
          ? [failure(`Startup impact: VendorUpdater is holding the desktop for ${estate.windows.bootSeconds} seconds.`)]
          : []),
      ],
      check: 'taskmgr',
      on: 'os',
    }
  }
  if (lower === 'devmgmt' || lower === 'devmgmt.msc' || lower === 'device manager') {
    return { lines: deviceLines(estate), check: 'devicemgr', on: 'os' }
  }
  if (lower === 'eventvwr' || lower === 'eventvwr.msc' || lower === 'event viewer') {
    return { lines: eventLines(estate), check: 'eventlog', on: 'os' }
  }
  if (lower === 'diskmgmt' || lower === 'diskmgmt.msc' || lower === 'disk management') {
    return { lines: diskMgmtLines(estate), check: 'diskmgmt', on: 'os' }
  }
  if (lower === 'msconfig' || lower === 'system configuration') {
    return { lines: startupLines(estate), check: 'msconfig', on: 'os' }
  }
  if (lower === 'safe mode' || lower === 'safemode' || lower === 'msconfig /safe') {
    return {
      lines: [
        muted('Advanced boot options:'),
        line('· Safe Mode — minimal drivers, no startup apps'),
        line('· Safe Mode with Networking — adds the network stack'),
        line('· Safe Mode with Command Prompt'),
        muted('Safe Mode proves a fault is in a driver or a startup entry; it does not repair it.'),
        estate.windows.safeMode ? applied('The machine will boot into Safe Mode next time.') : blank(),
      ],
      check: 'safemode',
      on: 'os',
    }
  }
  if (lower === 'sfc /scannow' || lower === 'sfc' || lower === 'sfc/scannow') {
    return { lines: sfcLines(estate), check: 'sfc', on: 'os' }
  }
  if (lower === 'chkdsk' || lower === 'chkdsk /f' || lower === 'chkdsk c: /f') {
    return { lines: chkdskLines(estate), check: 'chkdsk', on: 'os' }
  }
  if (lower === 'system restore' || lower === 'rstrui' || lower === 'restore points') {
    return { lines: restoreLines(estate), check: 'restore', on: 'os' }
  }
  if (lower === 'winver') {
    return { lines: winverLines(estate), check: 'winver', on: 'os' }
  }
  if (lower === 'outlook /profiles' || lower === 'outlook' || lower === 'mail') {
    return { lines: outlookLines(estate), check: 'outlook-profiles', on: 'outlook' }
  }
  if (lower === 'word /addins' || lower === 'excel /addins' || lower === 'addins') {
    return { lines: officeLines(estate), check: 'office-addins', on: 'word' }
  }
  if (lower === 'print queue' || lower === 'printers' || lower === 'print') {
    return { lines: printerLines(estate), check: 'print-queue', on: 'printer' }
  }
  if (lower === 'print install' || lower === 'print drivers' || lower === 'print /drivers') {
    return { lines: driverLines(estate), check: 'print-drivers', on: 'printer' }
  }
  if (lower === 'quickbooks /file' || lower === 'quickbooks' || lower === 'qb /file') {
    return { lines: quickBooksFileLines(estate), check: 'qb-file', on: 'quickbooks' }
  }
  if (lower === 'quickbooks /multiuser' || lower === 'qb /multiuser') {
    return { lines: quickBooksMultiUserLines(estate), check: 'qb-multiuser', on: 'quickbooks' }
  }
  if (lower === 'quickbooks /license' || lower === 'qb /license') {
    return { lines: quickBooksLicenseLines(estate), check: 'qb-license', on: 'quickbooks' }
  }
  if (lower === 'quickbooks /backup' || lower === 'qb /backup') {
    return { lines: quickBooksBackupLines(estate), check: 'qb-backup', on: 'quickbooks' }
  }
  if (lower === 'compat' || lower === 'compatibility') {
    return {
      lines: [
        muted('Properties · Compatibility'),
        line(
          estate.fixes.includes('compatibility-mode')
            ? 'Run this program in compatibility mode for: Windows XP (Service Pack 3)'
            : 'Run this program in compatibility mode for: not set',
        ),
        line('Run as administrator: off'),
        muted(
          'A program written for an older Windows can be told which version to expect, per user.',
        ),
      ],
      check: 'compat',
      on: 'os',
    }
  }

  if (words[0] === 'replace' || words[0] === 'fix' || words[0] === 'swap') {
    return {
      lines: [
        failure('Changes are made with the bench buttons, not from the console.'),
        muted('The console only reads; the action bar is where a part is replaced, so the record is kept.'),
      ],
    }
  }

  return {
    lines: [
      failure(`The bench has no tool called “${command}”.`),
      muted('Type help for the commands it does have.'),
    ],
  }
}

/** The check a part test records, for the diagram's Test button. */
export function testPart(estate: BenchEstate, part: PartId): ToolOutcome {
  return partTest(estate, part)
}

/**
 * The command that performs a given read, for a button that runs one without
 * making the learner type it. One table, so a shortcut and the console cannot
 * diverge.
 */
const READ_COMMANDS: Readonly<Record<CheckId, string>> = {
  post: 'post',
  beep: 'beep',
  psu: 'test psu',
  memtest: 'memtest ram-1',
  smart: 'smart',
  temp: 'temp',
  cmos: 'test cmos',
  battery: 'battery',
  charger: 'charger',
  display: 'test screen',
  keyboard: 'test keyboard',
  taskmgr: 'taskmgr',
  devicemgr: 'devmgmt',
  eventlog: 'eventvwr',
  diskmgmt: 'diskmgmt',
  msconfig: 'msconfig',
  safemode: 'safe mode',
  winver: 'winver',
  sfc: 'sfc /scannow',
  chkdsk: 'chkdsk',
  restore: 'system restore',
  'outlook-profiles': 'outlook /profiles',
  'office-addins': 'word /addins',
  'print-queue': 'print queue',
  'print-drivers': 'print install',
  'qb-file': 'quickbooks /file',
  'qb-multiuser': 'quickbooks /multiuser',
  'qb-license': 'quickbooks /license',
  'qb-backup': 'quickbooks /backup',
  compat: 'compat',
}

export function commandFor(check: CheckId, on: string): string {
  // The two reads that are about a named part need the part in the command.
  if (check === 'memtest') {
    return `memtest ${on}`
  }
  if (check === 'display') {
    return `test ${on}`
  }
  return READ_COMMANDS[check]
}
