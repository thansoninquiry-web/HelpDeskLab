import type { BenchEstate, DesktopCase } from '../types'
import { APP_CASES } from './apps'
import { HARDWARE_CASES } from './hardware'
import { WINDOWS_CASES } from './windows'

/**
 * Every case the bench offers, in the order the queue shows them.
 *
 * The queue is grouped by category rather than by difficulty, because that is
 * how a bench is handed work: hardware first, then the Windows faults, then the
 * application calls.
 */
export const CASES: readonly DesktopCase[] = [...HARDWARE_CASES, ...WINDOWS_CASES, ...APP_CASES]

export const CASE_BY_ID: Readonly<Record<string, DesktopCase>> = Object.fromEntries(
  CASES.map((entry) => [entry.id, entry]),
)

export function caseById(id: string): DesktopCase | undefined {
  return CASE_BY_ID[id]
}

/**
 * What "resolved" reads from the machine, per case.
 *
 * The check is a fact about the estate rather than about the buttons: a learner
 * who presses the right button but leaves the machine in the wrong state has not
 * resolved anything. Written here, in one table, so a case cannot ship without
 * one — a test walks every id.
 */
const VERIFY: Record<string, (estate: BenchEstate) => boolean> = {
  'no-post-psu': (estate) => estate.post.state !== 'dead',
  'no-post-memory': (estate) =>
    estate.post.state === 'post-ok' &&
    estate.post.ramDetectedGb === estate.post.ramExpectedGb &&
    estate.post.memoryHealthy,
  'memory-bluescreens': (estate) => estate.post.memoryHealthy,
  'failing-drive': (estate) => estate.disk.health === 'good',
  'overheating-shutdown': (estate) => estate.tempC <= 75,
  'cmos-clock-reset': (estate) => estate.cmos === 'ok',
  'laptop-battery-dead': (estate) =>
    estate.battery.present && estate.battery.health.startsWith('good') && estate.battery.chargePct > 50,
  'charger-dead': (estate) => estate.battery.charging,
  'cracked-panel': (estate) => estate.screen === 'ok',
  'keyboard-keys': (estate) => estate.keyboard === 'ok',
  'win10-profile-service': (estate) => estate.windows.signIn === 'ok',
  'win10-driver-regression': (estate) =>
    estate.devices.find((device) => device.name === 'Display adapter')?.status === 'ok',
  'win11-slow-boot': (estate) => estate.windows.bootSeconds < 60,
  'win11-disk-missing': (estate) =>
    estate.disk.letter !== null &&
    estate.disk.initialised &&
    estate.disks.some((disk) => disk.name === 'Disk 1'),
  'legacy-usb-driver': (estate) => estate.devices.every((device) => device.status !== 'unknown'),
  'legacy-compat': (estate) =>
    !estate.events.some((event) => event.source === 'Application Error' && event.id === 1000),
  'legacy-eol': (estate) => estate.windows.supported && estate.windows.updates === 'on',
  'outlook-profile-corrupt': (estate) => estate.outlook.profile !== 'corrupt',
  'word-crashes': (estate) => estate.office.state === 'ok' && !estate.office.addin,
  'printer-queue-stuck': (estate) => estate.printer.queue === 0 && estate.printer.status === 'Ready',
  'shared-printer-install': (estate) => estate.printer.installed && estate.printer.shared,
  'qb-company-damaged': (estate) => estate.quickbooks.companyFile === 'ok',
  'qb-multiuser': (estate) => estate.quickbooks.multiUser === 'ok',
  'qb-license': (estate) => estate.quickbooks.license === 'ok',
  'qb-restore': (estate) =>
    estate.quickbooks.companyFile === 'ok' && estate.quickbooks.backup === 'restored',
}

export function verifyCase(entry: DesktopCase, estate: BenchEstate): boolean {
  const verify = VERIFY[entry.id]
  if (!verify) {
    throw new Error(`No verification is defined for the desktop case: ${entry.id}`)
  }
  return verify(estate)
}

/** Case ids by category, for the queue's groups. */
export function casesByCategory(category: DesktopCase['category']): readonly DesktopCase[] {
  return CASES.filter((entry) => entry.category === category)
}
