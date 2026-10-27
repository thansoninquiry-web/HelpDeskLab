/**
 * The Desktop Support module's own vocabulary.
 *
 * A bench, a machine and the software on it, not a ticket world and not a
 * network. Like the consoles beside it the module is meant to be lifted out
 * whole, so nothing here is shared with `World`; it imports the app only for the
 * scoring thresholds and the progress shapes it publishes into.
 */

/** The parts a technician can point at, test or replace. */
export type PartId =
  | 'psu'
  | 'motherboard'
  | 'cpu'
  | 'ram-1'
  | 'ram-2'
  | 'gpu'
  | 'cooler'
  | 'cmos'
  | 'storage'
  | 'battery'
  | 'charger'
  | 'screen'
  | 'keyboard'

export type PartArea = 'case' | 'laptop'

export interface BenchPart {
  id: PartId
  name: string
  area: PartArea
  role: string
  /** The test that tells a learner whether this part is good. */
  test: CheckId
  /** What a failing one looks like in the report, in one line. */
  failure: string
}

/** Which Windows the bench machine runs. */
export type WindowsEdition = 'Windows 11' | 'Windows 10' | 'Windows 7' | 'Windows XP'

export type CaseCategory = 'hardware' | 'windows' | 'legacy' | 'application' | 'quickbooks'

export type AppId = 'outlook' | 'word' | 'excel' | 'printer' | 'quickbooks'

/**
 * One injected fault, read by the estate builder.
 *
 * A closed union, so a case cannot name a fault the estate does not know how to
 * apply, and a test can walk every case.
 */
export type Fault =
  | { kind: 'none' }
  | { kind: 'dead-psu' }
  | { kind: 'unseated-ram'; stick: 'ram-1' | 'ram-2' }
  | { kind: 'bad-ram'; stick: 'ram-1' | 'ram-2' }
  | { kind: 'failing-disk' }
  | { kind: 'overheating' }
  | { kind: 'cmos-battery' }
  | { kind: 'dead-battery' }
  | { kind: 'dead-charger' }
  | { kind: 'cracked-screen' }
  | { kind: 'keyboard-failure' }
  | { kind: 'profile-service' }
  | { kind: 'driver-regression' }
  | { kind: 'startup-load' }
  | { kind: 'disk-uninitialised' }
  | { kind: 'missing-driver' }
  | { kind: 'compat-refusal' }
  | { kind: 'unsupported-os' }
  | { kind: 'outlook-profile' }
  | { kind: 'office-addin' }
  | { kind: 'spooler-jam' }
  | { kind: 'printer-not-installed' }
  | { kind: 'qb-company-damaged' }
  | { kind: 'qb-multiuser' }
  | { kind: 'qb-license' }
  | { kind: 'qb-backup' }

/** Every change the module can make. Order is the order the reference paths use. */
export const DESKTOP_FIXES = [
  'reseat-ram',
  'replace-ram',
  'replace-psu',
  'replace-cmos',
  'clean-cooler',
  'replace-fan',
  'replace-disk',
  'replace-battery',
  'replace-charger',
  'replace-screen',
  'replace-keyboard',
  'boot-safe-mode',
  'run-sfc',
  'create-profile',
  'rollback-driver',
  'system-restore',
  'install-driver',
  'disable-startup',
  'initialize-disk',
  'assign-drive-letter',
  'compatibility-mode',
  'upgrade-windows',
  'enable-updates',
  'new-outlook-profile',
  'repair-office',
  'disable-addin',
  'clear-print-queue',
  'restart-spooler',
  'install-shared-printer',
  'qb-rebuild',
  'qb-multiuser-fix',
  'qb-activate',
  'qb-restore-backup',
  // Plausible changes that do not fix these cases. The action bar offers them
  // because a real bench offers them, and the scorer charges for taking one.
  'replace-motherboard',
  'replace-cpu',
  'replace-gpu',
  'wipe-disk',
  'reinstall-windows',
  'disable-updates',
  'disable-antivirus',
  'qb-copy-local',
] as const

export type FixId = (typeof DESKTOP_FIXES)[number]

/** Changes that take something away, priced higher when taken at random. */
export const DESTRUCTIVE_FIXES: readonly FixId[] = [
  'replace-motherboard',
  'replace-cpu',
  'replace-gpu',
  'wipe-disk',
  'reinstall-windows',
  'disable-updates',
  'disable-antivirus',
]

/**
 * Changes that can lose the data on the machine. The checklist's backup step is
 * scored against the first of these, not against the first change of any kind.
 */
export const DATA_RISK_FIXES: readonly FixId[] = [
  'replace-disk',
  'wipe-disk',
  'reinstall-windows',
  'initialize-disk',
  'repair-office',
  'qb-rebuild',
  'qb-restore-backup',
]

export const FIX_LABELS: Record<FixId, string> = {
  'reseat-ram': 'Reseat the memory modules',
  'replace-ram': 'Replace the faulty memory module',
  'replace-psu': 'Replace the power supply unit',
  'replace-cmos': 'Replace the CMOS battery',
  'clean-cooler': 'Clean the cooler and vents',
  'replace-fan': 'Replace the failed fan',
  'replace-disk': 'Replace the failing drive',
  'replace-battery': 'Replace the laptop battery',
  'replace-charger': 'Replace the charger',
  'replace-screen': 'Replace the cracked panel',
  'replace-keyboard': 'Replace the keyboard',
  'boot-safe-mode': 'Boot into Safe Mode',
  'run-sfc': 'Run sfc /scannow to repair the system files',
  'create-profile': 'Create a fresh user profile',
  'rollback-driver': 'Roll the display driver back',
  'system-restore': 'Restore the machine to an earlier restore point',
  'install-driver': 'Install the missing driver',
  'disable-startup': 'Disable the startup apps',
  'initialize-disk': 'Initialise the new disk',
  'assign-drive-letter': 'Assign the disk a drive letter',
  'compatibility-mode': 'Run the program in compatibility mode',
  'upgrade-windows': 'Move the machine to a supported Windows',
  'enable-updates': 'Turn updates back on',
  'new-outlook-profile': 'Create a new Outlook profile',
  'repair-office': 'Repair the Office installation',
  'disable-addin': 'Disable the crashing add-in',
  'clear-print-queue': 'Clear the stuck print queue',
  'restart-spooler': 'Restart the Print Spooler service',
  'install-shared-printer': 'Install the shared network printer',
  'qb-rebuild': 'Rebuild the QuickBooks company file',
  'qb-multiuser-fix': 'Fix the multi-user hosting setup',
  'qb-activate': 'Re-activate the QuickBooks licence',
  'qb-restore-backup': 'Restore the QuickBooks backup',
  'replace-motherboard': 'Replace the motherboard',
  'replace-cpu': 'Replace the processor',
  'replace-gpu': 'Replace the graphics card',
  'wipe-disk': 'Wipe the drive and start over',
  'reinstall-windows': 'Reinstall Windows',
  'disable-updates': 'Turn Windows Update off',
  'disable-antivirus': 'Disable the antivirus',
  'qb-copy-local': 'Move the company file to the local drive',
}

/** One read a tool or a part test performs. */
export const CHECKS = {
  post: { label: 'Watch the power-on self test', area: 'bench' },
  beep: { label: 'Look up the POST beep pattern', area: 'bench' },
  psu: { label: 'Test the power supply rails', area: 'part' },
  memtest: { label: 'Run a memory test', area: 'part' },
  smart: { label: 'Read the drive SMART report', area: 'part' },
  temp: { label: 'Read the CPU and case temperature', area: 'part' },
  cmos: { label: 'Check the CMOS battery voltage', area: 'part' },
  battery: { label: 'Read the battery report', area: 'part' },
  charger: { label: 'Test the charger output', area: 'part' },
  display: { label: 'Test the panel and its cable', area: 'part' },
  keyboard: { label: 'Test the keyboard', area: 'part' },
  taskmgr: { label: 'Open Task Manager', area: 'windows' },
  devicemgr: { label: 'Open Device Manager', area: 'windows' },
  eventlog: { label: 'Read Event Viewer', area: 'windows' },
  diskmgmt: { label: 'Open Disk Management', area: 'windows' },
  msconfig: { label: 'Open System Configuration', area: 'windows' },
  safemode: { label: 'Check Safe Mode and its options', area: 'windows' },
  winver: { label: 'Read the Windows version and support status', area: 'windows' },
  sfc: { label: 'Run sfc /scannow', area: 'windows' },
  chkdsk: { label: 'Run chkdsk', area: 'windows' },
  restore: { label: 'List the System Restore points', area: 'windows' },
  'outlook-profiles': { label: 'Open Mail and the Outlook profiles', area: 'app' },
  'office-addins': { label: 'Read the Office add-ins', area: 'app' },
  'print-queue': { label: 'Read the print queue', area: 'app' },
  'print-drivers': { label: 'Check the printer drivers and ports', area: 'app' },
  'qb-file': { label: 'Read the QuickBooks company file log', area: 'app' },
  'qb-multiuser': { label: 'Read the multi-user setup', area: 'app' },
  'qb-license': { label: 'Read the QuickBooks licence status', area: 'app' },
  'qb-backup': { label: 'List the QuickBooks backups', area: 'app' },
  compat: { label: 'Read the program compatibility settings', area: 'app' },
} as const satisfies Record<string, { label: string; area: 'bench' | 'part' | 'windows' | 'app' }>

export type CheckId = keyof typeof CHECKS

/** The checklist every case carries, in the order the desk does it. */
export const CHECKLIST = [
  {
    id: 'verify-user',
    label: 'Verify the user and the machine',
    detail: 'Confirm who is asking and that this is their device before touching it.',
  },
  {
    id: 'backup',
    label: 'Back up the data first',
    detail: 'Take a copy — or an image — before any change that can lose the files.',
  },
  {
    id: 'document',
    label: 'Document what was found and done',
    detail: 'A note that names the symptom, the evidence and the change, for the next person.',
  },
  {
    id: 'follow-up',
    label: 'Book the follow-up',
    detail: 'Say when the machine will be checked again, or what the user should watch for.',
  },
] as const

export type ChecklistId = (typeof CHECKLIST)[number]['id']

/** A checklist tick, with the note the document step needs. */
export interface ChecklistRecord {
  id: ChecklistId
  at: number
  note?: string
}

/** A read that genuinely isolates the fault, and the part or app it was run on. */
export interface Evidence {
  check: CheckId
  /** The part, the OS or the app the read was pointed at. */
  on?: string
}

export interface FixOption {
  id: FixId
  label: string
  detail: string
  /** True for the changes that take something away. */
  risk?: boolean
}

export interface DesktopCase {
  id: string
  title: string
  difficulty: 1 | 2 | 3
  category: CaseCategory
  platform: 'desktop' | 'laptop'
  /** The Windows the machine runs, for the badge and the legacy line. */
  edition: WindowsEdition
  /** The one-line symptom the queue shows. */
  symptom: string
  /** What the person at the desk is reported to have said. */
  report: string
  /** The part, OS or app the symptom is about. */
  subject: string
  fault: Fault
  /** The reads that actually isolate this fault. */
  evidence: readonly Evidence[]
  /** Changes the action bar offers, expected ones first. */
  fixOptions: readonly FixOption[]
  /** The reference path, in order. */
  expectedFix: readonly FixId[]
  hints: readonly [string, string, string]
  explanation: readonly string[]
  /** Whether the backup step is scored: false only when no data can be lost. */
  backupRequired: boolean
  /** What a resolved machine looks like, in plain sentences. */
  verifyText: string
  /** Commands worth trying in this case's console. */
  tools: readonly string[]
}

/* -------------------------------------------------------------- the estate */

export interface PostView {
  /** `dead` is no fans and no lights; `beep` is a POST that stops and beeps. */
  state: 'dead' | 'beep' | 'post-ok'
  beeps: string | null
  ramDetectedGb: number
  ramExpectedGb: number
  /** False while a module fails its test; the fix is what makes it true. */
  memoryHealthy: boolean
  /** The module the test fails on, so a read names it rather than both. */
  failing: 'ram-1' | 'ram-2' | null
}

export interface DiskHealth {
  health: 'good' | 'failing' | 'missing'
  smart: string
  detected: boolean
  initialised: boolean
  letter: string | null
}

export interface BatteryView {
  present: boolean
  chargePct: number
  charging: boolean
  health: string
}

export interface WindowsView {
  edition: WindowsEdition
  build: string
  supported: boolean
  signIn: 'ok' | 'fails'
  bootSeconds: number
  activation: 'activated' | 'unlicensed' | 'expired'
  updates: 'on' | 'off'
  safeMode: boolean
}

export interface DeviceRow {
  name: string
  status: 'ok' | 'warning' | 'error' | 'unknown'
  detail: string
}

export interface EventRow {
  level: 'error' | 'warning' | 'info'
  source: string
  id: number
  message: string
}

export interface DiskRow {
  name: string
  sizeGb: number
  fs: string | null
  status: string
  freeGb: number | null
}

export interface StartupRow {
  name: string
  impact: 'low' | 'medium' | 'high'
  enabled: boolean
}

export interface AppView {
  state: 'ok' | 'broken'
  detail: string
}

export interface PrinterView {
  queue: number
  status: string
  installed: boolean
  shared: boolean
}

export interface QuickBooksView {
  companyFile: 'ok' | 'damaged'
  multiUser: 'ok' | 'error'
  license: 'ok' | 'expired'
  backup: 'none' | 'restored'
}

export interface BenchEstate {
  caseId: string
  fixes: readonly FixId[]
  post: PostView
  disk: DiskHealth
  tempC: number
  cmos: 'ok' | 'dead'
  battery: BatteryView
  /** The charger itself, which is a different part from the pack. */
  charger: 'ok' | 'dead'
  screen: 'ok' | 'cracked'
  keyboard: 'ok' | 'failing'
  windows: WindowsView
  devices: readonly DeviceRow[]
  events: readonly EventRow[]
  disks: readonly DiskRow[]
  restorePoints: readonly string[]
  startup: readonly StartupRow[]
  apps: Readonly<Record<AppId, AppView>>
  printer: PrinterView
  outlook: { profile: 'ok' | 'corrupt' | 'recreated' }
  office: { addin: boolean; state: 'ok' | 'crashes' }
  quickbooks: QuickBooksView
  /** The machine's data still exists on the drive it started on. */
  dataIntact: boolean
}

/** One change, as the attempt keeps it. */
export interface ChangeRecord {
  fix: FixId
  at: number
}

export interface RecordedCheck {
  id: CheckId
  /** The part, the OS or the app the read was pointed at. */
  on: string
  at: number
}

/** What an attempt stores between visits. */
export interface AttemptState {
  fixes: readonly FixId[]
  changes: readonly ChangeRecord[]
  checks: readonly RecordedCheck[]
  checklist: readonly ChecklistRecord[]
}

export function isDestructiveFix(fix: FixId): boolean {
  return DESTRUCTIVE_FIXES.includes(fix)
}

export function isDataRiskFix(fix: FixId): boolean {
  return DATA_RISK_FIXES.includes(fix)
}
