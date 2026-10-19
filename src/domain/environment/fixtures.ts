import type {
  DeploymentTask,
  Device,
  DhcpScope,
  DirectoryUser,
  UserStatus,
  DnsRecord,
  FileShare,
  M365Account,
  MailMessage,
  MailboxRecord,
  Printer,
  RemoteSession,
  SecurityGroup,
  Shipment,
  Site,
  StockItem,
  World,
} from './types'
import { emptyVerificationState } from './verification'

export const BASE_CLOCK = Date.UTC(2026, 9, 16, 9, 0, 0)
export const CLOCK_STEP_MS = 60_000

const sites: Site[] = [
  {
    id: 'hq',
    name: 'Larkspur HQ',
    subnet: '10.20.4.0/24',
    prefixLength: 24,
    gateway: '10.20.4.1',
    dhcpServer: '10.20.4.12',
    dnsServers: ['10.20.4.10', '10.20.4.11'],
  },
  {
    id: 'depot',
    name: 'Larkspur Depot',
    subnet: '10.20.8.0/24',
    prefixLength: 24,
    gateway: '10.20.8.1',
    dhcpServer: '10.20.4.12',
    dnsServers: ['10.20.4.10', '10.20.4.11'],
  },
  {
    id: 'warehouse',
    name: 'North Warehouse',
    subnet: '10.20.12.0/24',
    prefixLength: 24,
    gateway: '10.20.12.1',
    dhcpServer: '10.20.4.12',
    dnsServers: ['10.20.4.10', '10.20.4.11'],
  },
]

/** The named accounts the tickets are built on. */
const namedUsers: DirectoryUser[] = [
  {
    id: 'u-dana',
    samAccountName: 'dwhitfield',
    displayName: 'Dana Whitfield',
    email: 'dana.whitfield@larkspur.example',
    department: 'Finance',
    siteId: 'hq',
    status: 'active',
    passwordExpired: false,
    passwordLastChangedAt: BASE_CLOCK - 12 * 24 * 60 * 60 * 1000,
    employeeId: 'E-8842',
    managerName: 'Ravi Patel',
  },
  {
    id: 'u-marcus',
    samAccountName: 'mchen',
    displayName: 'Marcus Chen',
    email: 'marcus.chen@larkspur.example',
    department: 'Operations',
    siteId: 'hq',
    status: 'locked',
    passwordExpired: false,
    passwordLastChangedAt: BASE_CLOCK - 20 * 24 * 60 * 60 * 1000,
    employeeId: 'E-4421',
    managerName: 'Theo Brooks',
  },
  {
    id: 'u-amara',
    samAccountName: 'asingh',
    displayName: 'Amara Singh',
    email: 'amara.singh@larkspur.example',
    department: 'Sales',
    siteId: 'depot',
    status: 'active',
    passwordExpired: true,
    passwordLastChangedAt: BASE_CLOCK - 95 * 24 * 60 * 60 * 1000,
    employeeId: 'E-2073',
    managerName: 'Kira Khan',
  },
  {
    id: 'u-jules',
    samAccountName: 'jortiz',
    displayName: 'Jules Ortiz',
    email: 'jules.ortiz@larkspur.example',
    department: 'Warehouse',
    siteId: 'warehouse',
    status: 'disabled',
    passwordExpired: false,
    passwordLastChangedAt: null,
    employeeId: 'E-1180',
    managerName: 'Theo Brooks',
  },
  {
    id: 'u-ravi',
    samAccountName: 'rpatel',
    displayName: 'Ravi Patel',
    email: 'ravi.patel@larkspur.example',
    department: 'IT',
    siteId: 'hq',
    status: 'active',
    passwordExpired: false,
    passwordLastChangedAt: BASE_CLOCK - 4 * 24 * 60 * 60 * 1000,
    employeeId: 'E-1001',
    managerName: 'Dana Whitfield',
  },
  {
    id: 'u-linh',
    samAccountName: 'lnguyen',
    displayName: 'Linh Nguyen',
    email: 'linh.nguyen@larkspur.example',
    department: 'Finance',
    siteId: 'hq',
    status: 'active',
    passwordExpired: false,
    passwordLastChangedAt: BASE_CLOCK - 8 * 24 * 60 * 60 * 1000,
    employeeId: 'E-7729',
    managerName: 'Dana Whitfield',
  },
  {
    id: 'u-theo',
    samAccountName: 'tbrooks',
    displayName: 'Theo Brooks',
    email: 'theo.brooks@larkspur.example',
    department: 'Operations',
    siteId: 'depot',
    status: 'active',
    passwordExpired: false,
    passwordLastChangedAt: BASE_CLOCK - 40 * 24 * 60 * 60 * 1000,
    employeeId: 'E-3390',
    managerName: 'Ravi Patel',
  },
  {
    id: 'u-kira',
    samAccountName: 'kkhan',
    displayName: 'Kira Khan',
    email: 'kira.khan@larkspur.example',
    department: 'Sales',
    siteId: 'warehouse',
    status: 'active',
    passwordExpired: false,
    passwordLastChangedAt: BASE_CLOCK - 15 * 24 * 60 * 60 * 1000,
    employeeId: 'E-6654',
    managerName: 'Amara Singh',
  },
]

/**
 * The rest of the org chart.
 *
 * The eight accounts above carry every ticket, which is enough for the work and
 * not enough for a company. A hundred staff accounts fill the directory in from
 * fixed name pools with a fixed walk — no RNG and no clock — so the same build
 * always lists the same people and a seed still reproduces the same estate.
 *
 * None of them is assigned a device, and that is deliberate: the generator only
 * draws a ticket from an account with a machine, so ticket selection, scope
 * occupancy, and every seeded draw stay exactly as they were. They are accounts
 * a service desk can still look up, unlock, or find in the tenant.
 */
const STAFF_FIRST_NAMES: readonly string[] = [
  'Aaliyah',
  'Adam',
  'Beatriz',
  'Callum',
  'Camille',
  'Danilo',
  'Delia',
  'Eamon',
  'Elena',
  'Farida',
  'Felix',
  'Gemma',
  'Harriet',
  'Hassan',
  'Imogen',
  'Ivan',
  'Jasmin',
  'Jonas',
  'Karim',
  'Kirsten',
  'Leila',
  'Liam',
  'Marta',
  'Mateo',
  'Nadia',
  'Niall',
  'Omar',
  'Paloma',
  'Priya',
  'Quentin',
  'Rosa',
  'Sanjay',
  'Selma',
  'Sione',
  'Tessa',
  'Tomas',
  'Uma',
  'Viktor',
  'Wren',
  'Yusuf',
]

const STAFF_LAST_NAMES: readonly string[] = [
  'Abara',
  'Alvarez',
  'Bennett',
  'Bergstrom',
  'Castellanos',
  'Cormier',
  'Delacroix',
  'Dupont',
  'Eriksen',
  'Ferreira',
  'Gallagher',
  'Hoffmann',
  'Ibarra',
  'Jankowski',
  'Kowalski',
  'Lindqvist',
  'Moreau',
  'Nakamura',
  'Okafor',
  'Petrova',
  'Quintero',
  'Rasmussen',
  'Sandoval',
  'Thackeray',
  'Ueda',
  'Valdez',
  'Whitlock',
  'Xu',
  'Yilmaz',
  'Zamora',
]

/** Where a generated account sits, and which of the named people manages it. */
const STAFF_PLACEMENTS = [
  { department: 'Finance', siteId: 'hq', managerName: 'Dana Whitfield' },
  { department: 'Operations', siteId: 'hq', managerName: 'Theo Brooks' },
  { department: 'Sales', siteId: 'depot', managerName: 'Kira Khan' },
  { department: 'Warehouse', siteId: 'warehouse', managerName: 'Theo Brooks' },
  { department: 'IT', siteId: 'hq', managerName: 'Ravi Patel' },
] as const

function buildStaffUsers(count: number): DirectoryUser[] {
  const sams = new Set(namedUsers.map((user) => user.samAccountName.toLowerCase()))
  const emails = new Set(namedUsers.map((user) => user.email.toLowerCase()))
  const names = new Set(namedUsers.map((user) => user.displayName.toLowerCase()))
  const staff: DirectoryUser[] = []
  const DAY_MS = 24 * 60 * 60 * 1000

  for (let index = 0; staff.length < count; index += 1) {
    const first = STAFF_FIRST_NAMES[index % STAFF_FIRST_NAMES.length] ?? ''
    const last =
      STAFF_LAST_NAMES[Math.floor(index / STAFF_FIRST_NAMES.length) % STAFF_LAST_NAMES.length] ?? ''
    const displayName = `${first} ${last}`.trim()
    const placement = STAFF_PLACEMENTS[index % STAFF_PLACEMENTS.length]
    if (displayName.length === 0 || !placement || names.has(displayName.toLowerCase())) {
      continue
    }
    names.add(displayName.toLowerCase())

    // Two people can share an initial and a surname, so a collision gets a
    // suffix rather than a lost account.
    const stem = `${first.slice(0, 1)}${last}`.toLowerCase().replace(/[^a-z0-9]/g, '')
    let sam = stem
    for (let suffix = 2; sams.has(sam); suffix += 1) {
      sam = `${stem}${suffix}`
    }
    sams.add(sam)

    const mailStem = `${first}.${last}`.toLowerCase().replace(/[^a-z0-9.]/g, '')
    let email = `${mailStem}@larkspur.example`
    for (let suffix = 2; emails.has(email); suffix += 1) {
      email = `${mailStem}${suffix}@larkspur.example`
    }
    emails.add(email)

    // A directory that is all active accounts is not a directory anyone has to
    // work: a few people are locked out, a few have left, and a handful are told
    // their password has expired — which it has, because the age and the flag
    // are read from the same number rather than set independently.
    const status: UserStatus =
      index % 17 === 0 ? 'disabled' : index % 23 === 0 ? 'locked' : 'active'
    const daysSinceChange = 3 + ((index * 13) % 200)
    const passwordExpired = status !== 'disabled' && daysSinceChange > 170
    const passwordLastChangedAt =
      status === 'disabled' ? null : BASE_CLOCK - daysSinceChange * DAY_MS

    staff.push({
      id: `u-staff-${String(staff.length + 1).padStart(3, '0')}`,
      samAccountName: sam,
      displayName,
      email,
      department: placement.department,
      siteId: placement.siteId,
      status,
      passwordExpired,
      passwordLastChangedAt,
      // Kept clear of the named accounts' numbers so no employee id is ambiguous.
      employeeId: `E-${5000 + staff.length * 7}`,
      managerName: placement.managerName,
    })
  }

  return staff
}

const users: DirectoryUser[] = [...namedUsers, ...buildStaffUsers(100)]

const devices: Device[] = [
  {
    id: 'lt-4471',
    hostname: 'LT-4471',
    kind: 'laptop',
    siteId: 'hq',
    os: 'Windows 11 Enterprise 23H2',
    adapterDescription: 'Intel(R) Wi-Fi 6E AX211 160MHz',
    macAddress: '00-1A-2B-3C-4D-5E',
    assignedUserId: 'u-dana',
    loggedInUserId: 'u-dana',
    linkUp: true,
    ipMode: 'dhcp',
    ipAddress: '10.20.4.57',
    subnetMask: '255.255.255.0',
    gateway: '10.20.4.1',
    dnsServers: ['10.20.4.10', '10.20.4.11'],
    dhcpLease: {
      server: '10.20.4.12',
      obtainedAt: BASE_CLOCK - 6 * 60 * 60 * 1000,
      expiresAt: BASE_CLOCK + 18 * 60 * 60 * 1000,
    },
    spoolerStatus: 'running',
    defaultPrinterId: 'prn-fin-01',
    domainJoined: true,
    pendingReboot: false,
    diskFreePercent: 22,
    lastUpdateDays: 21,
  },
  {
    id: 'lt-4472',
    hostname: 'LT-4472',
    kind: 'laptop',
    siteId: 'hq',
    os: 'Windows 11 Enterprise 23H2',
    adapterDescription: 'Intel(R) Wi-Fi 6E AX211 160MHz',
    macAddress: '00-1A-2B-3C-4D-5F',
    assignedUserId: 'u-marcus',
    loggedInUserId: 'u-marcus',
    linkUp: true,
    ipMode: 'dhcp',
    ipAddress: '10.20.4.58',
    subnetMask: '255.255.255.0',
    gateway: '10.20.4.1',
    dnsServers: ['10.20.4.10', '10.20.4.11'],
    dhcpLease: {
      server: '10.20.4.12',
      obtainedAt: BASE_CLOCK - 2 * 60 * 60 * 1000,
      expiresAt: BASE_CLOCK + 22 * 60 * 60 * 1000,
    },
    spoolerStatus: 'running',
    defaultPrinterId: 'prn-ops-01',
    domainJoined: true,
    pendingReboot: true,
    diskFreePercent: 41,
    lastUpdateDays: 3,
  },
  {
    id: 'dt-2201',
    hostname: 'DT-2201',
    kind: 'desktop',
    siteId: 'hq',
    os: 'Windows 11 Enterprise 23H2',
    adapterDescription: 'Realtek PCIe GbE Family Controller',
    macAddress: '00-1A-2B-3C-4D-60',
    assignedUserId: 'u-linh',
    loggedInUserId: 'u-linh',
    linkUp: true,
    ipMode: 'dhcp',
    ipAddress: '10.20.4.59',
    subnetMask: '255.255.255.0',
    gateway: '10.20.4.1',
    dnsServers: ['10.20.4.10', '10.20.4.11'],
    dhcpLease: {
      server: '10.20.4.12',
      obtainedAt: BASE_CLOCK - 4 * 60 * 60 * 1000,
      expiresAt: BASE_CLOCK + 20 * 60 * 60 * 1000,
    },
    spoolerStatus: 'running',
    defaultPrinterId: 'prn-fin-01',
    domainJoined: true,
    pendingReboot: false,
    diskFreePercent: 63,
    lastUpdateDays: 9,
  },
  {
    id: 'lt-8812',
    hostname: 'LT-8812',
    kind: 'laptop',
    siteId: 'depot',
    os: 'Windows 11 Pro 23H2',
    adapterDescription: 'Intel(R) Ethernet Connection I219-LM',
    macAddress: '00-1A-2B-3C-4D-61',
    assignedUserId: 'u-amara',
    loggedInUserId: 'u-amara',
    linkUp: true,
    ipMode: 'dhcp',      ipAddress: '10.20.8.51',
      subnetMask: '255.255.255.0',
      gateway: '10.20.8.1',
      dnsServers: ['10.20.4.10', '10.20.4.11'],
      dhcpLease: {
        server: '10.20.4.12',
        obtainedAt: BASE_CLOCK - 3 * 60 * 60 * 1000,
      expiresAt: BASE_CLOCK + 21 * 60 * 60 * 1000,
    },
    spoolerStatus: 'running',
    defaultPrinterId: 'prn-depot-01',
    domainJoined: true,
    pendingReboot: false,
    diskFreePercent: 55,
    lastUpdateDays: 14,
  },
  {
    id: 'lt-8813',
    hostname: 'LT-8813',
    kind: 'laptop',
    siteId: 'depot',
    os: 'Windows 11 Pro 23H2',
    adapterDescription: 'Intel(R) Ethernet Connection I219-LM',
    macAddress: '00-1A-2B-3C-4D-62',
    assignedUserId: 'u-theo',
    loggedInUserId: 'u-theo',
    linkUp: true,
    ipMode: 'static',
    ipAddress: '10.20.8.42',
    subnetMask: '255.255.255.0',
    gateway: '10.20.8.1',
    dnsServers: ['10.20.4.10', '10.20.4.11'],
    dhcpLease: null,
    spoolerStatus: 'running',
    defaultPrinterId: 'prn-depot-01',
    domainJoined: true,
    pendingReboot: false,
    diskFreePercent: 38,
    lastUpdateDays: 30,
  },
  {
    id: 'lt-9901',
    hostname: 'LT-9901',
    kind: 'laptop',
    siteId: 'warehouse',
    os: 'Windows 11 Pro 23H2',
    adapterDescription: 'Intel(R) Wi-Fi 6 AX201 160MHz',
    macAddress: '00-1A-2B-3C-4D-63',
    assignedUserId: 'u-kira',
    loggedInUserId: 'u-kira',
    linkUp: true,
    ipMode: 'dhcp',
    ipAddress: '10.20.12.31',
    subnetMask: '255.255.255.0',
    gateway: '10.20.12.1',
    dnsServers: ['10.20.4.10', '10.20.4.11'],
    dhcpLease: {
      server: '10.20.4.12',
      obtainedAt: BASE_CLOCK - 5 * 60 * 60 * 1000,
      expiresAt: BASE_CLOCK + 19 * 60 * 60 * 1000,
    },
    spoolerStatus: 'running',
    defaultPrinterId: null,
    domainJoined: true,
    pendingReboot: false,
    diskFreePercent: 71,
    lastUpdateDays: 5,
  },
  {
    id: 'srv-dc01',
    hostname: 'SRV-DC01',
    kind: 'server',
    siteId: 'hq',
    os: 'Windows Server 2022 Standard',
    adapterDescription: 'Microsoft Hyper-V Network Adapter',
    macAddress: '00-1A-2B-3C-4D-70',
    assignedUserId: null,
    loggedInUserId: null,
    linkUp: true,
    ipMode: 'static',
    ipAddress: '10.20.4.10',
    subnetMask: '255.255.255.0',
    gateway: '10.20.4.1',
    dnsServers: ['127.0.0.1'],
    dhcpLease: null,
    spoolerStatus: 'running',
    defaultPrinterId: null,
    domainJoined: true,
    pendingReboot: false,
    diskFreePercent: 48,
    lastUpdateDays: 2,
  },
  {
    id: 'srv-dc02',
    hostname: 'SRV-DC02',
    kind: 'server',
    siteId: 'hq',
    os: 'Windows Server 2022 Standard',
    adapterDescription: 'Microsoft Hyper-V Network Adapter',
    macAddress: '00-1A-2B-3C-4D-71',
    assignedUserId: null,
    loggedInUserId: null,
    linkUp: true,
    ipMode: 'static',
    ipAddress: '10.20.4.11',
    subnetMask: '255.255.255.0',
    gateway: '10.20.4.1',
    dnsServers: ['10.20.4.10'],
    dhcpLease: null,
    spoolerStatus: 'running',
    defaultPrinterId: null,
    domainJoined: true,
    pendingReboot: false,
    diskFreePercent: 52,
    lastUpdateDays: 2,
  },
  {
    id: 'srv-dhcp',
    hostname: 'SRV-DHCP',
    kind: 'server',
    siteId: 'hq',
    os: 'Windows Server 2022 Standard',
    adapterDescription: 'Microsoft Hyper-V Network Adapter',
    macAddress: '00-1A-2B-3C-4D-72',
    assignedUserId: null,
    loggedInUserId: null,
    linkUp: true,
    ipMode: 'static',
    ipAddress: '10.20.4.12',
    subnetMask: '255.255.255.0',
    gateway: '10.20.4.1',
    dnsServers: ['10.20.4.10', '10.20.4.11'],
    dhcpLease: null,
    spoolerStatus: 'running',
    defaultPrinterId: null,
    domainJoined: true,
    pendingReboot: false,
    diskFreePercent: 66,
    lastUpdateDays: 1,
  },
  {
    id: 'srv-fs01',
    hostname: 'SRV-FS01',
    kind: 'server',
    siteId: 'hq',
    os: 'Windows Server 2022 Standard',
    adapterDescription: 'Microsoft Hyper-V Network Adapter',
    macAddress: '00-1A-2B-3C-4D-73',
    assignedUserId: null,
    loggedInUserId: null,
    linkUp: true,
    ipMode: 'static',
    ipAddress: '10.20.4.25',
    subnetMask: '255.255.255.0',
    gateway: '10.20.4.1',
    dnsServers: ['10.20.4.10', '10.20.4.11'],
    dhcpLease: null,
    spoolerStatus: 'running',
    defaultPrinterId: null,
    domainJoined: true,
    pendingReboot: false,
    diskFreePercent: 34,
    lastUpdateDays: 6,
  },
  {
    id: 'srv-print1',
    hostname: 'SRV-PRINT1',
    kind: 'server',
    siteId: 'hq',
    os: 'Windows Server 2022 Standard',
    adapterDescription: 'Microsoft Hyper-V Network Adapter',
    macAddress: '00-1A-2B-3C-4D-74',
    assignedUserId: null,
    loggedInUserId: null,
    linkUp: true,
    ipMode: 'static',
    ipAddress: '10.20.4.30',
    subnetMask: '255.255.255.0',
    gateway: '10.20.4.1',
    dnsServers: ['10.20.4.10', '10.20.4.11'],
    dhcpLease: null,
    spoolerStatus: 'running',
    defaultPrinterId: 'prn-ops-01',
    domainJoined: true,
    pendingReboot: false,
    diskFreePercent: 44,
    lastUpdateDays: 12,
  },
]

const printers: Printer[] = [
  {
    id: 'prn-fin-01',
    name: 'PRN-FIN-01',
    siteId: 'hq',
    model: 'HP LaserJet Enterprise M507',
    ipAddress: '10.20.4.41',
    shareName: String.raw`\\SRV-PRINT1\FIN-01`,
    status: 'online',
    jobs: [
      {
        id: 'job-1041',
        document: 'Q3-reconciliation.xlsx',
        owner: 'dwhitfield',
        submittedAt: BASE_CLOCK - 12 * 60 * 1000,
        status: 'queued',
      },
    ],
  },
  {
    id: 'prn-ops-01',
    name: 'PRN-OPS-01',
    siteId: 'hq',
    model: 'Brother MFC-L8900CDW',
    ipAddress: '10.20.4.42',
    shareName: String.raw`\\SRV-PRINT1\OPS-01`,
    status: 'online',
    jobs: [],
  },
  {
    id: 'prn-depot-01',
    name: 'PRN-DEPOT-01',
    siteId: 'depot',
    model: 'HP LaserJet Pro M404dn',
    ipAddress: '10.20.8.41',
    shareName: String.raw`\\SRV-PRINT1\DEPOT-01`,
    status: 'online',
    jobs: [],
  },
]

const dhcpScopes: DhcpScope[] = [
  {
    siteId: 'hq',
    name: 'HQ-Users',
    server: '10.20.4.12',
    startAddress: '10.20.4.40',
    endAddress: '10.20.4.199',
    exclusions: ['10.20.4.41', '10.20.4.42'],
    leaseMinutes: 480,
    dnsServers: ['10.20.4.10', '10.20.4.11'],
    router: '10.20.4.1',
    leases: [
      { address: '10.20.4.57', hostname: 'LT-4471', state: 'active', expiresAt: BASE_CLOCK + 18 * 60 * 60 * 1000 },
      { address: '10.20.4.58', hostname: 'LT-4472', state: 'active', expiresAt: BASE_CLOCK + 22 * 60 * 60 * 1000 },
      { address: '10.20.4.59', hostname: 'DT-2201', state: 'active', expiresAt: BASE_CLOCK + 20 * 60 * 60 * 1000 },
    ],
  },
  {
    siteId: 'depot',
    name: 'Depot-Users',
    server: '10.20.4.12',
    startAddress: '10.20.8.40',
    endAddress: '10.20.8.199',
    exclusions: ['10.20.8.41', '10.20.8.42'],
    leaseMinutes: 480,
    dnsServers: ['10.20.4.10', '10.20.4.11'],
    router: '10.20.8.1',
    leases: [
      { address: '10.20.8.51', hostname: 'LT-8812', state: 'active', expiresAt: BASE_CLOCK + 21 * 60 * 60 * 1000 },
    ],
  },
  {
    siteId: 'warehouse',
    name: 'Warehouse-Users',
    server: '10.20.4.12',
    startAddress: '10.20.12.30',
    endAddress: '10.20.12.199',
    exclusions: [],
    leaseMinutes: 480,
    dnsServers: ['10.20.4.10', '10.20.4.11'],
    router: '10.20.12.1',
    leases: [
      { address: '10.20.12.31', hostname: 'LT-9901', state: 'active', expiresAt: BASE_CLOCK + 19 * 60 * 60 * 1000 },
      { address: '10.20.12.32', hostname: 'LT-WH-02', state: 'active', expiresAt: BASE_CLOCK + 9 * 60 * 60 * 1000 },
    ],
  },
]

const m365Accounts: M365Account[] = users.map((user, index) => ({
  userId: user.id,
  mfaRegistered: true,
  mfaMethod: 'authenticator',
  signInBlocked: false,
  lastSignInError: null,
  lastSignInAt: BASE_CLOCK - (index + 1) * 45 * 60 * 1000,
  signInAttempts: 1,
}))

const groups: SecurityGroup[] = [
  { name: 'FS-All-Users', members: users.map((user) => user.id) },
  { name: 'FS-Finance-RW', members: ['u-dana', 'u-linh', 'u-ravi'] },
  { name: 'FS-Finance-RO', members: ['u-theo', 'u-kira'] },
  { name: 'FS-Ops-RW', members: ['u-marcus', 'u-theo', 'u-ravi'] },
  { name: 'FS-Dispatch-RW', members: ['u-kira', 'u-jules', 'u-amara'] },
]

const shares: FileShare[] = [
  {
    id: 'share-finance',
    name: 'Finance',
    path: String.raw`\\SRV-FS01\Finance`,
    server: 'SRV-FS01',
    siteId: 'hq',
    grants: [
      { principal: { kind: 'group', name: 'FS-Finance-RW' }, access: 'change', allow: true },
      { principal: { kind: 'group', name: 'FS-Finance-RO' }, access: 'read', allow: true },
      { principal: { kind: 'group', name: 'FS-All-Users' }, access: 'read', allow: true },
    ],
  },
  {
    id: 'share-operations',
    name: 'Operations',
    path: String.raw`\\SRV-FS01\Operations`,
    server: 'SRV-FS01',
    siteId: 'hq',
    grants: [
      { principal: { kind: 'group', name: 'FS-Ops-RW' }, access: 'change', allow: true },
      { principal: { kind: 'group', name: 'FS-All-Users' }, access: 'read', allow: true },
    ],
  },
  {
    id: 'share-dispatch',
    name: 'Dispatch',
    path: String.raw`\\SRV-FS01\Dispatch`,
    server: 'SRV-FS01',
    siteId: 'hq',
    grants: [
      { principal: { kind: 'group', name: 'FS-Dispatch-RW' }, access: 'change', allow: true },
      { principal: { kind: 'group', name: 'FS-All-Users' }, access: 'read', allow: true },
    ],
  },
]

/**
 * The spare shelves and the shipping desk. Both are small, hand-written sets so
 * a learner can read them without paging, and so a scenario can point at a real
 * tag: a machine on a shelf and the shipment it left on are the same record here.
 */
const stock: StockItem[] = [
  {
    id: 'SHELF-DT-0101',
    kind: 'desktop',
    model: 'Dell OptiPlex 7010',
    siteId: 'hq',
    state: 'ready',
    daysOnShelf: 6,
    notes: 'Imaged and joined to the domain last week.',
  },
  {
    id: 'SHELF-DT-0102',
    kind: 'desktop',
    model: 'Dell OptiPlex 7010',
    siteId: 'hq',
    state: 'needs-image',
    daysOnShelf: 21,
    notes: 'Wiped, waiting for an imaging slot.',
  },
  {
    id: 'SHELF-LT-0117',
    kind: 'laptop',
    model: 'Lenovo ThinkPad T14',
    siteId: 'hq',
    state: 'ready',
    daysOnShelf: 3,
    notes: 'Battery replaced when it came back.',
  },
  {
    id: 'SHELF-LT-0118',
    kind: 'laptop',
    model: 'Lenovo ThinkPad T14',
    siteId: 'hq',
    state: 'awaiting-parts',
    daysOnShelf: 34,
    notes: 'Waiting on a replacement dock before it can go out.',
  },
  {
    id: 'SHELF-LT-0203',
    kind: 'laptop',
    model: 'HP EliteBook 840',
    siteId: 'depot',
    state: 'ready',
    daysOnShelf: 9,
    notes: 'Returned by a leaver; the old profile has been removed.',
  },
  {
    id: 'SHELF-LT-0204',
    kind: 'laptop',
    model: 'HP EliteBook 840',
    siteId: 'depot',
    state: 'quarantined',
    daysOnShelf: 41,
    notes: 'Cracked lid. Held until the damage case is closed.',
  },
  {
    id: 'SHELF-DT-0301',
    kind: 'desktop',
    model: 'Dell OptiPlex 3000',
    siteId: 'warehouse',
    state: 'ready',
    daysOnShelf: 12,
    notes: 'Spare for the picking line.',
  },
  {
    id: 'SHELF-DT-0302',
    kind: 'desktop',
    model: 'Dell OptiPlex 3000',
    siteId: 'warehouse',
    state: 'needs-image',
    daysOnShelf: 27,
    notes: 'Disk wiped; no imaging slot booked yet.',
  },
]

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const shipments: Shipment[] = [
  {
    id: 'LSP-8830',
    carrier: 'Ridgeway Couriers',
    direction: 'return',
    state: 'delayed',
    fromSiteId: 'depot',
    toSiteId: 'hq',
    assetTag: 'SHELF-LT-0204',
    contents: 'Damaged EliteBook 840, lid cracked',
    dueOn: BASE_CLOCK - 2 * DAY,
    lastEvent: 'Collection missed twice; the depot has been told to rebook.',
  },
  {
    id: 'LSP-8831',
    carrier: 'Ridgeway Couriers',
    direction: 'return',
    state: 'delivered',
    fromSiteId: 'warehouse',
    toSiteId: 'hq',
    assetTag: null,
    contents: 'Two OptiPlex 3000 desktops, end of lease',
    dueOn: BASE_CLOCK - 5 * DAY,
    lastEvent: 'Signed for at Larkspur HQ by reception.',
  },
  {
    id: 'LSP-8842',
    carrier: 'Northwind Freight',
    direction: 'outbound',
    state: 'in-transit',
    fromSiteId: 'hq',
    toSiteId: 'warehouse',
    assetTag: 'SHELF-LT-0117',
    contents: 'ThinkPad T14 with dock and charger',
    dueOn: BASE_CLOCK + 1 * DAY,
    lastEvent: 'Left the Larkspur HQ loading bay at 07:10.',
  },
  {
    id: 'LSP-8845',
    carrier: 'Northwind Freight',
    direction: 'outbound',
    state: 'preparing',
    fromSiteId: 'hq',
    toSiteId: 'depot',
    assetTag: 'SHELF-DT-0101',
    contents: 'OptiPlex 7010 with keyboard and monitor',
    dueOn: BASE_CLOCK + 3 * DAY,
    lastEvent: 'Label printed; waiting for the afternoon collection.',
  },
  {
    id: 'LSP-8849',
    carrier: 'Ridgeway Couriers',
    direction: 'return',
    state: 'in-transit',
    fromSiteId: 'warehouse',
    toSiteId: 'hq',
    assetTag: 'SHELF-DT-0301',
    contents: 'OptiPlex 3000 desktop from the picking line',
    dueOn: BASE_CLOCK + 2 * DAY,
    lastEvent: 'Picked up from the warehouse gate at 15:40.',
  },
]

/**
 * The mail tenant. Small enough to read, specific enough that a trace, a
 * quarantine decision, or an odd forward points at a real mailbox.
 */
const mailboxes: MailboxRecord[] = users.map((user) => ({
  userId: user.id,
  quotaPercent: user.id === 'u-marcus' ? 96 : 18 + (user.displayName.length % 7) * 9,
  forwarding:
    user.id === 'u-theo' ? 'theo.brooks.backup@example.net' : null,
  onHold: user.id === 'u-jules',
}))

const mailMessages: MailMessage[] = [
  {
    id: 'msg-1001',
    from: 'billing@northwind-freight.example',
    to: 'dana.whitfield@larkspur.example',
    subject: 'Invoice 2291 for the September freight',
    receivedAt: BASE_CLOCK - 4 * HOUR,
    state: 'delivered',
    reason: null,
    events: [
      { at: BASE_CLOCK - 4 * HOUR, text: 'Accepted from the internet by MX01.' },
      { at: BASE_CLOCK - 4 * HOUR + 12_000, text: 'Filtering passed: no rule matched.' },
      { at: BASE_CLOCK - 4 * HOUR + 20_000, text: 'Delivered to the mailbox.' },
    ],
  },
  {
    id: 'msg-1002',
    from: 'accounts@larkspur-payments.example',
    to: 'dana.whitfield@larkspur.example',
    subject: 'Action required: confirm your payment details',
    receivedAt: BASE_CLOCK - 2 * HOUR,
    state: 'quarantined',
    reason: 'Phishing: display name impersonating the finance team',
    events: [
      { at: BASE_CLOCK - 2 * HOUR, text: 'Accepted from the internet by MX01.' },
      { at: BASE_CLOCK - 2 * HOUR + 8_000, text: 'Anti-phishing policy held the message.' },
    ],
  },
  {
    id: 'msg-1003',
    from: 'invoices@ridgeway-couriers.example',
    to: 'linh.nguyen@larkspur.example',
    subject: 'Your delivery note',
    receivedAt: BASE_CLOCK - 26 * HOUR,
    state: 'quarantined',
    reason: 'Attachment type blocked by policy: .htm',
    events: [
      { at: BASE_CLOCK - 26 * HOUR, text: 'Accepted from the internet by MX01.' },
      { at: BASE_CLOCK - 26 * HOUR + 5_000, text: 'Transport rule held the attachment.' },
    ],
  },
  {
    id: 'msg-1004',
    from: 'it-support@larkspur-helpdesk.example',
    to: 'amara.singh@larkspur.example',
    subject: 'Your mailbox password expires today',
    receivedAt: BASE_CLOCK - 30 * HOUR,
    state: 'blocked',
    reason: 'Sender address is on the tenant block list',
    events: [
      { at: BASE_CLOCK - 30 * HOUR, text: 'Accepted from the internet by MX01.' },
      { at: BASE_CLOCK - 30 * HOUR + 3_000, text: 'Dropped: sender blocked by the tenant.' },
    ],
  },
  {
    id: 'msg-1005',
    from: 'dispatch@northwind-freight.example',
    to: 'jules.ortiz@larkspur.example',
    subject: 'Collection booked for Thursday',
    receivedAt: BASE_CLOCK - 3 * HOUR,
    state: 'deferred',
    reason: 'The recipient server did not accept the connection, so delivery is retrying',
    events: [
      { at: BASE_CLOCK - 3 * HOUR, text: 'Accepted from the internet by MX01.' },
      { at: BASE_CLOCK - 3 * HOUR + 40_000, text: 'Delivery deferred: connection to the mailbox server timed out.' },
    ],
  },
  {
    id: 'msg-1006',
    from: 'warehouse@larkspur.example',
    to: 'marcus.chen@larkspur.example',
    subject: 'Shift handover for the picking line',
    receivedAt: BASE_CLOCK - 5 * HOUR,
    state: 'delivered',
    reason: null,
    events: [
      { at: BASE_CLOCK - 5 * HOUR, text: 'Accepted from the organisation.' },
      { at: BASE_CLOCK - 5 * HOUR + 4_000, text: 'Delivered to the mailbox.' },
    ],
  },
]

const remoteSessions: RemoteSession[] = [
  {
    machineId: 'lt-8813',
    userId: 'u-theo',
    state: 'active',
    startedAt: BASE_CLOCK - 25 * MINUTE,
    client: 'LAPTOP-RPATEL · Remote Desktop Connection',
  },
  {
    machineId: 'lt-9901',
    userId: 'u-kira',
    state: 'disconnected',
    startedAt: BASE_CLOCK - 3 * HOUR,
    client: 'Support console · Browser session',
  },
]

const deploymentTasks: DeploymentTask[] = [
  {
    assetTag: 'SHELF-DT-0102',
    sequence: 'W11-23H2-Desktop',
    state: 'queued',
    step: 'Waiting for an imaging slot',
    attempts: 0,
    startedAt: null,
  },
  {
    assetTag: 'SHELF-DT-0302',
    sequence: 'W11-23H2-Desktop',
    state: 'failed',
    step: 'Failed applying the driver pack: 0x80070005',
    attempts: 2,
    startedAt: BASE_CLOCK - 2 * DAY,
  },
  {
    assetTag: 'SHELF-LT-0203',
    sequence: 'W11-23H2-Laptop',
    state: 'complete',
    step: 'Finished: joined to the domain and named',
    attempts: 1,
    startedAt: BASE_CLOCK - 9 * DAY,
  },
]

function buildDnsRecords(domain: string, deviceList: readonly Device[]): DnsRecord[] {
  const records: DnsRecord[] = [
    { name: `intranet.${domain}`, address: '10.20.4.20' },
    { name: `mail.${domain}`, address: '10.20.4.35' },
    { name: `fileserver.${domain}`, address: '10.20.4.25' },
    { name: `dc01.${domain}`, address: '10.20.4.10' },
    { name: `dhcp.${domain}`, address: '10.20.4.12' },
    { name: `print1.${domain}`, address: '10.20.4.30' },
    { name: `www.example.com`, address: '203.0.113.10' },
    { name: `learn.example.org`, address: '203.0.113.20' },
  ]

  for (const device of deviceList) {
    if (device.ipAddress) {
      records.push({ name: `${device.hostname.toLowerCase()}.${domain}`, address: device.ipAddress })
    }
  }

  return records
}

const DOMAIN = 'larkspur.example'

/**
 * Every world is a deep copy, so a ticket session can mutate its own machines,
 * accounts, and network without affecting any other world in the process.
 */
export function createLarkspurWorld(clock: number = BASE_CLOCK): World {
  const world: World = {
    clock,
    orgName: 'Larkspur Logistics',
    domain: DOMAIN,
    sites: structuredClone(sites),
    users: structuredClone(users),
    devices: structuredClone(devices),
    printers: structuredClone(printers),
    network: {
      wanUp: true,
      publicNameServers: ['1.1.1.1', '9.9.9.9'],
      dnsRecords: buildDnsRecords(DOMAIN, devices),
    },
    stock: structuredClone(stock),
    shipments: structuredClone(shipments),
    dhcpScopes: structuredClone(dhcpScopes),
    m365: {
      name: 'Larkspur Logistics',
      domain: DOMAIN,
      accounts: structuredClone(m365Accounts),
    },
    mail: {
      domain: DOMAIN,
      mailboxes: structuredClone(mailboxes),
      messages: structuredClone(mailMessages),
      blockedSenders: ['it-support@larkspur-helpdesk.example'],
    },
    remoteSessions: structuredClone(remoteSessions),
    deploymentTasks: structuredClone(deploymentTasks),
    shares: structuredClone(shares),
    groups: structuredClone(groups),
    currentDeviceId: 'lt-4471',
    verification: emptyVerificationState(),
    // HR issues a printed PIN letter to every employee at onboarding, so the
    // letter is a proof every caller can offer unless a world says otherwise.
    letterPinOnFile: true,
  }
  return world
}

/**
 * Sessions saved before M6 carry worlds without the DHCP, M365, and share
 * state. Backfill it so an interrupted attempt can still be resumed instead of
 * crashing on the first command that reads the new collections.
 */
export function ensureWorldState(world: World): World {
  const legacy = world as unknown as {
    dhcpScopes?: DhcpScope[]
    m365?: World['m365']
    shares?: FileShare[]
    groups?: SecurityGroup[]
    stock?: StockItem[]
    shipments?: Shipment[]
    mail?: World['mail']
    remoteSessions?: RemoteSession[]
    deploymentTasks?: DeploymentTask[]
    verification?: World['verification']
  }

  // The shelves and the shipping desk are estate data rather than attempt state,
  // so an older session gets a populated copy rather than an empty tool.
  if (!Array.isArray(legacy.stock) || !Array.isArray(legacy.shipments)) {
    const template = createLarkspurWorld(world.clock)
    legacy.stock = template.stock
    legacy.shipments = template.shipments
  }

  if (!Array.isArray(legacy.dhcpScopes) || !legacy.m365) {
    const template = createLarkspurWorld(world.clock)
    legacy.dhcpScopes = template.dhcpScopes
    legacy.m365 = template.m365
  }
  if (!legacy.mail || !Array.isArray(legacy.remoteSessions) || !Array.isArray(legacy.deploymentTasks)) {
    const template = createLarkspurWorld(world.clock)
    legacy.mail = legacy.mail ?? template.mail
    legacy.remoteSessions = legacy.remoteSessions ?? template.remoteSessions
    legacy.deploymentTasks = legacy.deploymentTasks ?? template.deploymentTasks
  }
  if (!Array.isArray(legacy.shares)) {
    legacy.shares = []
  }
  if (!Array.isArray(legacy.groups)) {
    legacy.groups = []
  }
  if (!legacy.verification) {
    legacy.verification = emptyVerificationState()
  }
  return world
}
