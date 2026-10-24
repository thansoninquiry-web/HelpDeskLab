import type {
  CompliancePolicy,
  IntuneApp,
  IntuneDevice,
  IntunePlatform,
  IntuneUser,
} from '../types'
import { GROUPS } from '../types'

/**
 * The seeded estate: twelve people, fifteen devices, two policies, four apps.
 *
 * Timestamps are relative to the moment the rows are first written, so a fresh
 * install always has a device that went quiet a month ago and one enrolled this
 * week, however long the app has been installed. The raw device settings are
 * stored as they are, and compliance is evaluated from the policies rather than
 * seeded — a device's compliance state is never a second copy of the truth.
 */

const DAY = 24 * 60 * 60 * 1000

function daysAgo(now: number, days: number): number {
  return now - Math.round(days * DAY)
}

export const SEED_USERS: readonly IntuneUser[] = [
  {
    id: 'usr-ada',
    displayName: 'Ada Whitfield',
    upn: 'ada.whitfield@northgate.example',
    department: 'Finance',
    jobTitle: 'Accounts Assistant',
    status: 'active',
    groupId: GROUPS.windows,
  },
  {
    id: 'usr-bram',
    displayName: 'Bram Okonkwo',
    upn: 'bram.okonkwo@northgate.example',
    department: 'Field Operations',
    jobTitle: 'Field Engineer',
    status: 'active',
    groupId: GROUPS.field,
  },
  {
    id: 'usr-chen',
    displayName: 'Chen Ito',
    upn: 'chen.ito@northgate.example',
    department: 'Support',
    jobTitle: 'Service Desk Analyst',
    status: 'active',
    groupId: GROUPS.windows,
  },
  {
    id: 'usr-dara',
    displayName: 'Dara Lindqvist',
    upn: 'dara.lindqvist@northgate.example',
    department: 'Finance',
    jobTitle: 'Payroll Officer',
    status: 'active',
    groupId: GROUPS.windows,
  },
  {
    id: 'usr-emil',
    displayName: 'Emil Novak',
    upn: 'emil.novak@northgate.example',
    department: 'Sales',
    jobTitle: 'Account Manager',
    status: 'active',
    groupId: GROUPS.field,
  },
  {
    id: 'usr-fiza',
    displayName: 'Fiza Rahman',
    upn: 'fiza.rahman@northgate.example',
    department: 'Support',
    jobTitle: 'Support Technician',
    status: 'active',
    groupId: GROUPS.windows,
  },
  {
    id: 'usr-gus',
    displayName: 'Gus Abernathy',
    upn: 'gus.abernathy@northgate.example',
    department: 'Field Operations',
    jobTitle: 'Site Supervisor',
    status: 'active',
    groupId: GROUPS.field,
  },
  {
    id: 'usr-hana',
    displayName: 'Hana Petrov',
    upn: 'hana.petrov@northgate.example',
    department: 'Sales',
    jobTitle: 'Sales Coordinator',
    status: 'active',
    groupId: GROUPS.mobile,
  },
  {
    id: 'usr-ivo',
    displayName: 'Ivo Marchetti',
    upn: 'ivo.marchetti@northgate.example',
    department: 'Engineering',
    jobTitle: 'Systems Engineer',
    status: 'active',
    groupId: GROUPS.engineering,
  },
  {
    id: 'usr-june',
    displayName: 'June Castellanos',
    upn: 'june.castellanos@northgate.example',
    department: 'Engineering',
    jobTitle: 'Test Engineer',
    status: 'active',
    groupId: GROUPS.windows,
  },
  {
    id: 'usr-kai',
    displayName: 'Kai Brenner',
    upn: 'kai.brenner@northgate.example',
    department: 'People Team',
    jobTitle: 'Recruiter',
    status: 'active',
    groupId: GROUPS.windows,
  },
  {
    id: 'usr-lena',
    displayName: 'Lena Duarte',
    upn: 'lena.duarte@northgate.example',
    department: 'Sales',
    jobTitle: 'Account Executive',
    status: 'disabled',
    groupId: GROUPS.mobile,
  },
]

export const SEED_POLICIES: readonly CompliancePolicy[] = [
  {
    id: 'pol-windows-baseline',
    name: 'Windows baseline',
    description:
      'Laptops and desktops must have BitLocker on and be on a supported build. A device that fails for more than three days is marked non-compliant.',
    platform: 'Windows',
    rules: [{ kind: 'bitlocker' }, { kind: 'min-os', version: '10.0.19045' }],
    graceDays: 3,
  },
  {
    id: 'pol-mobile-baseline',
    name: 'Mobile baseline',
    description:
      'Phones and tablets must have a device passcode and storage encryption. Grace is one day, because a phone in a pocket is the risk.',
    platform: 'mobile',
    rules: [{ kind: 'passcode' }, { kind: 'encryption' }],
    graceDays: 1,
  },
]

export const SEED_APPS: readonly IntuneApp[] = [
  {
    id: 'app-portal',
    name: 'Northgate Portal',
    publisher: 'Northgate IT',
    platform: 'all',
    assignment: { groupIds: [GROUPS.windows, GROUPS.mobile], install: 'required' },
  },
  {
    id: 'app-browser',
    name: 'Orbit Browser',
    publisher: 'Orbit Software',
    platform: 'Windows',
    assignment: { groupIds: [GROUPS.windows], install: 'required' },
  },
  {
    id: 'app-suite',
    name: 'Folio Suite',
    publisher: 'Folio Works',
    platform: 'all',
    assignment: { groupIds: [GROUPS.windows, GROUPS.mobile], install: 'required' },
  },
  {
    id: 'app-tunnel',
    name: 'Keystone VPN',
    publisher: 'Keystone Networks',
    platform: 'Windows',
    assignment: { groupIds: [GROUPS.field, GROUPS.engineering], install: 'required' },
  },
]

interface DeviceSeed {
  id: string
  name: string
  ownerUserId: string | null
  platform: IntunePlatform
  osVersion: string
  enrolledDaysAgo: number
  /** Null means the device has never reported in. */
  checkInDaysAgo: number | null
  groupId: string | null
  bitlocker: boolean
  passcodeSet: boolean
  encrypted: boolean
  lost?: boolean
  /** Checked in, but not re-judged since the last policy change. */
  policyStale?: boolean
  /** Days since the device started failing a policy, when it is inside grace. */
  failingDaysAgo?: number
  /** App ids installed last time the device reported, with the status it gave. */
  apps: ReadonlyArray<[appId: string, status: 'installed' | 'pending' | 'failed']>
}

const DEVICE_SEEDS: readonly DeviceSeed[] = [
  {
    id: 'dev-ws-1042',
    name: 'WS-1042',
    ownerUserId: 'usr-ada',
    platform: 'Windows',
    osVersion: '10.0.22631',
    enrolledDaysAgo: 240,
    checkInDaysAgo: 0.2,
    groupId: GROUPS.windows,
    bitlocker: true,
    passcodeSet: true,
    encrypted: true,
    apps: [
      ['app-portal', 'installed'],
      ['app-browser', 'installed'],
      ['app-suite', 'installed'],
    ],
  },
  {
    id: 'dev-lt-2207',
    name: 'LT-2207',
    ownerUserId: 'usr-bram',
    platform: 'Windows',
    osVersion: '10.0.22631',
    enrolledDaysAgo: 150,
    checkInDaysAgo: 0.4,
    groupId: GROUPS.windows,
    // BitLocker is off and the policy requires it: one sync applies the setting.
    bitlocker: false,
    passcodeSet: true,
    encrypted: false,
    apps: [
      ['app-portal', 'installed'],
      ['app-browser', 'installed'],
      ['app-suite', 'pending'],
      ['app-tunnel', 'installed'],
    ],
  },
  {
    id: 'dev-ws-1120',
    name: 'WS-1120',
    ownerUserId: 'usr-chen',
    platform: 'Windows',
    osVersion: '10.0.19045',
    enrolledDaysAgo: 400,
    // Silent for six weeks: the console has nothing current to judge.
    checkInDaysAgo: 42,
    groupId: GROUPS.windows,
    bitlocker: true,
    passcodeSet: true,
    encrypted: true,
    apps: [
      ['app-portal', 'installed'],
      ['app-browser', 'installed'],
      ['app-suite', 'installed'],
    ],
  },
  {
    id: 'dev-lt-2318',
    name: 'LT-2318',
    ownerUserId: 'usr-dara',
    platform: 'Windows',
    osVersion: '10.0.18363',
    enrolledDaysAgo: 60,
    checkInDaysAgo: 0.8,
    groupId: GROUPS.windows,
    bitlocker: true,
    passcodeSet: true,
    encrypted: true,
    // Failed the OS rule yesterday, so it is inside the three-day grace.
    failingDaysAgo: 1,
    apps: [
      ['app-portal', 'installed'],
      ['app-browser', 'installed'],
      ['app-suite', 'installed'],
    ],
  },
  {
    id: 'dev-ws-1188',
    name: 'WS-1188',
    ownerUserId: 'usr-emil',
    platform: 'Windows',
    osVersion: '10.0.22631',
    enrolledDaysAgo: 90,
    checkInDaysAgo: 1.5,
    groupId: GROUPS.field,
    bitlocker: true,
    passcodeSet: true,
    encrypted: true,
    apps: [
      ['app-portal', 'installed'],
      ['app-suite', 'installed'],
      ['app-tunnel', 'installed'],
    ],
  },
  {
    id: 'dev-lt-2402',
    name: 'LT-2402',
    ownerUserId: 'usr-fiza',
    platform: 'Windows',
    osVersion: '10.0.22631',
    enrolledDaysAgo: 120,
    checkInDaysAgo: 0.3,
    groupId: GROUPS.windows,
    bitlocker: true,
    passcodeSet: true,
    encrypted: true,
    apps: [
      // The install the ticket is about: attempted, failed, never retried.
      ['app-portal', 'failed'],
      ['app-browser', 'installed'],
      ['app-suite', 'installed'],
    ],
  },
  {
    id: 'dev-ws-1264',
    name: 'WS-1264',
    ownerUserId: 'usr-ivo',
    platform: 'Windows',
    osVersion: '10.0.22631',
    enrolledDaysAgo: 30,
    // Three days is inside the window, so the device is judged, not written off.
    checkInDaysAgo: 3,
    groupId: GROUPS.engineering,
    bitlocker: true,
    passcodeSet: true,
    encrypted: true,
    // Reported in, but the policy was edited afterwards and never re-evaluated.
    policyStale: true,
    apps: [
      ['app-portal', 'pending'],
      ['app-suite', 'installed'],
      ['app-tunnel', 'pending'],
    ],
  },
  {
    id: 'dev-ws-1301',
    name: 'WS-1301',
    ownerUserId: 'usr-bram',
    platform: 'Windows',
    osVersion: '10.0.22631',
    enrolledDaysAgo: 20,
    checkInDaysAgo: 0.6,
    groupId: GROUPS.windows,
    bitlocker: true,
    passcodeSet: true,
    encrypted: true,
    apps: [
      ['app-portal', 'installed'],
      ['app-browser', 'installed'],
      ['app-suite', 'installed'],
    ],
  },
  {
    id: 'dev-iph-3301',
    name: 'IPH-3301',
    ownerUserId: 'usr-ada',
    platform: 'iOS',
    osVersion: '17.4',
    enrolledDaysAgo: 200,
    checkInDaysAgo: 0.1,
    groupId: GROUPS.mobile,
    bitlocker: false,
    passcodeSet: true,
    encrypted: true,
    apps: [
      ['app-portal', 'installed'],
      ['app-suite', 'installed'],
    ],
  },
  {
    id: 'dev-iph-3355',
    name: 'IPH-3355',
    ownerUserId: 'usr-hana',
    platform: 'iOS',
    osVersion: '17.2',
    enrolledDaysAgo: 45,
    checkInDaysAgo: 0.5,
    groupId: GROUPS.mobile,
    bitlocker: false,
    passcodeSet: false,
    encrypted: true,
    apps: [
      ['app-portal', 'installed'],
      ['app-suite', 'pending'],
    ],
  },
  {
    id: 'dev-iph-3390',
    name: 'IPH-3390',
    ownerUserId: 'usr-gus',
    platform: 'iOS',
    osVersion: '17.4',
    enrolledDaysAgo: 300,
    checkInDaysAgo: 2,
    groupId: GROUPS.mobile,
    bitlocker: false,
    passcodeSet: true,
    encrypted: true,
    lost: true,
    apps: [
      ['app-portal', 'installed'],
      ['app-suite', 'installed'],
    ],
  },
  {
    id: 'dev-iph-3366',
    name: 'IPH-3366',
    ownerUserId: 'usr-june',
    platform: 'iOS',
    osVersion: '17.4',
    // Enrolled this week with nothing deployed yet: the new-hire case.
    enrolledDaysAgo: 1,
    checkInDaysAgo: 0.1,
    groupId: GROUPS.mobile,
    bitlocker: false,
    passcodeSet: true,
    encrypted: true,
    apps: [],
  },
  {
    id: 'dev-and-4402',
    name: 'AND-4402',
    ownerUserId: 'usr-emil',
    platform: 'Android',
    osVersion: '14',
    enrolledDaysAgo: 180,
    checkInDaysAgo: 0.7,
    groupId: GROUPS.mobile,
    bitlocker: false,
    passcodeSet: true,
    encrypted: true,
    apps: [
      ['app-portal', 'installed'],
      ['app-suite', 'installed'],
    ],
  },
  {
    id: 'dev-and-4470',
    name: 'AND-4470',
    ownerUserId: 'usr-chen',
    platform: 'Android',
    osVersion: '13',
    enrolledDaysAgo: 200,
    checkInDaysAgo: 0.4,
    groupId: GROUPS.mobile,
    bitlocker: false,
    passcodeSet: true,
    encrypted: true,
    apps: [
      ['app-portal', 'installed'],
      ['app-suite', 'installed'],
    ],
  },
  {
    id: 'dev-and-4455',
    name: 'AND-4455',
    // The leaver's phone: still enrolled, owner already disabled.
    ownerUserId: 'usr-lena',
    platform: 'Android',
    osVersion: '13',
    enrolledDaysAgo: 260,
    checkInDaysAgo: 6,
    groupId: GROUPS.mobile,
    bitlocker: false,
    passcodeSet: true,
    encrypted: true,
    apps: [
      ['app-portal', 'installed'],
      ['app-suite', 'installed'],
    ],
  },
]

/** Devices without a checkpoint yet, filled in by the caller with a clock. */
export function seedDevices(now: number): IntuneDevice[] {
  return DEVICE_SEEDS.map((seed) => ({
    id: seed.id,
    name: seed.name,
    ownerUserId: seed.ownerUserId,
    platform: seed.platform,
    osVersion: seed.osVersion,
    enrolledAt: daysAgo(now, seed.enrolledDaysAgo),
    lastCheckIn: seed.checkInDaysAgo === null ? null : daysAgo(now, seed.checkInDaysAgo),
    lifecycle: 'managed',
    groupId: seed.groupId,
    bitlocker: seed.bitlocker,
    passcodeSet: seed.passcodeSet,
    encrypted: seed.encrypted,
    lost: seed.lost ?? false,
    policyStale: seed.policyStale ?? false,
    nonComplianceSince:
      seed.failingDaysAgo === undefined ? null : daysAgo(now, seed.failingDaysAgo),
    compliance: 'not-evaluated',
    complianceReasons: [],
    apps: seed.apps.map(([appId, status]) => ({
      appId,
      status,
      lastAttempt: daysAgo(now, 3),
    })),
  }))
}
