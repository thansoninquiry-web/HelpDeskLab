import type {
  AppId,
  BenchEstate,
  DesktopCase,
  DeviceRow,
  EventRow,
  FixId,
  WindowsEdition,
} from '../types'

/**
 * The machine, derived from the case and the changes made to it.
 *
 * There is no `desktop_parts` table and no stored machine: a case names one
 * fault, and every reading the tools print comes from that fault plus the
 * changes applied since. That is what makes the console and the scoring agree —
 * they read the same function — and what makes a new case a content change.
 */

const BUILDS: Record<WindowsEdition, string> = {
  'Windows 11': '23H2 · build 22631.4169',
  'Windows 10': '22H2 · build 19045.4651',
  'Windows 7': 'SP1 · build 7601',
  'Windows XP': 'SP3 · build 2600',
}

const SUPPORTED: Record<WindowsEdition, boolean> = {
  'Windows 11': true,
  'Windows 10': true,
  'Windows 7': false,
  'Windows XP': false,
}

function healthyApps(): Record<AppId, { state: 'ok' | 'broken'; detail: string }> {
  return {
    outlook: { state: 'ok', detail: 'Outlook starts and the mailbox syncs.' },
    word: { state: 'ok', detail: 'Word opens documents.' },
    excel: { state: 'ok', detail: 'Excel opens workbooks.' },
    printer: { state: 'ok', detail: 'The printer is ready.' },
    quickbooks: { state: 'ok', detail: 'The company file opens.' },
  }
}

function baseline(entry: DesktopCase): BenchEstate {
  return {
    caseId: entry.id,
    fixes: [],
    post: {
      state: 'post-ok',
      beeps: null,
      ramDetectedGb: 16,
      ramExpectedGb: 16,
      memoryHealthy: true,
      failing: null,
    },
    disk: {
      health: 'good',
      smart: 'SMART overall-health self-assessment test result: PASSED\nReallocated sectors: 0 · Pending sectors: 0 · Power-on hours: 2,140',
      detected: true,
      initialised: true,
      letter: 'C:',
    },
    tempC: 52,
    cmos: 'ok',
    battery: {
      present: true,
      chargePct: 97,
      charging: true,
      health: 'good (design 52 Wh, full charge 49 Wh)',
    },
    charger: 'ok',
    screen: 'ok',
    keyboard: 'ok',
    windows: {
      edition: entry.edition,
      build: BUILDS[entry.edition],
      supported: SUPPORTED[entry.edition],
      signIn: 'ok',
      bootSeconds: 28,
      activation: 'activated',
      updates: 'on',
      safeMode: false,
    },
    devices: [
      { name: 'Display adapter', status: 'ok', detail: 'Intel UHD Graphics · driver 31.0.101.4502' },
      { name: 'Keyboard', status: 'ok', detail: 'Standard PS/2 Keyboard' },
      { name: 'USB xHCI controller', status: 'ok', detail: 'Driver loaded' },
      { name: 'Disk drives', status: 'ok', detail: 'Samsung SSD 870 EVO 500GB' },
      { name: 'Network adapter', status: 'ok', detail: 'Realtek PCIe GbE Family Controller' },
    ],
    events: [
      {
        level: 'info',
        source: 'Service Control Manager',
        id: 7036,
        message: 'The Print Spooler service entered the running state.',
      },
      {
        level: 'info',
        source: 'Kernel-Boot',
        id: 27,
        message: 'The boot type was 0x0.',
      },
    ],
    disks: [
      {
        name: 'Disk 0',
        sizeGb: 476,
        fs: 'NTFS',
        status: 'Healthy (Boot, Page File, Crash Dump, Primary Partition)',
        freeGb: 212,
      },
    ],
    restorePoints: [
      'Today, 08:00 — Automatic restore point (Windows Update)',
      '3 days ago — Automatic restore point (Driver install)',
    ],
    startup: [
      { name: 'OneDrive', impact: 'low', enabled: true },
      { name: 'Teams', impact: 'medium', enabled: true },
      { name: 'Windows Security notification icon', impact: 'low', enabled: true },
      { name: 'VendorUpdater', impact: 'high', enabled: true },
    ],
    apps: healthyApps(),
    printer: { queue: 0, status: 'Ready', installed: true, shared: true },
    outlook: { profile: 'ok' },
    office: { addin: false, state: 'ok' },
    quickbooks: { companyFile: 'ok', multiUser: 'ok', license: 'ok', backup: 'none' },
    dataIntact: true,
  }
}

function addEvent(estate: BenchEstate, event: EventRow): void {
  estate.events = [event, ...estate.events]
}

function setDevice(estate: BenchEstate, name: string, update: Partial<DeviceRow>): void {
  estate.devices = estate.devices.map((device) =>
    device.name === name ? { ...device, ...update } : device,
  )
}

/** Applies the injected fault. */
function applyFault(estate: BenchEstate, entry: DesktopCase): void {
  switch (entry.fault.kind) {
    case 'none':
      return
    case 'dead-psu':
      estate.post = { ...estate.post, state: 'dead', ramDetectedGb: 0 }
      estate.tempC = 23
      addEvent(estate, {
        level: 'error',
        source: 'Kernel-Power',
        id: 41,
        message: 'The system has rebooted without cleanly shutting down first.',
      })
      return
    case 'unseated-ram':
      estate.post = {
        ...estate.post,
        state: 'beep',
        beeps: '1 long, 2 short',
        ramDetectedGb: 8,
        memoryHealthy: false,
        failing: entry.fault.stick,
      }
      return
    case 'bad-ram':
      estate.post = { ...estate.post, memoryHealthy: false, failing: entry.fault.stick }
      addEvent(estate, {
        level: 'error',
        source: 'Microsoft-Windows-WHEA-Logger',
        id: 47,
        message: 'A corrected hardware error has occurred. Component: memory module.',
      })
      return
    case 'failing-disk':
      estate.disk = {
        health: 'failing',
        smart:
          'SMART overall-health self-assessment test result: FAILED\nReallocated sectors: 248 · Pending sectors: 32 · Power-on hours: 21,904',
        detected: true,
        initialised: true,
        letter: 'C:',
      }
      addEvent(estate, {
        level: 'error',
        source: 'Disk',
        id: 7,
        message: 'The device, \\Device\\Harddisk0\\DR0, has a bad block.',
      })
      return
    case 'overheating':
      estate.tempC = 96
      addEvent(estate, {
        level: 'error',
        source: 'Microsoft-Windows-Kernel-Processor-Power',
        id: 37,
        message:
          'The speed of processor 0 is being limited by system firmware. The processor has been in this reduced performance state for 330 seconds.',
      })
      return
    case 'cmos-battery':
      estate.cmos = 'dead'
      addEvent(estate, {
        level: 'warning',
        source: 'Microsoft-Windows-Kernel-General',
        id: 12,
        message: 'The operating system started at system time 2011-03-04T09:12:44.',
      })
      return
    case 'dead-battery':
      estate.battery = {
        present: true,
        chargePct: 0,
        charging: false,
        health: 'replace (design 52 Wh, full charge 0 Wh)',
      }
      return
    case 'dead-charger':
      estate.battery = { ...estate.battery, chargePct: 9, charging: false }
      estate.charger = 'dead'
      return
    case 'cracked-screen':
      estate.screen = 'cracked'
      return
    case 'keyboard-failure':
      estate.keyboard = 'failing'
      setDevice(estate, 'Keyboard', {
        status: 'warning',
        detail: 'Standard PS/2 Keyboard · keys E, D, C and X do not report',
      })
      return
    case 'profile-service':
      estate.windows = { ...estate.windows, signIn: 'fails' }
      addEvent(estate, {
        level: 'error',
        source: 'Microsoft-Windows-User Profile Service',
        id: 1511,
        message:
          'Windows cannot find the local profile and is logging you on with a temporary profile.',
      })
      return
    case 'driver-regression':
      setDevice(estate, 'Display adapter', {
        status: 'warning',
        detail: 'Intel UHD Graphics · driver 31.0.101.5186 not started (code 10)',
      })
      estate.windows = { ...estate.windows, bootSeconds: 41 }
      addEvent(estate, {
        level: 'error',
        source: 'Display',
        id: 4101,
        message: 'Display driver igfxn stopped responding and has successfully recovered.',
      })
      return
    case 'startup-load':
      estate.windows = { ...estate.windows, bootSeconds: 264 }
      estate.startup = estate.startup.map((row) =>
        row.name === 'VendorUpdater' ? { ...row, impact: 'high', enabled: true } : row,
      )
      addEvent(estate, {
        level: 'warning',
        source: 'Diagnostics-Performance',
        id: 101,
        message: 'This startup took 264 seconds, longer than the 60-second threshold.',
      })
      return
    case 'disk-uninitialised':
      estate.disk = {
        health: 'good',
        smart: 'SMART overall-health self-assessment test result: PASSED\nNew drive · 0 power-on hours',
        detected: true,
        initialised: false,
        letter: null,
      }
      addEvent(estate, {
        level: 'warning',
        source: 'Disk',
        id: 158,
        message: 'Disk 1 has the same disk identifiers as one of the server disks.',
      })
      return
    case 'missing-driver':
      estate.devices = [
        { name: 'USB xHCI controller', status: 'unknown', detail: 'Driver not installed (code 28)' },
        { name: 'USB 3.0 hub', status: 'unknown', detail: 'Driver not installed (code 28)' },
        ...estate.devices.filter(
          (device) => device.name !== 'USB xHCI controller' && device.name !== 'USB 3.0 hub',
        ),
      ]
      addEvent(estate, {
        level: 'warning',
        source: 'Microsoft-Windows-UserPnp',
        id: 20001,
        message: 'Driver installation failed for USB\\VID_8086&PID_9D2F.',
      })
      return
    case 'compat-refusal':
      addEvent(estate, {
        level: 'error',
        source: 'Application Error',
        id: 1000,
        message:
          'Faulting application name: payroll.exe, version 4.2.0.0, time stamp 0x4a2f19c1. Exception code: 0xc0000005.',
      })
      return
    case 'unsupported-os':
      estate.windows = { ...estate.windows, supported: false, updates: 'off' }
      addEvent(estate, {
        level: 'warning',
        source: 'Windows Update',
        id: 19,
        message: 'Installation failure: Windows failed to install the following update with error 0x80070422 (service disabled).',
      })
      return
    case 'outlook-profile':
      estate.outlook = { profile: 'corrupt' }
      estate.apps = {
        ...estate.apps,
        outlook: { state: 'broken', detail: 'Outlook closes on launch; the profile cannot be opened.' },
      }
      addEvent(estate, {
        level: 'error',
        source: 'Application Error',
        id: 1000,
        message: 'Faulting application name: OUTLOOK.EXE, version 16.0.17928.20156, exception code 0xc0000005.',
      })
      return
    case 'office-addin':
      estate.office = { addin: true, state: 'crashes' }
      estate.apps = {
        ...estate.apps,
        word: { state: 'broken', detail: 'Word closes when the contract template loads.' },
      }
      addEvent(estate, {
        level: 'error',
        source: 'Application Error',
        id: 1000,
        message: 'Faulting application name: WINWORD.EXE, faulting module: pdfmaker.dll, version 10.1.0.0.',
      })
      return
    case 'spooler-jam':
      estate.printer = {
        queue: 4,
        status: 'Deleting — 1 document in queue',
        installed: true,
        shared: true,
      }
      addEvent(estate, {
        level: 'error',
        source: 'Microsoft-Windows-PrintService',
        id: 372,
        message: 'The document Print Job 42, owned by dana, failed to print.',
      })
      return
    case 'printer-not-installed':
      estate.printer = { queue: 0, status: 'Not installed', installed: false, shared: false }
      return
    case 'qb-company-damaged':
      estate.quickbooks = { ...estate.quickbooks, companyFile: 'damaged' }
      estate.apps = {
        ...estate.apps,
        quickbooks: { state: 'broken', detail: 'QuickBooks reports the company file is damaged.' },
      }
      addEvent(estate, {
        level: 'error',
        source: 'QuickBooks',
        id: 0,
        message: 'Company file error: the file failed an integrity check (error 6144).',
      })
      return
    case 'qb-multiuser':
      estate.quickbooks = { ...estate.quickbooks, multiUser: 'error' }
      return
    case 'qb-license':
      estate.quickbooks = { ...estate.quickbooks, license: 'expired' }
      return
    case 'qb-backup':
      estate.quickbooks = { ...estate.quickbooks, companyFile: 'damaged' }
      addEvent(estate, {
        level: 'error',
        source: 'QuickBooks',
        id: 0,
        message: 'The company file could not be found in \\\\FS01\\Books\\.',
      })
      return
  }
}

/** Applies one change. A change that does not touch this fault leaves the machine as it was. */
function applyFix(estate: BenchEstate, entry: DesktopCase, fix: FixId): void {
  const fault = entry.fault.kind
  switch (fix) {
    case 'replace-psu':
      if (fault === 'dead-psu') {
        estate.post = {
          state: 'post-ok',
          beeps: null,
          ramDetectedGb: 16,
          ramExpectedGb: 16,
          memoryHealthy: true,
          failing: null,
        }
        estate.tempC = 48
      }
      return
    case 'reseat-ram':
      if (fault === 'unseated-ram') {
        estate.post = {
          state: 'post-ok',
          beeps: null,
          ramDetectedGb: 16,
          ramExpectedGb: 16,
          memoryHealthy: true,
          failing: null,
        }
      }
      return
    case 'replace-ram':
      if (fault === 'bad-ram' || fault === 'unseated-ram') {
        estate.post = {
          state: 'post-ok',
          beeps: null,
          ramDetectedGb: 16,
          ramExpectedGb: 16,
          memoryHealthy: true,
          failing: null,
        }
      }
      return
    case 'replace-disk':
      if (fault === 'failing-disk') {
        estate.disk = {
          health: 'good',
          smart: 'SMART overall-health self-assessment test result: PASSED\nNew drive · 0 power-on hours',
          detected: true,
          initialised: true,
          letter: 'C:',
        }
        estate.events = estate.events.filter((event) => event.id !== 7)
      }
      return
    case 'clean-cooler':
      if (fault === 'overheating') {
        estate.tempC = 63
        estate.events = estate.events.filter(
          (event) => event.source !== 'Microsoft-Windows-Kernel-Processor-Power',
        )
      }
      return
    case 'replace-fan':
      if (fault === 'overheating') {
        estate.tempC = 71
      }
      return
    case 'replace-cmos':
      if (fault === 'cmos-battery') {
        estate.cmos = 'ok'
        estate.events = estate.events.filter(
          (event) => event.source !== 'Microsoft-Windows-Kernel-General',
        )
      }
      return
    case 'replace-battery':
      if (fault === 'dead-battery' || fault === 'dead-charger') {
        estate.battery = {
          present: true,
          chargePct: 100,
          charging: true,
          health: 'good (design 52 Wh, full charge 51 Wh)',
        }
      }
      return
    case 'replace-charger':
      if (fault === 'dead-charger') {
        estate.battery = { ...estate.battery, charging: true, chargePct: 34 }
        estate.charger = 'ok'
      }
      return
    case 'replace-screen':
      if (fault === 'cracked-screen') {
        estate.screen = 'ok'
      }
      return
    case 'replace-keyboard':
      if (fault === 'keyboard-failure') {
        estate.keyboard = 'ok'
        setDevice(estate, 'Keyboard', {
          status: 'ok',
          detail: 'Standard PS/2 Keyboard',
        })
      }
      return
    case 'boot-safe-mode':
      estate.windows = { ...estate.windows, safeMode: true }
      return
    case 'create-profile':
      if (fault === 'profile-service') {
        estate.windows = { ...estate.windows, signIn: 'ok' }
        estate.events = estate.events.filter(
          (event) => event.source !== 'Microsoft-Windows-User Profile Service',
        )
      }
      return
    case 'rollback-driver':
    case 'system-restore':
      if (fault === 'driver-regression') {
        setDevice(estate, 'Display adapter', {
          status: 'ok',
          detail: 'Intel UHD Graphics · driver 31.0.101.4502',
        })
        estate.windows = { ...estate.windows, bootSeconds: 28 }
        estate.events = estate.events.filter((event) => event.source !== 'Display')
      }
      return
    case 'install-driver':
      if (fault === 'missing-driver') {
        estate.devices = estate.devices.map((device) =>
          device.status === 'unknown'
            ? { ...device, status: 'ok', detail: 'Driver loaded' }
            : device,
        )
        estate.events = estate.events.filter(
          (event) => event.source !== 'Microsoft-Windows-UserPnp',
        )
      }
      return
    case 'disable-startup':
      if (fault === 'startup-load') {
        estate.startup = estate.startup.map((row) =>
          row.name === 'VendorUpdater' ? { ...row, enabled: false } : row,
        )
        estate.windows = { ...estate.windows, bootSeconds: 31 }
        estate.events = estate.events.filter(
          (event) => event.source !== 'Diagnostics-Performance',
        )
      }
      return
    case 'initialize-disk':
      if (fault === 'disk-uninitialised') {
        estate.disk = { ...estate.disk, initialised: true }
        estate.disks = [
          ...estate.disks,
          {
            name: 'Disk 1',
            sizeGb: 931,
            fs: 'NTFS',
            status: 'Healthy (Primary Partition)',
            freeGb: null,
          },
        ]
      }
      return
    case 'assign-drive-letter':
      if (fault === 'disk-uninitialised') {
        estate.disk = { ...estate.disk, letter: 'D:' }
        estate.disks = estate.disks.map((disk) =>
          disk.name === 'Disk 1' ? { ...disk, freeGb: 928 } : disk,
        )
      }
      return
    case 'compatibility-mode':
      if (fault === 'compat-refusal' || fault === 'unsupported-os') {
        if (fault === 'compat-refusal') {
          estate.events = estate.events.filter(
            (event) => !(event.source === 'Application Error' && event.id === 1000),
          )
        }
      }
      return
    case 'upgrade-windows':
      if (fault === 'unsupported-os') {
        estate.windows = {
          ...estate.windows,
          edition: 'Windows 11',
          build: BUILDS['Windows 11'],
          supported: true,
          updates: 'on',
          bootSeconds: 24,
        }
        estate.events = estate.events.filter((event) => event.source !== 'Windows Update')
      }
      return
    case 'enable-updates':
      estate.windows = { ...estate.windows, updates: 'on' }
      return
    case 'new-outlook-profile':
      if (fault === 'outlook-profile') {
        estate.outlook = { profile: 'recreated' }
        estate.apps = {
          ...estate.apps,
          outlook: { state: 'ok', detail: 'Outlook starts with the new profile.' },
        }
        estate.events = estate.events.filter((event) => event.source !== 'Application Error')
      }
      return
    case 'disable-addin':
      if (fault === 'office-addin') {
        estate.office = { addin: false, state: 'ok' }
        estate.apps = {
          ...estate.apps,
          word: { state: 'ok', detail: 'Word opens the contract template.' },
        }
        estate.events = estate.events.filter((event) => event.source !== 'Application Error')
      }
      return
    case 'clear-print-queue':
      if (fault === 'spooler-jam') {
        estate.printer = { ...estate.printer, queue: 0, status: 'Ready' }
      }
      return
    case 'restart-spooler':
      if (fault === 'spooler-jam' && estate.printer.queue === 0) {
        estate.printer = { ...estate.printer, status: 'Ready' }
      }
      return
    case 'install-shared-printer':
      if (fault === 'printer-not-installed') {
        estate.printer = {
          queue: 0,
          status: 'Ready',
          installed: true,
          shared: true,
        }
        estate.apps = {
          ...estate.apps,
          printer: { state: 'ok', detail: 'The shared printer is installed.' },
        }
      }
      return
    case 'qb-rebuild':
      if (fault === 'qb-company-damaged') {
        estate.quickbooks = { ...estate.quickbooks, companyFile: 'ok' }
        estate.apps = {
          ...estate.apps,
          quickbooks: { state: 'ok', detail: 'The rebuilt company file opens.' },
        }
        addEvent(estate, {
          level: 'info',
          source: 'QuickBooks',
          id: 0,
          message: 'Rebuild completed: 3 records were skipped and listed in QBWin.log.',
        })
        estate.events = estate.events.filter(
          (event) => !(event.level === 'error' && event.source === 'QuickBooks'),
        )
      }
      return
    case 'qb-multiuser-fix':
      if (fault === 'qb-multiuser') {
        estate.quickbooks = { ...estate.quickbooks, multiUser: 'ok' }
      }
      return
    case 'qb-activate':
      if (fault === 'qb-license') {
        estate.quickbooks = { ...estate.quickbooks, license: 'ok' }
      }
      return
    case 'qb-restore-backup':
      if (fault === 'qb-backup' || fault === 'qb-company-damaged') {
        estate.quickbooks = { ...estate.quickbooks, companyFile: 'ok', backup: 'restored' }
        estate.apps = {
          ...estate.apps,
          quickbooks: { state: 'ok', detail: 'The restored company file opens.' },
        }
        estate.events = estate.events.filter(
          (event) => !(event.level === 'error' && event.source === 'QuickBooks'),
        )
      }
      return
    case 'wipe-disk':
      estate.dataIntact = false
      return
    case 'qb-copy-local':
      return
    case 'replace-motherboard':
    case 'replace-cpu':
    case 'replace-gpu':
    case 'reinstall-windows':
    case 'disable-updates':
    case 'disable-antivirus':
    case 'repair-office':
      return
  }
}

export function buildEstate(entry: DesktopCase, fixes: readonly FixId[]): BenchEstate {
  const estate = baseline(entry)
  estate.fixes = [...fixes]
  applyFault(estate, entry)
  for (const fix of fixes) {
    applyFix(estate, entry, fix)
  }
  return estate
}

/** The machine a healthy bench shows, for the bench page's reference panel. */
export function healthyEstate(): BenchEstate {
  return baseline({
    id: 'bench',
    edition: 'Windows 11',
  } as DesktopCase)
}
